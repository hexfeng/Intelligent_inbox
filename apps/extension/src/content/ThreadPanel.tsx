import { useCallback, useEffect, useState } from "react";
import { Archive, Check, FilePenLine, HelpCircle, MailOpen, RotateCcw, X } from "lucide-react";
import type { Recommendation } from "@intelligent-inbox/contracts";
import { api } from "../client.js";
import type { AnalysisResult, SummaryResponse } from "./types.js";

type ApiClient = typeof api;
type Props = { threadId: string; analyzeSignal: number; onClose: () => void; request?: ApiClient };

export function ThreadPanel({ threadId, analyzeSignal, onClose, request = api }: Props) {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [summary, setSummary] = useState<string[]>([]);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [why, setWhy] = useState(false);
  const [draftIntent, setDraftIntent] = useState<"DEFAULT" | "SHORTER" | "MORE_FORMAL" | "FRIENDLY" | "DECLINE">("DEFAULT");
  const [meeting, setMeeting] = useState(() => meetingDefaults());
  const [success, setSuccess] = useState<{ label: string; executionId?: string } | null>(null);

  const loadSummary = useCallback(async () => {
    setSummaryBusy(true);
    try {
      const response = await request<SummaryResponse>(`/v1/threads/${encodeURIComponent(threadId)}/summary`, "POST");
      setSummary(response.bullets);
    } catch {
      setSummary([]);
    } finally {
      setSummaryBusy(false);
    }
  }, [request, threadId]);

  const analyze = useCallback(async () => {
    setBusy(true); setError(""); setSuccess(null);
    try {
      setResult(await request<AnalysisResult>(`/v1/threads/${encodeURIComponent(threadId)}/analyze`, "POST"));
      void loadSummary();
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Analysis failed"); }
    finally { setBusy(false); }
  }, [loadSummary, request, threadId]);

  useEffect(() => { setResult(null); setSummary([]); setError(""); setSuccess(null); }, [threadId]);
  useEffect(() => { if (analyzeSignal > 0) void analyze(); }, [analyze, analyzeSignal]);

  const execute = async (recommendation: Recommendation) => {
    setBusy(true); setError("");
    try {
      if (recommendation.action_type === "DRAFT_REPLY") {
        await request(`/v1/threads/${encodeURIComponent(threadId)}/draft`, "POST", draftIntent === "DEFAULT" ? {} : { instruction: draftIntent });
        if (draftIntent !== "DEFAULT") void request("/v1/feedback", "POST", {
          thread_id: threadId, thread_version: result!.decision_signals.thread_version, event_type: "EDIT", recommendation_id: recommendation.id,
          rewrite_intent: draftIntent
        }).catch(() => undefined);
        setSuccess({ label: "Draft created in Gmail" });
      } else if (recommendation.action_type === "PROPOSE_TIME") {
        const response = await request<{ slots: unknown[] }>(`/v1/threads/${encodeURIComponent(threadId)}/meeting-draft`, "POST", {
          time_min: new Date(meeting.start).toISOString(), time_max: new Date(meeting.end).toISOString(),
          duration_minutes: meeting.duration, timezone: meeting.timezone,
          working_day_start: "09:00", working_day_end: "17:00", buffer_minutes: 15
        });
        setSuccess({ label: `Availability draft created with ${response.slots.length} verified time${response.slots.length === 1 ? "" : "s"}` });
      } else if (["ARCHIVE", "MARK_READ", "LABEL", "STAR"].includes(recommendation.action_type)) {
        const execution = await request<{ execution_id: string }>(`/v1/threads/${encodeURIComponent(threadId)}/actions/execute`, "POST", {
          action_type: recommendation.action_type,
          payload: recommendation.payload,
          source_recommendation_id: recommendation.id,
          thread_version: result!.decision_signals.thread_version,
          idempotency_key: crypto.randomUUID(),
          user_confirmed: true
        });
        setSuccess({ label: actionLabel(recommendation.action_type), executionId: execution.execution_id });
      } else {
        setError("This recommendation requires review before action.");
        return;
      }
      void request("/v1/feedback", "POST", {
        thread_id: threadId, thread_version: result!.decision_signals.thread_version, event_type: "ACCEPT", recommendation_id: recommendation.id
      }).catch(() => undefined);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Action failed"); }
    finally { setBusy(false); }
  };

  const undo = async () => {
    if (!success?.executionId) return;
    setBusy(true);
    try {
      await request(`/v1/actions/${success.executionId}/undo`, "POST");
      if (result) void request("/v1/feedback", "POST", { thread_id: threadId, thread_version: result.decision_signals.thread_version, event_type: "UNDO" }).catch(() => undefined);
      setSuccess({ label: "Action undone" });
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Undo failed"); }
    finally { setBusy(false); }
  };

  const wrong = async () => {
    if (!result) return;
    await request("/v1/feedback", "POST", {
      thread_id: threadId,
      thread_version: result.decision_signals.thread_version,
      event_type: "WRONG",
      recommendation_id: result.recommendations.primary.id
    });
    setSuccess({ label: "Feedback recorded" });
  };

  return <aside className="thread-panel" aria-label="Intelligent Inbox thread panel">
    <header className="panel-header"><h2>Intelligent Inbox</h2><button className="icon-button" aria-label="Close panel" onClick={onClose}><X size={18} /></button></header>
    {!result ? <div className="panel-empty">
      <div className="panel-mark"><MailOpen size={22} /></div>
      <h3>Understand this thread</h3>
      <p>Analyze the current Gmail thread to get one recommended next action.</p>
      <button className="ii-button ii-button--primary" disabled={busy} onClick={analyze}>{busy ? "Analyzing…" : "Analyze thread"}</button>
    </div> : <>
      <div className={`ii-status ${result.derived_state.review_required ? "ii-status--review" : ""}`}>{statusLabel(result.derived_state.attention_state)}</div>
      <section className="panel-section"><h3>Summary</h3>{summaryBusy ? <p>Summarizing…</p> : summary.length ? summary.map((line: string) => <p key={line}>{line}</p>) : <p>Summary unavailable. The decision is still ready.</p>}</section>
      <section className="panel-section recommendation"><h3>Recommended action</h3><p>{recommendationCopy(result.recommendations.primary)}</p>
        {result.recommendations.primary.action_type === "DRAFT_REPLY" ? <label className="draft-style">Draft style<select value={draftIntent} onChange={(event) => setDraftIntent(event.target.value as typeof draftIntent)}><option value="DEFAULT">Standard</option><option value="SHORTER">Shorter</option><option value="MORE_FORMAL">More formal</option><option value="FRIENDLY">Friendly</option><option value="DECLINE">Decline</option></select></label> : null}
        {result.recommendations.primary.action_type === "PROPOSE_TIME" ? <div className="meeting-constraints"><label>From<input type="datetime-local" value={meeting.start} onChange={(event) => setMeeting({ ...meeting, start: event.target.value })} /></label><label>To<input type="datetime-local" value={meeting.end} onChange={(event) => setMeeting({ ...meeting, end: event.target.value })} /></label><label>Duration<select value={meeting.duration} onChange={(event) => setMeeting({ ...meeting, duration: Number(event.target.value) })}><option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>60 min</option></select></label><p>Timezone: {meeting.timezone}</p></div> : null}
        <button className="ii-button ii-button--primary primary-action" disabled={busy || result.derived_state.review_required} onClick={() => execute(result.recommendations.primary)}>
          {primaryIcon(result.recommendations.primary.action_type)}{actionLabel(result.recommendations.primary.action_type)}
        </button>
        <div className="secondary-actions">{result.recommendations.secondary.map((item) => <button key={item.id} className="ii-button" disabled={busy} onClick={() => execute(item)}>{primaryIcon(item.action_type)}{actionLabel(item.action_type)}</button>)}</div>
      </section>
      <div className="panel-links"><button onClick={() => setWhy((value) => !value)}><HelpCircle size={14} />Why?</button><button onClick={wrong}>Wrong</button></div>
      {why ? <p className="reason-box">Reason: {result.derived_state.reason_codes.map((code) => code.replaceAll("_", " ").toLowerCase()).join("; ")}</p> : null}
    </>}
    {error ? <p className="ii-error">{error}</p> : null}
    {success ? <div className="success-box"><Check size={17} /><span>{success.label}</span>{success.executionId ? <button onClick={undo}><RotateCcw size={14} />Undo</button> : null}</div> : null}
  </aside>;
}

function actionLabel(action: string): string {
  return ({ DRAFT_REPLY: "Draft reply", ARCHIVE: "Archive", MARK_READ: "Mark read", STAR: "Star", LABEL: "Label", PROPOSE_TIME: "Review meeting", NO_ACTION: "Review" } as Record<string, string>)[action] ?? "Review";
}
function statusLabel(status: string): string { return ({ NEEDS_REPLY: "Needs reply", NEEDS_ACTION: "Action needed", FYI: "FYI", REVIEW: "Review required" } as Record<string, string>)[status] ?? "Review"; }
function recommendationCopy(item: Recommendation): string { return item.reason_code.replaceAll("_", " ").toLowerCase(); }
function primaryIcon(action: string) {
  if (action === "DRAFT_REPLY") return <FilePenLine size={16} />;
  if (action === "ARCHIVE") return <Archive size={16} />;
  return <MailOpen size={16} />;
}

function meetingDefaults() {
  const start = new Date();
  start.setDate(start.getDate() + 1); start.setHours(9, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 5); end.setHours(17, 0, 0, 0);
  const localValue = (date: Date) => {
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };
  return { start: localValue(start), end: localValue(end), duration: 30, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
}
