# Architecture

## Runtime boundary

```text
Chrome MV3 Extension
        | HTTPS + bearer session
Fastify TypeScript API
  |- OAuth and encrypted refresh-token boundary
  |- Gmail connector and deterministic action executor
  |- OpenAI classification and draft adapter
  |- Calendar FreeBusy and deterministic slot ranking
  `- PostgreSQL metadata, feedback and safe audit trail
```

The Extension never receives a Google refresh token, OpenAI key or database credential. The API never exposes a generic tool endpoint. Gmail and Calendar writes are compiled from versioned, server-validated requests.

## Request flow

1. The Extension extracts only Thread IDs from the current Gmail route or visible rows.
2. The API validates session ownership and fetches the Thread through Gmail API.
3. Raw body content is normalized in memory and sent to OpenAI with `store:false` and strict JSON Schema.
4. The API persists structured enums, Recommendation IDs and thread version, not raw body text.
5. A user-confirmed write request must match its Recommendation, account and current thread version.
6. PostgreSQL advisory locking serializes identical idempotency keys.
7. The executor captures per-message label state before mutation and checks the exact post-image before Undo.

## On-demand Triage

Triage accepts an explicit list of at most 50 Thread IDs from the current Gmail view. It reuses results only when the Gmail `thread_version` matches and analyzes missing versions with bounded concurrency. It does not scan the mailbox or depend on background watch state.

## Release boundary

The code supports Phase 0–8 surfaces, but external Alpha remains blocked until the real-account matrix, OAuth disclosure, privacy checks and Gmail DOM checks pass. Gmail Watch is a post-Alpha evidence decision.
