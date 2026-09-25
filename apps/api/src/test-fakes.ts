import type {
  CalendarSlot,
  DecisionSignalsV2,
  DerivedStateV2,
  FeedbackEvent,
  MeetingConstraints,
  SummaryResult
} from "@intelligent-inbox/contracts";
import type {
  AccountContext,
  DecisionProvider,
  DecisionRecord,
  DraftProvider,
  EvidenceEnvelope,
  GoogleGateway,
  LabelImage,
  NormalizedThread,
  Repository,
  StoredExecution,
  SummaryProvider,
  ThreadSnapshot
} from "./domain.js";

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
  attachments: [],
  labels: ["INBOX", "UNREAD"],
  messages: [{
    messageId: "message-1",
    subject: "Question",
    sender: "sender@example.com",
    recipients: ["user@example.com"],
    plainText: "Can you review this?",
    attachments: [],
    headers: { listUnsubscribe: false }
  }]
};

const contentProbabilities = {
  CONVERSATION: 0.9, NEWSLETTER: 0.02, PROMOTION: 0.02, NOTIFICATION: 0.02, INVOICE: 0.01, RECEIPT: 0.01, OTHER: 0.02
};
const intentProbabilities = { QUESTION: 0.9, REQUEST_ACTION: 0.02, REQUEST_MEETING: 0.02, INFORM: 0.02, INTRODUCE: 0.02, UNKNOWN: 0.02 };

export function testDecisionSignals(threadId = "thread-1", threadVersion = "version-1"): DecisionSignalsV2 {
  return {
    schema_version: "2.0",
    thread_id: threadId,
    thread_version: threadVersion,
    content_type: { value: "CONVERSATION", probabilities: contentProbabilities, confidence: 0.9 },
    communication_intent: { value: "QUESTION", probabilities: intentProbabilities, confidence: 0.9 },
    is_subscription: 0.01,
    is_automated_sender: 0.01,
    reply_expected: 0.9,
    action_required: 0.1,
    attachment_dependency: 0.05,
    contradictory_thread: 0.02,
    urgency: { score: 1, probabilities: { NONE: 0.1, LOW: 0.7, MEDIUM: 0.15, HIGH: 0.05 }, confidence: 0.7 },
    provider: "JEV",
    model_version: "jev-test",
    question_set_version: "decision-questions:v2.1"
  };
}

export class MemoryRepository implements Repository {
  account: AccountContext | null = testAccount;
  recommendation: { threadId: string; threadVersion: string; actionType: string } | null = null;
  executions = new Map<string, StoredExecution>();
  decision: DecisionRecord | null = null;
  summaries = new Map<string, SummaryResult>();
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
  async saveDecision(input: { record: DecisionRecord }): Promise<void> { this.decision = structuredClone(input.record); }
  async getDecision(_accountId: string, _threadId: string, threadVersion: string | undefined, pipelineVersion: string): Promise<DecisionRecord | null> {
    return this.decision?.pipelineVersion === pipelineVersion && (!threadVersion || this.decision.decisionSignals.thread_version === threadVersion)
      ? structuredClone(this.decision)
      : null;
  }
  async saveSummary(input: { summary: SummaryResult; pipelineVersion: string }): Promise<void> {
    this.summaries.set(`${input.summary.thread_id}:${input.summary.thread_version}:${input.pipelineVersion}`, structuredClone(input.summary));
  }
  async getSummary(_accountId: string, threadId: string, threadVersion: string, pipelineVersion: string): Promise<SummaryResult | null> {
    return structuredClone(this.summaries.get(`${threadId}:${threadVersion}:${pipelineVersion}`) ?? null);
  }
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
  async getThread(): Promise<ThreadSnapshot> { return { ...structuredClone(this.snapshot), labels: [...(this.currentLabels.messages[0]?.labels ?? [])] }; }
  async getLabelImage(): Promise<LabelImage> { return structuredClone(this.currentLabels); }
  async applyAction(): Promise<LabelImage> { this.mutations += 1; this.currentLabels = { messages: [{ id: "message-1", labels: ["UNREAD"] }] }; return this.currentLabels; }
  async restoreLabels(_account: AccountContext, _threadId: string, _current: LabelImage, target: LabelImage): Promise<LabelImage> { this.currentLabels = target; return target; }
  async createDraft(): Promise<{ draftId: string; threadId: string }> { return { draftId: "draft-1", threadId: this.snapshot.threadId }; }
  async getFreeBusy(): Promise<Array<{ start: string; end: string }>> { return []; }
  async revoke(): Promise<void> {}
}

export class FakeDecisionProvider implements DecisionProvider {
  calls = 0;
  async decide(thread: NormalizedThread): Promise<DecisionSignalsV2> {
    this.calls += 1;
    return testDecisionSignals(thread.threadId, thread.threadVersion);
  }
}

export class FakeGenerationProvider implements SummaryProvider, DraftProvider {
  summaryCalls = 0;
  async summarize(): Promise<string[]> { this.summaryCalls += 1; return ["The sender asks a question."]; }
  async draft(_snapshot: ThreadSnapshot, _thread: NormalizedThread, _evidence: EvidenceEnvelope, _state: DerivedStateV2): Promise<string> { return "Thanks — I will review this."; }
  async meetingDraft(_snapshot: ThreadSnapshot, _thread: NormalizedThread, _evidence: EvidenceEnvelope, _state: DerivedStateV2, _constraints: MeetingConstraints, slots: CalendarSlot[]): Promise<string> { return `I can meet at ${slots[0]?.start}.`; }
}
