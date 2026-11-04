# Integration evidence

Validated on 2026-11-04 against a dedicated Stalwart 1.0.1 container and the real
application binary. The isolated environment has its own Docker network,
mail directory, platform SQLite database and credentials; it does not alter
production mailbox data.

`tests/platform-integration.py` passed real login, operator authorization,
draft persistence, streamed attachment round-trip, two-user resource isolation,
send idempotency, shared Webmail/native JMAP/SMTP recipient counters, restart
persistence, fail-closed authenticated submission and unaffected external
incoming delivery during a platform outage. The recipient used for quota
checks is a second domain inside the isolated mail server; this proves the
policy path, not Internet deliverability.

`tests/identity-integration.py` passed concurrent signup, repeat requests,
real Stalwart provisioning/login, device revocation, application password
creation/revocation, password changes and one-use recovery. Its test helper
seeds only a delivery/captcha input into the stopped disposable database, then
calls the unchanged verification and account APIs. It does not prove production
Turnstile execution or delivery of verification email to an Internet mailbox.

Stalwart credential mutations use optimistic updates. A real test exposed a
conflict between password changes and asynchronous session-key revocation.
The application now serializes account mutations, including credential jobs,
within the supported single-instance process. Database operations remain short
and do not hold transactions across upstream requests.

The release check also validates Rust formatting, Clippy, unit tests, generated
OpenAPI/client consistency, frontend type checking/static export and inherited
frontend boundary fixtures. Public registration remains closed until all
remaining checks in `acceptance.json` are complete.
