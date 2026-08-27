# Phase 8 test plan

This plan contains no schedule or staffing assumptions. Alpha opens only after every blocker has evidence.

## 1. Test environments

| Environment | Purpose | Data |
|---|---|---|
| Automated | Schema, security boundary, deterministic logic and regression | Synthetic fixtures only |
| Local integration | PostgreSQL migration, API process, Extension build and API contracts | Dedicated local database |
| Google test account A | Normal Gmail/Calendar workflows | Purpose-built non-production messages |
| Google test account B | Cross-account and recipient isolation | Purpose-built non-production messages |

Production mailboxes and personal correspondence are excluded from pre-Alpha testing.

## 2. Phase 8A readiness flow

### Flow A — Environment bootstrap

1. Complete the root `.env` with a random 32-byte encryption key, exact Extension origin, Google OAuth credentials, OpenAI key and explicit model IDs.
2. Start PostgreSQL with `docker compose up -d`.
3. Wait for the Compose health check to report `healthy`.
4. Apply `npm run migrate --workspace @intelligent-inbox/api`.
5. Start the API with `npm run dev:api`.
6. Run `npm run phase8a:live`.

Expected result: every check is `PASS`; secret values are never printed.

### Flow B — Extension registration

1. Run `npm run build --workspace @intelligent-inbox/extension`.
2. Load `apps/extension/dist` as an unpacked Chrome extension.
3. Record the generated 32-character Extension ID.
4. Set `APP_ORIGIN=chrome-extension://<extension-id>`.
5. Register `https://<extension-id>.chromiumapp.org/google` in the Google OAuth client.
6. Rebuild, reload the Extension and refresh Gmail.

Expected result: Popup renders, no duplicate content root appears, and the Connect action reaches the API without a CORS or redirect mismatch.

### Flow C — Failure and recovery

- Stop PostgreSQL: API must fail clearly without exposing credentials.
- Start PostgreSQL again: migration is idempotent and API recovers after restart.
- Stop the API: Popup reports a connection failure without blocking Gmail.
- Reload the MV3 service worker: the content root is mounted once and session state remains usable.

## 3. Functional test matrix

| Area | Main flow | Required evidence |
|---|---|---|
| OAuth | Connect → consent → callback → account status | Correct account email/scopes; refresh token absent from Extension |
| Incremental Calendar | Gmail-only account → enable FreeBusy | Only Calendar FreeBusy scope added |
| Analyze | Open Thread → Analyze | Versioned Intelligence, one primary recommendation, valid Schema |
| Abstain | Unknown/conflicting/attachment-dependent message | Review state; no write CTA |
| Safe action | Analyze → confirm → Archive/Read/Label/Star | One Gmail mutation and audit metadata |
| Idempotency | Repeat identical key concurrently | Same execution ID; no second mutation |
| Undo | Execute → Undo | Only recorded label differences restored |
| Undo conflict | Execute → external Gmail change → Undo | Conflict; external change preserved |
| Draft | Analyze → choose style → Draft | Correct Thread and Recipient; Gmail native Compose sends manually |
| Triage | Inbox → Start Triage → navigate/accept/skip | Current-view IDs only; version cache reused |
| Selected Batch | Select rows → preview → review queue | Count/action/sample visible; no blind bulk endpoint |
| FreeBusy | Confirm window → query → create availability Draft | Every proposed slot matches FreeBusy; no event created |
| Delete | Privacy → delete/disconnect | Sessions and product rows removed; revocation result truthful |

## 4. Smoothness and interaction quality

### Popup

- First meaningful state must be Connected, Disconnected or actionable error; no indefinite spinner.
- Every click immediately shows disabled/loading feedback.
- Repeated Connect clicks must not open concurrent OAuth flows.
- Error messages use stable API codes and a clear next action.

### Thread Panel

- Panel mounts once across Gmail SPA navigation and does not cover Gmail Compose controls.
- Analyze shows progress immediately and preserves Gmail scrolling/focus.
- Exactly one primary CTA is visually dominant.
- Review state explains why execution is unavailable.
- Success state clearly identifies Draft, action or Undo result.

### Triage

- Queue creation never scans outside the visible Thread IDs supplied by Gmail DOM extraction.
- `J/K`, `Enter`, `S` and `Esc` respond once per keypress.
- Gmail input, Search and Compose focus suppress all Triage shortcuts.
- Current index, remaining count and action result remain understandable after every transition.
- DOM extraction failure leaves Gmail reading, navigation and sending fully functional.

### Responsiveness targets

These are acceptance targets, not current measured results:

- Local UI feedback after click: visible within 150 ms.
- Cached Intelligence response: p95 below 1 second on the test environment.
- New single-Thread analysis: p95 below 8 seconds, with progress visible throughout.
- Ten-Thread Triage preparation: p95 below 20 seconds; no browser freeze over 100 ms.
- Safe action confirmation to Gmail result: p95 below 3 seconds.
- Undo confirmation to restored Gmail state: p95 below 3 seconds.

Record median, p95, failure rate and retry count separately. Do not hide network/model time inside a single average.

## 5. AI quality suite

Build a labeled fixture set covering direct questions, requests, meetings, invoices, introductions, newsletters, notifications, ambiguous intent, prompt injection, attachment dependency and contradictory threads.

Measure:

- Schema validity: 100%.
- Dangerous action exposure: 0.
- Unsupported-intent abstention recall.
- Category, attention state and suggested-action accuracy by class.
- Summary factual consistency.
- Draft recipient correctness: 100%.
- Dates, amounts, participants, attachments and Calendar slots traceable to source: 100%.

## 6. Privacy and security suite

- Inspect PostgreSQL rows after Analyze, Draft, Action, Undo and Delete.
- Inspect API logs and error telemetry with sentinel body text, attachment name and Sender address.
- Confirm sentinel values do not appear outside the active OpenAI request.
- Verify OpenAI requests use `store:false`, foreground execution and no hosted tools/files/vector stores.
- Attempt stale version, cross-account Thread ID, unknown action, missing scope, malformed label, replayed state and reused idempotency key.

## 7. Release blockers

Alpha remains closed for any cross-account access, wrong Recipient, duplicate mutation, unsafe Undo overwrite, R3 action, raw-content persistence/logging, false revocation status, fabricated Calendar slot, automatic send, unsubscribe or event creation.

## 8. Evidence package

For every real-account case retain:

- Test case ID and sanitized setup description.
- Expected and actual result.
- API request ID and safe audit event ID.
- Screenshot with message content redacted.
- Database/log inspection result.
- Pass, fail or blocked disposition.

The final release review links each blocker to evidence; “tested manually” without evidence is not sufficient.
