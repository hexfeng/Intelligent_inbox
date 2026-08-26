// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { currentThreadId, isTextInput, renderDecisionBadges, selectedThreadIds, visibleThreadIds } from "./gmail-dom.js";

describe("Gmail DOM adapter", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("extracts the current thread id without reading email text", () => {
    expect(currentThreadId("https://mail.google.com/mail/u/0/#inbox/18abc123")).toBe("18abc123");
  });

  it("collects only visible or explicitly selected row ids", () => {
    document.body.innerHTML = `<table><tr class="zA"><td role="checkbox" aria-checked="true"></td><td><a href="https://mail.google.com/mail/u/0/#inbox/thread-a">A</a></td></tr><tr class="zA"><td role="checkbox" aria-checked="false"></td><td><a href="https://mail.google.com/mail/u/0/#inbox/thread-b">B</a></td></tr></table>`;
    expect(visibleThreadIds()).toEqual(["thread-a", "thread-b"]);
    expect(selectedThreadIds()).toEqual(["thread-a"]);
  });

  it("protects Gmail inputs from triage shortcuts", () => {
    document.body.innerHTML = `<div role="textbox" contenteditable="true"></div>`;
    expect(isTextInput(document.querySelector("[role=textbox]"))).toBe(true);
  });

  it("renders at most one enum-only decision badge per Gmail row", () => {
    document.body.innerHTML = `<table><tr class="zA"><td class="y6"><a href="https://mail.google.com/mail/u/0/#inbox/thread-a">Subject</a></td></tr></table>`;
    const items = [{ intelligence: { thread_id: "thread-a", attention_state: "NEEDS_REPLY" } }];
    renderDecisionBadges(items); renderDecisionBadges(items);
    expect(document.querySelectorAll("[data-ii-decision-badge]")).toHaveLength(1);
    expect(document.querySelector("[data-ii-decision-badge]")?.textContent).toBe("Needs reply");
  });
});
