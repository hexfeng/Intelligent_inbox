# Manual acceptance matrix

These checks require dedicated real Google test accounts and cannot be replaced by mocks.

## Google account and data

- Connect, refresh, reconnect and incrementally add Calendar FreeBusy permission.
- Confirm the Extension never receives the Google refresh token or OpenAI key.
- Delete account data; verify session invalidation, database deletion and reported revocation result.
- Inspect API, database, Sentry and analytics payloads for raw body, draft or Sender leakage.

## Gmail actions

- Analyze a real Thread and confirm the returned version changes when a new message arrives.
- Archive, Mark Read, Label and Star; repeat the same idempotency key and confirm one mutation.
- Undo a multi-message Thread with different per-message labels and confirm exact restoration.
- Modify Gmail state after execution and confirm Undo returns a conflict instead of overwriting it.
- Attempt cross-account, stale, unknown and missing-scope requests and confirm rejection.

## Draft and Extension

- Create a Draft in the correct Thread and Recipient; confirm no automatic send path exists.
- Verify Thread, Inbox, Search and Compose routes, multi-tab navigation and MV3 service-worker restart.
- Focus Gmail Compose/input controls and confirm Triage shortcuts do not fire.
- Break the expected Gmail DOM shape and confirm the Extension does not block native reading, navigation or sending.

## Calendar

- Grant FreeBusy scope incrementally.
- Verify time zone, DST, cross-day, working-hours, buffer and no-availability scenarios.
- Trace every displayed slot to the FreeBusy response.
- Confirm no event-create request or permission exists.

## Alpha release blockers

Any cross-account access, wrong Recipient, duplicate mutation, R3 action, raw-content log, false revocation result, or fabricated Calendar slot blocks release.
