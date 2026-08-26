import type { ThreadSnapshot } from "./domain.js";

const SIGNATURE_MARKERS = [/^--\s*$/m, /^Sent from my /im, /^Get Outlook for /im];

export function normalizeThread(snapshot: ThreadSnapshot): ThreadSnapshot {
  let text = snapshot.plainText.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const cuts = SIGNATURE_MARKERS.map((marker) => text.search(marker)).filter((index) => index >= 0);
  if (cuts.length > 0) text = text.slice(0, Math.min(...cuts)).trim();

  const lines = text.split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^On .+ wrote:$/.test(trimmed) || trimmed.startsWith(">")) continue;
    if (kept.at(-1) === trimmed) continue;
    kept.push(trimmed);
  }

  return { ...snapshot, plainText: kept.join("\n").trim() };
}
