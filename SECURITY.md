# Security policy

Do not report security issues in public GitHub issues. Contact the repository owner privately with reproduction steps and affected account boundaries.

The product security invariants are:

- Google refresh tokens are AES-256-GCM encrypted server-side.
- Sessions contain opaque random tokens; PostgreSQL stores only their hashes.
- Every Gmail write validates account ownership, scope, recommendation, thread version, action allow-list, confirmation and idempotency.
- Undo uses exact per-message label snapshots and refuses conflicting state.
- No public endpoint can send email, unsubscribe, create/cancel an event or invoke an arbitrary tool.
- Authorization, request bodies and response bodies are redacted from application logs.
