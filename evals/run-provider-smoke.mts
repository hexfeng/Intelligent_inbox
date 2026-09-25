import "../apps/api/src/env.js";
import { readFile } from "node:fs/promises";
import type { DecisionProvider, NormalizedThread } from "../apps/api/src/domain.js";
import { loadConfig } from "../apps/api/src/config.js";
import { OpenAIDecisionProvider, OpenAIGenerationProvider } from "../apps/api/src/openai-provider.js";
import { buildRecommendationSet, deriveState } from "../apps/api/src/recommendations.js";
import { TypeSafeDecisionProvider } from "../apps/api/src/typesafe-decision-provider.js";

type Fixture = { id: string; thread: NormalizedThread };
type LockedLabel = {
  id: string;
  content_type: string;
  communication_intent: string;
  is_subscription: boolean;
  attention_state: string;
};

async function readJsonl<T>(name: string): Promise<T[]> {
  return (await readFile(new URL(name, import.meta.url), "utf8"))
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line) as T);
}

async function evaluate(provider: DecisionProvider, fixtures: Fixture[], labels: Map<string, LockedLabel>) {
  const results = [];
  for (const fixture of fixtures) {
    const expected = labels.get(fixture.id);
    if (!expected) throw new Error(`Locked label is missing for ${fixture.id}`);
    const signals = await provider.decide(fixture.thread);
    const state = deriveState(signals);
    const recommendation = buildRecommendationSet(signals, state).primary.action_type;
    const checks = {
      content_type: signals.content_type.value === expected.content_type,
      communication_intent: signals.communication_intent.value === expected.communication_intent,
      is_subscription: (signals.is_subscription >= 0.5) === expected.is_subscription,
      attention_state: state.attention_state === expected.attention_state
    };
    results.push({
      fixture: fixture.id,
      pass: Object.values(checks).every(Boolean),
      checks,
      actual: {
        content_type: signals.content_type.value,
        content_confidence: signals.content_type.confidence,
        communication_intent: signals.communication_intent.value,
        intent_confidence: signals.communication_intent.confidence,
        is_subscription: signals.is_subscription,
        reply_expected: signals.reply_expected,
        action_required: signals.action_required,
        attachment_dependency: signals.attachment_dependency,
        attention_state: state.attention_state,
        review_required: state.review_required,
        recommendation
      },
      provider: signals.provider,
      model: signals.model_version,
      usage: signals.usage
    });
  }
  return results;
}

async function main(): Promise<void> {
  const config = loadConfig();
  if (config.DECISION_BACKEND !== "jev") throw new Error("eval:smoke requires DECISION_BACKEND=jev");
  const fixtures = await readJsonl<Fixture>("./fixtures.deidentified.jsonl");
  const labels = new Map((await readJsonl<LockedLabel>("./labels.locked.jsonl")).map((label) => [label.id, label]));
  const jevResults = await evaluate(new TypeSafeDecisionProvider(config), fixtures, labels);
  const lunaResults = await evaluate(new OpenAIDecisionProvider(config), fixtures, labels);

  const summaryFixture = fixtures[0]!;
  const bullets = await new OpenAIGenerationProvider(config).summarize(summaryFixture.thread, {
    threadId: summaryFixture.thread.threadId,
    threadVersion: summaryFixture.thread.threadVersion,
    refs: []
  });
  const jevPassed = jevResults.filter((result) => result.pass).length;
  const lunaPassed = lunaResults.filter((result) => result.pass).length;
  process.stdout.write(`${JSON.stringify({
    decision_providers: [
      { provider: "JEV", configured_model: config.TYPESAFE_MODEL, passed: jevPassed, total: jevResults.length, results: jevResults },
      { provider: "OPENAI_LUNA", configured_model: config.OPENAI_DECISION_MODEL, passed: lunaPassed, total: lunaResults.length, results: lunaResults }
    ],
    summary: { model: config.OPENAI_SUMMARY_MODEL, fixture: summaryFixture.id, bullet_count: bullets.length }
  }, null, 2)}\n`);
  if (jevPassed !== jevResults.length || lunaPassed !== lunaResults.length) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Provider smoke test failed"}\n`);
  process.exitCode = 1;
});
