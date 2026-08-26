# Implementation status by Phase

This file describes code readiness, not external release approval. Phase 8 remains closed until every real-account gate in `MANUAL_ACCEPTANCE.md` is evidenced.

## Phase 0 — Development Readiness

Implemented: TypeScript workspace, independent Extension/API boundary, exact action allow-list, OAuth data-flow documents, encrypted-token boundary, Archive pre-image and Undo execution path.

Pending gate evidence: real Gmail test-account Archive/Undo and production log inspection.

## Phase 1 — Foundation & Gmail Connector

Implemented: React/Vite/MV3 Extension, Fastify API, PostgreSQL migration, PKCE OAuth, session hashing, refresh-token encryption, connect, incremental Calendar consent, disconnect/revoke/delete, and account-scoped repository queries.

Pending gate evidence: Gmail SPA, multi-tab and MV3 suspension tests in the installed Extension.

## Phase 2 — Email Intelligence Core

Implemented: in-memory normalizer, one OpenAI Responses adapter, separate classifier/draft models, strict JSON Schema, `store:false`, versioned Intelligence, recommendation construction and Review abstention contract.

Pending gate evidence: production model evaluation set, prompt/version calibration and attachment-dependent abstention measurements.

## Phase 3 — Safe Actions & Undo

Implemented: Archive, Mark Read, Label and Star; Gmail scope, account recommendation, thread-version and action matching; advisory-lock idempotency; per-message pre/post label images; conflict-safe Undo.

Pending gate evidence: live cross-account, concurrent retry and multi-message restoration exercises.

## Phase 4 — Thread Panel & Feedback

Implemented: summary, state, one primary CTA, Why, Wrong, success, Undo and structured Accept/Edit/Skip/Wrong/Undo events without draft bodies.

Pending gate evidence: installed-Gmail navigation and accessibility acceptance.

## Phase 5 — Smart Reply

Implemented: one Gmail Draft, strict no-send boundary, Reply-To verification, self-recipient rejection, header-injection sanitation and pre-generation style intent.

Pending gate evidence: real recipient/thread correctness and factuality evaluation for dates, amounts, attachments and participants.

## Phase 6 — Inbox Triage & Selected Batch

Implemented: on-demand queue for explicit current-view IDs, version cache, bounded concurrency, enum-only row badges, one-at-a-time Triage, input shortcut protection and Selected Batch preview. Batch mode leads into per-thread review; it does not expose a blind bulk-write endpoint.

Pending gate evidence: Gmail DOM variants, Compose focus, search/category routes and broken-DOM fallback.

## Phase 7 — Calendar FreeBusy Collaboration

Implemented: incremental FreeBusy consent, thread-level constraint review, deterministic working-hours/buffer/busy ranking, traceable source marker, OpenAI wording constrained to verified slots, Gmail Draft creation and no create-event capability.

Pending gate evidence: timezone/DST/cross-day scenarios, real shared-calendar behavior and slot-to-draft trace inspection.

## Phase 8 — Alpha Hardening & Release

Implemented: production build, privacy/data control page, disconnect/delete path, safe log redaction, release runbook and manual blocker matrix.

Blocked by design: no external Alpha until all real Gmail/Calendar/OpenAI checks are complete. Gmail Watch remains post-Alpha.
