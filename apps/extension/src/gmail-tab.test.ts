import { describe, expect, it, vi } from "vitest";
import { requestCurrentGmailAnalysis } from "./gmail-tab.js";

describe("popup Gmail target", () => {
  it("does not message a non-Gmail tab", async () => {
    const send = vi.fn();
    await expect(requestCurrentGmailAnalysis({ id: 1, url: "chrome://extensions/" }, send))
      .resolves.toBe("Open a Gmail message before analyzing.");
    expect(send).not.toHaveBeenCalled();
  });

  it("turns a missing content script into a recovery message", async () => {
    const send = vi.fn().mockRejectedValue(new Error("Receiving end does not exist"));
    await expect(requestCurrentGmailAnalysis({ id: 2, url: "https://mail.google.com/mail/u/0/#inbox/id" }, send))
      .resolves.toBe("Refresh the Gmail tab after reloading the extension, then try again.");
  });
});
