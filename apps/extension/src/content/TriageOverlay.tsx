import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, ChevronLeft, ChevronRight, FilePenLine, Flag, SkipForward, X } from "lucide-react";
import type { Recommendation } from "@intelligent-inbox/contracts";
import { api } from "../client.js";
import { isTextInput, renderDecisionBadges } from "./gmail-dom.js";
import type { AnalysisResult, SummaryResponse } from "./types.js";

type ApiClient = typeof api;
type Props = { threadIds: string[]; onClose: () => void; request?: ApiClient };

export function TriageOverlay({ threadIds, onClose, request = api }: Props) {
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Record<string, AnalysisResult>>({});
  const [summaries, setSummaries] = useState<Record<string, string[]>>({});
  const [summaryErrors, setSummaryErrors] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const decisionInFlight = useRef(new Set<string>());
  const summaryInFlight = useRef(new Set<string>());
  const currentId = threadIds[index];
  const current = currentId ? results[currentId] : undefined;

  const next = useCallback(() => setIndex((value) => Math.min(threadIds.length - 1, value + 1)), [threadIds.length]);
  const previous = useCallback(() => setIndex((value) => Math.max(0, value - 1)), []);
  useEffect(() => { setError(""); }, [index]);

  const loadDecision = useCallback(async (threadId: string) => {
    if (decisionInFlight.current.has(threadId)) return;
    decisionInFlight.current.add(threadId);
    if (threadId === currentId) setError("");
    try {
      const result = await request<AnalysisResult>(`/v1/threads/${encodeURIComponent(threadId)}/analyze`, "POST");
      setResults((existing) => existing[threadId] ? existing : { ...existing, [threadId]: result });
    } catch (caught) {
      if (threadId === currentId) setError(caught instanceof Error ? caught.message : "Analysis failed");
    } finally {
      decisionInFlight.current.delete(threadId);
    }
  }, [currentId, request]);

  useEffect(() => {
    const windowIds = threadIds.slice(index, index + 5).filter((threadId) => !results[threadId]);
    void Promise.all(windowIds.map(loadDecision));
  }, [index, loadDecision, results, threadIds]);

  useEffect(() => { renderDecisionBadges(Object.values(results)); }, [results]);

  useEffect(() => {
    if (!currentId || !current || summaries[currentId] || summaryInFlight.current.has(currentId)) return;
    summaryInFlight.current.add(currentId);
    void request<SummaryResponse>(`/v1/threads/${encodeURIComponent(currentId)}/summary`, "POST")
      .then((response) => setSummaries((existing) => ({ ...existing, [currentId]: response.bullets })))
      .catch(() => setSummaryErrors((existing) => ({ ...existing, [currentId]: true })))
      .finally(() => summaryInFlight.current.delete(currentId));
  }, [current, currentId, request, summaries]);

  const feedback = useCallback(async (eventType: "SKIP" | "WRONG") => {
    if (!current) return;
    await request("/v1/feedback", "POST", {
      thread_id: current.decision_signals.thread_id,
      thread_version: current.decision_signals.thread_version,
      event_type: eventType,
      recommendation_id: current.recommendations.primary.id
    });
    next();
  }, [current, next, request]);

  const execute = useCallback(async (recommendation: Recommendation) => {
    if (!current) return;
    setBusy(true); setError("");
    try {
      if (recommendation.action_type === "DRAFT_REPLY") {
        await request(`/v1/threads/${encodeURIComponent(current.decision_signals.thread_id)}/draft`, "POST", {});
      } else if (["ARCHIVE", "MARK_READ", "LABEL", "STAR"].includes(recommendation.action_type)) {
        await request(`/v1/threads/${encodeURIComponent(current.decision_signals.thread_id)}/actions/execute`, "POST", {
          action_type: recommendation.action_type,
          payload: recommendation.payload,
          source_recommendation_id: recommendation.id,
          thread_version: current.decision_signals.thread_version,
          idempotency_key: crypto.randomUUID(),
          user_confirmed: true
        });
      } else {
        setError("Open the thread panel to review this recommendation.");
        return;
      }
      void request("/v1/feedback", "POST", {
        thread_id: current.decision_signals.thread_id,
        thread_version: current.decision_signals.thread_version,
        event_type: "ACCEPT",
        recommendation_id: recommendation.id
      }).catch(() => undefined);
      next();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Action failed"); }
    finally { setBusy(false); }
  }, [current, next, request]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isTextInput(event.target)) return;
      if (event.key === "Escape") onClose();
      if (event.key.toLowerCase() === "j") next();
      if (event.key.toLowerCase() === "k") previous();
      if (event.key === "Enter" && current && !current.derived_state.review_required) void execute(current.recommendations.primary);
      if (event.key.toLowerCase() === "s") void feedback("SKIP");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [current, execute, feedback, next, onClose, previous]);

  const archive = useMemo(() => current?.recommendations.secondary.find((item) => item.action_type === "ARCHIVE"), [current]);

  if (!currentId) return <div className="triage-backdrop"><div className="triage-overlay"><p>No eligible threads found.</p><button className="ii-button" onClick={onClose}>Close</button></div></div>;
  if (!current) return <div className="triage-backdrop" role="dialog" aria-modal="true"><article className="triage-overlay"><header className="triage-header"><strong>{index + 1} / {threadIds.length}</strong><button className="icon-button" aria-label="Close triage" onClick={onClose}><X size={18} /></button></header><p>{error ? "Analysis unavailable." : "Analyzing thread…"}</p>{error ? <><p className="ii-error">{error}</p><button className="ii-button" onClick={() => void loadDecision(currentId)}>Retry</button></> : null}</article></div>;
  const summary = summaries[currentId] ?? [];

  return <div className="triage-backdrop" role="dialog" aria-modal="true" aria-label="Triage email">
    <article className="triage-overlay">
      <header className="triage-header"><button className="icon-button" disabled={index === 0} onClick={previous}><ChevronLeft size={18} /></button><strong>{index + 1} / {threadIds.length}</strong><div><button className="icon-button" disabled={index === threadIds.length - 1} onClick={next}><ChevronRight size={18} /></button><button className="icon-button" aria-label="Close triage" onClick={onClose}><X size={18} /></button></div></header>
      <div className="triage-subject"><div><h2>{current.thread_header.sender || "Current sender"}</h2><p>{current.thread_header.subject || "Gmail thread"}</p></div><span className="ii-status">{current.derived_state.attention_state.replaceAll("_", " ").toLowerCase()}</span></div>
      <section className="triage-summary"><h3>Summary</h3>{summary.length ? summary.map((line: string) => <p key={line}>{line}</p>) : <p>{summaryErrors[currentId] ? "Summary unavailable. The decision is still ready." : "Summarizing…"}</p>}</section>
      {error ? <p className="ii-error">{error}</p> : null}
      <div className="triage-actions">
        <button className="ii-button ii-button--primary" disabled={busy || current.derived_state.review_required} onClick={() => execute(current.recommendations.primary)}><FilePenLine size={16} />{current.recommendations.primary.action_type === "DRAFT_REPLY" ? "Draft reply" : "Accept"}</button>
        {archive ? <button className="ii-button" disabled={busy} onClick={() => execute(archive)}><Archive size={16} />Archive</button> : null}
        <button className="ii-button" onClick={() => feedback("SKIP")}><SkipForward size={16} />Skip</button>
        <button className="ii-button" onClick={() => feedback("WRONG")}><Flag size={16} />Wrong</button>
      </div>
      <footer className="keyboard-hints"><span><kbd>Enter</kbd> Accept</span><span><kbd>J/K</kbd> Navigate</span><span><kbd>S</kbd> Skip</span><span><kbd>Esc</kbd> Close</span></footer>
    </article>
  </div>;
}
