import { describe, expect, it } from "vitest";
import { ActionService } from "./action-service.js";
import { FakeGoogleGateway, MemoryRepository, testAccount } from "./test-fakes.js";

const request = {
  action_type: "ARCHIVE" as const,
  payload: {},
  source_recommendation_id: "rec-1",
  thread_version: "version-1",
  idempotency_key: "00000000-0000-4000-8000-000000000010",
  user_confirmed: true as const
};

describe("ActionService", () => {
  it("returns the original result for an idempotent retry", async () => {
    const repository = new MemoryRepository();
    repository.recommendation = { threadId: "thread-1", threadVersion: "version-1", actionType: "ARCHIVE" };
    const google = new FakeGoogleGateway();
    const service = new ActionService(repository, google);
    const first = await service.execute(testAccount, "thread-1", request, "request-1");
    const second = await service.execute(testAccount, "thread-1", request, "request-2");
    expect(second.execution_id).toBe(first.execution_id);
    expect(google.mutations).toBe(1);
  });

  it("serializes concurrent requests sharing an idempotency key", async () => {
    const repository = new MemoryRepository();
    repository.recommendation = { threadId: "thread-1", threadVersion: "version-1", actionType: "ARCHIVE" };
    const google = new FakeGoogleGateway();
    const service = new ActionService(repository, google);
    const [first, second] = await Promise.all([
      service.execute(testAccount, "thread-1", request, "request-1"),
      service.execute(testAccount, "thread-1", request, "request-2")
    ]);
    expect(second.execution_id).toBe(first.execution_id);
    expect(google.mutations).toBe(1);
  });

  it("rejects a stale recommendation before mutation", async () => {
    const repository = new MemoryRepository();
    repository.recommendation = { threadId: "thread-1", threadVersion: "version-old", actionType: "ARCHIVE" };
    const google = new FakeGoogleGateway();
    await expect(new ActionService(repository, google).execute(testAccount, "thread-1", request, "request-1"))
      .rejects.toMatchObject({ code: "STALE_RECOMMENDATION" });
    expect(google.mutations).toBe(0);
  });

  it("rejects writes when Gmail Modify scope is absent", async () => {
    const repository = new MemoryRepository();
    repository.recommendation = { threadId: "thread-1", threadVersion: "version-1", actionType: "ARCHIVE" };
    const google = new FakeGoogleGateway();
    await expect(new ActionService(repository, google).execute({ ...testAccount, scopes: [] }, "thread-1", request, "request-1"))
      .rejects.toMatchObject({ code: "GMAIL_SCOPE_REQUIRED" });
    expect(google.mutations).toBe(0);
  });

  it("rejects undo when Gmail state changed after execution", async () => {
    const repository = new MemoryRepository();
    repository.recommendation = { threadId: "thread-1", threadVersion: "version-1", actionType: "ARCHIVE" };
    const google = new FakeGoogleGateway();
    const service = new ActionService(repository, google);
    const execution = await service.execute(testAccount, "thread-1", { ...request, idempotency_key: "00000000-0000-4000-8000-000000000011" }, "request-1");
    google.currentLabels = { messages: [{ id: "message-1", labels: ["STARRED"] }] };
    await expect(service.undo(testAccount, execution.execution_id, "request-2")).rejects.toMatchObject({ code: "UNDO_CONFLICT" });
  });
});
