import cors from "@fastify/cors";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { z } from "zod";
import { actionExecuteRequestSchema, feedbackEventSchema, meetingConstraintsSchema, type SummaryResult } from "@intelligent-inbox/contracts";
import { ActionService } from "./action-service.js";
import { rankFreeSlots } from "./calendar-slots.js";
import type { AppConfig } from "./config.js";
import { hashSecret } from "./crypto.js";
import type { AccountContext, DecisionProvider, DecisionRecord, DraftProvider, GoogleGateway, Repository, SummaryProvider } from "./domain.js";
import { AppError, assertFound } from "./errors.js";
import { buildEvidenceEnvelope, normalizeThread } from "./normalizer.js";
import { OAuthService } from "./oauth-service.js";
import { decisionPipelineVersion, summaryPipelineVersion } from "./pipeline.js";
import { buildRecommendationSet, deriveState } from "./recommendations.js";

declare module "fastify" {
  interface FastifyRequest { account?: AccountContext }
}

export type AppDependencies = {
  config: AppConfig;
  repository: Repository;
  google: GoogleGateway;
  decision: DecisionProvider;
  generation: SummaryProvider & DraftProvider;
};

const threadParams = z.object({ id: z.string().min(1).max(200) });
const actionParams = z.object({ id: z.string().uuid() });

