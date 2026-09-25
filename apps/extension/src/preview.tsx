import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { AnalysisResult } from "./content/types.js";
import { ThreadPanel } from "./content/ThreadPanel.js";
import { TriageOverlay } from "./content/TriageOverlay.js";
import "./theme.css";
import "./content/styles.css";
import "./preview.css";

const sample: AnalysisResult = {
  thread_header: { sender: "Maya Chen <maya@example.com>", subject: "Re: Launch brief review" },
  decision_signals: {
    schema_version: "2.0",
    thread_id: "preview-thread",
    thread_version: "preview-version",
    content_type: { value: "CONVERSATION", probabilities: { CONVERSATION: 0.9, NEWSLETTER: 0.02, PROMOTION: 0.02, NOTIFICATION: 0.02, INVOICE: 0.01, RECEIPT: 0.01, OTHER: 0.02 }, confidence: 0.9 },
    communication_intent: { value: "QUESTION", probabilities: { QUESTION: 0.9, REQUEST_ACTION: 0.02, REQUEST_MEETING: 0.02, INFORM: 0.02, INTRODUCE: 0.02, UNKNOWN: 0.02 }, confidence: 0.9 },
    is_subscription: 0.01,
    is_automated_sender: 0.01,
    reply_expected: 0.92,
    action_required: 0.1,
    attachment_dependency: 0.02,
    contradictory_thread: 0.01,
    urgency: { score: 2.7, probabilities: { NONE: 0.02, LOW: 0.08, MEDIUM: 0.18, HIGH: 0.72 }, confidence: 0.72 },
    provider: "JEV",
    model_version: "jev-latest",
    question_set_version: "decision-questions:v2.1"
  },
  derived_state: { attention_state: "NEEDS_REPLY", priority: "HIGH", review_required: false, reason_codes: ["STATE_NEEDS_REPLY"] },
  recommendations: {
    id: "preview-set", thread_id: "preview-thread", thread_version: "preview-version", status: "CURRENT",
    primary: { id: "preview-primary", rank: 0, action_type: "DRAFT_REPLY", reason_code: "EXPLICIT_QUESTION", risk: "R1", payload: {} },
    secondary: [{ id: "preview-archive", rank: 1, action_type: "ARCHIVE", reason_code: "OPTIONAL_CLEANUP", risk: "R1", payload: {} }]
  },
  cached: false,
  pipeline_version: "normalizer:v2.0+decision-schema:v2.0+decision-questions:v2.1+policy:v2.1+provider:jev/jev-latest"
};

const previewRequest = async <T,>(path: string): Promise<T> => (
  path.endsWith("/analyze") ? sample
    : path.endsWith("/summary") ? { schema_version: "1.0", thread_id: "preview-thread", thread_version: "preview-version", bullets: ["Maya asks whether the revised launch brief can be reviewed before Thursday.", "The thread includes no attachment, amount, or confirmed meeting time."], cached: false }
      : path.includes("/actions/execute") ? { execution_id: "preview-execution" } : { accepted: true }
) as T;

function Preview() {
  const [mode, setMode] = useState<"thread" | "triage">("thread");
  return <main className="preview-mail">
    <header className="preview-toolbar"><strong>Gmail</strong><input aria-label="Search mail" placeholder="Search mail" /><nav><button onClick={() => setMode("thread")}>Thread panel</button><button onClick={() => setMode("triage")}>Triage</button></nav></header>
    <aside className="preview-folders"><strong>Inbox</strong><span>Starred</span><span>Snoozed</span><span>Sent</span><span>Drafts</span></aside>
    <article className="preview-thread"><p className="preview-kicker">Inbox / Launch</p><h1>Re: Launch brief review</h1><div className="preview-message"><strong>Maya Chen</strong><span>to me</span><p>Hi — could you review the revised launch brief before Thursday? I want to make sure the product story is clear before the stakeholder review.</p></div></article>
    {mode === "thread" ? <ThreadPanel threadId="preview-thread" analyzeSignal={1} onClose={() => {}} request={previewRequest} /> : <TriageOverlay threadIds={["preview-thread", "preview-thread-2", "preview-thread-3"]} onClose={() => setMode("thread")} request={previewRequest} />}
  </main>;
}

createRoot(document.getElementById("root")!).render(<Preview />);
