# Privacy and data handling

## Product storage

Intelligent Inbox stores account references, Google scopes, encrypted refresh tokens, Gmail Thread IDs and versions, derived summaries, structured decision probabilities and enums, pipeline versions, recommendation/action metadata, feedback events and allow-listed audit metadata.

It does not intentionally persist Gmail raw bodies, attachment contents, the ephemeral EvidenceEnvelope, generated draft text, Sender addresses in logs, or full model-provider requests/responses. Action pre-images contain only per-message label state required for Undo.

## Current implementation

The v2 decision path sends normalized thread state to TypeSafe/JEV by default. If `DECISION_BACKEND=openai-luna`, the same decision state is sent to OpenAI. Summary and Draft requests use OpenAI Responses with `store:false`, foreground processing, strict structured output and no hosted tools, files, vector stores or background mode. Provider calls contain email content needed for the requested operation; neither `store:false` nor SDK configuration alone proves Zero Data Retention. Product copy must disclose both active providers and must not claim zero retention unless each project has been approved and configured for it.

## Implemented v2 processing

Normalized Thread state is sent to JEV for closed judgments when the default backend is active. OpenAI receives Thread context for an on-demand summary or requested Draft, and also for decisions only when the deployment explicitly selects `openai-luna`. Neither provider receives Gmail or Calendar write tools. Provider, model, token usage, question set and policy versions are persisted without the full provider request or response.

Provider retention, processing region, deletion behavior and contract terms still require live-account verification and must be reflected accurately in product copy before Alpha.

## Logging

Fastify redacts Authorization, request bodies and response bodies. Audit records use explicit metadata fields. Gmail pages must not enable session replay or DOM capture.

## Account deletion

`DELETE /v1/account/data` attempts Google credential revocation, deletes the connected account, sessions and product data through database cascades, and reports whether revocation succeeded. If revocation fails, the client must tell the user to remove Intelligent Inbox from Google Account permissions.
