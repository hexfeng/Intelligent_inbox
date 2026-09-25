import type { AppConfig } from "./config.js";

export const NORMALIZER_VERSION = "normalizer:v2.0";
export const QUESTION_SET_VERSION = "decision-questions:v2.1";
export const POLICY_VERSION = "policy:v2.1";
export const PIPELINE_VERSION = `${NORMALIZER_VERSION}+decision-schema:v2.0+${QUESTION_SET_VERSION}+${POLICY_VERSION}`;
export const SUMMARY_PIPELINE_VERSION = "summary:v2.0";

export function decisionPipelineVersion(config: Pick<AppConfig, "DECISION_BACKEND" | "TYPESAFE_MODEL" | "OPENAI_DECISION_MODEL">): string {
  const model = config.DECISION_BACKEND === "jev" ? config.TYPESAFE_MODEL : config.OPENAI_DECISION_MODEL;
  return `${PIPELINE_VERSION}+provider:${config.DECISION_BACKEND}/${model}`;
}

export function summaryPipelineVersion(config: Pick<AppConfig, "OPENAI_SUMMARY_MODEL">): string {
  return `${SUMMARY_PIPELINE_VERSION}+provider:openai/${config.OPENAI_SUMMARY_MODEL}`;
}
