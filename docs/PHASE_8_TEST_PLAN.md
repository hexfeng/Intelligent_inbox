# Phase 8 test plan

This plan contains no schedule or staffing assumptions. Decision Pipeline v2 is implemented in code; Alpha opens only after every live-provider and real-account blocker below has evidence.

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

1. Complete the root `.env` with a random 32-byte encryption key, exact Extension origin, Google OAuth credentials, `DECISION_BACKEND`, the selected decision-provider key and model, and explicit OpenAI summary and Draft model IDs.
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
| Analyze | Open Thread → Analyze | Valid v2 signals, code-derived state, one policy recommendation, pipeline version |
| Summary | Open analyzed Thread | Decision appears first; summary loads separately and remains evidence-grounded |
| Abstain | Unknown/conflicting/attachment-dependent message | Review state; no write CTA |
| Safe action | Analyze → confirm → Archive/Read/Label/Star | One Gmail mutation and audit metadata |
| Idempotency | Repeat identical key concurrently | Same execution ID; no second mutation |
| Undo | Execute → Undo | Only recorded label differences restored |
| Undo conflict | Execute → external Gmail change → Undo | Conflict; external change preserved |
| Draft | Analyze → choose style → Draft | Correct Thread and Recipient; Gmail native Compose sends manually |
| Triage | Inbox → Start Triage → navigate/accept/skip | Current item first; rolling prefetch; current-view IDs only; version cache reused |
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
- Cached decision response: p95 below 1 second on the test environment.
- New single-Thread Gmail fetch plus decision: p95 below 3 seconds, with progress visible throughout.
- Decision-provider portion: p95 below 1.5 seconds and exactly one provider call per Thread.
- On-demand summary: p95 below 5 seconds; failure does not remove the decision or recommendation.
- Ten-Thread Triage first item: p95 below 3 seconds; remaining items load progressively; no browser freeze over 100 ms.
- Safe action confirmation to Gmail result: p95 below 3 seconds.
- Undo confirmation to restored Gmail state: p95 below 3 seconds.

Record median, p95, failure rate and retry count separately. Do not hide network/model time inside a single average.

## 5. AI quality suite

Build a labeled fixture set covering direct questions, action requests, meetings, introductions, conversations, newsletters, promotions, notifications, invoices, receipts, subscriptions, automated senders, ambiguous intent, prompt injection, attachment dependency and contradictory threads.

Measure:

- Provider schema validity: 100%.
- Content type and communication intent precision, recall and F1 by class.
- Brier score, Expected Calibration Error and reliability bins for Jev probabilities.
- Subscription, automated-sender, reply-required, action-required, attachment-dependent and contradiction metrics.
- Review coverage and error-catch rate at the versioned policy thresholds.
- Fixed-signal RecommendationPolicy tests, including cross-field invariant violations.
- Dangerous action exposure: 0.
- Provider call count, p50, p95, timeout rate and cost per 100 Threads.
- Summary evidence trace rate for dates, amounts, participants, attachments and commitments.
- Draft recipient correctness: 100%.
- Dates, amounts, participants, attachments and Calendar slots traceable to source: 100%.

Provider, Policy and Generation reports remain separate. Do not report one overall accuracy that hides a weak class or a policy defect.

## 6. Privacy and security suite

- Inspect PostgreSQL rows after Analyze, Draft, Action, Undo and Delete.
- Inspect API logs and error telemetry with sentinel body text, attachment name and Sender address.
- Confirm sentinel values do not appear outside the active Jev decision request or active OpenAI generation request.
- Verify the decision provider receives normalized state only, and OpenAI generation requests use `store:false`, foreground execution and no hosted tools/files/vector stores.
- Verify full provider requests/responses and the ephemeral EvidenceEnvelope are absent from PostgreSQL, logs and telemetry.
- Attempt stale version, cross-account Thread ID, unknown action, missing scope, malformed label, replayed state and reused idempotency key.

## 7. Release blockers

Alpha remains closed for any cross-account access, wrong Recipient, duplicate mutation, unsafe Undo overwrite, R3 action, model-generated executable payload, v1.1 cache reused as v2, raw-content persistence/logging, false revocation status, fabricated Calendar slot, automatic send, unsubscribe or event creation.

## 8. Evidence package

For every real-account case retain:

- Test case ID and sanitized setup description.
- Expected and actual result.
- API request ID and safe audit event ID.
- Screenshot with message content redacted.
- Database/log inspection result.
- Pass, fail or blocked disposition.

The final release review links each blocker to evidence; “tested manually” without evidence is not sufficient.
