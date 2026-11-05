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

## Additional fault and boundary checks

Real isolated checks additionally cover a lost create response, an existing foreign
mailbox that must never be adopted, an actual upstream outage during registration
and password recovery, suspension/re-enable and stale session rejection. Recovery
requires another verification after an upstream failure; passwords are never queued.
User application passwords can access mail but cannot mint additional access keys.
The mail-only permission profile excludes deferred Sieve and vacation interfaces.

Four concurrent requests with one idempotency key produce one submission. After
simulating loss of the success record, restart reconciliation finds the actual
submission without sending again. Known quota rejection is distinguished from an
unknown result. Accepted/pending drafts cannot be edited or submitted with a new key.
HTML-only messages supply cleaned plain text for replies and forwards; remote images
and active content are removed from displayed HTML.

Production SMTP checks confirmed shared quota enforcement, durable counters after
restart and temporary rejection while the policy process is unavailable. The prior
configured recipient limits were restored after this controlled test.

SQL statements and migrations now reside inside the SQLite persistence engine;
a static gate prevents business handlers from introducing direct engine SQL. Schema
migration contents and checksums are unchanged. Future engines require explicit
implementations and conversion tools, not only another connection string.

## Attachment and browser observations

A 20MiB attachment was accepted by the real application and Stalwart. A one-byte
oversize upload and a draft with aggregate attachment size above 20MiB both returned
413. The staging directory was empty afterwards. Sampled process peak RSS was
30,576KiB in this debug-build isolated run; this is not a release capacity benchmark.

The actual React UI saved a draft, reloaded, reopened the Stalwart draft and resumed
editing through keyboard activation. The operations policy form saved successfully
while registration remained closed. A 390x844 viewport showed the account page in
dark mode, and the saved theme returned after a full reload. These focused checks
are not a claim of complete screen-reader, browser or device accessibility coverage.

## Published v0.1.0-alpha.3 and production update

