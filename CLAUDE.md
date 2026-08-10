# CLAUDE.md

This file sits at the repo root. It is the operating context for any AI coding agent working on Reeve. Read it before writing any code. It is the source of truth for stack, conventions, and the rules that a generic agent will get wrong without explicit instruction. The companion `.cursorrules` file enforces the same rules in Cursor.

## What Reeve is

Reeve is the operating system for the people who run tours: Tour Managers (TMs) and Production Managers (PMs). Every competitor (Master Tour, RoadOps, Advance with Me) is a filing cabinet: data in, documents out. Reeve is different. The TM inputs data themselves (control is trust), then Reeve works on that data continuously: it enriches it with travel, visa and routing intelligence, watches it for conflicts and expiries, and pushes the right information to the right person at the right time over email and WhatsApp. The TM is the only account holder. Crew, band, venues and promoters never log in. They receive messages.

Core philosophy: **Input, Enrich, Alert, Act.** The product is data-first, not AI-first. AI is a thin intelligent layer on top of clean, trusted, structured data. It never acts autonomously.

## The non-negotiables (read these first)

These five rules override convenience every time. Breaking any of them is a defect, not a style choice.

1. **Database changes are migration-plus-types, always.** Every schema change is a timestamped SQL migration in `supabase/migrations/`, applied through the Supabase CLI, with TypeScript types regenerated into `lib/types/database.ts`. All three are committed together. Never touch the database any other way. Full workflow below under "Database workflow".
2. **RLS is always on.** Every user-facing table has Row Level Security enabled and every policy scopes by tour ownership. Never disable RLS to make something work. Never use the service role key from client code. Storage bucket policies follow the same rule: scope by tour ownership using `owns_tour((storage.foldername(name))[1]::uuid)`, not just `auth.role() = 'authenticated'`. Every new bucket needs ownership-scoped policies before any data lands in it.
3. **pnpm only.** Never npm, never yarn. Never add a dependency that is not already in `package.json` without explicit instruction.
4. **No em-dashes. Anywhere.** Not in code, comments, copy, commit messages, or docs. Em-dashes are an AI tell. Use commas, periods, colons, or parentheses.
5. **Nothing is sent or booked without the TM.** Reeve never books travel or hotels autonomously and never sends a message to crew without TM action. The only exception is answering a crew member's direct inbound WhatsApp question, which the TM opts into per tour. Both `inbound_qa_enabled` and `morning_message_enabled` default to `false` on the `tours` table. Neither is switched on when a tour is created. Jobs and handlers must check the flag before doing anything. No schedule is registered, no Q&A fires, until the TM explicitly enables it.

## Stack (never deviate)

```
Next.js 16 (App Router, TypeScript, strict mode)
Tailwind CSS v4
shadcn/ui components (Radix primitives), in components/ui/
Lucide React for icons
Supabase: Postgres, Auth, Storage, Realtime, RLS (via @supabase/ssr)
Stripe for billing (flat per-TM subscription)
Resend for transactional and outbound email
Trigger.dev (@trigger.dev/sdk) for all scheduled and background jobs
Upstash Redis + @upstash/ratelimit for rate limiting, caching, send idempotency
@anthropic-ai/sdk for all AI inference (Anthropic models only)
Zod for runtime validation
Vercel for hosting
pnpm for package management
```

Do not add other AI providers. All inference runs on Anthropic models only.

### External service APIs (wrapped, never called raw from UI)

Travel and hotel providers are wrapped in an internal normalisation layer so they can be swapped per territory without touching UI. The planner depends on Reeve's normalised shapes, never a vendor payload.

```
Duffel                          flights (search; booking is off-platform in V1)
Trainline Partner / Omio B2B    EU rail
SNCF Connect                    French rail
RENFE                           Spanish rail
National Rail Darwin (free)     UK rail
Google Maps                     geocoding, venue hub resolution, drive times
RateHawk / Hotelbeds / Expedia Rapid   hotels (search and filter only in V1)
AirLabs                         live flight tracking and disruption alerts (shipped, Brief 31)
Meta WhatsApp Cloud API         operational comms (primary)
Twilio                          WhatsApp and SMS fallback
```

## Commands

```bash
pnpm check            # all five gates in CI's order. This is the one to run before asking for a merge.
                      # typecheck clears .next/types first, deliberately: tsconfig.json includes
                      # those generated route types, they are stale after a route is deleted, and
                      # a fresh CI checkout does not have them at all. Without the clear, the local
                      # gate fails on files CI never sees. next build regenerates them at the end.
pnpm dev              # local dev server
pnpm build            # production build (must pass before merge)
pnpm lint             # eslint, must be clean
pnpm typecheck        # tsc --noEmit, must be clean
pnpm check:conventions # the rules below that CI can enforce, must be clean
pnpm test             # unit tests, no Docker needed
pnpm types:gen        # regenerate lib/types/database.ts from Supabase (see Database workflow)

# Supabase (the only ways schema reaches the database)
supabase migration new <name>   # create a timestamped migration file
supabase db push                # apply migrations to the linked remote project
supabase migration up           # apply migrations to local
supabase db reset               # rebuild local DB from all migrations (destructive, local only)
```

`pnpm types:gen` wraps `supabase gen types typescript` and writes to `lib/types/database.ts`. Keep this script in `package.json` so the command is identical for every agent.

## Some of this file is enforced, and you should know which parts

`pnpm check:conventions` runs `scripts/check-conventions.mjs` and is a CI step alongside typecheck, lint and build. It exists because an audit on 2026-08-04 found that every bug in the repo, including two that silently destroyed user data, passed all three of those. This file was complete and correct at the time and its rules were still broken repeatedly by agents that had read it. **A rule that cannot fail the build is a suggestion.**

It currently enforces: `requireUser()` first in every server action, `revalidatePath` on the schedule route for any action writing a schedule-rendered table, no `.default()` on any schema in `lib/validators/`, no `getSession()`, `cache_control` on every Anthropic call, no unguarded `.in()`, no em-dashes, every `process.env` read declared in `.env.example`, `[BOTH]` marked on every variable reachable from `trigger/jobs/`, and a `-- deploy-order:` line on any migration that drops a column or table.

