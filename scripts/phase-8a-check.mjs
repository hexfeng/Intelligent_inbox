import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { Client } from "pg";

const root = resolve(import.meta.dirname, "..");
const live = process.argv.includes("--live");
const checks = [];

function check(name, passed, detail) {
  checks.push({ name, passed, detail });
}

function command(executable, args, timeout = 10_000) {
  return spawnSync(executable, args, { cwd: root, encoding: "utf8", timeout, windowsHide: true });
}

function parseEnv(text) {
  const values = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator > 0) values.set(line.slice(0, separator), line.slice(separator + 1).trim());
  }
  return values;
}

const envPath = resolve(root, ".env");
let env = new Map();
if (existsSync(envPath)) {
  env = parseEnv(await readFile(envPath, "utf8"));
  check("Root .env", true, "present");
} else {
  check("Root .env", false, "missing");
}

const required = [
  "DATABASE_URL", "TOKEN_ENCRYPTION_KEY_BASE64", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
  "OPENAI_API_KEY", "OPENAI_CLASSIFIER_MODEL", "OPENAI_DRAFT_MODEL", "APP_ORIGIN"
];
for (const key of required) {
  const value = env.get(key) ?? "";
  const placeholder = /replace|example|changeme|your[_-]/i.test(value);
  check(key, Boolean(value) && !placeholder, value && !placeholder ? "configured" : placeholder ? "placeholder" : "missing");
}

const encryptionKey = env.get("TOKEN_ENCRYPTION_KEY_BASE64") ?? "";
let keyBytes = 0;
try { keyBytes = Buffer.from(encryptionKey, "base64").length; } catch { keyBytes = 0; }
check("Token encryption key", keyBytes === 32, keyBytes === 32 ? "32 bytes" : "must decode to 32 bytes");
check("OpenAI store", env.get("OPENAI_STORE") === "false", env.get("OPENAI_STORE") === "false" ? "false" : "must be false");
check("Extension origin", /^chrome-extension:\/\/[a-p]{32}$/.test(env.get("APP_ORIGIN") ?? ""), "exact installed extension origin required");

const docker = command("docker", ["info", "--format", "{{.ServerVersion}}"], 8_000);
check("Docker engine", docker.status === 0 && Boolean(docker.stdout.trim()), docker.status === 0 ? "ready" : docker.error?.code === "ETIMEDOUT" ? "handshake timed out" : "not ready");

const manifestPath = resolve(root, "apps/extension/dist/manifest.json");
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  check("Extension build", true, `manifest v${manifest.manifest_version}, app ${manifest.version}`);
  check("Gmail content script", manifest.content_scripts?.some((item) => item.matches?.includes("https://mail.google.com/*")), "registered");
  check("Dangerous manifest permissions", !JSON.stringify(manifest).match(/gmail\.send|calendar\.events|management/), "none");
} else {
  check("Extension build", false, "dist/manifest.json missing");
}

if (live) {
  try {
    const health = await fetch("http://127.0.0.1:8787/health", { signal: AbortSignal.timeout(5_000) });
    const body = await health.json();
    check("API health", health.status === 200 && body.status === "ok", `HTTP ${health.status}`);
  } catch { check("API health", false, "unreachable"); }

  try {
    const auth = await fetch("http://127.0.0.1:8787/v1/account/status", { signal: AbortSignal.timeout(5_000) });
    const body = await auth.json();
    check("API auth boundary", auth.status === 401 && body.code === "AUTH_REQUIRED", `HTTP ${auth.status}, ${body.code ?? "no code"}`);
  } catch { check("API auth boundary", false, "unreachable"); }

  const databaseUrl = env.get("DATABASE_URL");
  if (databaseUrl) {
    const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000 });
    try {
      await client.connect();
      const tables = ["users", "connected_accounts", "sessions", "intelligence_results", "recommendation_sets", "action_executions", "feedback_events", "audit_logs"];
      const result = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1)", [tables]);
      check("Database migration", result.rowCount === tables.length, `${result.rowCount}/${tables.length} required tables`);
    } catch { check("Database migration", false, "connection or schema check failed"); }
    finally { await client.end().catch(() => undefined); }
  }
}

for (const item of checks) console.log(`${item.passed ? "PASS" : "FAIL"}  ${item.name} — ${item.detail}`);
const failed = checks.filter((item) => !item.passed);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed${live ? " (live)" : ""}.`);
if (failed.length) process.exitCode = 1;
