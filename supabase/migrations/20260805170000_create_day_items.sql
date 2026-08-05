-- Brief 42 step 1: a day is rows, not columns.
--
-- day_sheets holds one row per show with twenty fixed time columns, and
-- day_events holds freeform items placed by date alone. A column can hold one
-- value and can exist once per show, which is why there is no second
-- soundcheck, no press call, no duration on a load-in, and why the timeline has
-- four write paths for a TM who thinks they are doing one thing.
--
-- This migration adds day_items and moves every existing time into it. It is the
-- EXPAND half. Nothing is dropped, so it is safe to apply before or after the
-- code ships. The contract migration that drops day_sheets and day_events is a
-- later commit and carries its own -- deploy-order: line.
--
-- Two shapes here are deliberate and both were decided in the brief.
--
-- tour_date_id is the day and it is NOT NULL, and there is no date column of its
-- own. Every other timeline table carries a day link plus a derived date, and
-- keeping the two in step is the bug class Brief 19 created and Brief 36 spent
-- itself fixing. An item has the link and an instant, and nothing to disagree
-- with. That makes Brief 40's midnight rule structural rather than a convention:
-- a 01:30 curfew has tour_date_id pointing at the show it ends and starts_at
-- falling on the next calendar day, and no query has to reconcile them.
--
-- starts_at is nullable, because day_events.starts_at already is and an item
-- with no time yet is a real thing. ends_at is nullable too: forcing an end
-- means inventing 10:00 to 10:15 at insert, and an invented value cannot be told
-- apart from a stated one once stored. A curfew with a fifteen minute end reads
-- as a window, and a curfew is a hard stop.
--
-- Re-running this file will fail on `create table day_items`, deliberately, so a
-- double apply is loud rather than silent. The part that has to be safe to run
-- twice is the backfill, and that is a function with a not-exists guard on every
-- insert, so it can be called again on its own at any time.

-- ---------------------------------------------------------------------------
-- 1. The table.
-- ---------------------------------------------------------------------------

create table day_items (
  id           uuid        primary key default gen_random_uuid(),
  tour_id      uuid        not null references tours(id) on delete cascade,
  tour_date_id uuid        not null references tour_dates(id) on delete cascade,
  -- Cascade rather than day_events' `set null`: these are the show's running
  -- order and they are meaningless without it. The behaviour change this makes
  -- to backfilled freeform events (today one survives its show being deleted)
  -- is named in the brief and accepted.
  show_id      uuid        references shows(id) on delete cascade,
  kind         text        not null check (kind in (
    'lobby_call','venue_access','load_in','line_check','soundcheck','vip',
    'doors','support_on','support_off','changeover','headliner_on','headliner_off',
    'curfew','load_out',
    'catering_breakfast','catering_lunch','catering_dinner',
    'other'
  )),
  title        text,
  starts_at    timestamptz,
  ends_at      timestamptz,
  location     text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- An end with no start is not a window, it is a missing value. The backfill
  -- counts and skips any it finds rather than coercing one.
  constraint day_items_end_needs_start check (starts_at is not null or ends_at is null),
  constraint day_items_end_after_start check (ends_at is null or starts_at is null or ends_at > starts_at),
  -- Everything a TM types that is not a known kind lands as 'other', and an
  -- untitled 'other' is a block on the day with nothing to call it.
  constraint day_items_other_needs_title check (kind <> 'other' or title is not null)
);

-- The day view reads a day at a time, and the show panel reads a show's own
-- items. Ordering is starts_at then created_at and there is no sort_order
-- column: two items at the same instant are rare and a stable tiebreak is
-- enough. Do not add manual ordering without a reason, because it becomes a
-- thing every write path has to maintain.
create index day_items_tour_date_idx on day_items (tour_date_id);
create index day_items_show_idx on day_items (show_id);

alter table day_items enable row level security;

create policy "owner can manage day_items"
  on day_items for all
  using  (owns_tour(tour_id))
  with check (owns_tour(tour_id));

grant all on day_items to authenticated;
grant all on day_items to service_role;

create trigger set_updated_at
  before update on day_items
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. catering_type moves to shows.
-- ---------------------------------------------------------------------------