Known violations that predate the check live in `scripts/conventions-baseline.json`, each with a reason saying whether it is **accepted** (the check is wrong about it) or **debt** (the check is right and the fix is scheduled). That file should only ever shrink. Removing an entry is part of the fix, because a stale entry fails the check too. It stood at 20 when the check was written and is at 7 since Brief 37, with no `revalidate-schedule` debt left in it.

If a check fires on you, the default assumption is that the check is right. If it genuinely is not, add a baseline entry explaining why, rather than weakening the rule. Do not delete a check to make the build pass.

These are greps with judgement, not a type system, and they only cover rules mechanical enough to express. Most of this file is still unenforced prose, so the absence of a failure is not evidence that a change is correct.

## Database workflow (the rule Matt cares about most)

A change to the database is a single atomic action with three parts. Never do one without the others, and never merge a partial.

1. **Write the migration.** `supabase migration new <descriptive_name>` creates `supabase/migrations/<timestamp>_<name>.sql`. Put the DDL there. Never run ad-hoc SQL against the database. Never edit schema by hand in the Supabase dashboard. The migration file is the only legitimate source of a schema change.
2. **Apply the migration.** `supabase db push` for the linked remote, `supabase migration up` (or `supabase db reset` to rebuild) for local. Schema changes only reach a database through an applied migration.
3. **Regenerate types.** Run `pnpm types:gen` to rewrite `lib/types/database.ts`. Never hand-edit that file. Never invent table or column names anywhere in the codebase: import them from the generated types so the compiler catches drift.

Commit all three together (migration file, any code using the new schema, regenerated types) in one commit. A schema change that lands without its migration or without regenerated types is incomplete and must not be merged. If you change schema and forget the types, the build is wrong even if it compiles.

**If the migration drops or renames anything, there is a fourth part, and it is the one that has actually broken production.** A `drop column` is safe only once **both runtimes** are running the code that stopped reading it. `pnpm build` passing does not establish that: it covers the Next.js app on Vercel and says nothing about the jobs in `trigger/jobs/`, which deploy separately. Nor does grepping the repo for readers: that proves what the code says, never what is running.

So: ship the code to both runtimes, confirm both are live, then apply the migration. CI now deploys Trigger.dev on merge to `main`, which is what makes "both" happen automatically, and `pnpm check:conventions` fails a destructive migration that carries no `-- deploy-order:` line stating this was considered. The full reasoning, and the production failure that produced the rule, is under Environment variables below. It is repeated here because that is where it was written the first time and it was 170 lines from the decision it governs, which is exactly why it was missed.

**A rename is not a drop, and the fourth part does not save it. Renaming a column is two migrations.** `alter table ... rename column` has no safe moment to run at all. Apply it before the deploy and the running code reads the old name, which has gone. Apply it after and the running code reads the new name, which does not exist yet. Either way the gap is a deploy rather than a second, and "ship the code first" cannot help because there is no ordering in which both the old and the new code are correct. Note also that `check:conventions` greps for drops, so a lone `rename column` does not even trigger the `-- deploy-order:` requirement.

The shape that works is add-and-copy, then contract, across two commits:

1. Migration one adds the new column and copies the old one into it. Nothing is removed, so it is safe to apply at any point, before or after the code ships. In the same commit, move every reader and writer to the new name.
2. Merge, and let both runtimes deploy.
3. Migration two drops the old column, in a later commit. By then it has no reader anywhere and has been a stale copy since step one.

`supabase/migrations/20260805130000_add_lobby_call.sql` and `20260805160000_drop_hotel_departure.sql` are the reference pair (`hotel_departure` to `lobby_call`, Brief 36). The same applies to renaming a table.

**Two things about that rename are worth carrying beyond the database.** A test written for the end state cannot be committed with step one: asserting the old column is gone would be a test that has to fail for as long as the expand phase lasts, so those assertions belong in the contract commit. And `pnpm types:gen` reads the linked project, so `tsc` cannot pass on the new name until the migration has actually been applied. That is not a reason to hand-edit `lib/types/database.ts`; it is the reason the additive migration has to be safe to apply early.

## Database conventions

- Tables: `snake_case`, plural (`tours`, `people`, `shows`, `transport_segments`).
- Columns: `snake_case` (`created_at`, `tour_id`, `load_in_at`).
- Every table carries `id uuid primary key default gen_random_uuid()`, `created_at`, `updated_at`. Every tour-scoped table carries `tour_id`.
- Ownership and RLS: `account` is the only auth principal. `tour.account_id` is the owner. Every tour-scoped policy filters by the caller owning the tour. No cross-tour reads, ever.
- Use the supertype-plus-discriminator shapes from the data model. Do not invent parallel tables:
  - `person` has a `person_type` discriminator (`artist | crew | management | support`). Role-specific fields live in extensions like `crew_detail` (per diem and wage rates). Do not duplicate `dietary` or `allergies` onto riders: read them from `person`.
  - `transport_segment` is one table with a `mode` discriminator (`bus | truck | flight | rail | ground | hire`). People attach through `transport_assignment` (many-to-many), which holds per-person detail (seat, PNR, boarding pass). The logistics planner writes segments as `status = 'planned'`. The TM promotes to `booked` after booking off-platform and pasting the reference. Do not auto-set `booked`.
  - `hotel_stay` plus `room_assignment` (per-person, with `room_tier` of `artist | crew`).
  - `show` has `show_advance` (per-department status), `promoter`, `settlement`, `pass_sheet`, guest list and vendors hanging off it. Its times are `day_items` rows, which hang off the **day** (`tour_date_id`, not null) and reference the show (`show_id`, nullable), so a day can hold items with no show on it. `day_sheet` is gone: see the day view pattern below.
