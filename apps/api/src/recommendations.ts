import { randomUUID } from "node:crypto";
import type { EmailIntelligenceV11, Recommendation, RecommendationSet } from "@intelligent-inbox/contracts";

function riskFor(action: EmailIntelligenceV11["suggested_action"]): Recommendation["risk"] {
  if (["ARCHIVE", "MARK_READ", "LABEL", "STAR"].includes(action)) return "R1";
  if (["DRAFT_REPLY", "PROPOSE_TIME"].includes(action)) return "R2";
  return "R0";
}

export function buildRecommendationSet(intelligence: EmailIntelligenceV11): RecommendationSet {
  const primary: Recommendation = {
    id: randomUUID(),
    rank: 0,
    action_type: intelligence.review_required ? "NO_ACTION" : intelligence.suggested_action,
    reason_code: intelligence.reason_code,
    risk: intelligence.review_required ? "R0" : riskFor(intelligence.suggested_action),
    payload: {}
  };
  const secondaryActions = intelligence.review_required
    ? []
    : (["ARCHIVE", "MARK_READ"] as const).filter((action) => action !== primary.action_type);
  return {
    id: randomUUID(),
    thread_id: intelligence.thread_id,
    thread_version: intelligence.thread_version,
    primary,
    secondary: secondaryActions.slice(0, 3).map((action, index) => ({
      id: randomUUID(),
      rank: index + 1,
      action_type: action,
      reason_code: "USER_SELECTED_SAFE_ACTION",
      risk: "R1",
      payload: {}
    })),
    status: "CURRENT"
  };
}
