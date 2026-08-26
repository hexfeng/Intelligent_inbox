CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS connected_accounts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  google_sub text NOT NULL UNIQUE,
  email text NOT NULL,
  scopes text[] NOT NULL,
  encrypted_refresh_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash text PRIMARY KEY,
  code_verifier text NOT NULL,
  redirect_uri text NOT NULL,
  include_calendar boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS intelligence_results (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
  gmail_thread_id text NOT NULL,
  thread_version text NOT NULL,
  result_json jsonb NOT NULL,
  model_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, gmail_thread_id, thread_version)
);

CREATE TABLE IF NOT EXISTS recommendation_sets (
  id uuid PRIMARY KEY,
  intelligence_id uuid NOT NULL REFERENCES intelligence_results(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
  gmail_thread_id text NOT NULL,
  thread_version text NOT NULL,
  set_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS action_executions (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
  gmail_thread_id text NOT NULL,
  recommendation_id text NOT NULL,
  idempotency_key uuid NOT NULL,
  action_type text NOT NULL,
  pre_image_json jsonb NOT NULL,
  post_image_json jsonb NOT NULL,
  result_json jsonb NOT NULL,
  status text NOT NULL,
  undone_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS feedback_events (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
  gmail_thread_id text NOT NULL,
  thread_version text NOT NULL,
  event_type text NOT NULL,
  safe_value_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  entity_id text NOT NULL,
  safe_metadata_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS intelligence_lookup_idx
  ON intelligence_results(account_id, gmail_thread_id, thread_version);
CREATE INDEX IF NOT EXISTS audit_lookup_idx
  ON audit_logs(account_id, event_type, created_at DESC);