- `document_share` is the read-receipt ledger (sent, opened, acknowledged). It drives advance status automatically. Treat it as append-mostly: do not delete share rows.
- **A filter on an embedded table needs `!inner`, or it does not filter anything.** In PostgREST, `.eq('other_table.col', v)` against a plain embed does not remove parent rows. It only decides whether the nested object comes back `null`. The top level also cannot be ordered by an embedded column at all, so `.order('other_table.col')` silently does nothing. Combine that with `.limit(1)` and you get an arbitrary row whose nested object is often null. This produced two crew-facing bugs (`/travel` and `/hotel` answering "no upcoming travel" while travel existed, fixed 2026-08-04). Two rules follow: always write `other_table!inner (...)` when filtering on it, and when you need the *next* or *nearest* record, select from the table you are ranking so the filter and the `order` sit on the top level, then inner-join the join table to scope it. `lib/comms/templates/travel.ts` and `itinerary.ts` are the reference shape.
- **`tour_date_id` is which day a record belongs to. The record's own date column derives from it, and every path that writes one writes both.** `shows`, `hotel_stays` and `transport_segments` each carry a `tour_date_id` and a date of their own (`date`, `check_in_date`, `depart_at`). Brief 19 added the link, updated every create path to write both, and left every edit path writing the date alone, so editing a date pointed the link at the day the record used to be on: the schedule queries by the link and stayed put, while `/itinerary`, the morning message and the AI context read the date and moved. Resolve the day through `resolveTourDateId()` in `lib/schedule/day-link.ts` and write both columns together. Never write one without the other, on create or on edit: the create/edit split is what caused this, so both sides obey one rule. `shows (tour_date_id, date)` and `hotel_stays (tour_date_id, check_in_date)` are composite foreign keys onto `tour_dates (id, date)`, so getting it wrong on those two is a foreign key violation rather than a silent bug. `transport_segments` has no equivalent constraint, deliberately (below), so it is the one that still depends on the code being right.
- **A `timestamptz` belongs to the day it falls on in the tour's timezone, not its UTC day.** 22:00Z on 14 June is 15 June in Auckland. Deriving a day from `depart_at`, or filtering a timestamptz column by a day, goes through `localDateInZone()` and `localDayWindowUtc()` in `lib/schedule/datetime.ts`. Never `${date}T00:00:00Z` to the next midnight: that is correct only for a tour on UTC and silently a day out at the edges for every other one. This is also why `transport_segments` has no composite key. A generated column would have to copy `tours.timezone` onto every row, and the timezone is editable, so it is not immutable; a trigger only fires on writes to the segment, so editing a tour's timezone would silently invalidate existing rows either way.
- Money: `daily_wage_rate` and `per_diem_rate` are operational (settlement and per diem distribution), so they are in scope early. Hotel nightly rates and truck hire rates are financial-planning fields and are lower priority.

## Day view pattern (the primary TM working surface)

The schedule day view is the main place a TM works. The date sidebar is its own standalone card; main is a single card holding the timeline and day info side by side, with no divider between them. Neither ever swaps for anything: detail and add forms open in the global side panel instead (see "Panel and card visual language" below).

```
┌─────────────────┬────────────────────────────────────────────────────┐
│  Date sidebar   │  main (one card)                                   │
│  230px fixed    │  Day timeline (flex-1)   |   Day info (260px)      │
│  (own card)     │  no divider between them                           │
└─────────────────┴────────────────────────────────────────────────────┘
```

**Date sidebar**: a list of every day in the tour range. Coloured chip per day type (purple = show, teal = travel, amber = press, blue = rehearsal, stone = off). Selecting a day updates the `?date=` search param. Renders as its own standalone card, a sibling of the main content card, not embedded inside it: see "Panel and card visual language" below for the secondary panel system that makes this work. Server Component (`components/schedule/date-sidebar.tsx`), rendered via the `app/(app)/@secondaryPanel` slot, not inline in the schedule route's own layout.

**Day timeline**: a chronological list of all items on the selected day merged from three sources: `day_items` (everything with a time that is not travel or a bed), `transport_segments`, and `hotel_stays` (check-in/check-out). Items sorted by time ascending. Server Component. Clicking any item opens its detail in the global side panel, read via `PanelShell`-based panels in `components/schedule/panels/`. Flights render a read-only `FlightCard` inside `transport-panel.tsx` (live status, tracked via AirLabs) with booking reference as the one editable field; every other mode is a plain edit form.

It was four sources until Brief 42, and the fourth was `shows` with twenty fixed day-sheet time columns rendered as individual cards, plus `day_events` for anything that was not one of them. **A column can hold one value and can exist once per show**, which is why there was no second soundcheck, no press call, no duration on a load-in, and four write paths into a day for a TM who thought they were doing one thing. `day_items` is one row per thing that happens, with a `kind` from `lib/schedule/day-item-kinds.ts`, and that file is the only list. Adding a kind is one entry in it.

**The show is not on the timeline, and this catches people.** A day's items are the running order; the show itself (venue, capacity, catering type, advance, planner links, delete) is reached through the Venue block in day info, which opens `venue-panel.tsx`. A show with no times set therefore has no timeline card at all, deliberately: there is nothing to show and day info is where it lives. Do not add a placeholder card back. One existed until Brief 42 and its stated reason was that nothing else on the day view linked to the show, which stopped being true when Brief 36 step 6 added the Venue block.

**`day_items` carries `tour_date_id` and an instant, and they are allowed to disagree.** That is the point. A 01:30 curfew has `tour_date_id` pointing at the show it ends and `starts_at` falling on the next calendar day, so it renders under the right day without anything reconciling them. Consequence: **day items are never in the day view's late-night tail.** The tail exists for `transport_segments`, which are placed by `depart_at` and have no equivalent. Putting items in it would let one item render on two days, which is the ambiguity the day link exists to settle. See `lib/schedule/day-records.ts`.

**Day info**: a static block (venue, roster, notes), Server Component (`components/schedule/day-info-panel.tsx`). Never swaps for an edit view. The day options (`...`) and add (`+`) buttons sit above it, top right.

**Panel interaction pattern:** `components/schedule/day-view-client.tsx` is the state container: it holds popover, bottom-sheet, and dialog UI state, not which item is selected. Clicking a timeline item or picking an add category opens the global side panel (`stores/side-panel-store.ts`) directly, so `timeline-card.tsx` and the four panel forms are thin client components wherever they call `useSidePanel` themselves; day info stays a Server Component. Never put the whole day view in a client component just to handle panel state, and don't force a new panel form to be a Server Component to match a literal reading of that rule. See COMPONENTS.md's "Server vs client components" for the full pattern and the current count; this file doesn't restate it.

**Add flow:** the "+" button opens a Radix popover (desktop) or bottom-sheet (mobile, from the FAB) showing a category picker (Flight, Drive, Rail, Hotel, Show, Event). Selecting a category closes the picker and opens the relevant add form in the global side panel, on `PanelShell` like every other schedule panel (`components/schedule/add/add-flow.tsx`). Each add form's own first-step "Back" button returns to the picker; there is no separate back affordance in the panel chrome. Never route away from the day view for any add or edit action.

