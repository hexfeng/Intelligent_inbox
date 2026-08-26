import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().default("127.0.0.1"),
  API_PORT: z.coerce.number().int().positive().default(8787),
  APP_ORIGIN: z.string().default("*"),
  DATABASE_URL: z.string().min(1),
  TOKEN_ENCRYPTION_KEY_BASE64: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_CLASSIFIER_MODEL: z.string().min(1),
  OPENAI_DRAFT_MODEL: z.string().min(1),
  OPENAI_STORE: z.literal("false").default("false")
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.safeParse(environment);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid configuration: ${fields}`);
  }
  const key = Buffer.from(parsed.data.TOKEN_ENCRYPTION_KEY_BASE64, "base64");
  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY_BASE64 must decode to 32 bytes");
  }
  if (parsed.data.NODE_ENV === "production" && parsed.data.APP_ORIGIN === "*") {
    throw new Error("APP_ORIGIN must be the exact chrome-extension origin in production");
  }
  return parsed.data;
}
