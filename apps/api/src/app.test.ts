import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { FakeDecisionProvider, FakeGenerationProvider, FakeGoogleGateway, MemoryRepository } from "./test-fakes.js";
import type { AppConfig } from "./config.js";

const config: AppConfig = {
  NODE_ENV: "test", API_HOST: "127.0.0.1", API_PORT: 8787, APP_ORIGIN: "*", DATABASE_URL: "postgres://test",
  TOKEN_ENCRYPTION_KEY_BASE64: Buffer.alloc(32).toString("base64"), GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "secret",
  DECISION_BACKEND: "jev", TYPESAFE_API_KEY: "test", TYPESAFE_MODEL: "jev-test",
  OPENAI_API_KEY: "test", OPENAI_DECISION_MODEL: "test-model", OPENAI_SUMMARY_MODEL: "test-model", OPENAI_DRAFT_MODEL: "test-model", OPENAI_STORE: "false"
};

const dependencies = () => ({
  config,
  repository: new MemoryRepository(),
  google: new FakeGoogleGateway(),
  decision: new FakeDecisionProvider(),
  generation: new FakeGenerationProvider()
});

describe("API", () => {
  it("exposes a public health endpoint", async () => {
    const app = await buildApp(dependencies());
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    await app.close();
  });

  it("uses the structured auth error contract", async () => {
    const repository = new MemoryRepository(); repository.account = null;
    const app = await buildApp({ ...dependencies(), repository });
    const response = await app.inject({ method: "GET", url: "/v1/account/status" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "AUTH_REQUIRED", retryable: false });
    await app.close();
  });

  it("disconnects, deletes product data and reports revocation", async () => {
    const repository = new MemoryRepository();
    const app = await buildApp({ ...dependencies(), repository });
    const response = await app.inject({ method: "POST", url: "/v1/account/disconnect", headers: { authorization: "Bearer session" } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ deleted: true, disconnected: true, revoked: true });
    expect(repository.account).toBeNull();
    await app.close();
  });

  it("returns decision signals immediately and summary through a separate cached route", async () => {
    const deps = dependencies();
    const app = await buildApp(deps);
    const headers = { authorization: "Bearer session" };
    const decision = await app.inject({ method: "POST", url: "/v1/threads/thread-1/analyze", headers });
    expect(decision.statusCode).toBe(200);
    expect(decision.json()).toMatchObject({
      decision_signals: { schema_version: "2.0", provider: "JEV" },
      derived_state: { attention_state: "NEEDS_REPLY", review_required: false },
      cached: false
    });

    const firstSummary = await app.inject({ method: "POST", url: "/v1/threads/thread-1/summary", headers });
    const secondSummary = await app.inject({ method: "POST", url: "/v1/threads/thread-1/summary", headers });
    expect(firstSummary.json()).toMatchObject({ bullets: ["The sender asks a question."], cached: false });
    expect(secondSummary.json()).toMatchObject({ cached: true });
    expect(deps.generation.summaryCalls).toBe(1);
    await app.close();
  });
});