**Notes** are always-visible editable textareas in day info. They save on blur via a server action. No save button, no panel swap. Notes are not timeline items and do not appear in the timeline.

**Transport and Hotels** are not top-level nav items. They are accessible via the gear icon settings panel in the sidebar header. The primary nav is: Schedule, People, Settings (gear).

## Panel and card visual language (applies everywhere, no exceptions)

The card token is:

```
rounded-3xl border border-border bg-background
```

**`components/layout/app-content.tsx` owns it, and nothing else applies it.** It sits on four wrappers there: the secondary panel, `<main>`, the desktop side panel, and the mobile main. Those four are siblings of each other, separated by a gap.

`PanelShell` is chrome only: a header and a scrollable body on a plain `flex h-full flex-col`. It never carries the token. It looks like a card because `app-content.tsx` wraps it in one.

Adding the token to a panel component draws a card inside a card. If a panel should read as standalone, make it a sibling of `<main>` in `app-content.tsx`. Do not give it a border where it stands.

**The two panel systems and their shared visual contract:**

1. **Global side panel** (`components/layout/app-content.tsx` + `stores/side-panel-store.ts`): slides in from the right, main content shrinks left. 480px fixed width on desktop, full-width takeover on mobile. Chrome is `components/layout/panel-shell.tsx`: header (title, optional description, X button), scrollable body. Use `PanelShell` for every panel in the app, including the schedule day view's detail and add-to-day panels (Brief 33 retired the schedule's own right-column panel system in favour of this one). Transient: opened and closed by explicit user action from anywhere in the app (e.g. clicking a contact row, or a timeline item).

2. **Secondary panel** (`app/(app)/@secondaryPanel` Next.js parallel route slot + `components/layout/app-content.tsx`): a standalone, always-visible card to the left of main content, on routes that supply one. Not transient and not driven by a store: a route (e.g. `app/(app)/@secondaryPanel/tours/[id]/schedule/layout.tsx`) renders its content into the slot as a `layout.tsx` (not a `page.tsx`) so it persists across nested navigations exactly like any Next.js layout, the same way the schedule Dates list stays mounted across `?date=` clicks. `app/(app)/@secondaryPanel/default.tsx` renders nothing, so routes that don't use this are unaffected on a hard navigation. `AppContent` wraps whatever the slot renders in the card token at a fixed 230px width, `hidden lg:flex` (same breakpoint the schedule route already uses to swap to the mobile date strip). First and current use: the schedule Dates list (`components/schedule/date-sidebar.tsx`).

   `default.tsx` only resolves on a hard navigation (full page load or refresh). On client-side navigation, Next.js keeps rendering a slot's last content instead of re-resolving it, so without a second guard the panel would follow the user onto routes that never asked for one. `AppContent` gates visibility with `usePathname()` against `lib/layout/secondary-panel-routes.ts`. Adding a new secondary panel route requires both: the `@secondaryPanel/.../layout.tsx` override, and a matching path pattern added to `secondary-panel-routes.ts`. Skipping the second one is the failure mode: it will not error, it will just leak the panel onto other pages.

   **That persistence is also a trap, and it is the reason the Dates list goes stale.** Because the slot is a layout, `router.push()` does not re-resolve it: a soft navigation keeps the slot's last resolved content. An action that adds or removes a day therefore has to call `revalidatePath` on the schedule route server-side, or the new or deleted day sits in the sidebar until a hard reload. This bit `createRehearsal` and `deleteTourDate`, both of which push. If a change needs to show in the Dates list, the server action revalidates.

   **`router.refresh()` is the exception, and this line used to say otherwise.** It does re-resolve the slot, verified on Next 15.5.19 during Brief 41 by deleting `createTourDate`'s `revalidatePath` and watching the e2e spec still pass: `add-day-panel.tsx` refreshes after adding a day, and the sidebar updated anyway. Two things follow. Do not lean on it, because it makes a missing `revalidatePath` invisible on whichever paths happen to refresh, which is why the same brief's Dates spec adds a rehearsal (that branch pushes) rather than a day off (that branch refreshes). And do not delete a `revalidatePath` because refresh appears to cover it: the refresh is the caller's choice and the next caller may push.

Both use `rounded-3xl border border-border bg-background`. The global side panel has a forced header (title, optional description, X button); the secondary panel has no forced chrome since it's route-owned content, not a generic panel shell.

**One accepted exception:** `components/nav/tour-settings-panel.tsx` is a bespoke nav-rail slide-over (the gear icon: People, Transport, Hotels, Documents, WhatsApp, Settings), not a content panel, and is exempt from the panel-system rule. It lives inside the sidebar rail rather than over the main content area, so the card token does not apply to it. This is the only exception. Do not use it as precedent for a new panel type.

When building any new panel anywhere in the app, use one of these two systems. Do not invent a third. Do not render panel content as a flat div without the card treatment.

## Architecture and directory layout

```
app/                      Next.js routes (App Router). Desktop is primary. Mobile is the same codebase made responsive, not a separate route tree. On small screens, secondary columns (nav, date list, side panel) collapse into drawers and bottom-sheets via progressive disclosure; they are never a shrunken desktop layout. The mobile-first default layout is restored to the desktop arrangement with md: and lg: classes.
components/ui/            shadcn components (Radix). Do not edit generated primitives unless extending.
components/               application components, organised by feature (people/, shows/, logistics/, comms/, ...). See COMPONENTS.md at the repo root before adding or editing any component: it documents the two panel systems, the card/list tokens, and known drift between this file and the live code.
lib/                      shared utilities, clients, types
lib/supabase/            client wrappers (server, admin, middleware). Server-side admin only uses service role.
lib/types/database.ts    generated Supabase types. Never hand-edit.
lib/validators/          Zod schemas. Every form and every external payload validates here.
lib/logistics/           planner: venue hub resolution, provider adapters, option normalisation
lib/comms/               email (Resend) and WhatsApp/SMS (Meta, Twilio) senders and templates
lib/ai/                  Anthropic clients, prompts (static constants), tour-context assembly
lib/auth/helpers.ts      requireUser, getCurrentUser, safeRelativePath
trigger/jobs/            all Trigger.dev jobs (morning message, boarding-pass send, broadcasts, enrichment)
supabase/migrations/     every schema change as a timestamped SQL file, committed
middleware.ts            root middleware, exports middleware, uses getUser()
```

