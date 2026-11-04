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

## Production observations

Release `v0.1.0-alpha.1` was downloaded from GitHub, checked against its release
checksums, imported with `docker load` and started with pulls disabled at
`/workapps/mail-web`. All five persistent bind mounts resolve inside this
directory. The application is bound only to `127.0.0.1:18090`.

A message submitted through the production platform received
[Mail-tester 10/10](https://mail-tester.com/test-e7us9l9zt), with SPF, DKIM,
DMARC and IP/hostname association passing. A separate submission to Port25's
authentication verifier received an Internet reply, which was read through
the platform's own message API. These are specific delivery observations,
not a guarantee of inbox placement at every provider.

A small observation of the release container recorded 7.324 MiB idle memory
and 0.00% sampled CPU. Forty authenticated list requests at concurrency four
had median 41.78 ms, p95 1472.32 ms and maximum 1679.49 ms; memory after the run
was 7.777 MiB. This is one mailbox on this server, not a 100-user capacity
benchmark. The report deliberately includes the slow requests.

The install/restore rehearsal exposed two deployment-tool defects: stopped
instances could not produce a pre-update backup, and new restore directories
left logs owned by root. The tools now use a one-shot backup container when
stopped, stop writes before update snapshots, restore writable-directory
ownership and update the installed manager atomically. The revised manager
passed clean/repeated installation, consistent backup, empty-directory
restore, missing-image failure and execution from `/tmp` against the first
release image. Packaged-version validation is repeated for the next release.
