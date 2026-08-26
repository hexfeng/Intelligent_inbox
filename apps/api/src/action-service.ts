import { randomUUID } from "node:crypto";
import type { ActionExecuteRequest, ActionExecution } from "@intelligent-inbox/contracts";
import type { AccountContext, GoogleGateway, Repository } from "./domain.js";
import { AppError, assertFound } from "./errors.js";

export class ActionService {
  constructor(private readonly repository: Repository, private readonly google: GoogleGateway) {}

  async execute(account: AccountContext, threadId: string, request: ActionExecuteRequest, requestId: string): Promise<ActionExecution> {
    if (!account.scopes.includes("https://www.googleapis.com/auth/gmail.modify")) {
      throw new AppError("GMAIL_SCOPE_REQUIRED", "Gmail Modify permission is required", 403);
    }
    return this.repository.withIdempotencyLock(account.accountId, request.idempotency_key, async () => {
      const prior = await this.repository.getExecutionByIdempotency(account.accountId, request.idempotency_key);
      if (prior) return prior.execution;

      const recommendation = assertFound(
        await this.repository.getRecommendation(account.accountId, request.source_recommendation_id),
        "RECOMMENDATION_NOT_FOUND",
        "Recommendation does not belong to this account"
      );
      if (recommendation.threadId !== threadId || recommendation.threadVersion !== request.thread_version) {
        throw new AppError("STALE_RECOMMENDATION", "Recommendation is not valid for this thread version", 409);
      }
      if (recommendation.actionType !== request.action_type) {
        throw new AppError("ACTION_MISMATCH", "Requested action does not match recommendation", 409);
      }
      const before = await this.google.getThread(account, threadId);
      if (before.threadVersion !== request.thread_version) {
        throw new AppError("STALE_THREAD", "Thread changed after analysis", 409);
      }
      const preImage = await this.google.getLabelImage(account, threadId);
      const postImage = await this.google.applyAction(account, threadId, request.action_type, request.payload);
      const execution: ActionExecution = {
        execution_id: randomUUID(),
        status: "SUCCEEDED",
        action_type: request.action_type,
        undo_available: true,
        request_id: requestId
      };
      await this.repository.saveExecution({
        execution,
        accountId: account.accountId,
        threadId,
        recommendationId: request.source_recommendation_id,
        idempotencyKey: request.idempotency_key,
        actionType: request.action_type,
        preImage,
        postImage
      });
      await this.repository.saveAudit(account.userId, account.accountId, "ACTION_EXECUTED", execution.execution_id, {
        action_type: request.action_type,
        thread_version: request.thread_version,
        status: execution.status
      });
      return execution;
    });
  }

  async undo(account: AccountContext, executionId: string, requestId: string): Promise<ActionExecution> {
    const stored = assertFound(
      await this.repository.getExecution(account.accountId, executionId),
      "EXECUTION_NOT_FOUND",
      "Execution does not belong to this account"
    );
    if (stored.undoneAt) throw new AppError("ALREADY_UNDONE", "Execution was already undone", 409);
    const current = await this.google.getLabelImage(account, stored.threadId);
    if (!sameLabelImage(current, stored.postImage)) {
      throw new AppError("UNDO_CONFLICT", "Gmail state changed after this action", 409);
    }
    await this.google.restoreLabels(account, stored.threadId, current, stored.preImage);
    await this.repository.markExecutionUndone(account.accountId, executionId);
    await this.repository.saveAudit(account.userId, account.accountId, "ACTION_UNDONE", executionId, { action_type: stored.actionType });
    return { ...stored.execution, request_id: requestId, undo_available: false };
  }
}

function sameLabelImage(left: { messages: Array<{ id: string; labels: string[] }> }, right: { messages: Array<{ id: string; labels: string[] }> }): boolean {
  return JSON.stringify(left.messages) === JSON.stringify(right.messages);
}
