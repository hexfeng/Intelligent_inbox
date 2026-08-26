import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { FakeGoogleGateway, FakeIntelligenceProvider, MemoryRepository } from "./test-fakes.js";
import type { AppConfig } from "./config.js";

const config: AppConfig = {
  NODE_ENV: "test", API_HOST: "127.0.0.1", API_PORT: 8787, APP_ORIGIN: "*", DATABASE_URL: "postgres://test",
  TOKEN_ENCRYPTION_KEY_BASE64: Buffer.alloc(32).toString("base64"), GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "secret",
  OPENAI_API_KEY: "test", OPENAI_CLASSIFIER_MODEL: "test-model", OPENAI_DRAFT_MODEL: "test-model", OPENAI_STORE: "false"
};

describe("API", () => {
  it("exposes a public health endpoint", async () => {
    const app = await buildApp({ config, repository: new MemoryRepository(), google: new FakeGoogleGateway(), intelligence: new FakeIntelligenceProvider() });
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    await app.close();
  });

  it("uses the structured auth error contract", async () => {
    const repository = new MemoryRepository(); repository.account = null;
    const app = await buildApp({ config, repository, google: new FakeGoogleGateway(), intelligence: new FakeIntelligenceProvider() });
    const response = await app.inject({ method: "GET", url: "/v1/account/status" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "AUTH_REQUIRED", retryable: false });
    await app.close();
  });

  it("disconnects, deletes product data and reports revocation", async () => {
    const repository = new MemoryRepository();
    const app = await buildApp({ config, repository, google: new FakeGoogleGateway(), intelligence: new FakeIntelligenceProvider() });
    const response = await app.inject({ method: "POST", url: "/v1/account/disconnect", headers: { authorization: "Bearer session" } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ deleted: true, disconnected: true, revoked: true });
    expect(repository.account).toBeNull();
    await app.close();
  });
});
