import { describe, expect, it } from "vitest";
import { actionExecuteRequestSchema, emailIntelligenceV11Schema, meetingConstraintsSchema } from "./index.js";

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

  it("accepts a versioned intelligence result", () => {
    const result = emailIntelligenceV11Schema.safeParse({
      schema_version: "1.1",
      thread_id: "thread-1",
      thread_version: "history-1",
      attention_state: "NEEDS_REPLY",
      intent: "QUESTION",
      content_type: "CONVERSATION",
      workflow_state: "OPEN",
      priority: "NORMAL",
      summary: ["The sender asks for a decision."],
      suggested_action: "DRAFT_REPLY",
      reason_code: "EXPLICIT_QUESTION",
      review_required: false,
      confidence: 0.91,
      verified_facts: { recipients: [], dates: [], amounts: [], attachments: [], participants: [] }
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid meeting windows and timezones", () => {
    expect(meetingConstraintsSchema.safeParse({
      time_min: "2026-08-26T17:00:00.000Z", time_max: "2026-08-26T09:00:00.000Z",
      duration_minutes: 30, timezone: "Not/AZone"
    }).success).toBe(false);
  });
});
