import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { EmailIntelligenceV11, FeedbackEvent, RecommendationSet } from "@intelligent-inbox/contracts";
import type { AccountContext, Repository, StoredExecution } from "./domain.js";

export class PostgresRepository implements Repository {
  constructor(private readonly pool: Pool) {}

  async withIdempotencyLock<T>(accountId: string, key: string, operation: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${accountId}:${key}`]);
      const result = await operation();
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async saveOAuthState(input: { stateHash: string; verifier: string; redirectUri: string; includeCalendar: boolean; expiresAt: Date }): Promise<void> {
    await this.pool.query(
      `INSERT INTO oauth_states(state_hash, code_verifier, redirect_uri, include_calendar, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.stateHash, input.verifier, input.redirectUri, input.includeCalendar, input.expiresAt]
    );
  }

  async consumeOAuthState(stateHash: string): Promise<{ verifier: string; redirectUri: string; includeCalendar: boolean } | null> {
    const result = await this.pool.query(
      `DELETE FROM oauth_states WHERE state_hash = $1 AND expires_at > now()
       RETURNING code_verifier, redirect_uri, include_calendar`,
      [stateHash]
    );
    const row = result.rows[0] as { code_verifier: string; redirect_uri: string; include_calendar: boolean } | undefined;
    return row ? { verifier: row.code_verifier, redirectUri: row.redirect_uri, includeCalendar: row.include_calendar } : null;
  }

  async upsertGoogleAccount(input: { googleSub: string; email: string; scopes: string[]; encryptedRefreshToken: string }): Promise<AccountContext> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query(
        `SELECT u.id AS user_id, c.id AS account_id
         FROM connected_accounts c JOIN users u ON u.id = c.user_id WHERE c.google_sub = $1`,
        [input.googleSub]
      );
      const userId = (existing.rows[0]?.user_id as string | undefined) ?? randomUUID();
      const accountId = (existing.rows[0]?.account_id as string | undefined) ?? randomUUID();
      await client.query(
        `INSERT INTO users(id, email) VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`,
        [userId, input.email]
      );
      await client.query(
        `INSERT INTO connected_accounts(id, user_id, google_sub, email, scopes, encrypted_refresh_token)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (google_sub) DO UPDATE SET
           email = EXCLUDED.email,
           scopes = EXCLUDED.scopes,
           encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
           updated_at = now()`,
        [accountId, userId, input.googleSub, input.email, input.scopes, input.encryptedRefreshToken]
      );
      await client.query("COMMIT");
      return { userId, accountId, email: input.email, scopes: input.scopes, encryptedRefreshToken: input.encryptedRefreshToken };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createSession(input: { tokenHash: string; userId: string; accountId: string; expiresAt: Date }): Promise<void> {
    await this.pool.query(
      `INSERT INTO sessions(token_hash, user_id, account_id, expires_at) VALUES ($1, $2, $3, $4)`,
      [input.tokenHash, input.userId, input.accountId, input.expiresAt]
    );
  }

  async resolveSession(tokenHash: string): Promise<AccountContext | null> {
    const result = await this.pool.query(
      `SELECT s.user_id, c.id AS account_id, c.email, c.scopes, c.encrypted_refresh_token
       FROM sessions s JOIN connected_accounts c ON c.id = s.account_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [tokenHash]
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      userId: row.user_id as string,
      accountId: row.account_id as string,
      email: row.email as string,
      scopes: row.scopes as string[],
      encryptedRefreshToken: row.encrypted_refresh_token as string
    };
  }

  async saveIntelligence(input: { accountId: string; intelligence: EmailIntelligenceV11; recommendations: RecommendationSet; modelVersion: string }): Promise<void> {
    const persistedIntelligence = sanitizeIntelligenceForStorage(input.intelligence);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const intelligenceId = randomUUID();
      await client.query(
        `INSERT INTO intelligence_results(id, account_id, gmail_thread_id, thread_version, result_json, model_version)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT(account_id, gmail_thread_id, thread_version)
         DO UPDATE SET result_json = EXCLUDED.result_json, model_version = EXCLUDED.model_version`,
        [intelligenceId, input.accountId, input.intelligence.thread_id, input.intelligence.thread_version, persistedIntelligence, input.modelVersion]
      );
      const idResult = await client.query(
        `SELECT id FROM intelligence_results WHERE account_id = $1 AND gmail_thread_id = $2 AND thread_version = $3`,
        [input.accountId, input.intelligence.thread_id, input.intelligence.thread_version]
      );
      const persistedIntelligenceId = idResult.rows[0]?.id as string;
      await client.query(
        `DELETE FROM recommendation_sets WHERE account_id = $1 AND gmail_thread_id = $2 AND thread_version = $3`,
        [input.accountId, input.intelligence.thread_id, input.intelligence.thread_version]
      );
      await client.query(
        `INSERT INTO recommendation_sets(id, intelligence_id, account_id, gmail_thread_id, thread_version, set_json)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [input.recommendations.id, persistedIntelligenceId, input.accountId, input.intelligence.thread_id, input.intelligence.thread_version, input.recommendations]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getIntelligence(accountId: string, threadId: string, threadVersion?: string): Promise<{ intelligence: EmailIntelligenceV11; recommendations: RecommendationSet } | null> {
    const params: unknown[] = [accountId, threadId];
    const versionClause = threadVersion ? "AND i.thread_version = $3" : "";
    if (threadVersion) params.push(threadVersion);
    const result = await this.pool.query(
      `SELECT i.result_json, r.set_json FROM intelligence_results i
       JOIN recommendation_sets r ON r.intelligence_id = i.id
       WHERE i.account_id = $1 AND i.gmail_thread_id = $2 ${versionClause}
       ORDER BY i.created_at DESC LIMIT 1`,
      params
    );
    const row = result.rows[0] as { result_json: EmailIntelligenceV11; set_json: RecommendationSet } | undefined;
    return row ? { intelligence: row.result_json, recommendations: row.set_json } : null;
  }

  async getRecommendation(accountId: string, recommendationId: string): Promise<{ threadId: string; threadVersion: string; actionType: string } | null> {
    const result = await this.pool.query(
      `SELECT gmail_thread_id, thread_version, set_json FROM recommendation_sets WHERE account_id = $1`,
      [accountId]
    );
    for (const row of result.rows as Array<{ gmail_thread_id: string; thread_version: string; set_json: RecommendationSet }>) {
      const candidates = [row.set_json.primary, ...row.set_json.secondary];
      const match = candidates.find((candidate) => candidate.id === recommendationId);
      if (match) return { threadId: row.gmail_thread_id, threadVersion: row.thread_version, actionType: match.action_type };
    }
    return null;
  }

  async getExecutionByIdempotency(accountId: string, key: string): Promise<StoredExecution | null> {
    const result = await this.pool.query(
      `SELECT * FROM action_executions WHERE account_id = $1 AND idempotency_key = $2`,
      [accountId, key]
    );
    return this.executionFromRow(result.rows[0]);
  }

  async saveExecution(input: StoredExecution): Promise<void> {
    await this.pool.query(
      `INSERT INTO action_executions(
        id, account_id, gmail_thread_id, recommendation_id, idempotency_key,
        action_type, pre_image_json, post_image_json, result_json, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [input.execution.execution_id, input.accountId, input.threadId, input.recommendationId,
        input.idempotencyKey, input.actionType, input.preImage, input.postImage,
        input.execution, input.execution.status]
    );
  }

  async getExecution(accountId: string, executionId: string): Promise<StoredExecution | null> {
    const result = await this.pool.query(
      `SELECT * FROM action_executions WHERE account_id = $1 AND id = $2`,
      [accountId, executionId]
    );
    return this.executionFromRow(result.rows[0]);
  }

  async markExecutionUndone(accountId: string, executionId: string): Promise<void> {
    await this.pool.query(
      `UPDATE action_executions SET undone_at = now() WHERE account_id = $1 AND id = $2`,
      [accountId, executionId]
    );
  }

  async saveFeedback(userId: string, accountId: string, event: FeedbackEvent): Promise<void> {
    const safeValue = {
      recommendation_id: event.recommendation_id,
      rewrite_intent: event.rewrite_intent,
      corrected_field: event.corrected_field,
      corrected_value: event.corrected_value
    };
    await this.pool.query(
      `INSERT INTO feedback_events(id, user_id, account_id, gmail_thread_id, thread_version, event_type, safe_value_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [randomUUID(), userId, accountId, event.thread_id, event.thread_version, event.event_type, safeValue]
    );
  }

  async saveAudit(userId: string, accountId: string, eventType: string, entityId: string, safeMetadata: Record<string, unknown>): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_logs(id, user_id, account_id, event_type, entity_id, safe_metadata_json)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [randomUUID(), userId, accountId, eventType, entityId, safeMetadata]
    );
  }

  async deleteAccountData(userId: string, accountId: string): Promise<void> {
    await this.pool.query(`DELETE FROM connected_accounts WHERE id = $1 AND user_id = $2`, [accountId, userId]);
    await this.pool.query(`DELETE FROM users WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM connected_accounts WHERE user_id = $1)`, [userId]);
  }

  private executionFromRow(row: Record<string, unknown> | undefined): StoredExecution | null {
    if (!row) return null;
    return {
      execution: row.result_json as StoredExecution["execution"],
      accountId: row.account_id as string,
      threadId: row.gmail_thread_id as string,
      recommendationId: row.recommendation_id as string,
      idempotencyKey: row.idempotency_key as string,
      actionType: row.action_type as StoredExecution["actionType"],
      preImage: row.pre_image_json as StoredExecution["preImage"],
      postImage: row.post_image_json as StoredExecution["postImage"],
      ...(row.undone_at ? { undoneAt: new Date(row.undone_at as string).toISOString() } : {})
    };
  }
}

export function sanitizeIntelligenceForStorage(intelligence: EmailIntelligenceV11): EmailIntelligenceV11 {
  return {
    ...intelligence,
    verified_facts: {
      recipients: [],
      dates: [],
      amounts: [],
      attachments: [],
      participants: []
    }
  };
}
