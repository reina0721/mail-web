Mail Web v0.3.0-alpha.2

Adds multiple Stalwart connections and domain-specific operations. Existing locally enrolled mailbox login is retained: adding an upstream never imports or grants access to its users. Local account mappings select the single upstream for sessions, messages, drafts, attachments, credentials, reconciliation, Hooks and recipient counters.

Setup runs after deployment. Additional connections use temporary administrator authorization and independent resumable initialization, reusing the site's existing operator and Turnstile. Domain bindings, registration policies and readiness are separate from site settings. Legacy accounts, sessions, counters and human receipts migrate to the default connection without changing upstream accounts.

Account entry pages are more compact. Registration offers explicit domain choice; recovery stays bound to the existing account. Profile, capacity, capabilities, devices and app-password loading fail independently. The shared switch uses HeroUI's native track/thumb geometry.

Candidate validation is in progress. Two disposable real Stalwart servers, colliding remote IDs, real JMAP/SMTP isolation, the existing protocol regression and published-asset installation/restore must pass before production update. Production does not create test accounts or change normal mailbox limits. Human verification and external-mail receipt remain owner actions when required by the relevant domain's configuration.
