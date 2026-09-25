# Intelligent Inbox

Intelligent Inbox is a Gmail decision and action layer delivered as a Chrome MV3 extension plus an independent TypeScript API. It analyzes only user-requested Gmail threads, recommends one next action, executes an explicit safe allow-list, creates Gmail drafts without sending them, and can propose meeting times sourced from Google Calendar FreeBusy.

The code now implements Decision Pipeline v2: JEV is the default probabilistic decision backend, GPT-6 Luna is the contract-compatible decision fallback and summary model, GPT-6 Sol drafts replies, and deterministic local policy owns Review, priority and actions. See [Decision Pipeline v2](docs/DECISION_PIPELINE_V2.md), [Development plan v2](docs/DEVELOPMENT_PLAN_V2.md), [v2 refactor report](docs/V2_REFACTOR_REPORT_2026-09-24.md) and [Implementation status](docs/IMPLEMENTATION_STATUS.md). The Word PRD and phase plan at the repository root remain historical v1.x baselines.

## Current Alpha scope

- Google OAuth with Gmail Modify and incremental Calendar FreeBusy scopes.
- Per-message normalization, versioned v2 probability signals and pipeline-aware caching.
- JEV Choice/Noul/Score decisions with an explicit GPT-6 Luna backend switch.
- Deterministic recommendation and Review policy; models cannot choose executable actions.
- Archive, Mark Read, Label and Star with ownership, version, risk, idempotency and Undo checks.
- Gmail Thread Panel with independent summary loading, Extension-owned rolling Triage prefetch and explicit Selected Batch preview.
- Gmail Draft creation; there is no send endpoint.
- Calendar FreeBusy slot ranking; there is no event creation endpoint.
- Feedback, safe audit metadata, disconnect and account data deletion.

The repository intentionally has no Gmail Watch, Pub/Sub, automatic send, unsubscribe, event creation, vector store, hosted model tools or dynamic multi-provider routing.

## Repository layout

```text
apps/extension     React + Vite + Chrome MV3
apps/api           Fastify API, Google/OpenAI adapters, PostgreSQL repository
packages/contracts Shared Zod schemas and TypeScript types
docs               v2 architecture, development plan, privacy, runbook and acceptance gates
```

## Local setup

Requirements: Node.js 22+, Docker Desktop, a Google Cloud OAuth client, a TypeSafe/JEV API key, an OpenAI API project and Chrome. Set `DECISION_BACKEND=openai-luna` if you intentionally want the OpenAI decision fallback instead of JEV.

```powershell
npm install
docker compose up -d
Copy-Item .env.example .env
```

Generate the 32-byte encryption key in PowerShell and place the result in `.env`:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

Complete the root `.env`, then run the migration and API (both commands load that file automatically):

```powershell
npm run migrate --workspace @intelligent-inbox/api
npm run dev:api
```

Build and load the extension:

```powershell
npm run build --workspace @intelligent-inbox/extension
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `apps/extension/dist`. Copy the generated extension ID into the Google OAuth redirect URI:

```text
https://<extension-id>.chromiumapp.org/google
```

Set `APP_ORIGIN=chrome-extension://<extension-id>` and rebuild the extension if `VITE_API_BASE_URL` differs from `http://127.0.0.1:8787`.

## Quality commands

```powershell
npm run typecheck
npm test
npm run build
npm run phase8a:check
```

After PostgreSQL, migration and the API are running, use `npm run phase8a:live` to verify the database schema, API health and unauthenticated boundary. The detailed real-account flow is in [the Phase 8 test plan](docs/PHASE_8_TEST_PLAN.md).

Automated tests do not satisfy the Google-account release gate. Complete [the manual acceptance matrix](docs/MANUAL_ACCEPTANCE.md) before inviting Alpha users.