## Domain rules an agent will get wrong without instruction

- **The logistics planner returns live API options; it does not book.** In V1 the planner ranks real door-to-door options (flights, rail, ground combined into one normalised shape) and the TM books on the carrier site, then records the booking reference back into Reeve. Do not build in-app booking or payment in V1. Rank by feasibility first (arrives in time for `load_in_at` minus buffer), then duration, then mode preference. Never rank by price in V1. Show infeasible options flagged, never hidden.
- **Venue hub resolution is the differentiator.** A `show` resolves to its nearest transport hub (airport, rail station) plus ground time, cached on the show row (`transport_hub_iata`, `transport_hub_rail`, `hub_ground_minutes`). Resolution order: known-venue lookup, then Google Maps geocode-plus-nearest-hub fallback, then standard buffers (about 45 minutes airport transit, Maps drive time for ground). Festivals have no transport to site: this is the case that must work (for example Hellfest resolves to Clisson, nearest airport Nantes, about 40 minutes drive).
- **A failed read must never render as an empty result.** Every crew-facing template (`/itinerary`, `/travel`, `/hotel`, `/crew`) discards nothing: each checks its query error, logs it, and returns a message saying it could not load rather than one saying there is nothing there. "No upcoming shows on this tour" is a confident, plausible, wrong answer, and it is what a crew member got when a query failed. Logged rather than thrown, because the job has already accepted the message and throwing loses the reply. This is the only place these failures are visible, so the log line is the feature.
- **Deleting a list also deletes whatever was riding on one of its entries, and the thing riding along is not in the diff.** `/itinerary` rendered a fixed list of nine labels, and exactly one of them, venue access, formatted a date as well as a time. Nothing named that, nothing typed it, and nothing marked it as the only place a crew member learned which day the show was. Brief 42 replaced the fixed list with one line per stored item, correctly, and for one commit `/itinerary` answered with a venue, a list of times and no date at all. Before removing a loop, a field list or a template block, read one rendered example of the **old** output end to end and account for every distinct thing in it. A missing line is invisible in a diff that only shows the list going away. Caught by `tests/integration/day-link.test.ts`, and only as a side effect of testing something else, which is why `one-load-in.test.ts` now asserts the date directly.
- **Comms surface the start time only, except catering, which surfaces both ends.** Matt's decision, Brief 42. "Load-in 10:00", never "Load-in 10:00 to 10:15": a TM does not talk in ranges, and a load-in with a fifteen minute end reads as a window that shuts when it is really a start with an estimate on it. A meal window that does not say when it closes is worse than useless, which is the carve-out. Read it off `surfaceEndInComms` on the kind list, never off a `catering_` name prefix. One pure function owns it: `lib/comms/day-item-lines.ts`.
- **An item with no time gets no line, rather than a line saying TBC.** The old fixed list printed "Soundcheck: TBC" against every field a TM had not filled in, so a show with two real times sent seven lines of nothing and pushed the two that mattered off a phone screen.
- **A WhatsApp template has fixed placeholders, so the day blocks collapse repeats to one value per kind.** `lib/comms/blocks/show-times.ts` takes the earliest of each. That collapse is the channel's limit and not a reason to store one value per kind: `/itinerary` and the day view both render every item, including a second soundcheck. If two soundchecks need to reach crew over a day block, the fix is a new approved Meta template, not a narrower schema.
- **Comms is push, not pull.** Crew never open an app. Email (Resend) is the formal, paper-trail channel (riders, advancing docs, settlements) sent from a per-tour artist-branded subdomain. WhatsApp (Meta Cloud API, Twilio and SMS fallback) is the operational channel (day sheets, travel, boarding passes, changes, Q&A). WhatsApp is core to V1, not a fast-follow.
- **Slash commands are zero-AI template renders.** `/itinerary`, `/travel`, `/hotel`, `/crew` render directly from data with no model call. Implement as WhatsApp quick-reply buttons. Only free text that is not a recognised command goes to Claude. The inbound number maps to a `person`, so every reply is personalised without the crew member identifying themselves.
- **All scheduled and event comms run on Trigger.dev** and are idempotent through Upstash Redis. A double-send to crew is the fastest way to lose TM trust. Never send from a webhook handler synchronously: enqueue and return fast.
- **Inbound webhook messages must be deduplicated before enqueueing.** For WhatsApp, SET NX on the `wamid`. For email, SET NX on the Svix event id. If Redis is down, proceed and rely on the job's own guard rather than dropping the message. Dedup is the webhook's responsibility, not the job's.
- **The send pattern for Trigger.dev jobs is claim-send-release.** Set the idempotency claim, attempt the send, and release the claim (mark failed or delete) if the send throws. Setting the claim and then abandoning it on failure makes a failed send look like a success to a retry. `lib/comms/notify/index.ts` is the reference: claim via a unique DB insert, release the claim on failure. All send paths follow this pattern.
- **Claim-release applies to the webhook that enqueues, not just the job that sends.** A handler that claims a message id and then throws before `tasks.trigger()` succeeds has stranded the claim for its full TTL. The provider retries, hits the dedup guard, and gets a 200, so the message is permanently swallowed and every log looks healthy. Wrap the enqueue in try/catch and delete the claim on failure, then return a 500 so the provider retries. `app/api/whatsapp/inbound/route.ts` is the reference. The same applies to any job that writes state it will later diff against: write the state **after** the send succeeds, or the next run sees no change and never retries. Found in the Telegram and email webhooks and in `flight-status-check` on 2026-08-04, all three of which had copied the dedup half of the pattern without the release half.
- **Proactive WhatsApp sends must use Meta-approved templates.** Free-form messages and interactive messages are only valid in reply to a crew message within 24 hours. Anything sent outside that window (morning messages, boarding passes, broadcasts) must go through `sendTemplate`. Sending free-form proactively fails silently: Meta accepts the API call and drops the delivery.

## The AI layer

Claude fires only in three cases: free-text WhatsApp questions from crew, email-forward extraction (TM-initiated), and logistics query synthesis. When it fires it receives the full context of a single tour, assembled server-side and passed explicitly. Claude has no standing database access and never sees data outside the tour it is handed. It never books and never sends without TM approval. Cost model: slash commands cost nothing (templates), simple free text uses Haiku, synthesis and extraction use Sonnet, and repeated system prompts use prompt caching. Target is under 5 dollars per active tour per month. Store system prompts as static constants in `lib/ai/`, never built dynamically at runtime (dynamic prompts break caching).

