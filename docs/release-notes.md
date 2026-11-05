Mail Web v0.2.0-alpha.6

Adds one-time administrative authorization and automatic Stalwart initialization: choose an existing or new domain, bind or create an ordinary operator, and create dedicated directory/sender identities, API credentials and a scoped submission Hook. Administrator passwords, administrative API keys and Cloudflare Tokens remain memory-only. The protected wizard supports resource preview, durable encrypted progress, cancellation and reauthorization-based retry. New Hooks remain disabled until the restarted callback authenticates and scope synchronization succeeds.

Cloudflare Turnstile Widgets can be created using an account-scoped API Token; Site Key and Secret are captured automatically, while the Token is discarded. Existing manually configured settings remain available under Advanced configuration. See docs/stalwart-setup.md#automatic.

The artifact-only installer and CLI preserve the selected directory, account data and configuration. Public registration and protocol acceptance are not automatically enabled or certified. Real Cloudflare creation still requires a user-supplied Token; isolated transport tests are distinct from that acceptance.
