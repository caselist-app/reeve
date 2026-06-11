# Brief 19: Dates as Spine

## What this is

The current data model uses `shows` as the primary entity. Everything hangs off a show row: day sheets, advance, transport (via the planner), hotels (via the planner). This made sense for V1 but it breaks as soon as a tour has days that are not shows: rehearsal days, travel days, press days, days off.

This brief refactors the spine. `tour_dates` becomes the primary entity. A date may have a show, a rehearsal, transport, a hotel night, or nothing (day off). Day type is derived from what exists on that date, not stored as an explicit field.

The visible change for the TM: "Shows" in the sidebar becomes "Schedule". The schedule lists every date on the tour in order, with a type indicator on each row.

---

## Data model changes

### New table: `tour_dates`

One row per calendar day on the tour. This is the spine everything attaches to.

```sql
create table tour_dates (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  date date not null,
  day_type text not null default 'day_off'
    check (day_type in ('show', 'rehearsal', 'travel', 'press', 'day_off')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tour_id, date)
);
```

`(tour_id, date)` is unique: one row per date per tour. `day_type` is set explicitly by the TM when creating a date — they pick the type first, then the relevant context loads. It is not derived from attached entities. Notes is a free text field (e.g. "press junket Paris") with no semantic meaning to the system.

### Changes to `shows`

Add `tour_date_id` as a FK to `tour_dates`. A show must have a date, so this ends up NOT NULL after backfill, but we add it nullable first to allow the backfill migration to run.

```sql
alter table shows add column tour_date_id uuid references tour_dates(id) on delete cascade;
```

After backfill:

```sql
alter table shows alter column tour_date_id set not null;
```

`venue_name` stays NOT NULL on shows. Venue name is show-specific data, not date data.

### Changes to `day_sheets`

Two changes:
1. Add `lobby_call_at timestamptz` (new field, discussed in Brief 09 WhatsApp context)
2. `show_id` stays as the PK and FK. Day sheets are a show construct: they hold the venue schedule (load in, soundcheck, doors, etc.), not a generic date schedule. The link to `tour_dates` is via the show.

```sql
alter table day_sheets add column lobby_call_at timestamptz;
```

### New table: `rehearsals`

A rehearsal is a date with a location and a start time. It is not a show: no venue hub, no advance, no promoter. It sits directly on a `tour_date`.

