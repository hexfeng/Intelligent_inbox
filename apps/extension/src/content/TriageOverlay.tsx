import { useEffect, useState } from "react";
import { Archive, ChevronLeft, ChevronRight, FilePenLine, Flag, SkipForward, X } from "lucide-react";
import type { Recommendation } from "@intelligent-inbox/contracts";
import { api } from "../client.js";
import { isTextInput } from "./gmail-dom.js";
import type { AnalysisResult } from "./types.js";

type ApiClient = typeof api;
type Props = { items: AnalysisResult[]; onClose: () => void; request?: ApiClient };

export function TriageOverlay({ items, onClose, request = api }: Props) {
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = items[index];

  const next = () => setIndex((value) => Math.min(items.length - 1, value + 1));
  const previous = () => setIndex((value) => Math.max(0, value - 1));

  const feedback = async (eventType: "SKIP" | "WRONG") => {
    if (!current) return;
    await request("/v1/feedback", "POST", {
      thread_id: current.intelligence.thread_id,
      thread_version: current.intelligence.thread_version,
      event_type: eventType,
      recommendation_id: current.recommendations.primary.id
    });
    next();
  };

  const execute = async (recommendation: Recommendation) => {
    if (!current) return;
    setBusy(true); setError("");
    try {
      if (recommendation.action_type === "DRAFT_REPLY") {
        await request(`/v1/threads/${current.intelligence.thread_id}/draft`, "POST", {});
      } else if (["ARCHIVE", "MARK_READ", "LABEL", "STAR"].includes(recommendation.action_type)) {
        await request(`/v1/threads/${current.intelligence.thread_id}/actions/execute`, "POST", {
          action_type: recommendation.action_type,
          payload: recommendation.payload,
          source_recommendation_id: recommendation.id,
          thread_version: current.intelligence.thread_version,
          idempotency_key: crypto.randomUUID(),
          user_confirmed: true
        });
      }
      void request("/v1/feedback", "POST", {
        thread_id: current.intelligence.thread_id,
        thread_version: current.intelligence.thread_version,
        event_type: "ACCEPT",
        recommendation_id: recommendation.id
      }).catch(() => undefined);
      next();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Action failed"); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isTextInput(event.target)) return;
      if (event.key === "Escape") onClose();
      if (event.key.toLowerCase() === "j") next();
      if (event.key.toLowerCase() === "k") previous();
      if (event.key === "Enter" && current && !current.intelligence.review_required) void execute(current.recommendations.primary);
      if (event.key.toLowerCase() === "s") void feedback("SKIP");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [current, onClose]);

  if (!current) return <div className="triage-backdrop"><div className="triage-overlay"><p>No eligible threads found.</p><button className="ii-button" onClick={onClose}>Close</button></div></div>;
  const archive = current.recommendations.secondary.find((item) => item.action_type === "ARCHIVE");

  return <div className="triage-backdrop" role="dialog" aria-modal="true" aria-label="Triage email">
    <article className="triage-overlay">
      <header className="triage-header"><button className="icon-button" disabled={index === 0} onClick={previous}><ChevronLeft size={18} /></button><strong>{index + 1} / {items.length}</strong><div><button className="icon-button" disabled={index === items.length - 1} onClick={next}><ChevronRight size={18} /></button><button className="icon-button" aria-label="Close triage" onClick={onClose}><X size={18} /></button></div></header>
      <div className="triage-subject"><div><h2>{current.intelligence.verified_facts.sender ?? "Current sender"}</h2><p>{current.intelligence.verified_facts.subject ?? "Gmail thread"}</p></div><span className="ii-status">{current.intelligence.attention_state.replaceAll("_", " ").toLowerCase()}</span></div>
      <section className="triage-summary"><h3>Summary</h3>{current.intelligence.summary.map((line) => <p key={line}>{line}</p>)}</section>
      {error ? <p className="ii-error">{error}</p> : null}
      <div className="triage-actions">
        <button className="ii-button ii-button--primary" disabled={busy || current.intelligence.review_required} onClick={() => execute(current.recommendations.primary)}><FilePenLine size={16} />{current.recommendations.primary.action_type === "DRAFT_REPLY" ? "Draft reply" : "Accept"}</button>
        {archive ? <button className="ii-button" disabled={busy} onClick={() => execute(archive)}><Archive size={16} />Archive</button> : null}
        <button className="ii-button" onClick={() => feedback("SKIP")}><SkipForward size={16} />Skip</button>
        <button className="ii-button" onClick={() => feedback("WRONG")}><Flag size={16} />Wrong</button>
      </div>
      <footer className="keyboard-hints"><span><kbd>Enter</kbd> Accept</span><span><kbd>J/K</kbd> Navigate</span><span><kbd>S</kbd> Skip</span><span><kbd>Esc</kbd> Close</span></footer>
    </article>
  </div>;
}
