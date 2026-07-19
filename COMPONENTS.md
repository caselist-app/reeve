# COMPONENTS.md

Strict component rules for Reeve. Read this before touching anything in `components/`. This is the trimmed, operational version of the full audit at `docs/briefs/26-component-library-audit.md` (in the separate docs project, not this repo) — that doc has the reasoning behind every rule here, this file has the rule only. If a rule here and the full audit disagree, the full audit is the source of truth for reasoning but this file wins for what to actually do, and both should be updated together.

## The two real panel systems, and only two

1. **Global side panel**: `components/layout/app-content.tsx` (mechanism, owns the card token and 480px desktop width) + `components/layout/panel-shell.tsx` (chrome: title, optional description, X button, scrollable body) + `stores/side-panel-store.ts`. Use `PanelShell` for every global panel's content.
2. **Schedule right column**: `components/schedule/edit-panel.tsx` (chrome) + `stores/schedule-panel-store.ts`. Fixed 260px column in the day view, does not slide.

Do not invent a third. `components/nav/tour-settings-panel.tsx` is a known bespoke exception (nav-rail slide-over, not a content panel) — do not use it as precedent for a new panel type.

Every panel surface must carry `rounded-3xl border border-border bg-background`. This is currently true of `app-content.tsx` and `panel-shell.tsx`. **It is currently NOT true of `edit-panel.tsx`** — this is a known bug, not an example to copy. If you touch `edit-panel.tsx`, fix this.

Never use shadcn `Sheet`, `Drawer`, or `Dialog` for an in-page panel. `components/ui/sheet.tsx` is dead code, do not import it. Mobile slide-in/bottom-sheet behavior is hand-built directly against `@radix-ui/react-dialog` (aliased `SheetPrimitive`) in `day-view-client.tsx`, `app-content.tsx`, and `mobile-nav-drawer.tsx` — follow that existing pattern for a new mobile sheet, do not add a fifth implementation or resurrect `sheet.tsx`.

`AlertDialog` (`components/ui/alert-dialog.tsx`) is the one legitimate dialog primitive. Use it only for blocking yes/no destructive confirmations. Never repurpose it as an in-page panel.

## Card and list tokens, don't conflate them

- Panel/card surface: `rounded-3xl border border-border bg-background`.
- List row (roster, people table, attention feed): `components/ui/list-row.tsx`, which uses `rounded-xl`, a deliberately different, smaller radius. Use `ListRow` for clickable list rows, not `Card`.
- `components/ui/card.tsx` is legacy shadcn styling (`rounded-lg`), used in exactly one place: the pre-auth login page. Do not use it anywhere else. It does not carry the Reeve card token.

## Server vs client components

Default to Server Components. `'use client'` only for state, effects, or browser APIs, per CLAUDE.md.

The real pattern in the schedule day view is not "only `day-view-client.tsx` is a client component." It is: `day-view-client.tsx` owns layout/orchestration state (`activeCard`, add-category, mobile vs desktop rendering) via the `useSchedulePanel` store; timeline cards (`timeline-card.tsx`) and all four panel forms (`show-panel.tsx`, `transport-panel.tsx`, `hotel-panel.tsx`, `event-panel.tsx`) are thin client components wherever they need interactivity, click-to-select, or local form state. Don't force a new panel form to be a Server Component to match a literal reading of the old rule; match the actual pattern instead.

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

Adding or renaming a day-sheet field (load-in, curfew, etc.) requires updating all three: `day-timeline.tsx`'s `DAY_SHEET_FIELDS` array, `show-panel.tsx`'s `SECTIONS` constant, and the `DayPanelData` type in `day-view-client.tsx`. Missing one produces a silently incomplete UI, not a build error.

## Naming, not to be confused

- `add-picker.tsx` (timeline item category: Flight/Drive/Rail/Hotel/Show/Event) vs `day-type-picker.tsx` (tour_date type: Show/Rehearsal/Travel/Press/Day off). Structurally near-identical, functionally distinct, don't merge.
- `components/people/person-sheet.tsx` vs `components/roster/contact-sheet.tsx`: the roster one is live and canonical, the people one is likely dead.
- `components/schedule/schedule-view.tsx` (tour-level schedule list, own hardcoded colors) vs `components/schedule/date-sidebar.tsx` (day-view sidebar, CLAUDE.md's documented pip colors). These two have different, unreconciled color maps for the same day types. Confirm which is actually live before copying either one's color logic.

## When building a new form or panel

1. Pick the right panel system (global vs schedule right-column) per the table above, not a new one.
2. Use `Select` for any enum-backed field (mode, person_type, room_tier), never free text.
3. Validate through a Zod schema in `lib/validators/`, matching the existing `showSchema`/`contactSchema` pattern.
4. If the form touches a datetime, check which of the four existing tz-handling approaches actually matches the column before picking one.
5. Apply the card token if it's a new panel, don't copy `edit-panel.tsx`'s current (buggy) missing treatment.
