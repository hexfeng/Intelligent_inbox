import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { z } from "zod";
import {
  actionExecuteRequestSchema,
  feedbackEventSchema,
  meetingConstraintsSchema
} from "@intelligent-inbox/contracts";
import type { AppConfig } from "./config.js";
import { hashSecret } from "./crypto.js";
import type { AccountContext, GoogleGateway, IntelligenceProvider, Repository } from "./domain.js";
import { AppError, assertFound } from "./errors.js";
import { OAuthService } from "./oauth-service.js";
import { ActionService } from "./action-service.js";
import { buildRecommendationSet } from "./recommendations.js";
import { rankFreeSlots } from "./calendar-slots.js";

declare module "fastify" {
  interface FastifyRequest {
    account?: AccountContext;
  }
}

export type AppDependencies = {
  config: AppConfig;
  repository: Repository;
  google: GoogleGateway;
  intelligence: IntelligenceProvider;
};

const threadParams = z.object({ id: z.string().min(1).max(200) });
const actionParams = z.object({ id: z.string().uuid() });

export async function buildApp(dependencies: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({ logger: { redact: ["req.headers.authorization", "req.body", "res.body"] } });
  const oauth = new OAuthService(dependencies.config, dependencies.repository);
  const actions = new ActionService(dependencies.repository, dependencies.google);

  await app.register(cors, {
    origin: dependencies.config.APP_ORIGIN === "*" ? true : dependencies.config.APP_ORIGIN,
    methods: ["GET", "POST", "DELETE"]
  });

  app.addHook("onRequest", async (request, reply) => {
    const publicPath = request.url.startsWith("/health") || request.url.startsWith("/v1/auth/google/");
    if (publicPath) return;
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token) return reply.code(401).send(apiError("AUTH_REQUIRED", "Authentication is required", request.id, false));
    const account = await dependencies.repository.resolveSession(hashSecret(token));
    if (!account) return reply.code(401).send(apiError("SESSION_INVALID", "Session is invalid or expired", request.id, false));
    request.account = account;
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send(apiError(error.code, error.message, request.id, error.retryable));
    }
    if (error instanceof z.ZodError) {
      return reply.code(400).send(apiError("INVALID_REQUEST", "Request failed validation", request.id, false));
    }
    const unexpected = error instanceof Error ? error : new Error("Unknown error");
    request.log.error({ err: { name: unexpected.name, message: unexpected.message } }, "request failed");
    return reply.code(500).send(apiError("INTERNAL_ERROR", "The request could not be completed", request.id, true));
  });

  app.get("/health", async () => ({ status: "ok" }));

  app.post("/v1/auth/google/connect", async (request) => {
    const body = z.object({ redirect_uri: z.string(), include_calendar: z.boolean().default(false) }).parse(request.body);
    return oauth.begin(body.redirect_uri, body.include_calendar);
  });

  app.post("/v1/auth/google/exchange", async (request) => {
    const body = z.object({ code: z.string().min(1), state: z.string().min(1), redirect_uri: z.string() }).parse(request.body);
    return oauth.exchange(body);
  });

  app.get("/v1/account/status", async (request) => {
    const account = requireAccount(request);
    return { connected: true, email: account.email, scopes: account.scopes, watch_enabled: false };
  });

  app.post("/v1/threads/:id/analyze", async (request) => {
    const account = requireAccount(request);
    const { id } = threadParams.parse(request.params);
    const snapshot = await dependencies.google.getThread(account, id);
    const cached = await dependencies.repository.getIntelligence(account.accountId, id, snapshot.threadVersion);
    if (cached) return { ...cached, cached: true };
    const intelligence = await dependencies.intelligence.analyze(snapshot);
    const recommendations = buildRecommendationSet(intelligence);
    await dependencies.repository.saveIntelligence({
      accountId: account.accountId,
      intelligence,
      recommendations,
      modelVersion: dependencies.config.OPENAI_CLASSIFIER_MODEL
    });
    return { intelligence, recommendations, cached: false };
  });

  app.get("/v1/threads/:id/intelligence", async (request) => {
    const account = requireAccount(request);
    const { id } = threadParams.parse(request.params);
    const snapshot = await dependencies.google.getThread(account, id);
    return assertFound(
      await dependencies.repository.getIntelligence(account.accountId, id, snapshot.threadVersion),
      "INTELLIGENCE_NOT_FOUND",
      "Current thread has not been analyzed"
    );
  });

  app.post("/v1/threads/:id/actions/execute", async (request) => {
    const account = requireAccount(request);
    const { id } = threadParams.parse(request.params);
    return actions.execute(account, id, actionExecuteRequestSchema.parse(request.body), request.id);
  });

  app.post("/v1/actions/:id/undo", async (request) => {
    const account = requireAccount(request);
    const { id } = actionParams.parse(request.params);
    return actions.undo(account, id, request.id);
  });

  app.post("/v1/threads/:id/draft", async (request) => {
    const account = requireAccount(request);
    if (!account.scopes.includes("https://www.googleapis.com/auth/gmail.modify")) {
      throw new AppError("GMAIL_SCOPE_REQUIRED", "Gmail Modify permission is required", 403);
    }
    const { id } = threadParams.parse(request.params);
    const body = z.object({ instruction: z.enum(["SHORTER", "MORE_FORMAL", "FRIENDLY", "DECLINE"]).optional() }).parse(request.body ?? {});
    const snapshot = await dependencies.google.getThread(account, id);
    const current = assertFound(
      await dependencies.repository.getIntelligence(account.accountId, id, snapshot.threadVersion),
      "INTELLIGENCE_NOT_FOUND",
      "Analyze the current thread before creating a draft"
    );
    const draftBody = await dependencies.intelligence.draft(snapshot, current.intelligence, body.instruction);
    const draft = await dependencies.google.createDraft(account, snapshot, draftBody);
    await dependencies.repository.saveAudit(account.userId, account.accountId, "DRAFT_CREATED", draft.draftId, {
      thread_version: snapshot.threadVersion,
      rewrite_intent: body.instruction ?? "DEFAULT"
    });
    return draft;
  });

  app.post("/v1/triage/queue", async (request) => {
    const account = requireAccount(request);
    const body = z.object({ thread_ids: z.array(z.string().min(1).max(200)).min(1).max(50) }).parse(request.body);
    const unique = [...new Set(body.thread_ids)];
    const items = await mapConcurrent(unique, 4, async (threadId) => {
      const snapshot = await dependencies.google.getThread(account, threadId);
      let current = await dependencies.repository.getIntelligence(account.accountId, threadId, snapshot.threadVersion);
      if (!current) {
        const intelligence = await dependencies.intelligence.analyze(snapshot);
        const recommendations = buildRecommendationSet(intelligence);
        await dependencies.repository.saveIntelligence({ accountId: account.accountId, intelligence, recommendations, modelVersion: dependencies.config.OPENAI_CLASSIFIER_MODEL });
        current = { intelligence, recommendations };
      }
      return current;
    });
    return { items: sortTriage(items) };
  });

  app.post("/v1/calendar/freebusy", async (request) => {
    const account = requireAccount(request);
    const constraints = meetingConstraintsSchema.parse(request.body);
    if (!account.scopes.some((scope) => scope.includes("calendar.freebusy"))) {
      throw new AppError("CALENDAR_SCOPE_REQUIRED", "Calendar FreeBusy permission is required", 403);
    }
    const busy = await dependencies.google.getFreeBusy(account, constraints.time_min, constraints.time_max);
    return { constraints, slots: rankFreeSlots(constraints, busy) };
  });

  app.post("/v1/threads/:id/meeting-draft", async (request) => {
    const account = requireAccount(request);
    const { id } = threadParams.parse(request.params);
    const constraints = meetingConstraintsSchema.parse(request.body);
    if (!account.scopes.some((scope) => scope.includes("calendar.freebusy"))) {
      throw new AppError("CALENDAR_SCOPE_REQUIRED", "Calendar FreeBusy permission is required", 403);
    }
    if (!account.scopes.includes("https://www.googleapis.com/auth/gmail.modify")) {
      throw new AppError("GMAIL_SCOPE_REQUIRED", "Gmail Modify permission is required", 403);
    }
    const snapshot = await dependencies.google.getThread(account, id);
    const current = assertFound(
      await dependencies.repository.getIntelligence(account.accountId, id, snapshot.threadVersion),
      "INTELLIGENCE_NOT_FOUND",
      "Analyze the current thread before proposing meeting times"
    );
    if (current.intelligence.intent !== "MEETING_REQUEST" || current.intelligence.review_required || current.recommendations.primary.action_type !== "PROPOSE_TIME") {
      throw new AppError("MEETING_REVIEW_REQUIRED", "Current intelligence does not support a meeting proposal", 409);
    }
    const busy = await dependencies.google.getFreeBusy(account, constraints.time_min, constraints.time_max);
    const slots = rankFreeSlots(constraints, busy);
    const body = await dependencies.intelligence.meetingDraft(snapshot, current.intelligence, constraints, slots);
    const draft = await dependencies.google.createDraft(account, snapshot, body);
    await dependencies.repository.saveAudit(account.userId, account.accountId, "MEETING_DRAFT_CREATED", draft.draftId, {
      thread_version: snapshot.threadVersion, slot_count: slots.length, timezone: constraints.timezone
    });
    return { ...draft, slots };
  });

  app.post("/v1/feedback", async (request) => {
    const account = requireAccount(request);
    const event = feedbackEventSchema.parse(request.body);
    await dependencies.repository.saveFeedback(account.userId, account.accountId, event);
    return { accepted: true };
  });

  app.post("/v1/account/disconnect", async (request) => {
    const account = requireAccount(request);
    return disconnectAndDelete(account, dependencies);
  });

  app.delete("/v1/account/data", async (request) => {
    const account = requireAccount(request);
    return disconnectAndDelete(account, dependencies);
  });

  return app;
}