export async function buildApp(dependencies: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({ logger: { redact: ["req.headers.authorization", "req.body", "res.body"] } });
  const oauth = new OAuthService(dependencies.config, dependencies.repository);
  const actions = new ActionService(dependencies.repository, dependencies.google);
  const pipelineVersion = decisionPipelineVersion(dependencies.config);
  const summaryVersion = summaryPipelineVersion(dependencies.config);

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
    if (error instanceof AppError) return reply.code(error.statusCode).send(apiError(error.code, error.message, request.id, error.retryable));
    if (error instanceof z.ZodError) return reply.code(400).send(apiError("INVALID_REQUEST", "Request failed validation", request.id, false));
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
    const cached = await dependencies.repository.getDecision(account.accountId, id, snapshot.threadVersion, pipelineVersion);
    if (cached) return analysisResponse(snapshot.sender, snapshot.subject, cached, true);

    const signals = await dependencies.decision.decide(normalizeThread(snapshot));
    const derivedState = deriveState(signals);
    const record = {
      decisionSignals: signals,
      derivedState,
      recommendations: buildRecommendationSet(signals, derivedState),
      pipelineVersion
    };
    await dependencies.repository.saveDecision({ accountId: account.accountId, record });
    return analysisResponse(snapshot.sender, snapshot.subject, record, false);
  });

  const currentDecision = async (request: FastifyRequest) => {
    const account = requireAccount(request);
    const { id } = threadParams.parse(request.params);
    const snapshot = await dependencies.google.getThread(account, id);
    const record = assertFound(
      await dependencies.repository.getDecision(account.accountId, id, snapshot.threadVersion, pipelineVersion),
      "DECISION_NOT_FOUND",
      "Current thread has not been analyzed"
    );
    return analysisResponse(snapshot.sender, snapshot.subject, record, true);
  };
  app.get("/v1/threads/:id/decision", currentDecision);
  app.get("/v1/threads/:id/intelligence", currentDecision);

  app.post("/v1/threads/:id/summary", async (request) => {
    const account = requireAccount(request);
    const { id } = threadParams.parse(request.params);
    const snapshot = await dependencies.google.getThread(account, id);
    const cached = await dependencies.repository.getSummary(account.accountId, id, snapshot.threadVersion, summaryVersion);
    if (cached) return { ...cached, cached: true };
    const thread = normalizeThread(snapshot);
    const summary: SummaryResult = {
      schema_version: "1.0",
      thread_id: id,
      thread_version: snapshot.threadVersion,
      bullets: await dependencies.generation.summarize(thread, buildEvidenceEnvelope(thread))
    };
    await dependencies.repository.saveSummary({ accountId: account.accountId, summary, pipelineVersion: summaryVersion });
    return { ...summary, cached: false };
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
    requireGmailModify(account);
    const { id } = threadParams.parse(request.params);
    const body = z.object({ instruction: z.enum(["SHORTER", "MORE_FORMAL", "FRIENDLY", "DECLINE"]).optional() }).parse(request.body ?? {});
    const snapshot = await dependencies.google.getThread(account, id);
    const current = await requireDecision(dependencies, account, id, snapshot.threadVersion, "Analyze the current thread before creating a draft");
    const thread = normalizeThread(snapshot);
    const draftBody = await dependencies.generation.draft(snapshot, thread, buildEvidenceEnvelope(thread), current.derivedState, body.instruction);
    const draft = await dependencies.google.createDraft(account, snapshot, draftBody);
    await dependencies.repository.saveAudit(account.userId, account.accountId, "DRAFT_CREATED", draft.draftId, {
      thread_version: snapshot.threadVersion,
      rewrite_intent: body.instruction ?? "DEFAULT"
    });
    return draft;
  });

  app.post("/v1/calendar/freebusy", async (request) => {
    const account = requireAccount(request);
    const constraints = meetingConstraintsSchema.parse(request.body);
    requireCalendarFreeBusy(account);
    const busy = await dependencies.google.getFreeBusy(account, constraints.time_min, constraints.time_max);
    return { constraints, slots: rankFreeSlots(constraints, busy) };
  });

  app.post("/v1/threads/:id/meeting-draft", async (request) => {
    const account = requireAccount(request);
    const { id } = threadParams.parse(request.params);
    const constraints = meetingConstraintsSchema.parse(request.body);
    requireCalendarFreeBusy(account);
    requireGmailModify(account);
    const snapshot = await dependencies.google.getThread(account, id);
    const current = await requireDecision(dependencies, account, id, snapshot.threadVersion, "Analyze the current thread before proposing meeting times");
    if (current.decisionSignals.communication_intent.value !== "REQUEST_MEETING" || current.derivedState.review_required || current.recommendations.primary.action_type !== "PROPOSE_TIME") {
      throw new AppError("MEETING_REVIEW_REQUIRED", "Current decision does not support a meeting proposal", 409);
    }
    const busy = await dependencies.google.getFreeBusy(account, constraints.time_min, constraints.time_max);
    const slots = rankFreeSlots(constraints, busy);
    const thread = normalizeThread(snapshot);
    const body = await dependencies.generation.meetingDraft(snapshot, thread, buildEvidenceEnvelope(thread), current.derivedState, constraints, slots);
    const draft = await dependencies.google.createDraft(account, snapshot, body);
    await dependencies.repository.saveAudit(account.userId, account.accountId, "MEETING_DRAFT_CREATED", draft.draftId, {
      thread_version: snapshot.threadVersion,
      slot_count: slots.length,
      timezone: constraints.timezone
    });
    return { ...draft, slots };
  });

  app.post("/v1/feedback", async (request) => {
    const account = requireAccount(request);
    const event = feedbackEventSchema.parse(request.body);
    await dependencies.repository.saveFeedback(account.userId, account.accountId, event);
    return { accepted: true };
  });

  app.post("/v1/account/disconnect", async (request) => disconnectAndDelete(requireAccount(request), dependencies));
  app.delete("/v1/account/data", async (request) => disconnectAndDelete(requireAccount(request), dependencies));

  return app;
}

function analysisResponse(sender: string, subject: string, record: DecisionRecord, cached: boolean) {
  return {
    thread_header: { sender, subject },
    decision_signals: record.decisionSignals,
    derived_state: record.derivedState,
    recommendations: record.recommendations,
    cached,
    pipeline_version: record.pipelineVersion
  };
}

async function requireDecision(dependencies: AppDependencies, account: AccountContext, threadId: string, threadVersion: string, message: string) {
  return assertFound(
    await dependencies.repository.getDecision(account.accountId, threadId, threadVersion, decisionPipelineVersion(dependencies.config)),
    "DECISION_NOT_FOUND",
    message
  );
}

function requireGmailModify(account: AccountContext): void {
  if (!account.scopes.includes("https://www.googleapis.com/auth/gmail.modify")) throw new AppError("GMAIL_SCOPE_REQUIRED", "Gmail Modify permission is required", 403);
}

function requireCalendarFreeBusy(account: AccountContext): void {
  if (!account.scopes.some((scope) => scope.includes("calendar.freebusy"))) throw new AppError("CALENDAR_SCOPE_REQUIRED", "Calendar FreeBusy permission is required", 403);
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
