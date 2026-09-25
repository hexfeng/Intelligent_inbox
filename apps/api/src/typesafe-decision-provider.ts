import { TypeSafeClient } from "@typesafe-ai/sdk";
import { decisionSignalsV2Schema, type DecisionSignalsV2 } from "@intelligent-inbox/contracts";
import type { AppConfig } from "./config.js";
import { decisionQuestions } from "./decision-questions.js";
import type { DecisionProvider, NormalizedThread } from "./domain.js";
import { AppError } from "./errors.js";
import { QUESTION_SET_VERSION } from "./pipeline.js";

export class TypeSafeDecisionProvider implements DecisionProvider {
  private readonly client: TypeSafeClient;

  constructor(private readonly config: AppConfig) {
    if (!config.TYPESAFE_API_KEY) throw new Error("TYPESAFE_API_KEY is required for JEV");
    this.client = new TypeSafeClient({
      apiKey: config.TYPESAFE_API_KEY,
      defaultModel: config.TYPESAFE_MODEL,
      logLevel: "off"
    });
  }

  async decide(thread: NormalizedThread): Promise<DecisionSignalsV2> {
    const result = await this.client.systemOne({
      model: this.config.TYPESAFE_MODEL,
      state: JSON.stringify(thread),
      questions: decisionQuestions
    }).catch(() => {
      throw new AppError("DECISION_PROVIDER_FAILED", "JEV decision request failed", 502, true);
    });
    const answers = result.answers;
    const candidate = {
      schema_version: "2.0",
      thread_id: thread.threadId,
      thread_version: thread.threadVersion,
      content_type: {
        value: answers.contentType.choice,
        probabilities: answers.contentType.probabilities,
        confidence: answers.contentType.confidence
      },
      communication_intent: {
        value: answers.communicationIntent.choice,
        probabilities: answers.communicationIntent.probabilities,
        confidence: answers.communicationIntent.confidence
      },
      is_subscription: answers.isSubscription.noul,
      is_automated_sender: answers.isAutomatedSender.noul,
      reply_expected: answers.replyExpected.noul,
      action_required: answers.actionRequired.noul,
      attachment_dependency: answers.attachmentDependency.noul,
      contradictory_thread: answers.contradictoryThread.noul,
      urgency: {
        score: answers.urgency.score,
        probabilities: {
          NONE: answers.urgency.probabilities[0],
          LOW: answers.urgency.probabilities[1],
          MEDIUM: answers.urgency.probabilities[2],
          HIGH: answers.urgency.probabilities[3]
        },
        confidence: answers.urgency.confidence
      },
      provider: "JEV",
      model_version: result.model,
      question_set_version: QUESTION_SET_VERSION,
      usage: result.usage
    };
    const parsed = decisionSignalsV2Schema.safeParse(candidate);
    if (!parsed.success) throw new AppError("MODEL_OUTPUT_INVALID", "JEV output failed schema validation", 502, true);
    return parsed.data;
  }
}