[Workflow 41916857338](https://github.com/reina0721/mail-web/actions/runs/41916857338)
passed all checks and the post-publication direct-download install/restore rehearsal.
The deployed image was downloaded, checksum-checked and loaded from that Release.
Production upgraded from alpha.1 with a consistent pre-update snapshot; the container
is healthy on 127.0.0.1:18090. Existing operator login and the external reply were
verified again. SMTP quota, policy outage and restart persistence were retested and
10/hour, 50/day limits restored. Public registration is still closed.

Forty real authenticated list calls at concurrency four on alpha.3 measured median
1.44ms, p95 32.13ms and maximum 32.85ms. Sampled idle memory was 7.09MiB and memory
after the calls 7.898MiB, CPU 0.00%. This narrow local observation does not establish
sustained capacity or a percentage improvement over the earlier run.

A further isolated test submitted a 20MiB attachment successfully through Stalwart.
Including upload and submission, sampled debug-process peak RSS was 89,244KiB;
the earlier 30,576KiB figure covered upload/rejection only. Neither is a production
load guarantee. Both oversize checks still returned 413 and staging was empty.

Final operator credentials were rotated through the user's own account API. The
previous password and website sessions were rejected. The protected handoff resides
outside the repository on the owner's computer; the temporary server plaintext was
removed. Final snapshots retain identity associations, policies, counters, operations
and migration history. Historical backups can contain the now-invalid bootstrap
password and remain sensitive.

The production hostname/HTTPS proxy and actual production Turnstile token flow are
not yet accepted. DNS, Nginx and certificate changes are outside the authorized work
scope. Browser/device and screen-reader coverage remains limited to the focused
checks above. No stable release or open public registration is claimed.

## Generic v0.2.0-alpha.3 deployment

[Workflow 41941406559](https://github.com/reina0721/mail-web/actions/runs/41941406559) passed the production frontend build, type and architecture checks, 14 backend tests, strict Clippy, generated contract comparison, real isolated Stalwart integration, and public-release clean/repeated install plus backup/restore rehearsal. The isolated mail test now checks multiline plain text and literal angle-bracket addresses alongside sanitized HTML.

A separate real installation used only its explicitly selected application directory and a new container. Its image was downloaded from GitHub Releases, checksum-verified and loaded with Docker; no registry pull, source compilation or new host software was used. The panel connected the existing Stalwart domain, encrypted its dedicated service credential and enrolled an existing ordinary mailbox without resetting its password or changing its remote role. Configuration reads redact secrets.

The maintenance CLI then upgraded this installation from alpha.1 to alpha.3, preserving its encryption key, configuration, operator mapping and active browser session. Consistent snapshots were saved before and after the update. All bind mounts remain under the selected directory, Docker logs are disabled in favor of relative application logs, and the original seven containers retained their IDs. Real inbox/deep-link reading, operations, account drawer/focus return and corrected text formatting were checked in the browser.

Public registration remains closed. This deployment did not take over another application's submission Hook or claim new public-origin Turnstile/signup or external delivery acceptance. Historical delivery evidence above remains scoped to its original release and installation.

## Guided configuration v0.2.0-alpha.4

[Workflow 41953510105](https://github.com/reina0721/mail-web/actions/runs/41953510105) passed frontend production build/type/boundary checks, 8 frontend and contract checks, 16 backend tests, strict Clippy, generated OpenAPI/type comparisons, real isolated Stalwart integration and public-release clean/repeated installation, backup and restore. Discovery integration verifies capability and Origin enforcement, domain-scoped ordinary candidates, no returned API/Hook secret, no configuration write/restart, retained-key use only for the original source, and rejection of a different source without a newly supplied key.

Browser preview verification covered existing configuration auto-load; a failed initial read disabling save; bare-host HTTPS/port normalization; multiple domains requiring explicit selection; account-address autofill; unmatched Hook candidates disabled; cancelling edits and leave confirmation; a slow old request superseded by a new source while preserving edited branding; and the empty-install to existing-mailbox binding flow without a duplicate leave prompt. Example fixtures remain loopback-only and log redacted credential inputs.

The real installation upgraded through the existing artifact-only CLI to alpha.4. The encrypted runtime configuration matched its pre-update snapshot exactly and the existing operator logged in with unchanged credentials. Its current chosen branding was retained. Published checks are separate from protocol/public-registration acceptance; no remote identity, API key or Hook was created by discovery.

## Guided configuration v0.2.0-alpha.5

[Workflow 41956450361](https://github.com/reina0721/mail-web/actions/runs/41956450361) passed frontend types, production build, architecture boundaries, 8 frontend tests, 17 backend tests, strict Clippy, generated contract comparisons and real isolated Stalwart integration. The schema reader follows only same-origin versioned schema redirects and decodes Stalwart's gzip responses with a 4MiB expanded-data limit. Integration asserts the four actual advertised domain, ordinary-account, MTA Hook and API Key routes, alongside the discovery authorization, Origin, non-persistence and changed-source credential guards. The published prerelease also passed clean/repeated installation and backup/restore rehearsal.

The existing installation was upgraded through its CLI to alpha.5 without a host build, registry pull or new host software. Its container is healthy; the encrypted runtime configuration exactly matches the pre-update snapshot, and the existing browser session still reads the protected panel. Branding, mailbox domain and saved public origin are retained; secrets remain blank with presence flags. Live domain, account, Hook and schema queries succeeded and the panel now renders the advertised management deep links. Original seven unrelated containers retained their IDs and all new application mounts remain under the selected directory. No remote account, key or Hook was created by discovery.

Final desktop and mobile screenshots are of the real logged-in installation via the SSH management helper, not preview fixtures. Public registration remains closed and the panel lists the still-missing optional production prerequisites and manual protocol acceptance separately from connection success.

## One-time automatic installation v0.2.0-alpha.6

[Workflow 42047213713](https://github.com/reina0721/mail-web/actions/runs/42047213713) passed production frontend types/build, 215-source architecture checks, 20 boundary fixtures, 8 frontend checks, 23 backend tests, strict Clippy, generated contract comparisons and real Stalwart integration. Both administrator Basic authentication and API-key authorization created isolated installations with existing/new domains and existing/new ordinary operators. Runtime API-key metadata verifies a dedicated non-admin directory identity and a Replace-scoped sender credential.

A disposable upstream proxy allowed Stalwart to create a real service API key, withheld its response, then the application was restarted. The journal resumed as interrupted; the old temporary authorization was rejected. Reauthorization reconciled the owned service account, replaced only the inaccessible owned key and completed with one retained key. The suite also checks cancellation, Origin/capability enforcement, ciphertext capture, callback authentication after restart, Hook activation and idempotent repeated initialization. Test-owned Hooks are disabled before the following platform/identity regressions; unrelated Hooks are not taken over.

Cloudflare transport tests verify managed-widget request shape, returned Site Key/Secret, permission failures, rate limits, timeout and rejected redirects. These are isolated tests, not a real Cloudflare account acceptance. Production widget creation requires an owner-supplied account-scoped Token and remains explicitly unverified.

The published alpha.6 package passed clean/repeated installation and backup/restore rehearsal. The existing webmail1 deployment then upgraded using its CLI, checksum-verified release assets and Docker load. The container is healthy. Its encrypted runtime configuration exactly matches the pre-update snapshot; consistent SQLite snapshots before and after show identical platform-user mappings. All seven unrelated container IDs and selected-directory application mounts are retained.

Real desktop/mobile panel screenshots use the installation capability through the SSH management helper, not preview fixtures or ordinary-mailbox sign-in. The historical local operator credential handoff did not authenticate before the update; no reset was attempted. The panel read back the real brand, Stalwart/mailbox origins and site address. No production administrative authorization was supplied, and no remote production identity, key, Hook or Turnstile Widget was created during UI verification. Registration remains closed and protocol/public-origin acceptance is separate.
