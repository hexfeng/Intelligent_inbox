import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ExternalLink, ShieldCheck, Trash2, Unplug } from "lucide-react";
import { api } from "./client.js";
import "./theme.css";
import "./privacy.css";

function PrivacyPage() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");

  const removeAccount = async (path: string, label: string) => {
    if (!window.confirm(`${label} will remove Intelligent Inbox account data and attempt to revoke Google access. Continue?`)) return;
    setBusy(true); setResult("");
    try {
      const response = await api<{ revoked: boolean }>(path, path.endsWith("/data") ? "DELETE" : "POST");
      await chrome.storage.local.remove("session_token");
      setResult(response.revoked ? "Account data deleted and Google access revoked." : "Account data deleted. Google revocation could not be confirmed; review access in your Google Account.");
    } catch (error) {
      setResult(error instanceof Error ? error.message : "The request failed.");
    } finally { setBusy(false); }
  };

  return <main className="privacy-shell">
    <header><ShieldCheck size={26} /><div><h1>Privacy &amp; data</h1><p>Control what Intelligent Inbox keeps and how your account is connected.</p></div></header>
    <section><h2>Stored by Intelligent Inbox</h2><p>Account references, Gmail thread IDs and versions, structured intelligence, recommendations, action history, feedback, and security audit metadata.</p></section>
    <section><h2>Not stored by Intelligent Inbox</h2><p>Raw email bodies, attachments, free-text extracted entities, and draft body text are processed only for the active request and are excluded from the product database, analytics, error reports, and ordinary logs.</p></section>
    <section><h2>OpenAI processing</h2><p>Requests use <code>store: false</code>. This is not the same as Zero Data Retention; provider handling depends on the account's approved data controls.</p><a href="https://developers.openai.com/api/docs/guides/your-data" target="_blank" rel="noreferrer">Read OpenAI data controls <ExternalLink size={14} /></a></section>
    {result ? <p className="privacy-result" role="status">{result}</p> : null}
    <div className="privacy-actions">
      <button className="ii-button" disabled={busy} onClick={() => removeAccount("/v1/account/disconnect", "Disconnect")}><Unplug size={16} />Disconnect and remove data</button>
      <button className="ii-button privacy-danger" disabled={busy} onClick={() => removeAccount("/v1/account/data", "Delete account data")}><Trash2 size={16} />Delete account data</button>
    </div>
  </main>;
}

createRoot(document.getElementById("root")!).render(<PrivacyPage />);
