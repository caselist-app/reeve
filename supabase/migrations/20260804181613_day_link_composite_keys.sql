-- Brief 38 Part 1: make the day link impossible to desync at rest.
--
-- Brief 36 repairs the rows and fixes the edit actions that broke them. This
-- makes the fourth code path, the one somebody writes next month, unable to
-- break them the same way. Application code is exactly what has been getting
-- this wrong since Brief 19, so an application fix on its own is a fix with a
-- known expiry date.
--
-- Mechanism is a composite foreign key rather than a trigger: it is
-- declarative, it cannot be bypassed, and it costs nothing to read. A write
-- that sets shows.date without moving shows.tour_date_id stops being a silent
-- data bug and becomes a foreign key violation at the moment it happens.
--
-- MUST RUN AFTER 20260804181612_repair_day_links.sql. Live data violates these
-- constraints today, so adding them first fails. If this migration errors on a
-- foreign key violation, that means the repair missed a row, which is the
-- intended failure: loud, before the constraint is trusted, rather than quiet
-- afterwards. Run the audit query at the top of the repair migration to see
-- which rows are left.

-- ---------------------------------------------------------------------------
-- 1. The foreign key target
-- ---------------------------------------------------------------------------
-- Redundant on its own, since id is already the primary key and therefore
-- already unique. Postgres requires a declared unique constraint over exactly
-- the referenced columns before they can be an FK target, so this exists purely
-- to make (id, date) referenceable.

alter table tour_dates
  add constraint tour_dates_id_date_key unique (id, date);

-- ---------------------------------------------------------------------------
-- 2. shows
-- ---------------------------------------------------------------------------
-- shows.tour_date_id and shows.date are both NOT NULL, so this constraint is
-- checked on every row with no null-bypass to reason about.
--
-- on delete cascade preserves the existing behaviour exactly: deleting a day
-- deletes the show on it, which is what the single-column FK from Brief 19
-- already did.
--
-- on update cascade is new and changes nothing today, because no code path
-- edits tour_dates.date (Edit Day submits day_type and notes only). It matters
-- the day one does: a day's date moving would otherwise be rejected outright,
-- where what it should do is take the show with it. That is the correct
-- behaviour under "the link is the source of truth", so it is declared now
-- rather than discovered later.

-- Dropped by looking the constraint up rather than by name. Brief 19 created it
-- implicitly with `add column tour_date_id uuid references tour_dates(id)`, so
-- its name is whatever Postgres generated, and a guessed name that turns out to
-- be wrong fails this migration for a reason that has nothing to do with the
-- change being made.
do $$
declare
  v_name text;
begin
  select con.conname into v_name
  from pg_constraint con
  where con.conrelid = 'shows'::regclass
    and con.contype = 'f'
    and con.confrelid = 'tour_dates'::regclass
    and con.conkey = array[
      (select attnum from pg_attribute
        where attrelid = 'shows'::regclass and attname = 'tour_date_id')
    ]::smallint[];

  if v_name is null then
    raise exception 'No single-column foreign key from shows.tour_date_id to tour_dates found. Has this migration already run?';
  end if;

  execute format('alter table shows drop constraint %I', v_name);
end
$$;

alter table shows
  add constraint shows_tour_date_id_date_fkey
  foreign key (tour_date_id, date)
  references tour_dates (id, date)
  on update cascade
  on delete cascade;

-- ---------------------------------------------------------------------------
-- 3. hotel_stays
-- ---------------------------------------------------------------------------
-- A linked stay's tour_date_id is its check-in day, per Brief 36's decision 1.
--
-- Both columns are nullable, and a composite foreign key with MATCH SIMPLE (the
-- default) is not checked at all when any of its columns is null. That is the
-- behaviour we want on this table: an unlinked stay, which is what the planner
-- writes, is legal and renders off its check_in_date. The constraint binds only
-- when a stay claims a day, which is the case that was going wrong.
--
-- The delete action is the dangerous part and is why this is not a plain
-- `on delete set null`. That form nulls EVERY column in the key, so deleting a
-- day would wipe check_in_date off the stay: silent data loss, exactly the
-- class this brief exists to stop. The column list restricts it to the link, so
-- deleting a day unlinks the stay and leaves its dates intact, and the stay
-- keeps rendering through the date-matched query. That form needs Postgres 15
-- or later. supabase/config.toml pins the local stack to 17. CONFIRM THE
-- REMOTE PROJECT'S VERSION IN THE SUPABASE DASHBOARD BEFORE RUNNING THIS: it
-- cannot be checked from outside the project.

do $$
declare
  v_name text;
begin
  select con.conname into v_name
  from pg_constraint con
  where con.conrelid = 'hotel_stays'::regclass
    and con.contype = 'f'
    and con.confrelid = 'tour_dates'::regclass
    and con.conkey = array[
      (select attnum from pg_attribute
        where attrelid = 'hotel_stays'::regclass and attname = 'tour_date_id')
    ]::smallint[];

  if v_name is null then
    raise exception 'No single-column foreign key from hotel_stays.tour_date_id to tour_dates found. Has this migration already run?';
  end if;

  execute format('alter table hotel_stays drop constraint %I', v_name);
end
$$;

alter table hotel_stays
  add constraint hotel_stays_tour_date_id_check_in_date_fkey
  foreign key (tour_date_id, check_in_date)
  references tour_dates (id, date)
  on update cascade
  on delete set null (tour_date_id);

-- ---------------------------------------------------------------------------
-- 4. transport_segments: deliberately not constrained
-- ---------------------------------------------------------------------------
-- Matt's decision, 2026-08-04. depart_at is a timestamptz, so the calendar day
-- it falls on is its local date in the tour's timezone, and a composite foreign
-- key needs a real stored column to reference.
--
-- The options were a generated column holding that local date, a trigger, or
-- application enforcement plus a test. A generated column has to be immutable
-- and can only read its own row, so it would mean copying tours.timezone onto
-- every segment, and the timezone is editable in tour settings, so it is not
-- immutable. A trigger would work, but shares the same hole as everything else
-- here: it only fires on a write to transport_segments, so editing a tour's
-- timezone silently invalidates every existing segment without anything firing.
--
-- Since no database mechanism is actually airtight for this column, the honest
-- version is the one that does not look stronger than it is: updateTransportSegment
-- writes the link, and tests/integration/day-link.test.ts fails if it stops.
-- This is the one of the three that new code can still get wrong.
