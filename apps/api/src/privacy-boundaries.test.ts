import { describe, expect, it } from "vitest";
import type { EmailIntelligenceV11 } from "@intelligent-inbox/contracts";
import { draftRecipient, sanitizeHeader } from "./google-gateway.js";
import { sanitizeIntelligenceForStorage } from "./postgres-repository.js";
import { testThread } from "./test-fakes.js";

const intelligence: EmailIntelligenceV11 = {
  schema_version: "1.1", thread_id: "thread-1", thread_version: "v1", attention_state: "NEEDS_REPLY",
  intent: "QUESTION", content_type: "CONVERSATION", workflow_state: "OPEN", priority: "NORMAL",
  summary: ["A derived summary."], suggested_action: "DRAFT_REPLY", reason_code: "QUESTION",
  review_required: false, confidence: 0.9,
  verified_facts: { sender: "sender@example.com", recipients: ["user@example.com"], subject: "Private subject", dates: ["Thursday"], amounts: ["$50"], attachments: ["secret.pdf"], participants: ["Maya"] }
};

describe("privacy and draft boundaries", () => {
  it("removes free-text verified facts before database persistence", () => {
    expect(sanitizeIntelligenceForStorage(intelligence).verified_facts).toEqual({ recipients: [], dates: [], amounts: [], attachments: [], participants: [] });
  });

  it("prefers a single verified Reply-To mailbox", () => {
    expect(draftRecipient({ ...testThread, replyTo: "Support <reply@example.com>" }, "user@example.com")).toBe("reply@example.com");
  });

  it("rejects self-addressed replies and strips header newlines", () => {
    expect(() => draftRecipient({ ...testThread, sender: "User <user@example.com>" }, "user@example.com")).toThrow(/latest message/);
    expect(sanitizeHeader("Subject\r\nBcc: attacker@example.com")).toBe("Subject Bcc: attacker@example.com");
  });
});
