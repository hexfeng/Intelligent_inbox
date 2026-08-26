import { describe, expect, it } from "vitest";
import { normalizeThread } from "./normalizer.js";

describe("normalizeThread", () => {
  it("removes quoted history and signatures", () => {
    const result = normalizeThread({
      threadId: "t1",
      threadVersion: "v1",
      subject: "Question",
      sender: "sender@example.com",
      recipients: ["me@example.com"],
      plainText: "Can you review this?\n\nOn Monday Alex wrote:\n> old text\n-- \nAlex",
      attachments: [],
      labels: []
    });
    expect(result.plainText).toBe("Can you review this?");
  });
});
