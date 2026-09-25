# Implementation status by Phase

This file describes code readiness, not external release approval. Decision Pipeline v2 is implemented and the legacy v1.1 write path is removed. Phase 8 remains closed until provider evaluation and every real-account gate in `MANUAL_ACCEPTANCE.md` are evidenced.

## Phase 0 — Development Readiness

Code complete: TypeScript workspace, v2 shared contracts, independent Extension/API boundary, exact action allow-list, encrypted-token boundary, Archive pre-image and Undo execution path.

Pending external evidence: real Gmail Archive/Undo and production log inspection. The local PostgreSQL v2 migration and schema gate pass.

## Phase 1 — Foundation & Gmail Connector

Code complete: React/Vite/MV3 Extension, Fastify API, PostgreSQL, PKCE OAuth, sessions, incremental Calendar consent and account-scoped queries. Gmail Threads now preserve each message's body, optional HTML, sender, recipients, headers and attachment metadata. Normalization and evidence extraction run per message.

Pending external evidence: installed-Extension Gmail SPA, multi-tab and MV3 suspension tests.

## Phase 2 — Decision Pipeline Core

Code complete:

- `DecisionSignalsV2`, complete probability maps and per-signal confidence.
- TypeSafe/JEV Choice, Noul and Score questions in one `systemOne` request.
- Contract-compatible GPT-6 Luna decision backend selected by deployment config.
- Deterministic code-owned Review, attention, priority, reason codes and recommendations.
- Ephemeral EvidenceEnvelope; no raw message body in decision persistence.
- Normalizer, question set, policy and cache pipeline versions.

Verified locally: JEV and GPT-6 Luna both pass the 3/3 synthetic locked smoke set, and the Luna summary path returns valid structured output.

Pending external evidence: representative locked-set calibration, per-class quality thresholds, latency and cost reporting. The three seed fixtures are not production-quality evidence.

## Phase 3 — Safe Actions & Undo

Code complete and retained: Archive, Mark Read, Label and Star; account ownership, thread version and recommendation matching; advisory-lock idempotency; per-message label images and conflict-safe Undo. Models do not output actions or payloads.

Pending external evidence: live cross-account, concurrent retry and multi-message restoration exercises.

## Phase 4 — Thread Panel & Feedback

Code complete: `AnalysisResultV2`, independent summary loading, code-owned Review reasons, v2 feedback taxonomy and no uncalibrated aggregate confidence display.

Pending external evidence: installed-Gmail navigation, keyboard, focus and accessibility acceptance.

## Phase 5 — Smart Reply

Code complete: Draft generation is separate from decisions, context is rebuilt from the current normalized Thread and EvidenceEnvelope, Reply-To and self-recipient checks remain, and the API creates a Gmail Draft without sending.

Pending external evidence: real recipient/thread correctness and factuality review for dates, amounts, attachments and participants.

## Phase 6 — Inbox Triage & Selected Batch

Code complete: the Extension owns the thread-ID queue, loads the current item first and prefetches the next four in parallel. Summary is on demand and a later provider failure cannot delay the first item. The old all-at-once `/v1/triage/queue` route is removed.

Pending external evidence: first-item latency, partial provider failure, Gmail DOM variants, Compose focus, search/category routes and broken-DOM fallback.

## Phase 7 — Calendar FreeBusy Collaboration

Code complete: incremental FreeBusy consent, deterministic slot ranking, verified-source markers, v2 meeting gate and Draft-only output. There is no create-event capability.

Pending external evidence: timezone/DST/cross-day and real shared-calendar scenarios.

## Phase 8 — Alpha Hardening & Release

Code complete: v2 migration, pipeline-aware caches, provider disclosure, environment template, release checks, seed eval fixtures, offline policy evaluator, production build and privacy/data-control paths.

Local environment, provider credentials, PostgreSQL migration, API boundary and 22/22 Phase 8A live checks are ready. The remaining blockers are Google real-account acceptance and an approved representative de-identified or synthetic labeled corpus. Gmail Watch remains post-Alpha.
