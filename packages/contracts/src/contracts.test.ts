import { describe, expect, it } from "vitest";
import { z } from "zod";
import { actionExecuteRequestSchema, decisionSignalsV2Schema, meetingConstraintsSchema } from "./index.js";

describe("shared contracts", () => {
  it("rejects dangerous or unknown actions", () => {
    const result = actionExecuteRequestSchema.safeParse({
      action_type: "SEND_REPLY",
      payload: {},
      source_recommendation_id: "rec-1",
      thread_version: "v1",
      idempotency_key: crypto.randomUUID(),
      user_confirmed: true
    });

    expect(result.success).toBe(false);
  });

  it("requires a label id for label actions", () => {
    const result = actionExecuteRequestSchema.safeParse({
      action_type: "LABEL",
      payload: {},
      source_recommendation_id: "rec-1",
      thread_version: "v1",
      idempotency_key: crypto.randomUUID(),
      user_confirmed: true
    });

    expect(result.success).toBe(false);
  });

  it("accepts versioned decision signals with calibrated shapes", () => {
    const result = decisionSignalsV2Schema.safeParse({
      schema_version: "2.0",
      thread_id: "thread-1",
      thread_version: "history-1",
      content_type: {
        value: "CONVERSATION",
        probabilities: { CONVERSATION: 0.9, NEWSLETTER: 0.02, PROMOTION: 0.01, NOTIFICATION: 0.02, INVOICE: 0.01, RECEIPT: 0.01, OTHER: 0.03 },
        confidence: 0.9
      },
      communication_intent: {
        value: "QUESTION",
        probabilities: { QUESTION: 0.9, REQUEST_ACTION: 0.02, REQUEST_MEETING: 0.01, INFORM: 0.03, INTRODUCE: 0.01, UNKNOWN: 0.03 },
        confidence: 0.9
      },
      is_subscription: 0.01,
      is_automated_sender: 0.02,
      reply_expected: 0.95,
      action_required: 0.1,
      attachment_dependency: 0.01,
      contradictory_thread: 0.01,
      urgency: { score: 1, probabilities: { NONE: 0.1, LOW: 0.8, MEDIUM: 0.08, HIGH: 0.02 }, confidence: 0.8 },
      provider: "JEV",
      model_version: "jev-latest",
      question_set_version: "email-v2"
    });

    expect(result.success).toBe(true);
  });

  it("rejects incomplete or unnormalized probability maps", () => {
    const result = decisionSignalsV2Schema.shape.content_type.safeParse({
      value: "PROMOTION",
      probabilities: { CONVERSATION: 0.1, NEWSLETTER: 0.1, PROMOTION: 0.1, NOTIFICATION: 0.1, INVOICE: 0.1, RECEIPT: 0.1, OTHER: 0.1 },
      confidence: 0.8
    });

    expect(result.success).toBe(false);
  });

  it("keeps the OpenAI fallback decision contract JSON-schema compatible", () => {
    const modelSchema = decisionSignalsV2Schema.omit({
      thread_id: true,
      thread_version: true,
      provider: true,
      model_version: true,
      question_set_version: true,
      usage: true
    });
    expect(() => z.toJSONSchema(modelSchema)).not.toThrow();
  });

  it("rejects invalid meeting windows and timezones", () => {
    expect(meetingConstraintsSchema.safeParse({
      time_min: "2026-08-26T17:00:00.000Z", time_max: "2026-08-26T09:00:00.000Z",
      duration_minutes: 30, timezone: "Not/AZone"
    }).success).toBe(false);
  });
});
