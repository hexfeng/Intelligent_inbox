# Architecture

This file defines the implemented v2 runtime. Code completion and remaining external validation gates are tracked in [Implementation status](IMPLEMENTATION_STATUS.md), [Development plan v2](DEVELOPMENT_PLAN_V2.md) and the [v2 refactor report](V2_REFACTOR_REPORT_2026-09-24.md).

## Runtime boundary

```text
Chrome MV3 Extension
  - explicit Gmail Thread IDs
  - current item plus rolling prefetch
            |
            | HTTPS + bearer session
            v
Fastify TypeScript API
  - OAuth and encrypted refresh-token boundary
  - Gmail and Calendar connectors
  - per-message normalizer
  - ephemeral EvidenceEnvelope
            |
            v
DecisionProvider
  - Jev primary
  - Choice, Noul and Score only
  - GPT-6 Luna contract-compatible operational fallback
            |
            v
RecommendationPolicy
  - deterministic thresholds and cross-field invariants
  - Review, attention, priority and action ownership
       +--------------------+
       |                    |
       v                    v
On-demand Generation    Deterministic Executor
  - Luna summary          - Gmail allow-list only
  - Sol Draft             - ownership and version checks
  - no tools              - idempotency and Undo
       |                    |
       +----------+---------+
                  v
PostgreSQL
  - derived decisions and probabilities
  - pipeline and recommendation metadata
  - feedback, execution and safe audit data
  - no raw body, EvidenceEnvelope or Draft text
```

The Extension never receives a Google refresh token, model-provider key or database credential. The API exposes no generic tool endpoint. Models never receive Gmail or Calendar write tools.

## Decision and generation flow

1. The Extension extracts only Thread IDs from the current Gmail route or visible rows.
2. The API validates session ownership and fetches the Thread through Gmail API.
3. The connector preserves message boundaries; the normalizer removes signatures and quoted history per message.
4. One Jev request evaluates all independent closed judgments against the same state.
5. `RecommendationPolicy` derives Review, attention, priority and recommendation from probabilities, account scopes, thread state and product rules.
6. The API persists only derived structured results with a full `pipeline_version`.
7. Summary is generated only for an opened Thread or current Triage item. Draft is generated only after an explicit user request.
8. A user-confirmed write must match its Recommendation, account and current thread version.
9. PostgreSQL advisory locking serializes identical idempotency keys.
10. The executor captures per-message label state before mutation and checks the exact post-image before Undo.

The normative decision contract is in [Decision Pipeline v2](DECISION_PIPELINE_V2.md).

## Provider boundary

`DecisionProvider`, `SummaryProvider` and `DraftProvider` are separate interfaces. Jev is the default decision implementation; GPT-6 Luna can implement the same decision contract through an explicit deployment setting. The first release does not perform automatic per-request fallback or dynamic provider routing.

The decision model returns no `suggested_action`, Gmail label ID, tool name, Review flag, summary or arbitrary extracted string. Provider output is untrusted until local schema validation succeeds.

## Evidence boundary

Headers, message IDs, recipients and attachment metadata come from the connector. Dates, amounts, participants and identifiers must carry a source message, field and optional offset. Model-proposed candidates are not verified until code confirms that they exist in the source.

The EvidenceEnvelope is ephemeral. Attachment bodies remain outside the Alpha path; attachment-dependent decisions enter Review.

## On-demand Triage

The Extension owns the queue of explicit current-view Thread IDs. It analyzes the current item first and prefetches only the next 3 to 5 items. A late item or provider failure cannot block the first result. Triage does not scan the mailbox or depend on background watch state.

## Cache boundary

A cache hit requires account, Thread ID, Gmail `thread_version` and `pipeline_version`. The pipeline version covers normalizer, decision schema, Jev question set, recommendation policy and provider/model. v1.1 combined intelligence results are never interpreted as v2 probability results.

## Release boundary

OAuth, Google connector, safe actions, Undo and Calendar FreeBusy remain valid completed foundations. The local v2 migration and synthetic provider smoke pass. External Alpha stays blocked until representative locked-set calibration, real-account acceptance, privacy disclosure and Gmail DOM checks pass. Gmail Watch remains a post-Alpha evidence decision.
