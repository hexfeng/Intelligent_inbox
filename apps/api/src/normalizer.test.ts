import { describe, expect, it } from "vitest";
import { buildEvidenceEnvelope, normalizeThread } from "./normalizer.js";

describe("normalizeThread", () => {
  it("normalizes each message without flattening thread history", () => {
    const result = normalizeThread({
      threadId: "t1",
      threadVersion: "v1",
      subject: "Question",
      sender: "sender@example.com",
      recipients: ["me@example.com"],
      attachments: [],
      labels: [],
      messages: [
        {
          messageId: "m1",
          subject: "Question",
          sender: "sender@example.com",
          recipients: ["me@example.com"],
          plainText: "Can you review invoice INV-123 for $42?\n\nOn Monday Alex wrote:\n> old text\n-- \nAlex",
          attachments: [{ filename: "invoice.pdf", mimeType: "application/pdf" }],
          headers: { listUnsubscribe: false }
        },
        {
          messageId: "m2",
          subject: "Re: Question",
          sender: "me@example.com",
          recipients: ["sender@example.com"],
          plainText: "Yes, by 2026-10-01.",
          attachments: [],
          headers: { listUnsubscribe: false }
        }
      ]
    });

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]?.bodyText).toBe("Can you review invoice INV-123 for $42?");
    expect(result.messages[1]?.bodyText).toBe("Yes, by 2026-10-01.");
  });

  it("uses HTML as a fallback and emits only compact evidence references", () => {
    const thread = normalizeThread({
      threadId: "t1",
      threadVersion: "v1",
      subject: "Invoice",
      sender: "billing@example.com",
      recipients: ["me@example.com"],
      attachments: ["invoice.pdf"],
      labels: [],
      messages: [{
        messageId: "m1",
        subject: "Invoice",
        sender: "billing@example.com",
        recipients: ["me@example.com"],
        plainText: "",
        htmlText: "<p>Total: $42</p><p>Invoice INV-123</p>",
        attachments: [{ filename: "invoice.pdf" }],
        headers: { listUnsubscribe: false }
      }]
    });
    const evidence = buildEvidenceEnvelope(thread);

    expect(thread.messages[0]?.bodyText).toContain("Total: $42");
    expect(evidence.refs.map((ref) => ref.field)).toEqual(expect.arrayContaining(["SUBJECT", "SENDER", "RECIPIENT", "ATTACHMENT", "BODY"]));
    expect(JSON.stringify(evidence)).not.toContain("Total:");
  });
});