Prompt caching is not optional. Every call to Claude must include `cache_control: { type: 'ephemeral' }` on the first system block (the static tour context block). A call without it pays full token cost on every request and will blow the cost model on any active tour. The AI context layer is the right place to enforce this: all Claude calls should go through it, never raw SDK calls from feature code.

## Auth model

- Supabase Auth. The `account` (the TM or PM) is the only authenticated principal.
- Tour ownership is the authorisation primitive. Server actions and route handlers verify the caller owns the tour before any read or write.
- Middleware is `middleware.ts`, exports `middleware`, and uses `getUser()`. Never use `getSession()` anywhere.
- The service role key is server-side admin only (webhooks, cron, Trigger.dev jobs). Never in client code.
- **Every server action calls `requireUser()` as its first statement**, before any other logic, including input validation. Server actions are publicly POSTable endpoints, so anything above the auth gate is reachable unauthenticated. The one legitimate exception is the pre-session login flow in `app/(auth)/login/actions.ts`, where no user exists yet and rate limiting is the control instead. That file is allowlisted in `scripts/check-conventions.mjs`. Do not add to that allowlist to make a check pass, and do not remove it to match a stricter reading of this rule: it would break login.
- **Server actions use the RLS client. The admin client is for jobs, webhooks and cron.** `createClient()` from `lib/supabase/server` is the default in every server action, and `owns_tour()` is then the authorization gate, so no extra ownership query is needed. Reach for `createAdminClient()` in a server action only when the action must legitimately bypass RLS, for example writing to a table the TM cannot write directly. Reference for the default case: `lib/logistics/plan.ts` and `lib/logistics/hotels.ts`.
- **When a server action does use the admin client, it bypasses RLS.** Verify tour ownership via the RLS client first, then scope every admin query with `.eq('tour_id', tourId)`. The RLS check is not redundant; it is the ownership gate the admin client cannot provide. See `lib/actions/boarding-pass-upload.ts` for the correct pattern.
- **RLS scopes rows by tour, it does not check that two ids in the same payload belong to the same tour.** Any action taking more than one entity id must verify they share a `tour_id` before using them together. A show id the caller owns plus a person id from another tour will pass RLS on both reads and still be wrong. See the person check at the top of `planTravel()` in `lib/logistics/plan.ts`.
- **Webhook signature checks fail closed.** If the env var holding the secret is absent, return 401 immediately. Never fall back to an empty string, a default value, or a conditional check. A missing secret means the environment is misconfigured; accepting the request in that state opens the endpoint to anyone. See `app/api/whatsapp/inbound/route.ts` and `app/api/email/inbound/route.ts` for the pattern.

## Code style

- TypeScript strict mode. No `any`. Use `unknown` and narrow.
- Server Components by default. Use `'use client'` only for state, effects, or browser APIs.
- Server actions for mutations. Write API routes only for webhooks, cron, Stripe callbacks, and inbound provider hooks.
- **`null` means the TM cleared it. `undefined` means the form never sent it. Never collapse the two.** This is the single most destructive mistake made in this codebase, and it is invisible in review. A form that submits a subset of a record's fields, posted to an action that writes the whole row, will null everything it did not send, because Zod's `.optional()` yields `undefined` for an absent key and the row mapper then coerces that to `null` alongside genuinely cleared fields. `.default()` is worse: it invents a value for a key nobody submitted. Rules that follow, all four required:
  - **Read the form with `readForm` from `lib/forms/read-form.ts`, and never with `fd.get()` by hand.** `FormData` is the only layer that still knows whether a field was posted, so it is the only layer that can make this distinction; `fd.get()` returns null for "absent" and for "blank" alike, and everything downstream of a hand-rolled reader is guessing. `readForm` uses `fd.has()`: a key absent from the payload is `undefined`, a key present and empty is `null`, and there are three kinds (`'string'`, `'number'`, `'requiredString'`), not five. The old `'stringOrUndefined'` and `'numberOrUndefined'` were deleted rather than deprecated, because a per-field choice made once cannot be right for a form with conditional sections: `contact-sheet.tsx` renders the default-role input only in roster context and the pay inputs only in tour context, and whichever kind it picked was wrong in the other mode. Both were live bugs, in opposite directions.
  - **Never put `.default()` on a field in an action-facing schema.** `catering_type` had one, so the schedule day view's day-sheet panel, which submitted 14 time fields and no catering, silently wrote `'none'` and nulled six catering columns every time a TM edited load-in. That panel and that column are both gone (Brief 42), and the rule is why: the mistake was the `.default()`, not the panel. Make the field required, or optional, and put the fallback at the call site where a reviewer sees it. `pnpm check:conventions` fails a `.default()` anywhere in `lib/validators/`.
  - **In the action, skip fields that are `undefined` and write fields that are `null`.** `updateDayItem` in `lib/actions/day-items.ts` is the reference: it hands every field to `definedOnly()` and returns early when that leaves nothing to write. It replaced `updateDaySheet`, which was the reference until Brief 42 deleted it.
  - **In a row mapper, omit a key that is `undefined` rather than mapping it to `null`.** Use `definedOnly()` from `lib/forms/write-row.ts` rather than writing the conditional spreads by hand, and apply it to every field rather than only the ones that have already bitten: which fields a save omits depends on which branch of the form rendered it. `toRow` in `lib/actions/contacts.ts` is the reference. It coerced four `default_*` pay columns to null on every tour-context person edit, and then `default_role` and `default_person_type` for the same reason a round later, because the first fix was made field by field.
  These were live and destroying data until 2026-08-04. When you add a form that posts a subset of a record, assume this bug is present until you have checked the action. A helper that sits between `readForm` and an action must pass both states through: `fromDatetimeLocal` in `lib/schedule/datetime.ts` returns `undefined` for `undefined` for exactly this reason.
