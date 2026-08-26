import type {
  ActionExecution,
  EmailIntelligenceV11,
  FeedbackEvent,
  CalendarSlot,
  MeetingConstraints,
  RecommendationSet,
  WriteAction
} from "@intelligent-inbox/contracts";

export type AccountContext = {
  userId: string;
  accountId: string;
  email: string;
  scopes: string[];
  encryptedRefreshToken: string;
};

export type ThreadSnapshot = {
  threadId: string;
  threadVersion: string;
  subject: string;
  sender: string;
  replyTo?: string;
  recipients: string[];
  plainText: string;
  attachments: string[];
  labels: string[];
  messageId?: string;
  references?: string;
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
  saveIntelligence(input: { accountId: string; intelligence: EmailIntelligenceV11; recommendations: RecommendationSet; modelVersion: string }): Promise<void>;
  getIntelligence(accountId: string, threadId: string, threadVersion?: string): Promise<{ intelligence: EmailIntelligenceV11; recommendations: RecommendationSet } | null>;
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

export interface IntelligenceProvider {
  analyze(snapshot: ThreadSnapshot): Promise<EmailIntelligenceV11>;
  draft(snapshot: ThreadSnapshot, intelligence: EmailIntelligenceV11, instruction?: string): Promise<string>;
  meetingDraft(snapshot: ThreadSnapshot, intelligence: EmailIntelligenceV11, constraints: MeetingConstraints, slots: CalendarSlot[]): Promise<string>;
}
