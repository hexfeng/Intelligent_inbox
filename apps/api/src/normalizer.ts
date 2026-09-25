import type { EvidenceEnvelope, EvidenceRef, NormalizedThread, ThreadMessage, ThreadSnapshot } from "./domain.js";

const SIGNATURE_MARKERS = [/^--\s*$/m, /^Sent from my /im, /^Get Outlook for /im];
const BODY_EVIDENCE = [
  /(?:[$€£]\s?\d[\d,.]*|\d[\d,.]*\s?(?:USD|CAD|EUR|GBP))/gi,
  /\b(?:\d{4}-\d{2}-\d{2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,\s*\d{4})?)\b/gi,
  /\b(?:invoice|order|ticket|case|reference|confirmation)[\s#:.-]*[A-Z0-9-]{3,}\b/gi
];

function htmlToText(html: string): string {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function normalizeBody(message: ThreadMessage): string {
  let text = (message.plainText || (message.htmlText ? htmlToText(message.htmlText) : ""))
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const cuts = SIGNATURE_MARKERS.map((marker) => text.search(marker)).filter((index) => index >= 0);
  if (cuts.length > 0) text = text.slice(0, Math.min(...cuts)).trim();

  const kept: string[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (/^On .+ wrote:$/.test(trimmed) || trimmed.startsWith(">")) continue;
    if (trimmed && kept.at(-1) === trimmed) continue;
    kept.push(trimmed);
  }
  return kept.join("\n").trim();
}

export function normalizeThread(snapshot: ThreadSnapshot): NormalizedThread {
  return {
    threadId: snapshot.threadId,
    threadVersion: snapshot.threadVersion,
    labels: [...snapshot.labels],
    messages: snapshot.messages.map((source) => {
      const { plainText: _plainText, htmlText: _htmlText, ...message } = source;
      return { ...message, bodyText: normalizeBody(source) };
    })
  };
}

function push(refs: EvidenceRef[], ref: EvidenceRef): void {
  if (ref.value.trim()) refs.push(ref);
}

export function buildEvidenceEnvelope(thread: NormalizedThread): EvidenceEnvelope {
  const refs: EvidenceRef[] = [];
  for (const message of thread.messages) {
    push(refs, { messageId: message.messageId, field: "SUBJECT", value: message.subject });
    push(refs, { messageId: message.messageId, field: "SENDER", value: message.sender });
    for (const recipient of message.recipients) push(refs, { messageId: message.messageId, field: "RECIPIENT", value: recipient });
    for (const attachment of message.attachments) push(refs, { messageId: message.messageId, field: "ATTACHMENT", value: attachment.filename });
    for (const pattern of BODY_EVIDENCE) {
      pattern.lastIndex = 0;
      for (const match of message.bodyText.matchAll(pattern)) {
        if (match.index === undefined) continue;
        push(refs, {
          messageId: message.messageId,
          field: "BODY",
          value: match[0],
          start: match.index,
          end: match.index + match[0].length
        });
      }
    }
  }
  return { threadId: thread.threadId, threadVersion: thread.threadVersion, refs };
}
