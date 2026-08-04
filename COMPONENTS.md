# COMPONENTS.md

Strict component rules for Reeve. Read this before touching anything in `components/`. This is the trimmed, operational version of the full audit, Brief 26 in Notion (briefs live in Notion only, not in this repo). That brief has the reasoning behind every rule here, this file has the rule only. If a rule here and the full audit disagree, the full audit is the source of truth for reasoning but this file wins for what to actually do, and both should be updated together.

## The two real panel systems, and only two

1. **Global side panel**: `components/layout/app-content.tsx` (mechanism, owns the card token and 480px desktop width, full-width takeover on mobile) + `components/layout/panel-shell.tsx` (chrome: title, optional description, X button, scrollable body) + `stores/side-panel-store.ts`. Use `PanelShell` for every panel's content, everywhere, including the schedule day view's detail and add-to-day panels (Brief 33 retired the schedule's own right-column panel system in favour of this one). Transient, opened/closed by user action from anywhere in the app.
2. **Secondary panel**: `app/(app)/@secondaryPanel` (Next.js parallel route slot, one file per route that needs it, `default.tsx` renders null for everyone else) + `components/layout/app-content.tsx` (renders whatever the slot produces as a 230px fixed card, `hidden lg:flex`, to the left of main). No store: content is route-owned and always visible, not toggled at runtime. Populate it with a `layout.tsx` inside the slot's route folder, not a `page.tsx`: a layout persists across nested navigations (e.g. the schedule Dates list staying mounted across `?date=` clicks) the same way any Next.js layout does; a page does not. First and current use: `app/(app)/@secondaryPanel/tours/[id]/schedule/layout.tsx` → `components/schedule/date-sidebar.tsx`.
   - **`default.tsx` only catches hard navigation.** On client-side navigation away from a route with a secondary panel, Next.js keeps rendering the slot's last content instead of re-resolving it, it does not fall back to `default.tsx` until a full page load. `app-content.tsx` gates visibility with `usePathname()` against `lib/layout/secondary-panel-routes.ts`, independent of the slot's own render. **If you add a new secondary panel route, add its path pattern to `secondary-panel-routes.ts` too, or it will leak onto every other route on soft navigation.**

Do not invent a third. `components/nav/tour-settings-panel.tsx` is a known bespoke exception (nav-rail slide-over, not a content panel), do not use it as precedent for a new panel type.

**`app-content.tsx` owns every card wrapper. Panel components never carry the card token.**

The token `rounded-3xl border border-border bg-background` is applied in exactly one file: `components/layout/app-content.tsx`, on four wrappers (the secondary panel, `<main>`, the desktop side panel, and the mobile main). Anything rendered inside one of those wrappers is already sitting on a card.

`PanelShell` is chrome only: a header and a scrollable body, rooted on a plain `flex h-full flex-col`. It never carries the token, and it shouldn't: it looks like a card because `app-content.tsx` wraps its content in one.

Do not add the card token to a panel component. Doing so draws a card inside a card: a doubled border, plus the timeline's `lg:border-r` showing as a redundant vertical line. This was tried on 2026-08-04 (Brief 27 Part 1) and reverted the same day.

If a panel needs to look like a standalone card, the fix is to render it as a sibling of `<main>` in `app-content.tsx`, not to give it a border where it stands.

Never use shadcn `Sheet`, `Drawer`, or `Dialog` for an in-page panel. `components/ui/sheet.tsx` is dead code, do not import it (it does not exist in the repo; don't resurrect it).

For a bottom-anchored mobile sheet, use `components/ui/bottom-sheet.tsx` (wraps `@radix-ui/react-dialog` directly, with a `titleClassName` prop for sheets that render their own header row, and a `maxHeight` prop). Both of `day-view-client.tsx`'s sheets (day info, add-to-day picker) go through it. Never hand-roll a new `SheetPrimitive.Root`/`Portal`/`Overlay`/`Content` block for a bottom sheet; that duplication is exactly what this component replaced (Brief 32 Phase 4).

`app-content.tsx` (mobile global-panel takeover, slides in from the right) and `mobile-nav-drawer.tsx` (main nav, slides in from the left) also wrap `@radix-ui/react-dialog` directly, and legitimately don't go through `BottomSheet`: they're edge drawers, not bottom sheets, each is a single non-duplicated instance in its own file, and forcing them through a component named and shaped for bottom anchoring would be a false abstraction, the same reason `command-palette.tsx` (a centred modal) stays on its own. `@radix-ui/react-dialog` is imported in exactly four files for this reason: `bottom-sheet.tsx`, `app-content.tsx`, `mobile-nav-drawer.tsx`, `command-palette.tsx`. If a second bottom-anchored, left-drawer, or right-drawer instance shows up anywhere, that's the third-occurrence signal (see below) to extract that shape too, not to bend `BottomSheet` to fit it.

`AlertDialog` (`components/ui/alert-dialog.tsx`) is the one legitimate dialog primitive. Use it only for blocking yes/no destructive confirmations. Never repurpose it as an in-page panel.

## Card and list tokens, don't conflate them

- Panel/card surface: `rounded-3xl border border-border bg-background`.
- List row (roster, people table, attention feed): `components/ui/list-row.tsx`, which uses `rounded-xl`, a deliberately different, smaller radius. Use `ListRow` for clickable list rows, not `Card`.
- `components/ui/card.tsx` is legacy shadcn styling (`rounded-lg`), used in exactly one place: the pre-auth login page. Do not use it anywhere else. It does not carry the Reeve card token.

## Server vs client components

Default to Server Components. `'use client'` only for state, effects, or browser APIs, per CLAUDE.md.

The real pattern in the schedule day view is not "only `day-view-client.tsx` is a client component." It is: `day-view-client.tsx` owns popover/bottom-sheet/dialog UI state and mobile vs desktop rendering via local `useState`, plus `useSidePanel` (`stores/side-panel-store.ts`) for opening the global side panel; timeline cards (`timeline-card.tsx`) and all four panel forms (`show-panel.tsx`, `transport-panel.tsx`, `hotel-panel.tsx`, `event-panel.tsx`) also use `useSidePanel` directly and are thin client components wherever they need interactivity, click-to-select, or local form state. Don't force a new panel form to be a Server Component to match a literal reading of the old rule; match the actual pattern instead.

**Brief 32 Phase 6 audit (2026-08-04):** 75 of 97 `.tsx` files under `components/` carry `'use client'`. Every one was checked for a reason (local state/reducer, an effect, a transition, routing hooks, a `stores/` subscription, an inline event handler, a direct browser API, or a ref) before concluding this wasn't a pool of accidentally-client feature components. 70 of the 75 have one of those directly in the file. The other 5 (`label.tsx`, `tooltip.tsx`, `switch.tsx`, `separator.tsx`, `dropdown-menu.tsx`) are shadcn wrappers with no visible hook of their own, `'use client'` because the Radix primitive they wrap needs the boundary, not a candidate for conversion. Server Components in `components/`: mostly `components/ui/` primitives that are pure presentational wrappers (`button.tsx`, `input.tsx`, `card.tsx`, and others, 11 files) plus 11 schedule/hotel/transport feature components (`day-content.tsx`, `day-header.tsx`, `day-info-panel.tsx`, `day-timeline.tsx`, `schedule-skeleton.tsx`, `stay-row.tsx`, `segment-row.tsx`, `page-header.tsx`, `page-layout.tsx`, `context-summary.tsx`) that render server-fetched data with no interactivity of their own.

The 2026-07-31 perf audit's "client boundary sits high in the day view tree" theory doesn't hold up against the current tree: `timeline-card.tsx`'s own `'use client'` is there because it calls `useSidePanel` directly (click-to-select), which is the documented, intentional pattern above, not an accident. If day-view latency work continues, look at data-fetching waterfalls (already P0-fixed on `perf-p0-day-view`) rather than the client/server split. No components were converted by this audit; this note is the record of having checked, per the brief's "investigate first, only then decide what to convert" instruction.

## Lazy-loaded components, keep them out of the app shell

Three components load through `next/dynamic` with `ssr: false` rather than being imported directly, and they should stay that way:

- `components/nav/lazy-command-palette.tsx` wraps `command-palette.tsx`. Added by the Vercel agent PR #18 (`vercel-agent/no-cost-performance`, 2026-08-04) to keep the Radix Dialog, the Lucide search icons and the palette search UI out of the first app shell bundle. The wrapper holds its own Cmd+K listener while the real palette is unloaded, then unbinds on first open and hands off. `app/(app)/layout.tsx` renders the wrapper, never `CommandPalette` directly.
- `components/schedule/add/add-flow.tsx` and `components/layout/active-panel.tsx` follow the same pattern for panel and add-form content.

The rule for anything new: if a client component is not visible on first paint and pulls in a Radix primitive, a large icon set, or a search UI, it goes behind a lazy wrapper. Note this interacts with the `@radix-ui/react-dialog` four-file count above: `command-palette.tsx` still imports it, but no longer in the shell's initial bundle.

## Data model rules enforced at the component layer

- Never duplicate `dietary` or `allergies` anywhere except the `contacts` table. `components/roster/contact-sheet.tsx` is the canonical add/edit form for this. `components/people/person-sheet.tsx` is likely dead code duplicating this responsibility, confirm before building on it.
- Tour-scoped pay terms (`per_diem_rate`, `daily_wage_rate`) live on `crew_detail`, not `contacts`. `contacts` only has `default_*` rate fields (defaults for a new tour, not the operational rate). Don't confuse the two.
- `transport_segment.status` is never set to `booked` from a form directly. It only advances after a TM pastes a confirmation reference through a dedicated action (see `hotel-stay-detail.tsx`'s `confirmHotelBooking` for the reference pattern, applied identically to hotels). `transport-panel.tsx` renders `status` read-only, follow that.
- Planner components (`option-row.tsx`, `hotel-option-card.tsx`, `freeform-planner.tsx`, `hotel-workspace.tsx`) never display or sort by price. Infeasible options are dimmed and flagged, never hidden. "Book" is always an external link; "Record" is always the in-app write of a `planned` row.
- The six `transport_segment.mode` values (`bus | truck | flight | rail | ground | hire`) should always be a constrained `Select`, never a free-text field. `extractions-view.tsx` currently uses free text for this in the AI-extraction review flow, that's a known gap, don't copy it into a new form.

## Known duplicated/inconsistent code, don't extend it further

- Timezone conversion (`fromDatetimeLocal`/`toDatetimeLocal`) is duplicated verbatim between `event-panel.tsx` and `transport-panel.tsx`, absent entirely in `hotel-panel.tsx` (plain date/time strings), and naive/non-tz-aware in `rehearsal-form.tsx`. Before adding a fifth datetime form, ask which of these is actually correct for the column type, don't just copy the nearest one.
- Advance status has three incompatible vocabularies across `advance-dots.tsx` (`confirmed/in_progress/not_started/na`), `advance-tracker.tsx` (`not_started/in_progress/done`), and `shows-view.tsx` (ad hoc). Check `lib/shows/advance.ts` and the DB constraint for the real enum before touching any of these three files.
- `components/nav/theme-toggle.tsx` (binary) and `components/tours/settings-form.tsx`'s inline theme picker (3-way) are two separate, un-reconciled theme switchers. Don't add a third.

## Day-sheet fields have three sources of truth, keep them in sync

Adding or renaming a day-sheet field (load-in, curfew, etc.) requires updating all three: `day-timeline.tsx`'s `DAY_SHEET_FIELDS` array, `show-panel.tsx`'s `SECTIONS` constant, and the `ShowDaySheet` type in `stores/side-panel-store.ts`. Missing one produces a silently incomplete UI, not a build error.

## Naming, not to be confused

- `add-picker.tsx` (timeline item category: Flight/Drive/Rail/Hotel/Show/Event) vs `day-type-picker.tsx` (tour_date type: Show/Rehearsal/Travel/Press/Day off). Structurally near-identical, functionally distinct, don't merge.
- `components/people/person-sheet.tsx` vs `components/roster/contact-sheet.tsx`: the roster one is live and canonical, the people one is likely dead.
- `components/schedule/schedule-view.tsx` (tour-level schedule list, own hardcoded colors) vs `components/schedule/date-sidebar.tsx` (day-view Dates panel, CLAUDE.md's documented chip colors). These two have different, unreconciled color maps for the same day types. Confirm which is actually live before copying either one's color logic.

## Form submission: every form goes through `useEntityForm`

Every form that calls a server action goes through `hooks/use-entity-form.ts`. Never hand-roll `useTransition` plus an error `useState` plus `router.refresh()`. Never read `FormData` with an `fd.get(name) as string` cast: use `lib/forms/read-form.ts`'s `readForm(fd, shape)` instead, which gives every field a single, reviewed conversion (`'string'`, `'stringOrUndefined'`, `'requiredString'`, `'number'`, `'numberOrUndefined'`).

`useEntityForm({ action, onSuccess, refreshOnSuccess })` owns pending state, error state, the submit handler, and the success path. `action` reads the FormData (via `readForm`) and calls the server action; it can do async work first (a drive-time lookup, a Zod parse) as long as it resolves to something with `error`. `refreshOnSuccess` defaults to `false`: add forms that create a new timeline item pass `true` so the server-rendered timeline picks it up; edit panels that mutate a row already rendered inside their own panel state leave it `false` and rely on the hook's `saved` flag to flash "Saved." instead. See `components/schedule/add/add-hotel-form.tsx` (simple add form), `components/schedule/panels/event-panel.tsx` (simple edit panel), and `components/shows/show-form.tsx` or `components/roster/contact-sheet.tsx` (multi-branch submit logic, still funnelled through one `action`) for the range of real usage.

Genuine exceptions exist and are fine: a control that mutates on a plain button click with no `<form>` (`transport-panel.tsx`'s `BookingReferenceField`, saving one field from a controlled input) has nothing for `useEntityForm` to wrap, since there's no `FormData` to read. A multi-step wizard driven by many small button-click mutations across steps, not one field-name-to-server-action submission (`add-flight-form.tsx`'s search wizard, planner workspaces, the command palette), is also a legitimate `useTransition` holdout. What is not an exception: a real `<form onSubmit>` with named fields and one server action call, no matter how large.

**Known gap, tracked, not yet closed:** as of Brief 32 Phase 2, `useEntityForm`/`readForm` cover the forms the brief's audit named by number (the five schedule add-forms, the four schedule panels, `add-flight-form.tsx`'s wizard split out its manual-entry form, `show-form.tsx`, `contact-sheet.tsx`). Roughly 27 other files still hand-roll the old pattern (`settings-form.tsx`, `new-tour-form.tsx`, `rehearsal-form.tsx`, `day-sheet-form.tsx`, the planner and roster panels, and others) and were out of this pass's explicit scope, not confirmed exceptions. Migrate a file to `useEntityForm` the next time you touch it for an unrelated reason, don't leave it as the pattern to copy for a new form.

## When building a new form or panel

1. Pick the right panel system (global or secondary) per the table above, not a new one.
2. Use `Select` for any enum-backed field (mode, person_type, room_tier), never free text.
3. Validate through a Zod schema in `lib/validators/`, matching the existing `showSchema`/`contactSchema` pattern.
4. If the form touches a datetime, check which of the four existing tz-handling approaches actually matches the column before picking one.
5. Never apply the card token to the panel component itself, `PanelShell` already sits inside one. See "app-content.tsx owns every card wrapper" above.
6. Wire the submit path through `useEntityForm` and `readForm`, per "Form submission" above. Don't hand-roll `useTransition` for a new form; that is exactly the pattern Brief 32 removed.

## The third-occurrence rule

The second time a pattern is written by hand, note it in a comment. The third time, extract it into a shared file (`hooks/`, `lib/`, or `components/ui/`) and write the rule here. Don't document a duplicated pattern as the approved approach to follow, which is how the pre-Brief-32 bottom-sheet and form-boilerplate duplication both got institutionalised in this file.
