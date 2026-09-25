import { describe, expect, it } from "vitest";
import { draftRecipient, sanitizeHeader } from "./google-gateway.js";
import { sanitizeDecisionForStorage } from "./postgres-repository.js";
import { PIPELINE_VERSION } from "./pipeline.js";
import { buildRecommendationSet, deriveState } from "./recommendations.js";
import { testDecisionSignals, testThread } from "./test-fakes.js";

describe("privacy and draft boundaries", () => {
  it("persists only the typed decision record and strips unknown email content", () => {
    const signals = Object.assign(testDecisionSignals(), { raw_body: "Private email body" });
    const state = deriveState(signals);
    const stored = sanitizeDecisionForStorage({
      decisionSignals: signals,
      derivedState: state,
      recommendations: buildRecommendationSet(signals, state),
      pipelineVersion: PIPELINE_VERSION
    });
    expect(JSON.stringify(stored)).not.toContain("Private email body");
    expect(stored.decisionSignals).not.toHaveProperty("raw_body");
  });

  it("prefers a single verified Reply-To mailbox", () => {
    expect(draftRecipient({ ...testThread, replyTo: "Support <reply@example.com>" }, "user@example.com")).toBe("reply@example.com");
  });

  it("rejects self-addressed replies and strips header newlines", () => {
    expect(() => draftRecipient({ ...testThread, sender: "User <user@example.com>" }, "user@example.com")).toThrow(/latest message/);
    expect(sanitizeHeader("Subject\r\nBcc: attacker@example.com")).toBe("Subject Bcc: attacker@example.com");
  });
});
