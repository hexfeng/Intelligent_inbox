import "./env.js";
import { Pool } from "pg";
import { loadConfig } from "./config.js";
import { buildApp } from "./app.js";
import { PostgresRepository } from "./postgres-repository.js";
import { GoogleApiGateway } from "./google-gateway.js";
import { OpenAIDecisionProvider, OpenAIGenerationProvider } from "./openai-provider.js";
import { TypeSafeDecisionProvider } from "./typesafe-decision-provider.js";

const config = loadConfig();
const pool = new Pool({ connectionString: config.DATABASE_URL, max: 10 });
const generation = new OpenAIGenerationProvider(config);
const app = await buildApp({
  config,
  repository: new PostgresRepository(pool),
  google: new GoogleApiGateway(config),
  decision: config.DECISION_BACKEND === "jev" ? new TypeSafeDecisionProvider(config) : new OpenAIDecisionProvider(config),
  generation
});

const close = async () => {
  await app.close();
  await pool.end();
};
process.on("SIGINT", close);
process.on("SIGTERM", close);

await app.listen({ host: config.API_HOST, port: config.API_PORT });
