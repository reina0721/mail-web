# Mail and operations UI verification

This records browser verification of the redesigned frontend using the production static export and isolated example data. It does **not** certify live login, upstream Stalwart operations, message delivery, or deployment readiness.

## Reproduce

```sh
pnpm --dir frontend typecheck
node frontend/tooling/check-boundaries.mjs
node frontend/tooling/check-boundaries-fixtures.mjs
pnpm --dir frontend build
node tests/ui-preview.mjs
```

Open `http://localhost:4201/` or `/admin/`. The fixture server binds only to loopback, serves example.com identities, labels every page as an example preview, keeps mutations in memory, and never connects to an upstream mail service. Restarting it restores the fixtures. `/__preview/control` is an isolated test control endpoint for failure, latency, session, permission, theme and dependency-readiness scenarios; it is not part of the application.

## Checked in the browser

- 1440×900: default list uses a 216px sidebar and 40px horizontal rows; optional split mode uses a 320px list with 72px rows, remaining width belongs to the reader; list and reader scroll independently. No document horizontal overflow.
- 1024×768: sidebar measures 192px; opening a message switches from list to reader, with a working return control. Operations overview reflows to two metric columns and one content column. No document horizontal overflow.
- 390×844: single message list, dedicated reader, folder drawer, visible compose entry, account summary cards and compact operations navigation. No document horizontal overflow. Compose has a separately scrolling field area and a visible send/save footer.
- Mail: current-page select-all, selected-count toolbar, mark unread, star without opening the message, move to archive, search/no results, empty sent folder, 50-item pagination and clearing selection/reader when changing context.
- Detail requests with 1200ms versus 100ms fixture latency: the latest selected message retains its subject and sender after the older request resolves.
- Reply prepopulates recipient, subject and quoted body; cc/bcc are collapsed initially. Closing saves the draft. Injected draft-save failure preserves the entered subject and editor, reports the failure, and succeeds after restoring the service.
- Operations: account search and status filtering, editing capacity, save reflected in the table, dirty-editor leave protection, disable confirmation and resulting disabled status.
- Registration: dependency-not-ready disables opening registration, invalid daily/hourly limits disable save, cancel restores saved values, section and header-link navigation warn about unsaved changes. With fixture dependencies ready, opening and saving registration succeeds.
- Tasks: retry reports the returned queued count; audit records display actor, subject, timestamp and outcome.
- Injected 503 responses: mail and operations display failure and retry controls. Injected expired session returns to login and clears mail content. A non-operator session cannot see operations data.
- Light and dark mail themes inspected. Drawer and confirmation focus behavior exercised with keyboard Escape and cancel/continue actions.

## Remaining deployment verification

The above covers presentation and frontend interactions against API-shaped fixtures. Real account access, durable changes, protocol enforcement, safe HTML from the real backend, attachments and end-to-end delivery retain their existing integration/deployment acceptance requirements.

## Density and motion refinement

- 1440×900: 64px header, 48px stable toolbar, 19 complete list rows or 10 complete split rows. 1848×955: 20 complete horizontal rows. 1024×768 retains the 192px sidebar and has no horizontal overflow; 390×844 has 88px rows and a 52px toolbar, including selection mode.
- Quiet icon actions share 32px desktop / 44px mobile hit areas, real hover/focus tooltips, selected/disabled/loading states, and semantic names. Menu triggers retain their overlay and focus implementation. Reference calibration: TailAdmin Buttons and the supplied Gmail image; no reference assets or DOM copied. Shared state samples are at `/ui-elements/buttons/`.
- Mail content enters using the existing 180ms content-swap recipe. Drawer motion uses semantic timing tokens and edge-aligned transforms; exit uses the shorter control token. No per-row entrance animations or animation library was added.
- The component calibration page exercised reduced-motion policy: animation and transition durations measured 0.00001 seconds instead of 0.18 seconds. The system preference continues to use the existing global media-query policy.
- Enter opens messages; Escape returns focus to the originating message. Menu Escape restores the move trigger. Slow competing detail requests preserve the latest subject. Keyword mutation failure restores the previous star state.
- Background refresh retains rows and scroll; loading placeholders are delayed 150ms; fixed feedback avoids moving the working region. Editor forms are not keyed by motion wrappers. Account save and unsaved-change confirmation were exercised again after refinement.
- Public backend interfaces remain unchanged. Layout preference is local and scoped to the signed-in identity. These checks still use isolated example data, not live mailbox or deployment certification.