-- The one column on day_sheets that is not a time and has no row to become. It
-- is a per-show property, "who is providing catering", so it moves rather than
-- going. Deleting a field a TM has filled in is not a migration decision.
alter table shows
  add column if not exists catering_type text not null default 'none'
    check (catering_type in ('none', 'buyout', 'provided'));

update shows s
set catering_type = ds.catering_type
from day_sheets ds
where ds.show_id = s.id
  and ds.catering_type is distinct from s.catering_type;

-- ---------------------------------------------------------------------------
-- 3. The backfill, as a callable function.
-- ---------------------------------------------------------------------------

-- A function rather than inline SQL for one reason: it is the only way the
-- backfill can be tested. Integration fixtures are created after every
-- migration has run, so inline SQL has nothing to act on by the time a test can
-- insert a day sheet, and tests/integration/day-items-backfill.test.ts would
-- read zero rows and pass or fail for the wrong reason.
--
-- Called once below with null, which means the whole database. Called with a
-- tour id by the test. Step 8 drops it along with the old tables.
--
-- security definer so the migration and the service role both run it as owner.
-- Execute is revoked from public and granted to service_role only: a TM must
-- never be able to run a database-wide backfill.
create or replace function backfill_day_items(p_tour_id uuid default null)
returns table (
  items_created          integer,
  tour_dates_created     integer,
  catering_pairs_skipped integer,
  event_ends_dropped     integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items            integer := 0;
  v_days             integer := 0;
  v_catering_skipped integer := 0;
  v_ends_dropped     integer := 0;
  v_batch            integer := 0;
begin
  -- 3a. A day_events row can sit on a date the tour has no day for, because
  -- day_events is placed by `date` alone and is the only timeline source off the
  -- day link. Matt's call, 2026-08-04: create the day rather than drop the row.
  -- resolveTourDateId already behaves this way on every other path. No day_type,
  -- so the table default ('day_off') applies: nothing about an event says what
  -- kind of day it is, and guessing would put a chip in the Dates sidebar the TM
  -- never chose.
  insert into public.tour_dates (tour_id, date)
  select distinct e.tour_id, e.date
  from public.day_events e
  where (p_tour_id is null or e.tour_id = p_tour_id)
    -- Brief 36 Part 4 deleted these, but the migration history is out of sync,
    -- so guard rather than trust. A sentinel row would otherwise surface on a
    -- TM's day as an item called __day_notes__.
    and e.title <> '__day_notes__'
    and not exists (
      select 1 from public.tour_dates d
      where d.tour_id = e.tour_id and d.date = e.date
    )
  on conflict (tour_id, date) do nothing;
  get diagnostics v_days = row_count;

  -- 3b. One row per non-null instant column. The kind is the column name, which
  -- is why the eighteen kinds are exactly the seventeen that exist today plus
  -- 'other'. tour_date_id and show_id come off the owning show, which has both
  -- and where both are not null.
  insert into public.day_items (tour_id, tour_date_id, show_id, kind, starts_at)
  select ds.tour_id, s.tour_date_id, ds.show_id, t.kind, t.value
  from public.day_sheets ds
  join public.shows s on s.id = ds.show_id
  cross join lateral (values
    ('lobby_call'::text,    ds.lobby_call),
    ('venue_access',        ds.venue_access),
    ('load_in',             ds.load_in),
    ('line_check',          ds.line_check),
    ('soundcheck',          ds.soundcheck),
    ('vip',                 ds.vip),
    ('doors',               ds.doors),
    ('support_on',          ds.support_on),
    ('support_off',         ds.support_off),
    ('changeover',          ds.changeover),
    ('headliner_on',        ds.headliner_on),
    ('headliner_off',       ds.headliner_off),
    ('curfew',              ds.curfew),
    ('load_out',            ds.load_out)
  ) as t(kind, value)
  where t.value is not null
    and (p_tour_id is null or ds.tour_id = p_tour_id)
    and not exists (
      select 1 from public.day_items di
      where di.tour_date_id = s.tour_date_id
        and di.kind = t.kind
        and di.starts_at is not distinct from t.value
        and di.show_id is not distinct from ds.show_id
    );
  get diagnostics v_batch = row_count;
  v_items := v_items + v_batch;

  -- 3c. One row per catering pair, both ends carried. Three pairs collapse to
  -- three kinds, which is where twenty columns become seventeen.
  insert into public.day_items (tour_id, tour_date_id, show_id, kind, starts_at, ends_at)
  select ds.tour_id, s.tour_date_id, ds.show_id, t.kind, t.starts, t.ends
  from public.day_sheets ds
  join public.shows s on s.id = ds.show_id
  cross join lateral (values
    ('catering_breakfast'::text, ds.catering_breakfast_start, ds.catering_breakfast_end),
    ('catering_lunch',           ds.catering_lunch_start,     ds.catering_lunch_end),
    ('catering_dinner',          ds.catering_dinner_start,    ds.catering_dinner_end)
  ) as t(kind, starts, ends)
  where t.starts is not null
    and (p_tour_id is null or ds.tour_id = p_tour_id)
    and not exists (
      select 1 from public.day_items di
      where di.tour_date_id = s.tour_date_id
        and di.kind = t.kind
        and di.starts_at is not distinct from t.starts
        and di.show_id is not distinct from ds.show_id
    );
  get diagnostics v_batch = row_count;
  v_items := v_items + v_batch;

  -- A catering end with no start cannot become a row: day_items_end_needs_start
  -- rejects it, and inventing a start would be a stated value that nobody
  -- stated. Counted so it is visible, because the count is the only place it
  -- shows up.
  select count(*)
  into v_catering_skipped
  from public.day_sheets ds
  cross join lateral (values
    (ds.catering_breakfast_start, ds.catering_breakfast_end),
    (ds.catering_lunch_start,     ds.catering_lunch_end),
    (ds.catering_dinner_start,    ds.catering_dinner_end)
  ) as t(starts, ends)
  where t.starts is null
    and t.ends is not null
    and (p_tour_id is null or ds.tour_id = p_tour_id);

  -- 3d. Freeform events become 'other', title intact, day resolved through
  -- (tour_id, date). Every one has a day by now, because 3a created the missing
  -- ones, so this is an inner join and a row that failed to resolve would be
  -- lost silently. It cannot happen; if it ever does, the count below will not
  -- match and the test asserts on that count.
  insert into public.day_items (
    tour_id, tour_date_id, show_id, kind, title, starts_at, ends_at, location, notes
  )
  select
    e.tour_id,
    d.id,
    e.show_id,
    'other',
    e.title,
    e.starts_at,
    -- An end with no start would violate day_items_end_needs_start. Dropped and
    -- counted rather than allowed to fail the whole migration for one malformed
    -- row that predates any constraint stopping it.
    case when e.starts_at is null then null else e.ends_at end,
    e.location,
    e.notes
  from public.day_events e
  join public.tour_dates d on d.tour_id = e.tour_id and d.date = e.date
  where (p_tour_id is null or e.tour_id = p_tour_id)
    and e.title <> '__day_notes__'
    and not exists (
      select 1 from public.day_items di
      where di.tour_date_id = d.id
        and di.kind = 'other'
        and di.title is not distinct from e.title
        and di.starts_at is not distinct from e.starts_at
    );
  get diagnostics v_batch = row_count;
  v_items := v_items + v_batch;

  select count(*)
  into v_ends_dropped
  from public.day_events e
  where e.starts_at is null
    and e.ends_at is not null
    and e.title <> '__day_notes__'
    and (p_tour_id is null or e.tour_id = p_tour_id);

  return query select v_items, v_days, v_catering_skipped, v_ends_dropped;
end;
$$;

revoke execute on function backfill_day_items(uuid) from public;
grant execute on function backfill_day_items(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Run it once, for the whole database.
-- ---------------------------------------------------------------------------

-- The counts are raised as a notice rather than discarded, because the number of
-- days this created and the number of catering pairs it could not carry are the
-- only evidence of what the migration did to a TM's data.
do $$
declare
  r record;
begin
  select * into r from backfill_day_items(null);
  raise notice 'day_items backfill: % items created, % tour_dates created, % catering pairs skipped, % event ends dropped',
    r.items_created, r.tour_dates_created, r.catering_pairs_skipped, r.event_ends_dropped;
end;
$$;
