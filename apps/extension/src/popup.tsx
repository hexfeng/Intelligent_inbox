import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Brain, CheckCircle2, ExternalLink, ShieldCheck } from "lucide-react";
import { sendBackground } from "./client.js";
import { requestCurrentGmailAnalysis } from "./gmail-tab.js";
import "./theme.css";
import "./popup.css";

type Status = { connected: boolean; email: string; scopes: string[] };

function Popup() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    sendBackground<Status>({ type: "ACCOUNT_STATUS" }).then(setStatus).catch(() => setStatus(null));
  }, []);

  const connect = async (calendar = false) => {
    setBusy(true); setError("");
    try {
      await sendBackground({ type: "CONNECT_GOOGLE", includeCalendar: calendar });
      setStatus(await sendBackground<Status>({ type: "ACCOUNT_STATUS" }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Connection failed");
    } finally { setBusy(false); }
  };

  const analyzeCurrent = async () => {
    setError("");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const errorMessage = await requestCurrentGmailAnalysis(tab, (tabId, message) => chrome.tabs.sendMessage(tabId, message));
    if (errorMessage) { setError(errorMessage); return; }
    window.close();
  };

  return <main className="popup-shell">
    <header className="popup-header"><Brain size={20} /><h1>Intelligent Inbox</h1></header>
    {status ? <section className="account-card">
      <div className="account-row"><CheckCircle2 size={17} color="#1e8e3e" /><div><strong>Connected</strong><span>{status.email}</span></div></div>
    </section> : <section className="empty-state"><p>Connect Google to analyze the thread you are viewing.</p></section>}
    {error ? <p className="ii-error">{error}</p> : null}
    {status ? <button className="ii-button ii-button--primary popup-action" onClick={analyzeCurrent}><Brain size={16} />Analyze current thread</button>
      : <button className="ii-button ii-button--primary popup-action" disabled={busy} onClick={() => connect(false)}>{busy ? "Connecting…" : "Connect Google"}</button>}
    {status && !status.scopes.some((scope) => scope.includes("calendar.freebusy"))
      ? <button className="ii-button popup-action" disabled={busy} onClick={() => connect(true)}><ExternalLink size={16} />Enable Calendar FreeBusy</button>
      : null}
    <button className="ii-button popup-action" onClick={() => chrome.runtime.openOptionsPage()}><ShieldCheck size={16} />Privacy &amp; data</button>
    <footer>Raw email content is processed per request and is not stored by Intelligent Inbox.</footer>
  </main>;
}

createRoot(document.getElementById("root")!).render(<Popup />);
