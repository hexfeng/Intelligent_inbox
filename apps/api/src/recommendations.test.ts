import { describe, expect, it } from "vitest";
import type { DecisionSignalsV2 } from "@intelligent-inbox/contracts";
import { buildRecommendationSet, deriveState } from "./recommendations.js";
import { testDecisionSignals } from "./test-fakes.js";

function withSignals(overrides: Partial<DecisionSignalsV2>): DecisionSignalsV2 {
  return { ...testDecisionSignals(), ...overrides };
}

describe("decision policy v2", () => {
  it.each([
    {
      name: "promotion subscription",
      signals: withSignals({
        content_type: { value: "PROMOTION", confidence: 0.88, probabilities: { CONVERSATION: 0.02, NEWSLETTER: 0.04, PROMOTION: 0.88, NOTIFICATION: 0.02, INVOICE: 0.01, RECEIPT: 0.01, OTHER: 0.02 } },
        communication_intent: { value: "REQUEST_ACTION", confidence: 0.9, probabilities: { QUESTION: 0.02, REQUEST_ACTION: 0.9, REQUEST_MEETING: 0.01, INFORM: 0.02, INTRODUCE: 0.02, UNKNOWN: 0.03 } },
        is_subscription: 0.92,
        reply_expected: 0.03,
        action_required: 0.42
      }),
      state: "FYI",
      action: "MARK_READ"
    },
    {
      name: "subscription signal independent of content type",
      signals: withSignals({
        content_type: { value: "OTHER", confidence: 0.88, probabilities: { CONVERSATION: 0.02, NEWSLETTER: 0.04, PROMOTION: 0.02, NOTIFICATION: 0.02, INVOICE: 0.01, RECEIPT: 0.01, OTHER: 0.88 } },
        communication_intent: { value: "INFORM", confidence: 0.9, probabilities: { QUESTION: 0.02, REQUEST_ACTION: 0.02, REQUEST_MEETING: 0.01, INFORM: 0.9, INTRODUCE: 0.02, UNKNOWN: 0.03 } },
        is_subscription: 0.92,
        reply_expected: 0.03,
        action_required: 0.02
      }),
      state: "FYI",
      action: "MARK_READ"
    },
    {
      name: "meeting request",
      signals: withSignals({
        communication_intent: { value: "REQUEST_MEETING", confidence: 0.9, probabilities: { QUESTION: 0.02, REQUEST_ACTION: 0.02, REQUEST_MEETING: 0.9, INFORM: 0.02, INTRODUCE: 0.02, UNKNOWN: 0.02 } }
      }),
      state: "NEEDS_REPLY",
      action: "PROPOSE_TIME"
    },
    {
      name: "non-reply action",
      signals: withSignals({
        communication_intent: { value: "REQUEST_ACTION", confidence: 0.9, probabilities: { QUESTION: 0.02, REQUEST_ACTION: 0.9, REQUEST_MEETING: 0.02, INFORM: 0.02, INTRODUCE: 0.02, UNKNOWN: 0.02 } },
        reply_expected: 0.2,
        action_required: 0.9
      }),
      state: "NEEDS_ACTION",
      action: "STAR"
    }
  ])("routes $name deterministically", ({ signals, state, action }) => {
    const derived = deriveState(signals);
    expect(derived.attention_state).toBe(state);
    expect(derived.review_required).toBe(false);
    expect(buildRecommendationSet(signals, derived).primary.action_type).toBe(action);
  });

  it.each([
    ["attachment-dependent", withSignals({ attachment_dependency: 0.8 }), "ATTACHMENT_DEPENDENCY"],
    ["contradictory", withSignals({ contradictory_thread: 0.7 }), "THREAD_CONTRADICTION"],
    ["low-margin intent", withSignals({ communication_intent: { value: "QUESTION", confidence: 0.51, probabilities: { QUESTION: 0.51, REQUEST_ACTION: 0.39, REQUEST_MEETING: 0.03, INFORM: 0.03, INTRODUCE: 0.02, UNKNOWN: 0.02 } } }), "INTENT_UNCERTAIN"]
  ])("sends %s decisions to review", (_name, signals, reason) => {
    const derived = deriveState(signals as DecisionSignalsV2);
    expect(derived).toMatchObject({ attention_state: "REVIEW", review_required: true });
    expect(derived.reason_codes).toContain(reason);
    expect(buildRecommendationSet(signals as DecisionSignalsV2, derived).primary.action_type).toBe("NO_ACTION");
  });
});
