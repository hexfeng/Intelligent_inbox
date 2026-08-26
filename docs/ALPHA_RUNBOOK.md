# Alpha runbook

## Build and install

1. Run typecheck, tests and the production build.
2. Apply the PostgreSQL migration.
3. Configure the Google consent screen, exact Chrome redirect URI and allowed scopes.
4. Configure the API origin and required OpenAI model environment variables.
5. Load the unpacked Extension and confirm the Popup reports the expected account and scopes.

## Recovery

- If Gmail UI duplicates, reload the Extension and refresh Gmail. The content root is idempotent and should remount once.
- If the Panel cannot anchor, close it and use the Popup; Gmail native functionality must remain unaffected.
- If an action returns `STALE_THREAD`, re-analyze before executing.
- If Undo returns `UNDO_CONFLICT`, inspect Gmail state manually; do not retry a blind restore.
- If OAuth fails after the consent screen, verify the exact extension redirect URI and restart the connection flow.

## Incident boundaries

Immediately stop Alpha access for cross-account data, wrong Recipient, duplicate Gmail mutation, dangerous action exposure, raw email content in logs, or a Calendar slot not returned by FreeBusy.

Do not work around these failures with automatic retries, fallback providers or expanded scopes. Narrow or disable the affected surface until the root cause is verified.
