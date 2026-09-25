const THREAD_ID_PATTERN = /[#/](?:inbox|all|sent|search\/[^/]+)\/([a-zA-Z0-9_-]+)$/;
const GMAIL_API_THREAD_ID_PATTERN = /^[a-f0-9]{10,32}$/i;

export function currentThreadId(locationHref = window.location.href, root: ParentNode = document): string | null {
  const legacyId = visibleLegacyThreadId(root);
  if (legacyId) return legacyId;
  const hash = new URL(locationHref).hash;
  const routeId = hash.match(THREAD_ID_PATTERN)?.[1];
  return routeId && GMAIL_API_THREAD_ID_PATTERN.test(routeId) ? routeId : null;
}

export function visibleThreadIds(root: ParentNode = document): string[] {
  const ids = new Set<string>();
  root.querySelectorAll<HTMLAnchorElement>('tr.zA a[href*="/"]').forEach((anchor) => {
    const id = rowThreadId(anchor);
    if (id) ids.add(id);
  });
  return [...ids];
}

export function selectedThreadIds(root: ParentNode = document): string[] {
  const selected = root.querySelectorAll<HTMLTableRowElement>('tr.zA:has([role="checkbox"][aria-checked="true"])');
  const ids = new Set<string>();
  selected.forEach((row) => {
    row.querySelectorAll<HTMLAnchorElement>('a[href*="/"]').forEach((anchor) => {
      const id = rowThreadId(anchor);
      if (id) ids.add(id);
    });
  });
  return [...ids];
}

export function renderDecisionBadges(items: Array<{ decision_signals: { thread_id: string }; derived_state: { attention_state: string } }>, root: ParentNode = document): void {
  const decisions = new Map(items.map((item) => [item.decision_signals.thread_id, decisionLabel(item.derived_state.attention_state)]));
  root.querySelectorAll<HTMLElement>("[data-ii-decision-badge]").forEach((badge) => badge.remove());
  root.querySelectorAll<HTMLAnchorElement>('tr.zA a[href*="/"]').forEach((anchor) => {
    const id = rowThreadId(anchor);
    const label = id ? decisions.get(id) : undefined;
    if (!label) return;
    const row = anchor.closest("tr.zA");
    const target = row?.querySelector<HTMLElement>(".y6") ?? anchor.parentElement;
    if (!target || target.querySelector("[data-ii-decision-badge]")) return;
    const badge = document.createElement("span");
    badge.dataset.iiDecisionBadge = "true";
    badge.textContent = label;
    badge.style.cssText = "display:inline-block;margin-left:8px;padding:2px 6px;border:1px solid #f4c78a;border-radius:5px;color:#8a4f00;background:#fff8e8;font:600 11px/1.4 system-ui;vertical-align:middle";
    target.append(badge);
  });
}

function visibleLegacyThreadId(root: ParentNode): string | null {
  const candidates = [...root.querySelectorAll<HTMLElement>("[data-legacy-thread-id]")];
  const visible = candidates.find((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  });
  return (visible ?? (candidates.length === 1 ? candidates[0] : undefined))?.dataset.legacyThreadId ?? null;
}

function rowThreadId(anchor: HTMLAnchorElement): string | null {
  const legacyId = anchor.closest("tr.zA")?.querySelector<HTMLElement>("[data-legacy-thread-id]")?.dataset.legacyThreadId;
  if (legacyId) return legacyId;
  const routeId = anchor.href.match(THREAD_ID_PATTERN)?.[1];
  return routeId && GMAIL_API_THREAD_ID_PATTERN.test(routeId) ? routeId : null;
}

function decisionLabel(state: string): string {
  return ({ NEEDS_REPLY: "Needs reply", NEEDS_ACTION: "Action needed", FYI: "FYI", REVIEW: "Review" } as Record<string, string>)[state] ?? "Review";
}

export function isTextInput(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : document.activeElement;
  return Boolean(element?.closest('input, textarea, [contenteditable="true"], [role="textbox"]'));
}
