import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const valid = {
  NODE_ENV: "production",
  API_HOST: "127.0.0.1",
  API_PORT: "8787",
  APP_ORIGIN: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  DATABASE_URL: "postgres://test",
  TOKEN_ENCRYPTION_KEY_BASE64: Buffer.alloc(32).toString("base64"),
  GOOGLE_CLIENT_ID: "client",
  GOOGLE_CLIENT_SECRET: "secret",
  OPENAI_API_KEY: "key",
  OPENAI_CLASSIFIER_MODEL: "classifier",
  OPENAI_DRAFT_MODEL: "draft",
  OPENAI_STORE: "false"
};

describe("configuration safety", () => {
  it("requires an exact extension origin in production", () => {
    expect(() => loadConfig({ ...valid, APP_ORIGIN: "*" })).toThrow(/exact chrome-extension origin/);
  });

  it("locks OpenAI storage to false", () => {
    expect(() => loadConfig({ ...valid, OPENAI_STORE: "true" })).toThrow(/OPENAI_STORE/);
  });
});
