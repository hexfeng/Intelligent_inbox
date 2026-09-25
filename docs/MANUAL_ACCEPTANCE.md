# Manual acceptance matrix

These checks require dedicated real Google test accounts and cannot be replaced by mocks.

## Google account and data

- Connect, refresh, reconnect and incrementally add Calendar FreeBusy permission.
- Confirm the Extension never receives the Google refresh token or OpenAI key.
- Delete account data; verify session invalidation, database deletion and reported revocation result.
- Inspect API, database, Sentry and analytics payloads for raw body, draft or Sender leakage.

## Gmail actions

- Analyze a real Thread and confirm v2 signals, derived state, recommendation and pipeline version are returned before the optional summary.
- Confirm the returned Thread version changes when a new message arrives and no v1.1 cache is reused as v2.
- Exercise Promotion, Newsletter, Subscription, Receipt, direct reply, action request and ambiguous mixed-category messages; confirm Review and code-owned recommendations match the locked cases.
- Archive, Mark Read, Label and Star; repeat the same idempotency key and confirm one mutation.
- Undo a multi-message Thread with different per-message labels and confirm exact restoration.
- Modify Gmail state after execution and confirm Undo returns a conflict instead of overwriting it.
- Attempt cross-account, stale, unknown and missing-scope requests and confirm rejection.

## Draft and Extension

- Create a Draft in the correct Thread and Recipient; confirm no automatic send path exists.
- Confirm summary failure leaves the decision and safe recommendation usable.
- Start a ten-Thread Triage queue; confirm the first item appears without waiting for all ten and later failures do not block navigation.
- Verify Thread, Inbox, Search and Compose routes, multi-tab navigation and MV3 service-worker restart.
- Focus Gmail Compose/input controls and confirm Triage shortcuts do not fire.
- Break the expected Gmail DOM shape and confirm the Extension does not block native reading, navigation or sending.

## Calendar

- Grant FreeBusy scope incrementally.
- Verify time zone, DST, cross-day, working-hours, buffer and no-availability scenarios.
- Trace every displayed slot to the FreeBusy response.
- Confirm no event-create request or permission exists.

## Alpha release blockers

Any cross-account access, wrong Recipient, duplicate mutation, R3 action, model-generated executable payload, v1.1 cache accepted as v2, raw-content log, false revocation result, or fabricated Calendar slot blocks release.
