import { randomUUID } from "node:crypto";
import type { DecisionSignalsV2, DerivedStateV2, Recommendation, RecommendationSet } from "@intelligent-inbox/contracts";

const CLASS_CONFIDENCE_MIN = 0.65;
const CLASS_MARGIN_MIN = 0.15;

function probabilityMargin(probabilities: Record<string, number>): number {
  const sorted = Object.values(probabilities).sort((left, right) => right - left);
  return (sorted[0] ?? 0) - (sorted[1] ?? 0);
}

function riskFor(action: Recommendation["action_type"]): Recommendation["risk"] {
  if (["ARCHIVE", "MARK_READ", "LABEL", "STAR"].includes(action)) return "R1";
  if (["DRAFT_REPLY", "PROPOSE_TIME"].includes(action)) return "R2";
  return "R0";
}

export function deriveState(signals: DecisionSignalsV2): DerivedStateV2 {
  const reasons: string[] = [];
  if (signals.content_type.confidence < CLASS_CONFIDENCE_MIN || probabilityMargin(signals.content_type.probabilities) < CLASS_MARGIN_MIN) {
    reasons.push("CONTENT_TYPE_UNCERTAIN");
  }
  if (signals.communication_intent.confidence < CLASS_CONFIDENCE_MIN || probabilityMargin(signals.communication_intent.probabilities) < CLASS_MARGIN_MIN) {
    reasons.push("INTENT_UNCERTAIN");
  }
  if (signals.communication_intent.value === "UNKNOWN") reasons.push("INTENT_UNKNOWN");
  if (signals.attachment_dependency >= 0.4) reasons.push("ATTACHMENT_DEPENDENCY");
  if (signals.contradictory_thread >= 0.3) reasons.push("THREAD_CONTRADICTION");
  if (["PROMOTION", "NEWSLETTER", "NOTIFICATION", "RECEIPT"].includes(signals.content_type.value) && signals.reply_expected >= 0.6) {
    reasons.push("TYPE_REPLY_CONFLICT");
  }

  const reviewRequired = reasons.length > 0;
  const attentionState: DerivedStateV2["attention_state"] = reviewRequired
    ? "REVIEW"
    : signals.reply_expected >= 0.6
      ? "NEEDS_REPLY"
      : signals.action_required >= 0.6
        ? "NEEDS_ACTION"
        : "FYI";
  const priority: DerivedStateV2["priority"] = signals.urgency.score >= 2.5 ? "HIGH" : signals.urgency.score <= 0.75 ? "LOW" : "NORMAL";

  return {
    attention_state: attentionState,
    priority,
    review_required: reviewRequired,
    reason_codes: reasons.length ? reasons : [attentionState === "FYI" ? "NO_OBLIGATION_DETECTED" : `STATE_${attentionState}`]
  };
}

function primaryAction(signals: DecisionSignalsV2, state: DerivedStateV2): Recommendation["action_type"] {
  if (state.review_required) return "NO_ACTION";
  if (signals.communication_intent.value === "REQUEST_MEETING" && signals.reply_expected >= 0.6) return "PROPOSE_TIME";
  if (state.attention_state === "NEEDS_REPLY") return "DRAFT_REPLY";
  if (state.attention_state === "NEEDS_ACTION") return "STAR";
  if (signals.is_subscription >= 0.7 || ["PROMOTION", "NEWSLETTER", "NOTIFICATION", "RECEIPT"].includes(signals.content_type.value)) return "MARK_READ";
  return "ARCHIVE";
}

export function buildRecommendationSet(signals: DecisionSignalsV2, state = deriveState(signals)): RecommendationSet {
  const action = primaryAction(signals, state);
  const primary: Recommendation = {
    id: randomUUID(),
    rank: 0,
    action_type: action,
    reason_code: state.reason_codes[0]!,
    risk: riskFor(action),
    payload: {}
  };
  const secondaryActions = state.review_required
    ? []
    : (["ARCHIVE", "MARK_READ"] as const).filter((candidate) => candidate !== action);
  return {
    id: randomUUID(),
    thread_id: signals.thread_id,
    thread_version: signals.thread_version,
    primary,
    secondary: secondaryActions.map((secondary, index) => ({
      id: randomUUID(),
      rank: index + 1,
      action_type: secondary,
      reason_code: "USER_SELECTED_SAFE_ACTION",
      risk: "R1",
      payload: {}
    })),
    status: "CURRENT"
  };
}
