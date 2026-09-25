import { z } from "zod";

export const attentionStateSchema = z.enum([
  "NEEDS_REPLY",
  "NEEDS_ACTION",
  "FYI",
  "REVIEW"
]);

export const communicationIntentSchema = z.enum([
  "QUESTION",
  "REQUEST_ACTION",
  "REQUEST_MEETING",
  "INFORM",
  "INTRODUCE",
  "UNKNOWN"
]);

export const contentTypeSchema = z.enum([
  "CONVERSATION",
  "NEWSLETTER",
  "PROMOTION",
  "NOTIFICATION",
  "INVOICE",
  "RECEIPT",
  "OTHER"
]);

export const prioritySchema = z.enum(["HIGH", "NORMAL", "LOW"]);
export const urgencyLevelSchema = z.enum(["NONE", "LOW", "MEDIUM", "HIGH"]);

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

const probabilitySchema = z.number().min(0).max(1);

function probabilityMap<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).superRefine((value, context) => {
    const total = Object.values(value).reduce<number>((sum, item) => sum + Number(item), 0);
    if (Math.abs(total - 1) > 0.02) {
      context.addIssue({ code: "custom", message: "probabilities must sum to 1" });
    }
  });
}

export const contentTypeProbabilitiesSchema = probabilityMap({
  CONVERSATION: probabilitySchema,
  NEWSLETTER: probabilitySchema,
  PROMOTION: probabilitySchema,
  NOTIFICATION: probabilitySchema,
  INVOICE: probabilitySchema,
  RECEIPT: probabilitySchema,
  OTHER: probabilitySchema
});

export const communicationIntentProbabilitiesSchema = probabilityMap({
  QUESTION: probabilitySchema,
  REQUEST_ACTION: probabilitySchema,
  REQUEST_MEETING: probabilitySchema,
  INFORM: probabilitySchema,
  INTRODUCE: probabilitySchema,
  UNKNOWN: probabilitySchema
});

export const urgencyProbabilitiesSchema = probabilityMap({
  NONE: probabilitySchema,
  LOW: probabilitySchema,
  MEDIUM: probabilitySchema,
  HIGH: probabilitySchema
});

export const decisionSignalsV2Schema = z.object({
  schema_version: z.literal("2.0"),
  thread_id: z.string().min(1),
  thread_version: z.string().min(1),
  content_type: z.object({
    value: contentTypeSchema,
    probabilities: contentTypeProbabilitiesSchema,
    confidence: probabilitySchema
  }),
  communication_intent: z.object({
    value: communicationIntentSchema,
    probabilities: communicationIntentProbabilitiesSchema,
    confidence: probabilitySchema
  }),
  is_subscription: probabilitySchema,
  is_automated_sender: probabilitySchema,
  reply_expected: probabilitySchema,
  action_required: probabilitySchema,
  attachment_dependency: probabilitySchema,
  contradictory_thread: probabilitySchema,
  urgency: z.object({
    score: z.number().min(0).max(3),
    probabilities: urgencyProbabilitiesSchema,
    confidence: probabilitySchema
  }),
  provider: z.enum(["JEV", "OPENAI_LUNA"]),
  model_version: z.string().min(1),
  question_set_version: z.string().min(1),
  usage: z.object({
    input_tokens: z.number().int().min(0),
    output_tokens: z.number().int().min(0)
  }).optional()
});

export const derivedStateV2Schema = z.object({
  attention_state: attentionStateSchema,
  priority: prioritySchema,
  review_required: z.boolean(),
  reason_codes: z.array(z.string().min(1).max(80)).min(1).max(8)
});

export const threadHeaderSchema = z.object({
  sender: z.string(),
  subject: z.string()
});

export const summaryResultSchema = z.object({
  schema_version: z.literal("1.0"),
  thread_id: z.string().min(1),
  thread_version: z.string().min(1),
  bullets: z.array(z.string().min(1).max(240)).min(1).max(4)
});

export const analysisResultV2Schema = z.object({
  thread_header: threadHeaderSchema,
  decision_signals: decisionSignalsV2Schema,
  derived_state: derivedStateV2Schema,
  recommendations: recommendationSetSchema,
  cached: z.boolean(),
  pipeline_version: z.string().min(1)
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
  corrected_field: z.enum([
    "content_type",
    "communication_intent",
    "is_subscription",
    "attention_state",
    "priority",
    "recommendation_action"
  ]).optional(),
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

export type ContentType = z.infer<typeof contentTypeSchema>;
export type CommunicationIntent = z.infer<typeof communicationIntentSchema>;
export type DecisionSignalsV2 = z.infer<typeof decisionSignalsV2Schema>;
export type DerivedStateV2 = z.infer<typeof derivedStateV2Schema>;
export type AnalysisResultV2 = z.infer<typeof analysisResultV2Schema>;
export type SummaryResult = z.infer<typeof summaryResultSchema>;
export type RecommendationSet = z.infer<typeof recommendationSetSchema>;
export type Recommendation = z.infer<typeof recommendationSchema>;
export type ActionExecuteRequest = z.infer<typeof actionExecuteRequestSchema>;
export type ActionExecution = z.infer<typeof actionExecutionSchema>;
export type FeedbackEvent = z.infer<typeof feedbackEventSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type WriteAction = z.infer<typeof writeActionSchema>;
export type MeetingConstraints = z.infer<typeof meetingConstraintsSchema>;
export type CalendarSlot = z.infer<typeof calendarSlotSchema>;
