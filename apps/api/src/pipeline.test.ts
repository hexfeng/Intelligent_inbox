import { describe, expect, it } from "vitest";
import { decisionPipelineVersion, summaryPipelineVersion } from "./pipeline.js";

const models = { TYPESAFE_MODEL: "jev-a", OPENAI_DECISION_MODEL: "gpt-6-luna" } as const;

describe("pipeline cache versions", () => {
  it("separates decision backends and their configured models", () => {
    const jev = decisionPipelineVersion({ DECISION_BACKEND: "jev", ...models });
    const luna = decisionPipelineVersion({ DECISION_BACKEND: "openai-luna", ...models });
    const otherJev = decisionPipelineVersion({ DECISION_BACKEND: "jev", ...models, TYPESAFE_MODEL: "jev-b" });

    expect(jev).not.toBe(luna);
    expect(jev).not.toBe(otherJev);
  });

  it("separates summary model revisions", () => {
    expect(summaryPipelineVersion({ OPENAI_SUMMARY_MODEL: "gpt-6-luna" }))
      .not.toBe(summaryPipelineVersion({ OPENAI_SUMMARY_MODEL: "gpt-6-luna-2026-09-01" }));
  });
});
