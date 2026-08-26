const THREAD_ID_PATTERN = /[#/](?:inbox|all|sent|search\/[^/]+)\/([a-zA-Z0-9_-]+)$/;

export function currentThreadId(locationHref = window.location.href): string | null {
  const hash = new URL(locationHref).hash;
  return hash.match(THREAD_ID_PATTERN)?.[1] ?? null;
}

export function visibleThreadIds(root: ParentNode = document): string[] {
  const ids = new Set<string>();
  root.querySelectorAll<HTMLAnchorElement>('tr.zA a[href*="/"]').forEach((anchor) => {
    const id = anchor.href.match(THREAD_ID_PATTERN)?.[1];
    if (id) ids.add(id);
  });
  return [...ids];
}

export function selectedThreadIds(root: ParentNode = document): string[] {
  const selected = root.querySelectorAll<HTMLTableRowElement>('tr.zA:has([role="checkbox"][aria-checked="true"])');
  const ids = new Set<string>();
  selected.forEach((row) => {
    row.querySelectorAll<HTMLAnchorElement>('a[href*="/"]').forEach((anchor) => {
      const id = anchor.href.match(THREAD_ID_PATTERN)?.[1];
      if (id) ids.add(id);
    });
  });
  return [...ids];
}

export function renderDecisionBadges(items: Array<{ intelligence: { thread_id: string; attention_state: string } }>, root: ParentNode = document): void {
  const decisions = new Map(items.map((item) => [item.intelligence.thread_id, decisionLabel(item.intelligence.attention_state)]));
  root.querySelectorAll<HTMLElement>("[data-ii-decision-badge]").forEach((badge) => badge.remove());
  root.querySelectorAll<HTMLAnchorElement>('tr.zA a[href*="/"]').forEach((anchor) => {
    const id = anchor.href.match(THREAD_ID_PATTERN)?.[1];
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

function decisionLabel(state: string): string {
  return ({ NEEDS_REPLY: "Needs reply", NEEDS_ACTION: "Action needed", FYI: "FYI", REVIEW: "Review" } as Record<string, string>)[state] ?? "Review";
}

export function isTextInput(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : document.activeElement;
  return Boolean(element?.closest('input, textarea, [contenteditable="true"], [role="textbox"]'));
}
