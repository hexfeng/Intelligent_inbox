ALTER TABLE intelligence_results
  ADD COLUMN IF NOT EXISTS pipeline_version text;

UPDATE intelligence_results
SET pipeline_version = 'legacy:v1.1'
WHERE pipeline_version IS NULL;

ALTER TABLE intelligence_results
  ALTER COLUMN pipeline_version SET NOT NULL;

ALTER TABLE intelligence_results
  DROP CONSTRAINT IF EXISTS intelligence_results_account_id_gmail_thread_id_thread_version_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'intelligence_results_pipeline_unique'
  ) THEN
    ALTER TABLE intelligence_results
      ADD CONSTRAINT intelligence_results_pipeline_unique
      UNIQUE(account_id, gmail_thread_id, thread_version, pipeline_version);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS summary_results (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
  gmail_thread_id text NOT NULL,
  thread_version text NOT NULL,
  pipeline_version text NOT NULL,
  result_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, gmail_thread_id, thread_version, pipeline_version)
);

CREATE INDEX IF NOT EXISTS intelligence_pipeline_lookup_idx
  ON intelligence_results(account_id, gmail_thread_id, thread_version, pipeline_version);

CREATE INDEX IF NOT EXISTS summary_pipeline_lookup_idx
  ON summary_results(account_id, gmail_thread_id, thread_version, pipeline_version);
