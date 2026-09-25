import type {
  ActionExecution,
  CalendarSlot,
  DecisionSignalsV2,
  DerivedStateV2,
  FeedbackEvent,
  MeetingConstraints,
  RecommendationSet,
  SummaryResult,
  WriteAction
} from "@intelligent-inbox/contracts";

export type AccountContext = {
  userId: string;
  accountId: string;
  email: string;
  scopes: string[];
  encryptedRefreshToken: string;
};

export type ThreadAttachment = { filename: string; mimeType?: string };

export type ThreadMessage = {
  messageId: string;
  subject: string;
  sender: string;
  replyTo?: string;
  recipients: string[];
  sentAt?: string;
  plainText: string;
  htmlText?: string;
  attachments: ThreadAttachment[];
  headers: { listUnsubscribe: boolean; precedence?: string };
};

export type ThreadSnapshot = {
  threadId: string;
  threadVersion: string;
  subject: string;
  sender: string;
  replyTo?: string;
  recipients: string[];
  attachments: string[];
  labels: string[];
  messageId?: string;
  references?: string;
  messages: ThreadMessage[];
};

export type NormalizedMessage = Omit<ThreadMessage, "plainText" | "htmlText"> & { bodyText: string };
export type NormalizedThread = Pick<ThreadSnapshot, "threadId" | "threadVersion" | "labels"> & { messages: NormalizedMessage[] };

export type EvidenceRef = {
  messageId: string;
  field: "SUBJECT" | "SENDER" | "RECIPIENT" | "ATTACHMENT" | "BODY";
  value: string;
  start?: number;
  end?: number;
};

export type EvidenceEnvelope = Pick<ThreadSnapshot, "threadId" | "threadVersion"> & { refs: EvidenceRef[] };

export type DecisionRecord = {
  decisionSignals: DecisionSignalsV2;
  derivedState: DerivedStateV2;
  recommendations: RecommendationSet;
  pipelineVersion: string;
};

export type LabelImage = { messages: Array<{ id: string; labels: string[] }> };

export type StoredExecution = {
  execution: ActionExecution;
  accountId: string;
  threadId: string;
  recommendationId: string;
  idempotencyKey: string;
  actionType: WriteAction;
  preImage: LabelImage;
  postImage: LabelImage;
  undoneAt?: string;
};

export interface Repository {
  withIdempotencyLock<T>(accountId: string, key: string, operation: () => Promise<T>): Promise<T>;
  saveOAuthState(input: { stateHash: string; verifier: string; redirectUri: string; includeCalendar: boolean; expiresAt: Date }): Promise<void>;
  consumeOAuthState(stateHash: string): Promise<{ verifier: string; redirectUri: string; includeCalendar: boolean } | null>;
  upsertGoogleAccount(input: { googleSub: string; email: string; scopes: string[]; encryptedRefreshToken: string }): Promise<AccountContext>;
  createSession(input: { tokenHash: string; userId: string; accountId: string; expiresAt: Date }): Promise<void>;
  resolveSession(tokenHash: string): Promise<AccountContext | null>;
  saveDecision(input: { accountId: string; record: DecisionRecord }): Promise<void>;
  getDecision(accountId: string, threadId: string, threadVersion: string | undefined, pipelineVersion: string): Promise<DecisionRecord | null>;
  saveSummary(input: { accountId: string; summary: SummaryResult; pipelineVersion: string }): Promise<void>;
  getSummary(accountId: string, threadId: string, threadVersion: string, pipelineVersion: string): Promise<SummaryResult | null>;
  getRecommendation(accountId: string, recommendationId: string): Promise<{ threadId: string; threadVersion: string; actionType: string } | null>;
  getExecutionByIdempotency(accountId: string, key: string): Promise<StoredExecution | null>;
  saveExecution(execution: StoredExecution): Promise<void>;
  getExecution(accountId: string, executionId: string): Promise<StoredExecution | null>;
  markExecutionUndone(accountId: string, executionId: string): Promise<void>;
  saveFeedback(userId: string, accountId: string, event: FeedbackEvent): Promise<void>;
  saveAudit(userId: string, accountId: string, eventType: string, entityId: string, safeMetadata: Record<string, unknown>): Promise<void>;
  deleteAccountData(userId: string, accountId: string): Promise<void>;
}

export interface GoogleGateway {
  getThread(account: AccountContext, threadId: string): Promise<ThreadSnapshot>;
  getLabelImage(account: AccountContext, threadId: string): Promise<LabelImage>;
  applyAction(account: AccountContext, threadId: string, action: WriteAction, payload: { label_id?: string | undefined }): Promise<LabelImage>;
  restoreLabels(account: AccountContext, threadId: string, current: LabelImage, target: LabelImage): Promise<LabelImage>;
  createDraft(account: AccountContext, snapshot: ThreadSnapshot, body: string): Promise<{ draftId: string; threadId: string }>;
  getFreeBusy(account: AccountContext, timeMin: string, timeMax: string): Promise<Array<{ start: string; end: string }>>;
  revoke(account: AccountContext): Promise<void>;
}

export interface DecisionProvider { decide(thread: NormalizedThread): Promise<DecisionSignalsV2> }

export interface SummaryProvider { summarize(thread: NormalizedThread, evidence: EvidenceEnvelope): Promise<string[]> }

export interface DraftProvider {
  draft(snapshot: ThreadSnapshot, thread: NormalizedThread, evidence: EvidenceEnvelope, state: DerivedStateV2, instruction?: string): Promise<string>;
  meetingDraft(snapshot: ThreadSnapshot, thread: NormalizedThread, evidence: EvidenceEnvelope, state: DerivedStateV2, constraints: MeetingConstraints, slots: CalendarSlot[]): Promise<string>;
}
