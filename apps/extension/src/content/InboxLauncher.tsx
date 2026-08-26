import { useState } from "react";
import { Layers3, ListChecks, X } from "lucide-react";
import { api } from "../client.js";
import { renderDecisionBadges, selectedThreadIds, visibleThreadIds } from "./gmail-dom.js";
import { TriageOverlay } from "./TriageOverlay.js";
import type { TriageQueue } from "./types.js";

export function InboxLauncher() {
  const [items, setItems] = useState<TriageQueue["items"] | null>(null);
  const [preview, setPreview] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const start = async (ids: string[]) => {
    if (ids.length === 0) { setError("No Gmail threads are visible in this view."); return; }
    setBusy(true); setError("");
    try {
      const queue = (await api<TriageQueue>("/v1/triage/queue", "POST", { thread_ids: ids })).items;
      renderDecisionBadges(queue);
      setItems(queue);
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Triage could not start"); }
    finally { setBusy(false); }
  };

  const selectBatch = () => {
    const ids = selectedThreadIds();
    if (ids.length === 0) setError("Select Gmail rows before opening batch preview.");
    else { setError(""); setPreview(ids); }
  };

  return <>
    <div className="inbox-launcher"><button className="ii-button ii-button--primary" disabled={busy} onClick={() => start(visibleThreadIds())}><ListChecks size={16} />{busy ? "Preparing…" : "Start triage"}</button><button className="ii-button" onClick={selectBatch}><Layers3 size={16} />Selected batch</button>{error ? <span className="launcher-error">{error}</span> : null}</div>
    {items ? <TriageOverlay items={items} onClose={() => setItems(null)} /> : null}
    {preview ? <div className="batch-backdrop" role="dialog" aria-modal="true"><section className="batch-preview"><header><div><h2>Selected batch preview</h2><p>{preview.length} explicitly selected Gmail threads</p></div><button className="icon-button" onClick={() => setPreview(null)}><X size={18} /></button></header><div className="batch-rule"><strong>Allowed actions</strong><span>Archive · Mark read · Label</span></div><p className="ii-muted">Each thread is analyzed on demand. Nothing is executed until you review the queue.</p><div className="batch-footer"><button className="ii-button" onClick={() => setPreview(null)}>Cancel</button><button className="ii-button ii-button--primary" onClick={() => { const ids = preview; setPreview(null); void start(ids); }}>Review queue</button></div></section></div> : null}
  </>;
}
