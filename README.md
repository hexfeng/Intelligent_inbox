# Intelligent Inbox

Intelligent Inbox is a Gmail decision and action layer delivered as a Chrome MV3 extension plus an independent TypeScript API. It analyzes only user-requested Gmail threads, recommends one next action, executes an explicit safe allow-list, creates Gmail drafts without sending them, and can propose meeting times sourced from Google Calendar FreeBusy.

## Current Alpha scope

- Google OAuth with Gmail Modify and incremental Calendar FreeBusy scopes.
- Versioned Email Intelligence v1.1 with strict structured output.
- Archive, Mark Read, Label and Star with ownership, version, risk, idempotency and Undo checks.
- Gmail Thread Panel, on-demand Triage queue and explicit Selected Batch preview.
- Gmail Draft creation; there is no send endpoint.
- Calendar FreeBusy slot ranking; there is no event creation endpoint.
- Feedback, safe audit metadata, disconnect and account data deletion.

The repository intentionally has no Gmail Watch, Pub/Sub, automatic send, unsubscribe, event creation, vector store, hosted OpenAI tools or multi-provider routing.

## Repository layout

```text
apps/extension     React + Vite + Chrome MV3
apps/api           Fastify API, Google/OpenAI adapters, PostgreSQL repository
packages/contracts Shared Zod schemas and TypeScript types
docs               Architecture, privacy, runbook and manual acceptance gates
```

## Local setup

Requirements: Node.js 22+, Docker Desktop, a Google Cloud OAuth client, an OpenAI API project and Chrome.

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
```

Automated tests do not satisfy the Google-account release gate. Complete [the manual acceptance matrix](docs/MANUAL_ACCEPTANCE.md) before inviting Alpha users.
