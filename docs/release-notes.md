Mail Web v0.2.0-alpha.9

Replaces the manual protocol-attestation registration gate with deployment readiness checks. Setup and operations share a detailed checklist; domains, runtime permissions, sender identities, Hook configuration/scope and callback authentication are inspected without creating resources. A purpose-limited check page at the configured website origin verifies real Turnstile and actual external-mail receipt before registration can be enabled manually.

Readiness and one-time check credentials persist in SQLite. Configuration changes invalidate receipts; completed human checks survive ordinary restarts and branding/default-limit edits. Public policy separates requested enablement from effective availability. Legacy protocol declarations remain historical metadata. Full SMTP/JMAP quota, fail-closed and restart regression remain mandatory release checks; the readiness probe is not represented as a production protocol test.

Updates retain installation configuration and account data. Real production human verification and mailbox-code entry are completed by the owner in the browser, not fabricated by deployment automation.
