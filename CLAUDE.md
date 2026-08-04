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
FlightAware AeroAPI             live flight tracking (seam in V1, alerts in V2)
Meta WhatsApp Cloud API         operational comms (primary)
Twilio                          WhatsApp and SMS fallback
```

## Commands

```bash
pnpm dev              # local dev server
pnpm build            # production build (must pass before merge)
pnpm lint             # eslint, must be clean
pnpm typecheck        # tsc --noEmit, must be clean
pnpm types:gen        # regenerate lib/types/database.ts from Supabase (see Database workflow)

# Supabase (the only ways schema reaches the database)
supabase migration new <name>   # create a timestamped migration file
supabase db push                # apply migrations to the linked remote project
supabase migration up           # apply migrations to local
supabase db reset               # rebuild local DB from all migrations (destructive, local only)
```

`pnpm types:gen` wraps `supabase gen types typescript` and writes to `lib/types/database.ts`. Keep this script in `package.json` so the command is identical for every agent.

## Database workflow (the rule Matt cares about most)

A change to the database is a single atomic action with three parts. Never do one without the others, and never merge a partial.

1. **Write the migration.** `supabase migration new <descriptive_name>` creates `supabase/migrations/<timestamp>_<name>.sql`. Put the DDL there. Never run ad-hoc SQL against the database. Never edit schema by hand in the Supabase dashboard. The migration file is the only legitimate source of a schema change.
2. **Apply the migration.** `supabase db push` for the linked remote, `supabase migration up` (or `supabase db reset` to rebuild) for local. Schema changes only reach a database through an applied migration.
3. **Regenerate types.** Run `pnpm types:gen` to rewrite `lib/types/database.ts`. Never hand-edit that file. Never invent table or column names anywhere in the codebase: import them from the generated types so the compiler catches drift.

Commit all three together (migration file, any code using the new schema, regenerated types) in one commit. A schema change that lands without its migration or without regenerated types is incomplete and must not be merged. If you change schema and forget the types, the build is wrong even if it compiles.

## Database conventions

- Tables: `snake_case`, plural (`tours`, `people`, `shows`, `transport_segments`).
- Columns: `snake_case` (`created_at`, `tour_id`, `load_in_at`).
- Every table carries `id uuid primary key default gen_random_uuid()`, `created_at`, `updated_at`. Every tour-scoped table carries `tour_id`.
- Ownership and RLS: `account` is the only auth principal. `tour.account_id` is the owner. Every tour-scoped policy filters by the caller owning the tour. No cross-tour reads, ever.
- Use the supertype-plus-discriminator shapes from the data model. Do not invent parallel tables:
  - `person` has a `person_type` discriminator (`artist | crew | management | support`). Role-specific fields live in extensions like `crew_detail` (per diem and wage rates). Do not duplicate `dietary` or `allergies` onto riders: read them from `person`.
  - `transport_segment` is one table with a `mode` discriminator (`bus | truck | flight | rail | ground | hire`). People attach through `transport_assignment` (many-to-many), which holds per-person detail (seat, PNR, boarding pass). The logistics planner writes segments as `status = 'planned'`. The TM promotes to `booked` after booking off-platform and pasting the reference. Do not auto-set `booked`.
  - `hotel_stay` plus `room_assignment` (per-person, with `room_tier` of `artist | crew`).
  - `show` has `show_advance` (per-department status), `day_sheet`, `promoter`, `settlement`, `pass_sheet`, guest list and vendors hanging off it.
- `document_share` is the read-receipt ledger (sent, opened, acknowledged). It drives advance status automatically. Treat it as append-mostly: do not delete share rows.
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

**Day timeline**: a chronological list of all items on the selected day merged from four sources: `hotel_stays` (check-in/check-out), `transport_segments`, `shows` (day sheet fields as individual cards), and `day_events` (freeform). Items sorted by time ascending. Server Component. Clicking any item opens its detail in the global side panel (venue and day sheet for a show, the segment for transport, the stay for a hotel, the event), read via `PanelShell`-based panels in `components/schedule/panels/`. Flights render a read-only `FlightCard` inside `transport-panel.tsx` (live status, tracked via AirLabs) with booking reference as the one editable field; every other mode is a plain edit form.

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
- **Comms is push, not pull.** Crew never open an app. Email (Resend) is the formal, paper-trail channel (riders, advancing docs, settlements) sent from a per-tour artist-branded subdomain. WhatsApp (Meta Cloud API, Twilio and SMS fallback) is the operational channel (day sheets, travel, boarding passes, changes, Q&A). WhatsApp is core to V1, not a fast-follow.
- **Slash commands are zero-AI template renders.** `/itinerary`, `/travel`, `/hotel`, `/crew` render directly from data with no model call. Implement as WhatsApp quick-reply buttons. Only free text that is not a recognised command goes to Claude. The inbound number maps to a `person`, so every reply is personalised without the crew member identifying themselves.
- **All scheduled and event comms run on Trigger.dev** and are idempotent through Upstash Redis. A double-send to crew is the fastest way to lose TM trust. Never send from a webhook handler synchronously: enqueue and return fast.
- **Inbound webhook messages must be deduplicated before enqueueing.** For WhatsApp, SET NX on the `wamid`. For email, SET NX on the Svix event id. If Redis is down, proceed and rely on the job's own guard rather than dropping the message. Dedup is the webhook's responsibility, not the job's.
- **The send pattern for Trigger.dev jobs is claim-send-release.** Set the idempotency claim, attempt the send, and release the claim (mark failed or delete) if the send throws. Setting the claim and then abandoning it on failure makes a failed send look like a success to a retry. `lib/comms/notify/index.ts` is the reference: claim via a unique DB insert, release the claim on failure. All send paths follow this pattern.
- **Proactive WhatsApp sends must use Meta-approved templates.** Free-form messages and interactive messages are only valid in reply to a crew message within 24 hours. Anything sent outside that window (morning messages, boarding passes, broadcasts) must go through `sendTemplate`. Sending free-form proactively fails silently: Meta accepts the API call and drops the delivery.

## The AI layer

Claude fires only in three cases: free-text WhatsApp questions from crew, email-forward extraction (TM-initiated), and logistics query synthesis. When it fires it receives the full context of a single tour, assembled server-side and passed explicitly. Claude has no standing database access and never sees data outside the tour it is handed. It never books and never sends without TM approval. Cost model: slash commands cost nothing (templates), simple free text uses Haiku, synthesis and extraction use Sonnet, and repeated system prompts use prompt caching. Target is under 5 dollars per active tour per month. Store system prompts as static constants in `lib/ai/`, never built dynamically at runtime (dynamic prompts break caching).

Prompt caching is not optional. Every call to Claude must include `cache_control: { type: 'ephemeral' }` on the first system block (the static tour context block). A call without it pays full token cost on every request and will blow the cost model on any active tour. The AI context layer is the right place to enforce this: all Claude calls should go through it, never raw SDK calls from feature code.

## Auth model

- Supabase Auth. The `account` (the TM or PM) is the only authenticated principal.
- Tour ownership is the authorisation primitive. Server actions and route handlers verify the caller owns the tour before any read or write.
- Middleware is `middleware.ts`, exports `middleware`, and uses `getUser()`. Never use `getSession()` anywhere.
- The service role key is server-side admin only (webhooks, cron, Trigger.dev jobs). Never in client code.
- **Every server action calls `requireUser()` as its first statement**, before any other logic. No exceptions, even for actions that seem low-risk without auth. Server actions are publicly POSTable endpoints.
- **The admin (service role) client bypasses RLS.** Every server action that uses it must first verify tour ownership via the RLS client, then scope all admin queries with `.eq('tour_id', tourId)`. The RLS check is not redundant; it is the ownership gate the admin client cannot provide. See `lib/actions/boarding-pass-upload.ts` for the correct pattern.
- **Webhook signature checks fail closed.** If the env var holding the secret is absent, return 401 immediately. Never fall back to an empty string, a default value, or a conditional check. A missing secret means the environment is misconfigured; accepting the request in that state opens the endpoint to anyone. See `app/api/whatsapp/inbound/route.ts` and `app/api/email/inbound/route.ts` for the pattern.

## Code style

- TypeScript strict mode. No `any`. Use `unknown` and narrow.
- Server Components by default. Use `'use client'` only for state, effects, or browser APIs.
- Server actions for mutations. Write API routes only for webhooks, cron, Stripe callbacks, and inbound provider hooks.
- Named exports for components. Default exports only for Next.js page, layout, and route files.
- Functional components and hooks only. No class components.
- Tailwind utility classes only. No `.css` files unless unavoidable. Merge classes with `cn()` from `@/lib/utils`.
- Imports use the `@/` alias. No relative imports across top-level folders.
- Async APIs (`cookies`, `params`, `searchParams`) are awaited in Next.js 16.
- Validate every external URL before redirecting. Only allow relative paths starting with `/` and not `//`.
- Comments explain WHY when non-obvious, never WHAT.

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
- Do not use the admin (service role) client in a server action without first verifying tour ownership via the RLS client.
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
