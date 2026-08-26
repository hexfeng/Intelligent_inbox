import type { CalendarSlot, EmailIntelligenceV11, FeedbackEvent, MeetingConstraints, RecommendationSet } from "@intelligent-inbox/contracts";
import type { AccountContext, GoogleGateway, IntelligenceProvider, LabelImage, Repository, StoredExecution, ThreadSnapshot } from "./domain.js";

export const testAccount: AccountContext = {
  userId: "00000000-0000-4000-8000-000000000001",
  accountId: "00000000-0000-4000-8000-000000000002",
  email: "user@example.com",
  scopes: ["https://www.googleapis.com/auth/gmail.modify"],
  encryptedRefreshToken: "encrypted"
};

export const testThread: ThreadSnapshot = {
  threadId: "thread-1",
  threadVersion: "version-1",
  subject: "Question",
  sender: "sender@example.com",
  recipients: ["user@example.com"],
  plainText: "Can you review this?",
  attachments: [],
  labels: ["INBOX", "UNREAD"]
};

export class MemoryRepository implements Repository {
  account: AccountContext | null = testAccount;
  recommendation: { threadId: string; threadVersion: string; actionType: string } | null = null;
  executions = new Map<string, StoredExecution>();
  intelligence: { intelligence: EmailIntelligenceV11; recommendations: RecommendationSet } | null = null;
  private lockTail: Promise<void> = Promise.resolve();

  async withIdempotencyLock<T>(_accountId: string, _key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.lockTail;
    let release: () => void = () => {};
    this.lockTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await operation(); }
    finally { release(); }
  }
  async saveOAuthState(): Promise<void> {}
  async consumeOAuthState(): Promise<null> { return null; }
  async upsertGoogleAccount(): Promise<AccountContext> { return testAccount; }
  async createSession(): Promise<void> {}
  async resolveSession(): Promise<AccountContext | null> { return this.account; }
  async saveIntelligence(input: { intelligence: EmailIntelligenceV11; recommendations: RecommendationSet }): Promise<void> { this.intelligence = input; }
  async getIntelligence(): Promise<{ intelligence: EmailIntelligenceV11; recommendations: RecommendationSet } | null> { return this.intelligence; }
  async getRecommendation(): Promise<{ threadId: string; threadVersion: string; actionType: string } | null> { return this.recommendation; }
  async getExecutionByIdempotency(_accountId: string, key: string): Promise<StoredExecution | null> { return [...this.executions.values()].find((item) => item.idempotencyKey === key) ?? null; }
  async saveExecution(execution: StoredExecution): Promise<void> { this.executions.set(execution.execution.execution_id, execution); }
  async getExecution(_accountId: string, executionId: string): Promise<StoredExecution | null> { return this.executions.get(executionId) ?? null; }
  async markExecutionUndone(_accountId: string, executionId: string): Promise<void> { const item = this.executions.get(executionId); if (item) this.executions.set(executionId, { ...item, undoneAt: new Date().toISOString() }); }
  async saveFeedback(_userId: string, _accountId: string, _event: FeedbackEvent): Promise<void> {}
  async saveAudit(): Promise<void> {}
  async deleteAccountData(): Promise<void> { this.account = null; }
}

export class FakeGoogleGateway implements GoogleGateway {
  snapshot: ThreadSnapshot = testThread;
  currentLabels: LabelImage = { messages: [{ id: "message-1", labels: [...testThread.labels] }] };
  mutations = 0;
  async getThread(): Promise<ThreadSnapshot> { return { ...this.snapshot, labels: [...(this.currentLabels.messages[0]?.labels ?? [])] }; }
  async getLabelImage(): Promise<LabelImage> { return structuredClone(this.currentLabels); }
  async applyAction(): Promise<LabelImage> { this.mutations += 1; this.currentLabels = { messages: [{ id: "message-1", labels: ["UNREAD"] }] }; return this.currentLabels; }
  async restoreLabels(_account: AccountContext, _threadId: string, _current: LabelImage, target: LabelImage): Promise<LabelImage> { this.currentLabels = target; return target; }
  async createDraft(): Promise<{ draftId: string; threadId: string }> { return { draftId: "draft-1", threadId: this.snapshot.threadId }; }
  async getFreeBusy(): Promise<Array<{ start: string; end: string }>> { return []; }
  async revoke(): Promise<void> {}
}

export class FakeIntelligenceProvider implements IntelligenceProvider {
  async analyze(snapshot: ThreadSnapshot): Promise<EmailIntelligenceV11> {
    return {
      schema_version: "1.1", thread_id: snapshot.threadId, thread_version: snapshot.threadVersion,
      attention_state: "NEEDS_REPLY", intent: "QUESTION", content_type: "CONVERSATION",
      workflow_state: "OPEN", priority: "NORMAL", summary: ["The sender asks a question."],
      suggested_action: "DRAFT_REPLY", reason_code: "EXPLICIT_QUESTION", review_required: false,
      confidence: 0.9, verified_facts: { sender: snapshot.sender, recipients: snapshot.recipients, subject: snapshot.subject, dates: [], amounts: [], attachments: [], participants: [] }
    };
  }
  async draft(): Promise<string> { return "Thanks — I will review this."; }
  async meetingDraft(_snapshot: ThreadSnapshot, _intelligence: EmailIntelligenceV11, _constraints: MeetingConstraints, slots: CalendarSlot[]): Promise<string> { return `I can meet at ${slots[0]?.start}.`; }
}