async function disconnectAndDelete(account: AccountContext, dependencies: AppDependencies) {
  let revoked = true;
  try { await dependencies.google.revoke(account); }
  catch { revoked = false; }
  await dependencies.repository.deleteAccountData(account.userId, account.accountId);
  return { deleted: true, disconnected: true, revoked };
}

function requireAccount(request: FastifyRequest): AccountContext {
  if (!request.account) throw new AppError("AUTH_REQUIRED", "Authentication is required", 401);
  return request.account;
}

function apiError(code: string, message: string, request_id: string, retryable: boolean) {
  return { code, message, request_id, retryable };
}

async function mapConcurrent<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index];
      if (item !== undefined) results[index] = await mapper(item);
    }
  }));
  return results;
}

function sortTriage<T extends { intelligence: { attention_state: string; priority: string } }>(items: T[]): T[] {
  const attention = new Map([["NEEDS_REPLY", 0], ["NEEDS_ACTION", 1], ["REVIEW", 2], ["FYI", 3]]);
  const priority = new Map([["HIGH", 0], ["NORMAL", 1], ["LOW", 2]]);
  return [...items].sort((a, b) =>
    (attention.get(a.intelligence.attention_state) ?? 9) - (attention.get(b.intelligence.attention_state) ?? 9) ||
    (priority.get(a.intelligence.priority) ?? 9) - (priority.get(b.intelligence.priority) ?? 9)
  );
}
