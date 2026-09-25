// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { currentThreadId, isTextInput, renderDecisionBadges, selectedThreadIds, visibleThreadIds } from "./gmail-dom.js";

describe("Gmail DOM adapter", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("prefers the visible Gmail API thread id over the opaque UI route id", () => {
    document.body.innerHTML = `<h2 data-legacy-thread-id="1a0d55f1a19cebb5">Subject</h2>`;
    expect(currentThreadId("https://mail.google.com/mail/u/0/#inbox/FMfcgzOpaque", document)).toBe("1a0d55f1a19cebb5");
  });

  it("accepts a legacy hex route id but rejects an opaque route without DOM evidence", () => {
    expect(currentThreadId("https://mail.google.com/mail/u/0/#inbox/1a0d55f1a19cebb5", document)).toBe("1a0d55f1a19cebb5");
    expect(currentThreadId("https://mail.google.com/mail/u/0/#inbox/FMfcgzOpaque", document)).toBeNull();
  });

  it("collects only visible or explicitly selected row ids", () => {
    document.body.innerHTML = `<table><tr class="zA"><td role="checkbox" aria-checked="true"></td><td><a href="https://mail.google.com/mail/u/0/#inbox/FMfcOne"><span data-legacy-thread-id="1a0d55f1a19cebb5">A</span></a></td></tr><tr class="zA"><td role="checkbox" aria-checked="false"></td><td><a href="https://mail.google.com/mail/u/0/#inbox/FMfcTwo"><span data-legacy-thread-id="1a0d54f04ad77fb7">B</span></a></td></tr></table>`;
    expect(visibleThreadIds()).toEqual(["1a0d55f1a19cebb5", "1a0d54f04ad77fb7"]);
    expect(selectedThreadIds()).toEqual(["1a0d55f1a19cebb5"]);
  });

  it("protects Gmail inputs from triage shortcuts", () => {
    document.body.innerHTML = `<div role="textbox" contenteditable="true"></div>`;
    expect(isTextInput(document.querySelector("[role=textbox]"))).toBe(true);
  });

  it("renders at most one enum-only decision badge per Gmail row", () => {
    document.body.innerHTML = `<table><tr class="zA"><td class="y6"><a href="https://mail.google.com/mail/u/0/#inbox/FMfcOne"><span data-legacy-thread-id="1a0d55f1a19cebb5">Subject</span></a></td></tr></table>`;
    const items = [{ decision_signals: { thread_id: "1a0d55f1a19cebb5" }, derived_state: { attention_state: "NEEDS_REPLY" } }];
    renderDecisionBadges(items); renderDecisionBadges(items);
    expect(document.querySelectorAll("[data-ii-decision-badge]")).toHaveLength(1);
    expect(document.querySelector("[data-ii-decision-badge]")?.textContent).toBe("Needs reply");
  });
});
