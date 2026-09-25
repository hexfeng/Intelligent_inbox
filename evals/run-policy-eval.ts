import { readFile } from "node:fs/promises";
import type { DecisionSignalsV2 } from "@intelligent-inbox/contracts";
import { buildRecommendationSet, deriveState } from "../apps/api/src/recommendations.js";

type Case = {
  id: string;
  overrides: Partial<DecisionSignalsV2>;
  expected: { attention_state: string; review_required: boolean; action_type: string };
};

const base: DecisionSignalsV2 = {
  schema_version: "2.0",
  thread_id: "eval-thread",
  thread_version: "v1",
  content_type: { value: "CONVERSATION", probabilities: { CONVERSATION: 0.9, NEWSLETTER: 0.02, PROMOTION: 0.02, NOTIFICATION: 0.02, INVOICE: 0.01, RECEIPT: 0.01, OTHER: 0.02 }, confidence: 0.9 },
  communication_intent: { value: "QUESTION", probabilities: { QUESTION: 0.9, REQUEST_ACTION: 0.02, REQUEST_MEETING: 0.02, INFORM: 0.02, INTRODUCE: 0.02, UNKNOWN: 0.02 }, confidence: 0.9 },
  is_subscription: 0.01,
  is_automated_sender: 0.01,
  reply_expected: 0.9,
  action_required: 0.1,
  attachment_dependency: 0.05,
  contradictory_thread: 0.02,
  urgency: { score: 1, probabilities: { NONE: 0.1, LOW: 0.7, MEDIUM: 0.15, HIGH: 0.05 }, confidence: 0.7 },
  provider: "JEV",
  model_version: "eval",
  question_set_version: "decision-questions:v2.1"
};

async function main(): Promise<void> {
  const url = new URL("./policy-cases.jsonl", import.meta.url);
  const cases = (await readFile(url, "utf8")).trim().split(/\r?\n/).map((line) => JSON.parse(line) as Case);
  let passed = 0;
  for (const item of cases) {
    const signals = { ...base, ...item.overrides } as DecisionSignalsV2;
    const state = deriveState(signals);
    const action = buildRecommendationSet(signals, state).primary.action_type;
    const actual = { attention_state: state.attention_state, review_required: state.review_required, action_type: action };
    const ok = JSON.stringify(actual) === JSON.stringify(item.expected);
    process.stdout.write(`${ok ? "PASS" : "FAIL"} ${item.id}${ok ? "" : ` expected=${JSON.stringify(item.expected)} actual=${JSON.stringify(actual)}`}\n`);
    if (ok) passed += 1;
  }
  process.stdout.write(`${passed}/${cases.length} policy cases passed\n`);
  if (passed !== cases.length) process.exitCode = 1;
}

void main();
