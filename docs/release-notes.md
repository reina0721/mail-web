Mail Web v0.3.0-alpha.2

Adds multiple Stalwart connections and domain-specific operations. Existing locally enrolled mailbox login is retained: adding an upstream never imports or grants access to its users. Local account mappings select the single upstream for sessions, messages, drafts, attachments, credentials, reconciliation, Hooks and recipient counters.

Setup runs after deployment. Additional connections use temporary administrator authorization and independent resumable initialization, reusing the site's existing operator and Turnstile. Domain bindings, registration policies and readiness are separate from site settings. Legacy accounts, sessions, counters and human receipts migrate to the default connection without changing upstream accounts.

Account entry pages are more compact. Registration offers explicit domain choice; recovery stays bound to the existing account. Profile, capacity, capabilities, devices and app-password loading fail independently. The shared switch uses HeroUI's native track/thumb geometry.

Validation passed in the [complete release workflow](https://github.com/reina0721/mail-web/actions/runs/42097795715), including 29 backend tests, two disposable real Stalwart servers with equal remote IDs, real JMAP/SMTP counters and published-asset installation/restore. The existing webmail1 deployment was updated through the artifact-only CLI. Configuration, local account/limits, counters, encryption key and prior human receipts were preserved; existing registration remains enabled.

Production retains its original connection and domain. No test accounts/domains were created, no normal mailbox limits or other applications' Hooks changed, and no production outage test was run. Actual setup screenshots use the installation capability; ordinary operator sign-in was not retested or reset. New domains still need their own real human/mail checks before manual enablement. See acceptance.json for evidence scope and remaining coverage.