```sql
create table rehearsals (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  tour_date_id uuid not null references tour_dates(id) on delete cascade,
  location_name text not null,
  address text,
  google_maps_url text,
  start_at timestamptz,
  end_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

One rehearsal per date (a tour rarely has two separate rehearsal blocks in one day, and if they do the notes field covers it). If this turns out to be wrong, it is easy to relax later.

### Changes to `transport_segments`

Add an optional `tour_date_id` FK. This links a transport leg to the date it departs (not the date it arrives). Nullable: existing segments and manually entered segments may not be linked to a date.

```sql
alter table transport_segments add column tour_date_id uuid references tour_dates(id) on delete set null;
```

`on delete set null`: if a date row is deleted, the transport segment is not deleted; it just loses its date link.

### Changes to `hotel_stays`

Add an optional `tour_date_id` FK. This links a hotel stay to the night the party arrives (i.e. the `check_in_date`'s corresponding tour date). Nullable for the same reason as transport.

```sql
alter table hotel_stays add column tour_date_id uuid references tour_dates(id) on delete set null;
```

---

## Day type

`day_type` is set explicitly by the TM. When adding a new date to the schedule, the TM selects the type first (Show, Rehearsal, Travel, Press, Day Off) and the relevant input fields load for that type.

Values: `show | rehearsal | travel | press | day_off`

The sidebar renders the venue name + city under a show day row (once a show is linked), just the type label for all other day types — matching the Day Sheets app pattern.

---

## Migration plan

Single migration: `20260611200000_tour_dates_spine.sql`

Steps in order (each step must be in the same migration file):

1. Create `tour_dates` table with RLS policies and GRANTs
2. Create `rehearsals` table with RLS policies and GRANTs
3. Add nullable `tour_date_id` to `shows`
4. Backfill: for each distinct `(tour_id, date)` pair in `shows`, insert a `tour_dates` row; then update `shows.tour_date_id` to match
5. Set `shows.tour_date_id` NOT NULL
6. Add `lobby_call_at` to `day_sheets`
7. Add nullable `tour_date_id` to `transport_segments`
8. Add nullable `tour_date_id` to `hotel_stays`

All GRANTs follow the pattern from `20260610120000_grant_service_role.sql`. Every new table needs:

```sql
grant select, insert, update, delete on <table> to service_role;
```

---

## Route changes

### Sidebar rename

`/tours/[id]/shows` stays as the URL slug. The label in the sidebar changes from "Shows" to "Schedule". Do not break existing bookmarks.

### New schedule list view: `/tours/[id]/shows`

Replace the current shows-only list with a chronological list of all `tour_dates` on the tour, enriched with their type and the key entity for that date.

Each row shows:
- Date (day of week + dd Mon)
- Type indicator (pill or icon): Show / Rehearsal / Travel / Day off
- For show rows: venue name + city
- For rehearsal rows: location name
- For travel rows: first transport segment summary ("London Heathrow -> Paris CDG")
- For day off rows: nothing, or the notes field if set

Rows link to the detail view for the primary entity on that date (show detail, rehearsal detail, or transport detail).

There is a single "Add" button that opens the day-type picker (see UX section below).

### Updated show detail view: `/tours/[id]/shows/[showId]`

No route change. The show detail view remains show-centric. It does not become a "date detail" view. Venue, advance, day sheet, planner all live here as before.

### New rehearsal detail view: `/tours/[id]/rehearsals/[rehearsalId]`

Simple form: location name, address, Google Maps link, start time, end time, notes. No advance, no hub resolution. The WhatsApp `travel_to_rehearsal` template fires from this data.

---

## Schedule UX

### Adding a new date

The "Add" button on the schedule list opens a compact picker. The TM selects what kind of day they are adding:

- **Show** — opens the existing show create form (venue, date, load-in)
- **Rehearsal** — opens the new rehearsal create form (location, date, start time)
- **Travel day** — creates a date row and immediately opens the transport planner (or takes the TM to transport entry)
- **Day off** — creates a blank date row (optional notes field)

Selecting "Show" or "Rehearsal" automatically creates the `tour_dates` row for that date (or links to an existing one) as part of the same write.

### Keyboard shortcuts on the schedule list (show days only)

When focus is in the schedule list or a show row is selected, two shortcuts provide rapid entry of the most common time fields:

| Shortcut | Action |
|----------|--------|
| `Cmd+B` | Open bus call input inline on that row (writes to the `depart_at` of the first bus-mode `transport_segment` for that date, or creates a new one) |
| `Cmd+L` | Open lobby call input inline on that row (writes to `day_sheets.lobby_call_at`) |

Both open a single plain-text input inline in the row. The TM types a time and presses Enter. No time picker. No modal.

### Plain text time input

All time fields across the schedule (not just the shortcuts above) accept plain text. The parser handles:

- `10am`, `10AM`, `10:00am`
- `14:00`, `14.00`, `1400`
- `2pm`, `2:30pm`
- `0800`, `08:00`

Parse on blur (when focus leaves the field) and on Enter. If the input cannot be parsed, show an inline error and keep focus in the field. Never show a time picker. Never show a clock wheel. Industry standard for TMs is typed times.

This parser lives in `lib/utils/parse-time.ts` and is used everywhere a time is entered in the app.

---

## Comms impact

### Morning message

`buildMorningMessageData` currently queries `shows` and `day_sheets` by `show_id`. No change needed to the query shape: the morning message fires on show days, and show days are still show rows. The Trigger.dev job that finds "which shows are today" does not need to change.

If in a future brief the morning message should also fire on rehearsal days, it will query `rehearsals` instead. That is not in scope here.

### Boarding pass / bus call / lobby call

The boarding pass Trigger.dev job fires from `transport_assignments`. Transport segments now have an optional `tour_date_id` but the job does not need to use it. No change.

The `lobby_call` Trigger.dev job (to be built in a future brief) will query `day_sheets.lobby_call_at` where it is not null and the departure is within the next hour. It needs `lobby_call_at` to be in the schema, which this migration adds.

---

## Code changes required (beyond migration)

1. **`lib/types/database.ts`**: regenerate after migration (`pnpm types:gen`)

2. **`app/tours/[id]/shows/page.tsx`**: rewrite to query `tour_dates` joined to shows, rehearsals, transport; render chronological list with type indicators and the "Add" picker

3. **Sidebar label**: change "Shows" to "Schedule" in the sidebar nav component

4. **`app/tours/[id]/rehearsals/[rehearsalId]/page.tsx`**: new page (simple form)

5. **`lib/utils/parse-time.ts`**: new utility, plain text time parser

6. **Show create/edit forms**: when a show is created, also create (or find) the `tour_dates` row for that date and write `shows.tour_date_id`

7. **`lib/comms/templates/itinerary.ts`**: no change needed (queries shows directly by tour_id and date, not via tour_dates)

8. **`lib/comms/templates/morning-message.ts`**: no change needed

---

## What this brief does NOT include

- Building Briefs 16-18 (transport overview, hotels overview, documents): those come after the spine is in place
- Mobile PWA (Brief 14)
- The `travel_to_rehearsal` WhatsApp template job: the schema for rehearsals lands here; the Trigger.dev job is a separate brief
- The `lobby_call` Trigger.dev job: `lobby_call_at` column lands here; the job is a separate brief
- Press days as an explicit entity: a press day is a day off with notes ("press junket, Paris") until there is a clear product need for a dedicated press entity
- Any UI for linking existing transport/hotel rows to tour_dates retroactively: that is a one-time data tool, not a product feature
