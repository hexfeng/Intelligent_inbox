import { google } from "googleapis";
import type { gmail_v1 } from "googleapis";
import type { WriteAction } from "@intelligent-inbox/contracts";
import type { AppConfig } from "./config.js";
import { decryptSecret } from "./crypto.js";
import type { AccountContext, GoogleGateway, LabelImage, ThreadAttachment, ThreadSnapshot } from "./domain.js";
import { AppError } from "./errors.js";

function decodeBase64Url(value: string | null | undefined): string {
  return value ? Buffer.from(value, "base64url").toString("utf8") : "";
}

function header(message: gmail_v1.Schema$Message, name: string): string {
  return message.payload?.headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function collectText(part: gmail_v1.Schema$MessagePart | undefined, mimeType: "text/plain" | "text/html"): string[] {
  if (!part) return [];
  if (part.mimeType === mimeType) return [decodeBase64Url(part.body?.data)];
  return (part.parts ?? []).flatMap((child) => collectText(child, mimeType));
}

function collectAttachments(part: gmail_v1.Schema$MessagePart | undefined): ThreadAttachment[] {
  if (!part) return [];
  const own = part.filename ? [{ filename: part.filename, ...(part.mimeType ? { mimeType: part.mimeType } : {}) }] : [];
  return own.concat((part.parts ?? []).flatMap(collectAttachments));
}

export class GoogleApiGateway implements GoogleGateway {
  constructor(private readonly config: AppConfig) {}

  async getThread(account: AccountContext, threadId: string): Promise<ThreadSnapshot> {
    const gmail = google.gmail({ version: "v1", auth: this.auth(account) });
    const response = await gmail.users.threads.get({ userId: "me", id: threadId, format: "full" });
    const messages = response.data.messages ?? [];
    const last = messages.at(-1);
    if (!last) throw new AppError("THREAD_NOT_FOUND", "Gmail thread was not found", 404);
    const labels = Array.from(new Set(messages.flatMap((message) => message.labelIds ?? []))).sort();
    const threadMessages = messages.map((message, index) => {
      const sentAt = message.internalDate ? new Date(Number(message.internalDate)).toISOString() : undefined;
      const plainText = collectText(message.payload, "text/plain").filter(Boolean).join("\n\n");
      const htmlText = collectText(message.payload, "text/html").filter(Boolean).join("\n\n");
      return {
        messageId: header(message, "Message-ID") || message.id || `${threadId}-${index}`,
        subject: header(message, "Subject"),
        sender: header(message, "From"),
        ...(header(message, "Reply-To") ? { replyTo: header(message, "Reply-To") } : {}),
        recipients: header(message, "To").split(",").map((value) => value.trim()).filter(Boolean),
        ...(sentAt ? { sentAt } : {}),
        plainText,
        ...(htmlText ? { htmlText } : {}),
        attachments: collectAttachments(message.payload),
        headers: {
          listUnsubscribe: Boolean(header(message, "List-Unsubscribe")),
          ...(header(message, "Precedence") ? { precedence: header(message, "Precedence") } : {})
        }
      };
    });
    return {
      threadId,
      threadVersion: response.data.historyId ?? last.id ?? threadId,
      subject: header(last, "Subject"),
      sender: header(last, "From"),
      ...(header(last, "Reply-To") ? { replyTo: header(last, "Reply-To") } : {}),
      recipients: header(last, "To").split(",").map((value) => value.trim()).filter(Boolean),
      attachments: threadMessages.flatMap((message) => message.attachments.map((attachment) => attachment.filename)),
      labels,
      ...(last.id ? { messageId: header(last, "Message-ID") || last.id } : {}),
      ...(header(last, "References") ? { references: header(last, "References") } : {}),
      messages: threadMessages
    };
  }

  async getLabelImage(account: AccountContext, threadId: string): Promise<LabelImage> {
    const gmail = google.gmail({ version: "v1", auth: this.auth(account) });
    return this.currentLabels(gmail, threadId);
  }

  async applyAction(account: AccountContext, threadId: string, action: WriteAction, payload: { label_id?: string | undefined }): Promise<LabelImage> {
    const gmail = google.gmail({ version: "v1", auth: this.auth(account) });
    const mutation = actionMutation(action, payload);
    await gmail.users.threads.modify({ userId: "me", id: threadId, requestBody: mutation });
    return this.currentLabels(gmail, threadId);
  }

  async restoreLabels(account: AccountContext, threadId: string, current: LabelImage, target: LabelImage): Promise<LabelImage> {
    const gmail = google.gmail({ version: "v1", auth: this.auth(account) });
    const currentById = new Map(current.messages.map((message) => [message.id, message.labels]));
    for (const targetMessage of target.messages) {
      const currentLabels = currentById.get(targetMessage.id);
      if (!currentLabels) throw new AppError("UNDO_CONFLICT", "A Gmail message is missing from the thread", 409);
      const currentSet = new Set(currentLabels);
      const targetSet = new Set(targetMessage.labels);
      const addLabelIds = targetMessage.labels.filter((label) => !currentSet.has(label));
      const removeLabelIds = currentLabels.filter((label) => !targetSet.has(label));
      if (addLabelIds.length || removeLabelIds.length) {
        await gmail.users.messages.modify({ userId: "me", id: targetMessage.id, requestBody: { addLabelIds, removeLabelIds } });
      }
    }
    return this.currentLabels(gmail, threadId);
  }

  async createDraft(account: AccountContext, snapshot: ThreadSnapshot, body: string): Promise<{ draftId: string; threadId: string }> {
    const gmail = google.gmail({ version: "v1", auth: this.auth(account) });
    const recipient = draftRecipient(snapshot, account.email);
    const cleanSubject = sanitizeHeader(snapshot.subject);
    const subject = cleanSubject.toLowerCase().startsWith("re:") ? cleanSubject : `Re: ${cleanSubject}`;
    const headers = [
      `To: ${recipient}`,
      `Subject: ${subject}`,
      "Content-Type: text/plain; charset=utf-8",
      "MIME-Version: 1.0"
    ];
    if (snapshot.messageId) headers.push(`In-Reply-To: ${snapshot.messageId}`);
    if (snapshot.references) headers.push(`References: ${snapshot.references}`);
    const raw = Buffer.from(`${headers.join("\r\n")}\r\n\r\n${body}`, "utf8").toString("base64url");
    const response = await gmail.users.drafts.create({
      userId: "me",
      requestBody: { message: { threadId: snapshot.threadId, raw } }
    });
    const draftId = response.data.id;
    if (!draftId) throw new AppError("DRAFT_CREATE_FAILED", "Gmail did not return a draft id", 502, true);
    return { draftId, threadId: snapshot.threadId };
  }

  async getFreeBusy(account: AccountContext, timeMin: string, timeMax: string): Promise<Array<{ start: string; end: string }>> {
    const calendar = google.calendar({ version: "v3", auth: this.auth(account) });
    const response = await calendar.freebusy.query({
      requestBody: { timeMin, timeMax, items: [{ id: "primary" }] }
    });
    return (response.data.calendars?.primary?.busy ?? []).flatMap((slot) =>
      slot.start && slot.end ? [{ start: slot.start, end: slot.end }] : []
    );
  }

  async revoke(account: AccountContext): Promise<void> {
    const auth = this.auth(account);
    await auth.revokeCredentials();
  }

  private auth(account: AccountContext) {
    const client = new google.auth.OAuth2(this.config.GOOGLE_CLIENT_ID, this.config.GOOGLE_CLIENT_SECRET);
    client.setCredentials({ refresh_token: decryptSecret(account.encryptedRefreshToken, this.config.TOKEN_ENCRYPTION_KEY_BASE64) });
    return client;
  }

  private async currentLabels(gmail: gmail_v1.Gmail, threadId: string): Promise<LabelImage> {
    const response = await gmail.users.threads.get({ userId: "me", id: threadId, format: "minimal" });
    return {
      messages: (response.data.messages ?? []).flatMap((message) =>
        message.id ? [{ id: message.id, labels: [...(message.labelIds ?? [])].sort() }] : []
      )
    };
  }
}

export function draftRecipient(snapshot: ThreadSnapshot, accountEmail: string): string {
  const recipient = mailboxAddress(snapshot.replyTo ?? snapshot.sender);
  if (!recipient) throw new AppError("DRAFT_RECIPIENT_REVIEW_REQUIRED", "Reply recipient could not be verified", 409);
  if (recipient === accountEmail.trim().toLowerCase()) {
    throw new AppError("DRAFT_RECIPIENT_REVIEW_REQUIRED", "The latest message was sent by the connected account", 409);
  }
  return recipient;
}

export function mailboxAddress(value: string): string | null {
  const normalized = sanitizeHeader(value);
  const matches = normalized.match(/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
  return matches.length === 1 ? matches[0]!.toLowerCase() : null;
}

export function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export function actionMutation(action: WriteAction, payload: { label_id?: string | undefined }): gmail_v1.Schema$ModifyThreadRequest {
  switch (action) {
    case "ARCHIVE": return { removeLabelIds: ["INBOX"] };
    case "MARK_READ": return { removeLabelIds: ["UNREAD"] };
    case "STAR": return { addLabelIds: ["STARRED"] };
    case "LABEL":
      if (!payload.label_id) throw new AppError("INVALID_ACTION_PAYLOAD", "LABEL requires label_id", 400);
      return { addLabelIds: [payload.label_id] };
  }
  throw new AppError("ACTION_NOT_ALLOWED", "Action is not in the write allow-list", 400);
}