## Scroll cue, component review and executed motion

- Reviewed all 36 public UI-adapter entry points; findings, retained library ownership and reproducible family samples are recorded in `ui-component-review.md`.
- Mail-only scrollbar hiding leaves the overflow region focusable. Arrow click moved 618px for a 772px viewport (80%); PageDown advanced the region; Control+End hid the cue and exposed the complete last row. A four-message second page and search no-results hid the cue.
- Light and dark checks at 1848×955, 1440×900, 1024×768 and 390×844 showed no document horizontal overflow. Desktop cue/arrow measured 40/32px; mobile 48/44px; checkbox controls 16/18px. Menu rows measured 32px desktop and 44px mobile; long text wrapped within 280px. Mobile account trigger retained 44×44px while pressed.
- Partial page selection renders a HeroUI mixed indicator; full page selection renders a check. Single-action menu is 160px wide with one padding layer. Account menu has icons and a session separator. Dark choice outlines use a semantic border derived from muted ink and neutral border.
- Found and fixed an omitted import of the generated motion definitions: previous animation-name/duration configuration did not prove execution. Production-CSS regression test now verifies keyframes consumed by content and feedback recipes.
- In the isolated four-times-slow sample, content fade measured 0.72s and intermediate opacity 0.739; HeroUI drawer entry measured 0.72s with 19.7% remaining translation; exit measured 0.48s with data-exiting=true and 92.8% translation. Normal tokens remain 180ms entry / 120ms exit. Reduced preview gives animation-name=none and opacity=1; debug speed resets to 1 on leaving the sample.
- Narrow mail list/detail entry combines canonical fade with an 8px starting-style transition. Admin sections, compose entry and batch toolbar use canonical fade. No editor is keyed for animation; refresh keeps its existing content and scroll. Drawer movement uses HeroUI’s original recipe rather than a second custom slide.
- Checks: production build (including TypeScript), boundary checker, 20 boundary fixtures, three scroll-metric cases and the built-CSS motion integration case. These are browser fixture results; real touch hardware and screen-reader speech remain separate acceptance checks.

- Regression found during resizing: a stored split-reading preference let the desktop reader-hide rule win on mobile, hiding both panes after opening mail. The mobile composition now explicitly reveals the reader when a message is active. Rechecked with is-split at 390×844, then returned to the list with its entry control.

- Final operations checks: lin@example.com quota saved as 2049 MiB and was reflected in the table; reopening showed the saved value. Disable confirmation explained session/protocol impact; cancel retained the account. Registration remained disabled while dependency readiness was false. Task retry reported the returned queued count. Operations at all four target widths had no horizontal overflow; mobile used summary cards.

## Multiple connections and account pages (2026-11-05)

- Checked configured setup at 1440×900, 1024×768 and 390×844. Existing sites show site settings and connection management; the first-install form and duplicate readiness card are collapsed. Source selection shows its bound domains, and each domain links to its scoped policy. No document horizontal overflow.
- Account content measures 820px on desktop/tablet, with one independent scrolling host. Removed the former duplicate account-page wrapper and the irrelevant mobile folder control. Mobile stays one column with visible controls.
- Changing appearance and refreshing devices retain an unsaved display name. Profile and appearance save independently; saving appearance does not persist the draft name. Optional application-password failure leaves profile, appearance and devices usable with retry. Capacity is unavailable when its own request fails.
- Connection advanced inputs warn before switching sources; cancelling retains the entered value, cancelling edits restores saved values. Parent setup navigation also tracks these drafts. Domain-policy switching similarly protects unsaved changes; cancel and save behave independently per domain.
- Shared HeroUI switch checked/unchecked, disabled and keyboard focus states were inspected in light/dark samples and live fixture operations. Space toggles; Tab continues to the next field. Track/thumb geometry remains owned by HeroUI rather than a second set of offsets.
- Login, domain registration and recovery were inspected on mobile. Domain choice distinguishes closed/unready states and clears stale challenges. No CAPTCHA was solved and no production email was sent by UI automation.
- Reduced-motion sample was actually operated: content animation-name none, transition-duration 0s and opacity 1. The existing system media-query policy remains in place.
- A deliberately delayed pre-authorization 401 response (3s) could not overwrite the newer authorized setup read after the load-generation fix. Connections remained available with no stale expired-login alert.

These are browser example-preview results, not proof of new production connections, public signup, device hardware coverage or screen-reader speech. Real deployment results are recorded separately in acceptance.json.
