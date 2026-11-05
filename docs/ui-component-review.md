# Shared component review — 2026-11-04

The inventory follows every package export, including nonvisual utilities. Third-party interaction remains owned by HeroUI / React Aria. The samples at `/ui-elements/` are isolated; they do not call production APIs.

## Findings and corrections

| Family | Finding | Shared correction |
| --- | --- | --- |
| Buttons | Every Action was ghost plus reconstructed colours; custom spinner; duplicated confirmation actions | Map primary / outline / ghost / danger to HeroUI; use its Spinner and shared Action in dialogs. Brand and status colours map to public theme tokens once. Keep project density and no-scale motion policy. |
| Checkbox | Rounded control, field shadow, repeated indicator treatment, partial selection invisible | HeroUI Checkbox and its Indicator retained; optional indeterminate mapping; flat 16/18px control, 4px corners, independent focus outline, 32/44px hit area. |
| Menus | Fixed large width; nested vendor padding; ungrouped account actions | Content width 160–280px constrained by viewport, one 4px inset, 32/44px rows, wrapped labels, 8px corners and light elevation. Account icons and session separator. |
| Inputs | Combobox group and inner input each owned a surface; field shadows; incomplete icon labels | One group owns border, focus and surface; inner input stays transparent; shared field geometry, explicit accessible clear / expand / calendar labels. |
| Date picker | Existing direct date dependency 3.12.3 conflicted with current HeroUI peer and React Aria 3.12.4 | Align existing dependency to 3.12.4 and deduplicate its lock entries; retain original DatePicker / Calendar. |
| Surfaces and overlays | Menu, tooltip and toast inherited heavy overlay shadow; drawer corners inherited dialog radius | Separate semantic menu/dialog elevation; light tooltip/toast surface; flush drawer edge. Focus, portals, keyboard dismissal and close triggers stay in the library. |
| Toggle group | Multiple mode retained attached-group shell and geometry | Use HeroUI isDetached for multiple selection, transparent group with 8px gap and independent controls. |
| Tabs | Line variant retained vendor selected surface | Explicit line/section surface ownership and icon alignment; existing Tabs behavior retained. |
| Other exports | Review preserved existing semantics and composition rather than introducing replacement primitives | Card/Panel explicit elevation remains opt-in by appearance; data, identity, tree, progress, disclosure and asynchronous composition covered by family samples. |

## Export inventory

All exported entry points were included in the source review. A family sample is a reproducible visual check, not a claim that every possible prop permutation or assistive technology has been certified.

| Public entry | Runtime exports |
| --- | --- |
| ./styles.css | shared tokens, geometry and interaction styles |
| ./action | Action |
| ./accessibility | SkipLink, LiveRegion |
| ./async-region | AsyncRegion |
| ./busy-indicator | BusyIndicator |
| ./content-swap-transition | ContentSwapTransition |
| ./card | Card, CardHeader, CardContent, CardFooter |
| ./command-menu | CommandMenu |
| ./data-display | DataTable, TabsView |
| ./date-picker-field | DatePickerField |
| ./description-list | DescriptionList |
| ./disclosure | DisclosurePanel |
| ./feedback | Badge, AlertBanner, NotificationCard |
| ./feedback-context | FeedbackContext, useFeedback |
| ./feedback-provider | FeedbackProvider |
| ./feedback-presence | FeedbackPresence |
| ./form-field | TextField, FileField, PasswordField, TextAreaField, SelectField, ComboField, SwitchField, CheckboxField, RadioGroupField |
| ./form-error-summary | FormErrorSummary |
| ./icon-action | IconAction |
| ./identity | Avatar, UserIdentity |
| ./menu-button | MenuButton |
| ./navigation | BreadcrumbTrail, TextLink, PaginationControl |
| ./navigation-flyout | NavigationHint, NavigationFlyout |
| ./overlays | PopoverCard, TooltipAction, DialogSurface, ConfirmDialog, DestructiveConfirmDialog, DrawerSurface |
| ./overlay-trigger | OverlayTriggerAction |
| ./panel | Panel |
| ./progress-meter | ProgressMeter |
| ./ready-image | ReadyImage |
| ./search-box | SearchBox |
| ./skeleton | Skeleton |
| ./state-surface | StateSurface |
| ./status-pill | StatusPill |
| ./step-navigation | StepNavigation |
| ./tree | Tree |
| ./toggle-group | ToggleGroup |
| ./container-layout | useContainerBreakpoint |

## Browser evidence

- Eight family pages render the shared implementation: buttons, forms, menus, overlays, feedback, surfaces, navigation and data.
- States exercised include default, selected, indeterminate, disabled, pending, keyboard focus, menu open/close, long wrapped labels, dialog save failure retaining text, drawer Escape/focus return, destructive cancel, command search/empty, table selection, tree expansion, tab/pagination changes, asynchronous initial/refreshing/empty/error/ready, notification dismissal and persistent error feedback.
- Reduced-motion preview measured 0.00001s control transitions. System motion preference remains covered by the shared media-query policy.
- Additional mail, operations and viewport results are recorded in ui-acceptance.md. Real touch hardware, screen-reader speech output and live mail service acceptance are outside this browser fixture review.

Motion follow-up: the missing generated-keyframe stylesheet import is now fixed. Drawer motion delegates to HeroUI's original entry/exit recipes with timing tokens (no duplicate slide transform). The buttons family includes normal/reduced and four-times-slow content playback; debug settings clear on exit. Production CSS is checked by tests/motion-styles.test.mjs.
