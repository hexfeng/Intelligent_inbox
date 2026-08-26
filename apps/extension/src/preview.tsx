import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { AnalysisResult } from "./content/types.js";
import { ThreadPanel } from "./content/ThreadPanel.js";
import { TriageOverlay } from "./content/TriageOverlay.js";
import "./theme.css";
import "./content/styles.css";
import "./preview.css";

const sample: AnalysisResult = {
  intelligence: {
    schema_version: "1.1",
    thread_id: "preview-thread",
    thread_version: "preview-version",
    attention_state: "NEEDS_REPLY",
    intent: "QUESTION",
    content_type: "CONVERSATION",
    workflow_state: "OPEN",
    priority: "HIGH",
    summary: ["Maya asks whether the revised launch brief can be reviewed before Thursday.", "The thread includes no attachment, amount, or confirmed meeting time."],
    suggested_action: "DRAFT_REPLY",
    reason_code: "EXPLICIT_QUESTION",
    review_required: false,
    confidence: 0.94,
    verified_facts: {
      sender: "Maya Chen <maya@example.com>", recipients: ["you@example.com"], subject: "Re: Launch brief review",
      dates: ["Thursday"], amounts: [], attachments: [], participants: ["Maya Chen"]
    }
  },
  recommendations: {
    id: "preview-set", thread_id: "preview-thread", thread_version: "preview-version", status: "CURRENT",
    primary: { id: "preview-primary", rank: 0, action_type: "DRAFT_REPLY", reason_code: "EXPLICIT_QUESTION", risk: "R1", payload: {} },
    secondary: [{ id: "preview-archive", rank: 1, action_type: "ARCHIVE", reason_code: "OPTIONAL_CLEANUP", risk: "R1", payload: {} }]
  }
};

const previewRequest = async <T,>(path: string): Promise<T> => (
  path.endsWith("/analyze") ? sample : path.includes("/actions/execute") ? { execution_id: "preview-execution" } : { accepted: true }
) as T;

function Preview() {
  const [mode, setMode] = useState<"thread" | "triage">("thread");
  return <main className="preview-mail">
    <header className="preview-toolbar"><strong>Gmail</strong><input aria-label="Search mail" placeholder="Search mail" /><nav><button onClick={() => setMode("thread")}>Thread panel</button><button onClick={() => setMode("triage")}>Triage</button></nav></header>
    <aside className="preview-folders"><strong>Inbox</strong><span>Starred</span><span>Snoozed</span><span>Sent</span><span>Drafts</span></aside>
    <article className="preview-thread"><p className="preview-kicker">Inbox / Launch</p><h1>Re: Launch brief review</h1><div className="preview-message"><strong>Maya Chen</strong><span>to me</span><p>Hi — could you review the revised launch brief before Thursday? I want to make sure the product story is clear before the stakeholder review.</p></div></article>
    {mode === "thread" ? <ThreadPanel threadId="preview-thread" analyzeSignal={1} onClose={() => {}} request={previewRequest} /> : <TriageOverlay items={[sample, sample, sample]} onClose={() => setMode("thread")} request={previewRequest} />}
  </main>;
}

createRoot(document.getElementById("root")!).render(<Preview />);