- **A server action behind an uncontrolled form must revalidate, or the save will look like it failed.** React 19 resets a form to its `defaultValue` after a form action succeeds, on the documented assumption that `defaultValue` is the canonical value the server just sent back. If the action does not call `revalidatePath`, the server component still holds the old data and the reset restores it, so the value visibly snaps back until a manual reload. Forms on `useEntityForm` are covered because the hook calls `router.refresh()`; forms using `useActionState` directly are not. Found 2026-08-04 in `updateTourAction`, which was the only action file in the repo with no revalidate.
- **Do not repaint something that lives above the current route by revalidating the layout. Write it to a client store instead.** This is the exception to the rule above, and `updateTourAction` in `lib/actions/tours.ts` is now the reference for the exception rather than for the rule, so read it before "restoring" its `revalidatePath`. A tour's name renders in `components/nav/tour-selector.tsx` and `components/nav/sidebar.tsx`, both in the app layout, while the form that edits it sits in the settings route below. Repainting that from below, whether by `revalidatePath(..., 'layout')` or `router.refresh()`, intermittently received the correct payload and never committed it on the client: the save stuck on "Saving..." with the old name until a reload, about one save in five. The server was correct in every failing run, which is what made it so hard to see. `stores/tour-name-store.ts` holds an optimistic override the nav reads, the action no longer revalidates, and the form no longer uses a native `<form action>`, so nothing resets it. Server data catches up on the next navigation, because everything under `app/(app)` is a dynamic render. Fixed 2026-08-10 (REE-65) after three sessions of misdiagnosis, most of it spent on the client-side router rather than on removing the round-trip.
- **An intermittent failure is never proven fixed by one green run, and green runs are not evidence in proportion to how much you want them to be.** At a one-in-five failure rate a broken fix passes a single run four times out of five, and passes three runs better than half the time. REE-65 was called fixed on the GitHub Actions outage (wrong), then on three green runs (wrong), then merged on one green run whose commit message claimed ten. Prove it by running the spec repeatedly in one job, `playwright test <spec> --repeat-each=20` on a throwaway branch, and quote the count. Twenty passes puts a broken fix at roughly one in eighty. Note that most e2e specs here are not repeat-safe: `revalidate.spec.ts:81` creates a day and never removes it, so it fails every repeat after the first. That is the harness, not the product.
- **The same day, mutate the same route.** Any server action that changes something rendered on the schedule must call `revalidatePath` on `/tours/{id}/schedule`, even when the form that called it sits in a panel. The day view's edit panels deliberately do not pass `refreshOnSuccess` to `useEntityForm`; they rely on the action revalidating, while add forms refresh on the client. Both work, and mixing them double-renders, so pick by which kind of form you are writing. Forgetting the revalidate in an edit panel's action is silent: the panel says "Saved." and the timeline keeps the old value. This bit twice on 2026-08-04, in `updateTourAction` and again in `updateDaySheet`, which had no revalidate while its immediate sibling `updateShowNotes` did. `updateTourAction` has since gone the other way and deliberately has no revalidate, for the reason two rules above; it is no longer an example of this one.
- **A `redirect()` from a page under a `loading.tsx` is not an HTTP redirect, and nothing in the code says so.** The `loading.tsx` is a Suspense boundary, so Next streams the shell, commits the response as a 200, and delivers the navigation inside the stream for the browser to perform afterwards. Three of them sit above the schedule route (`app/(app)`, the schedule folder, the `@secondaryPanel` slot). Anything reading the status or the URL immediately (a test, a health check, a crawler) sees a 200 on the page it was redirected away from. A redirect from a layout is different: `requireUser()` in `app/(app)/layout.tsx` runs before anything streams and is a real 307. Found in Brief 41 when the cross-account e2e spec failed against correct code.
- **A new page route needs a line in `tests/e2e/smoke.spec.ts`.** That suite is the only thing in CI that loads a page: `next build` prerenders six routes and none of them is under `app/(app)`, because the layout reads `cookies()`. A route missing from the list is a route nothing checks. The route-count test at the bottom of that file fails on the commit that adds one, so this is enforced rather than remembered.
- Named exports for components. Default exports only for Next.js page, layout, and route files.
- Functional components and hooks only. No class components.
- Tailwind utility classes only. No `.css` files unless unavoidable. Merge classes with `cn()` from `@/lib/utils`. **The one sanctioned `.css` file is `components/schedule/day-calendar.css`** (Brief 43, REE-59), the override layer for react-big-calendar. It is unavoidable: RBC ships its own unlayered stylesheet (imported in `day-calendar.tsx`), and Tailwind v4 compiles utilities into `@layer utilities`, so an unlayered rule always beats a layered one regardless of specificity. A Tailwind class handed to RBC through `eventPropGetter` therefore loses to RBC's own `.rbc-event` and the accent never paints. The only reliable re-tokenisation is a stylesheet in the same unlayered tier that loads after RBC's, which is that file. It uses no hardcoded hex (Reeve tokens for chrome, Tailwind's `--color-*` palette variables plus `color-mix` for kind accents), so dark mode tracks automatically. Do not delete the import, do not "convert it to Tailwind", and do not add a second `.css` file on its precedent.
- Imports use the `@/` alias. No relative imports across top-level folders.
- Async APIs (`cookies`, `params`, `searchParams`) are awaited in Next.js 16.
- Validate every external URL before redirecting. Only allow relative paths starting with `/` and not `//`.
- Comments explain WHY when non-obvious, never WHAT.

## Performance conventions

The day view is the surface a TM hits hundreds of times a day, so latency there is a product problem, not a nicety. These are the rules that keep it fast.

- **Never issue a Supabase `.in()` with an empty array.** Guard the call and resolve `{ data: [] }` instead. An empty `.in()` is a full network round trip that can only ever return nothing. If every id array in a fetch is empty, return early before touching the database at all. Reference: `lib/schedule/day-roster.ts`, and the same pattern in `lib/comms/affected.ts`.
- **Parallelise independent queries with `Promise.all`.** Never chain awaits that do not depend on each other. Serial waves are the main cause of day-view latency.
- **Heavy client components that are not visible on first paint load through `next/dynamic` with `ssr: false`.** Anything pulling in a Radix dialog, a large icon set, or a search UI belongs behind a lazy wrapper rather than in the app shell bundle. Current uses: `components/nav/lazy-command-palette.tsx`, `components/schedule/add/add-flow.tsx`, `components/layout/active-panel.tsx`. Where the lazy wrapper gates a keyboard shortcut, the wrapper holds a minimal listener itself until first open, then unbinds and hands off to the real component.

## Environment variables

`.env.example` is the contract. Every variable the code reads must be listed there, even the optional ones. Rules that are easy to get wrong:

- **There are two runtimes and they do not share environment variables.** Vercel runs the Next.js app (pages, server actions, API routes). Trigger.dev runs everything in `trigger/jobs/` on its own infrastructure. A Trigger.dev job cannot see a Vercel environment variable. Anything a job reads, directly or through `lib/`, must be set in the Trigger.dev dashboard as well, per environment. `.env.example` marks these `[BOTH]`. When you add a variable that job code reads, mark it and say so in the PR, because the person deploying will otherwise set it in one place.
- **This failure is close to invisible, which is why it needs a rule.** Jobs run after the webhook has already returned 200, so Vercel logs look healthy and the crew member simply gets no reply. The only evidence is in the Trigger.dev run. On 2026-08-04 inbound WhatsApp had the Meta credentials in Vercel only, and the webhook reported success for every message it failed to answer. If a send silently does not arrive, check the Trigger.dev environment before reading any code.

- **One secret, one name.** There is one Meta app and therefore one app secret, and it is called `META_APP_SECRET`. Both `app/api/whatsapp/inbound/route.ts` and `app/api/data-deletion/route.ts` read that name. It used to be duplicated as `WHATSAPP_APP_SECRET` in the WhatsApp route, which meant whichever of the two names was left unset made that endpoint reject every request, silently, because signature checks fail closed. Consolidated 2026-08-04. Do not reintroduce a second name for it. The same reasoning applies to any future Meta or provider credential: one credential, one variable, read from one place.
- **Dropping a column is a two-runtime deploy, and the runtimes deploy separately.** Vercel redeploys on merge. Trigger.dev does not: it has no CI step and no `package.json` script, so it needs `npx trigger.dev@latest deploy` run by hand. A migration that drops a column therefore has to land **after both runtimes are running the code that stopped reading it**, not after the merge. Get this wrong and every job that still selects the column fails with `42703` while Vercel looks perfectly healthy. This is the same two-runtime split as the env var rule above, and it has now caused a silent production failure twice. It bit on 2026-08-04 when Brief 36 step 3 dropped `shows.load_in_at` and `shows.curfew_at`: `/itinerary` runs **only** on Trigger.dev (`lib/comms/router.ts` is reached from `trigger/jobs/*-router.ts` and from nothing on Vercel), so it kept selecting both columns and told a crew member the tour had no shows.
- **Renaming a secret is a two-step deploy, in this order.** Add the new variable in Vercel and confirm it is live, then ship the code that reads it, then remove the old variable. Shipping the rename first takes the endpoint down the moment it deploys, and for the WhatsApp webhook that means every inbound crew message is rejected.
- **`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is browser-exposed by design** (Places autocomplete in `components/shows/places-address-input.tsx`). It must be a separate key from the server-side `GOOGLE_MAPS_API_KEY` and must be HTTP-referrer restricted in Google Cloud. Never reuse the server key with a `NEXT_PUBLIC_` prefix.

## Brand and copy

Short sentences. Plain English. No corporate language. No em-dashes. Use industry terms the way a TM uses them: tour, show, advance, day sheet, load-in, crew, party. Product copy should sound like a professional wrote it, not a SaaS founder.

## What NOT to do

- Do not change the database without a migration, an apply, and regenerated types. All three or none.
- Do not hand-edit `lib/types/database.ts` or invent table or column names.
- Do not disable RLS, and do not use the service role key from client code.
- Do not build in-app booking or payment for travel or hotels in V1. Planner ranks, TM books off-platform, reference recorded back.
- Do not rank logistics options by price in V1. Feasibility first.
- Do not auto-promote a `transport_segment` to `booked`. The TM does that after booking.
- Do not send anything to crew without TM action (except answering a direct inbound question the TM opted into).
- Do not fire crew Q&A or register a morning-message schedule without checking the tour's `inbound_qa_enabled` / `morning_message_enabled` flag first. Both default false.
- Do not run AI or send messages synchronously inside a webhook handler. Enqueue on Trigger.dev and return fast.
- Do not build system prompts dynamically at runtime. Static constants only.
- Do not call the Anthropic SDK without `cache_control: { type: 'ephemeral' }` on the first system block.
- Do not scope storage bucket policies by authentication alone. Scope by tour ownership using `owns_tour()` on the path's tour id.
- Do not reach for the admin (service role) client in a server action because it is easier. Default to the RLS client. If an action genuinely needs the admin client, verify tour ownership via the RLS client first.
- Do not write a record's date column without resolving and writing its `tour_date_id`, or the reverse, on create or on edit. Use `resolveTourDateId()`.
- Do not derive a day from a `timestamptz`, or filter one by a day, using UTC midnight. Use `localDateInZone()` and `localDayWindowUtc()` with the tour's timezone.
- Do not accept two entity ids in one action without checking they belong to the same tour.
- Do not map an `undefined` field to `null` in a row mapper, and do not put `.default()` on an action-facing schema field that some callers do not submit. Both silently destroy data.
- Do not rely on `router.push` or `router.refresh` to update the `@secondaryPanel` Dates list. It is a layout and will not re-resolve. Revalidate server-side.
- Do not claim a webhook message id and then enqueue without releasing the claim if the enqueue throws.
- Do not issue a Supabase `.in()` with an empty array. Guard it.
- Do not import a Radix dialog or other heavy client component into the app shell. Lazy-load it.
- Do not read an env var the code depends on without adding it to `.env.example`.
- Do not verify a webhook signature against an empty string or a missing env var. Return 401 when the secret is absent.
- Do not enqueue an inbound webhook message without first deduplicating on the message ID via Redis SET NX.
- Do not send proactive WhatsApp messages (outside a 24-hour reply window) as free-form messages. Use approved templates.
- Do not set an idempotency claim before a send and leave it set if the send fails. Claim, send, release on failure.
- Do not duplicate `dietary` or `allergies` onto riders. Read from `person`.
- Do not use `getSession()`. Always `getUser()`.
- Do not call a server action without `requireUser()` as the first line.
- Do not add an AI provider other than Anthropic.
- Do not add a dependency not in `package.json` without instruction.
- Do not switch off pnpm. Do not write `.css` files. Do not use Pages Router patterns.
- Do not use em-dashes. Ever.
```
