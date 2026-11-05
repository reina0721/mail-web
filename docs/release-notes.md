Mail Web v0.2.0-alpha.4

Adds a guided Stalwart setup panel with automatic existing-configuration loading, field-specific GitHub tutorials and schema-derived administration links. Protected read-only discovery lists domains, ordinary mailbox candidates and callback-matched Hooks without creating objects, saving configuration or returning credentials. Changing the upstream requires a newly supplied directory key. Registration prerequisites and protocol acceptance are displayed separately. See docs/stalwart-setup.md for both existing-mailbox and public-registration walkthroughs.

Generic, independently configurable Webmail: choose the site name, existing Stalwart domain and connection credentials in the protected installation panel. Configuration is encrypted at rest; existing ordinary mailboxes can be enrolled as local operators without changing their Stalwart roles.

Includes compact inbox and operations layouts, shared HeroUI controls, content transitions, reduced-motion support and an accessible list scroll cue. GitHub release downloads contain the Docker image archive, checksums, relative-path Compose deployment and maintenance CLI. The target server loads this archive without pulling registry images or compiling source.

Real-data refinements keep standard folders in a predictable order and distinguish actual HTML from JMAP text/plain fallbacks. Plain messages retain their paragraphs and literal angle-bracket addresses; actual HTML remains sanitized and isolated.

The README documents directory selection, installation, configuration, SSH-protected administration, updates, consistent backup and restore. Public registration remains gated by its actual dependencies and protocol acceptance. Historical production evidence in docs/acceptance.json belongs to the earlier deployment; it does not certify every installation of this preview.
