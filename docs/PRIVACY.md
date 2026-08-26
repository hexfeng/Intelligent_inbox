# Privacy and data handling

## Product storage

Intelligent Inbox stores account references, Google scopes, encrypted refresh tokens, Gmail Thread IDs and versions, derived summaries, structured intelligence enums, recommendation/action metadata, feedback events and allow-listed audit metadata.

It does not intentionally persist Gmail raw bodies, attachments, free-text verified facts, generated draft text, Sender addresses in logs, or full OpenAI prompts/responses. Action pre-images contain only per-message label state required for Undo.

## OpenAI processing

OpenAI requests use the Responses API with `store:false`, foreground processing, strict structured output and no hosted tools, files, vector stores or background mode. `store:false` does not by itself guarantee Zero Data Retention. Product copy must disclose the actual OpenAI project controls and must not claim zero retention unless the project has been approved and configured for it.

## Logging

Fastify redacts Authorization, request bodies and response bodies. Audit records use explicit metadata fields. Gmail pages must not enable session replay or DOM capture.

## Account deletion

`DELETE /v1/account/data` attempts Google credential revocation, deletes the connected account, sessions and product data through database cascades, and reports whether revocation succeeded. If revocation fails, the client must tell the user to remove Intelligent Inbox from Google Account permissions.
