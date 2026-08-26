import { useEffect, useState } from "react";
import { currentThreadId } from "./gmail-dom.js";
import { InboxLauncher } from "./InboxLauncher.js";
import { ThreadPanel } from "./ThreadPanel.js";

export function App() {
  const [threadId, setThreadId] = useState(() => currentThreadId());
  const [panelOpen, setPanelOpen] = useState(true);
  const [analyzeSignal, setAnalyzeSignal] = useState(0);

  useEffect(() => {
    const onRoute = () => { setThreadId(currentThreadId()); setPanelOpen(true); };
    window.addEventListener("hashchange", onRoute);
    const observer = new MutationObserver(onRoute);
    observer.observe(document.body, { childList: true, subtree: true });
    const listener = (message: { type?: string }) => {
      if (message.type === "ANALYZE_CURRENT_THREAD") { setPanelOpen(true); setAnalyzeSignal((value) => value + 1); }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => { window.removeEventListener("hashchange", onRoute); observer.disconnect(); chrome.runtime.onMessage.removeListener(listener); };
  }, []);

  return threadId && panelOpen
    ? <ThreadPanel threadId={threadId} analyzeSignal={analyzeSignal} onClose={() => setPanelOpen(false)} />
    : <InboxLauncher />;
}
