import { z } from "zod";

export const attentionStateSchema = z.enum([
  "NEEDS_REPLY",
  "NEEDS_ACTION",
  "FYI",
  "REVIEW"
]);

export const intentSchema = z.enum([
  "QUESTION",
  "REQUEST",
  "MEETING_REQUEST",
  "INVOICE",
  "INTRODUCTION",
  "NEWSLETTER",
  "NOTIFICATION",
  "UNKNOWN"
]);

export const contentTypeSchema = z.enum([
  "CONVERSATION",
  "NEWSLETTER",
  "PROMOTION",
  "NOTIFICATION",
  "RECEIPT",
  "OTHER"
]);

export const workflowStateSchema = z.enum(["OPEN", "RESOLVED"]);
export const prioritySchema = z.enum(["HIGH", "NORMAL", "LOW"]);

export const safeActionSchema = z.enum([
  "NO_ACTION",
  "ARCHIVE",
  "MARK_READ",
  "LABEL",
  "STAR",
  "DRAFT_REPLY",
  "PROPOSE_TIME"
]);

export const writeActionSchema = z.enum(["ARCHIVE", "MARK_READ", "LABEL", "STAR"]);

export const recommendationSchema = z.object({
  id: z.string().min(1),
  rank: z.number().int().min(0).max(3),
  action_type: safeActionSchema,
  reason_code: z.string().min(1).max(80),
  risk: z.enum(["R0", "R1", "R2"]),
  payload: z.record(z.string(), z.unknown()).default({})
});

export const recommendationSetSchema = z.object({
  id: z.string().min(1),
  thread_id: z.string().min(1),
  thread_version: z.string().min(1),
  primary: recommendationSchema,
  secondary: z.array(recommendationSchema).max(3),
  status: z.enum(["CURRENT", "STALE"])
});

export const verifiedFactsSchema = z.object({
  sender: z.string().optional(),
  recipients: z.array(z.string()).default([]),
  subject: z.string().optional(),
  dates: z.array(z.string()).default([]),
  amounts: z.array(z.string()).default([]),
  attachments: z.array(z.string()).default([]),
  participants: z.array(z.string()).default([])
});

export const emailIntelligenceV11Schema = z.object({
  schema_version: z.literal("1.1"),
  thread_id: z.string().min(1),
  thread_version: z.string().min(1),
  attention_state: attentionStateSchema,
  intent: intentSchema,
  content_type: contentTypeSchema,
  workflow_state: workflowStateSchema,
  priority: prioritySchema,
  summary: z.array(z.string().min(1).max(240)).min(1).max(4),
  suggested_action: safeActionSchema,
  reason_code: z.string().min(1).max(80),
  review_required: z.boolean(),
  confidence: z.number().min(0).max(1),
  verified_facts: verifiedFactsSchema
});

export const actionExecuteRequestSchema = z.object({
  action_type: writeActionSchema,
  payload: z.object({ label_id: z.string().min(1).optional() }).default({}),
  source_recommendation_id: z.string().min(1),
  thread_version: z.string().min(1),
  idempotency_key: z.string().uuid(),
  user_confirmed: z.literal(true)
}).superRefine((value, context) => {
  if (value.action_type === "LABEL" && !value.payload.label_id) {
    context.addIssue({ code: "custom", message: "LABEL requires payload.label_id", path: ["payload", "label_id"] });
  }
});

export const actionExecutionSchema = z.object({
  execution_id: z.string().min(1),
  status: z.enum(["SUCCEEDED", "FAILED", "CONFLICT"]),
  action_type: writeActionSchema,
  undo_available: z.boolean(),
  request_id: z.string().min(1)
});

export const feedbackEventSchema = z.object({
  thread_id: z.string().min(1),
  thread_version: z.string().min(1),
  event_type: z.enum(["ACCEPT", "SKIP", "WRONG", "EDIT", "UNDO", "CORRECT_FIELD"]),
  recommendation_id: z.string().optional(),
  rewrite_intent: z.enum(["SHORTER", "MORE_FORMAL", "FRIENDLY", "DECLINE"]).optional(),
  corrected_field: z.enum(["attention_state", "intent", "priority", "suggested_action"]).optional(),
  corrected_value: z.string().max(80).optional()
});

export const apiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  request_id: z.string().min(1),
  retryable: z.boolean()
});

const timezoneSchema = z.string().min(1).refine((value) => {
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; }
  catch { return false; }
}, "Invalid IANA timezone");

export const meetingConstraintsSchema = z.object({
  time_min: z.string().datetime(),
  time_max: z.string().datetime(),
  duration_minutes: z.number().int().min(15).max(240),
  timezone: timezoneSchema,
  working_day_start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("09:00"),
  working_day_end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("17:00"),
  buffer_minutes: z.number().int().min(0).max(120).default(0)
}).superRefine((value, context) => {
  if (new Date(value.time_min).getTime() >= new Date(value.time_max).getTime()) {
    context.addIssue({ code: "custom", message: "time_min must be before time_max", path: ["time_max"] });
  }
  if (value.working_day_start >= value.working_day_end) {
    context.addIssue({ code: "custom", message: "working_day_start must be before working_day_end", path: ["working_day_end"] });
  }
});

export const calendarSlotSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  timezone: z.string(),
  source: z.literal("GOOGLE_FREEBUSY")
});

export type EmailIntelligenceV11 = z.infer<typeof emailIntelligenceV11Schema>;
export type RecommendationSet = z.infer<typeof recommendationSetSchema>;
export type Recommendation = z.infer<typeof recommendationSchema>;
export type ActionExecuteRequest = z.infer<typeof actionExecuteRequestSchema>;
export type ActionExecution = z.infer<typeof actionExecutionSchema>;
export type FeedbackEvent = z.infer<typeof feedbackEventSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type WriteAction = z.infer<typeof writeActionSchema>;
export type MeetingConstraints = z.infer<typeof meetingConstraintsSchema>;
export type CalendarSlot = z.infer<typeof calendarSlotSchema>;
