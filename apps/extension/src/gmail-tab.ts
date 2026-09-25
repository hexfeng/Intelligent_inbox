type BrowserTab = { id?: number | undefined; url?: string | undefined } | undefined;
type SendMessage = (tabId: number, message: { type: "ANALYZE_CURRENT_THREAD" }) => Promise<unknown>;

export async function requestCurrentGmailAnalysis(tab: BrowserTab, sendMessage: SendMessage): Promise<string | null> {
  if (!tab?.id || !tab.url?.startsWith("https://mail.google.com/")) {
    return "Open a Gmail message before analyzing.";
  }
  try {
    await sendMessage(tab.id, { type: "ANALYZE_CURRENT_THREAD" });
    return null;
  } catch {
    return "Refresh the Gmail tab after reloading the extension, then try again.";
  }
}
