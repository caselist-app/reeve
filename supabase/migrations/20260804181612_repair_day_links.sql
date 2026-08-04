-- Brief 36 Part 1: repair the day link on existing rows.
--
-- Brief 19 made tour_dates the spine and retrofitted tour_date_id onto shows,
-- hotel_stays and transport_segments. Every create path was updated to write
-- both the link and the record's own date column. No edit path was. So every
-- date a TM has changed since then left the link pointing at the day the record
-- used to be on.
--
-- DIRECTION OF THE REPAIR, and it is the important decision in this file.
-- The date column wins here, and the link is rebuilt from it. Going forward
-- tour_date_id is the source of truth and the date derives from it, which is
-- the opposite, and that is deliberate: the desync only ever happened because
-- an edit wrote the date and left the link behind, so the date column is the
-- one holding the TM's most recent intent. Repairing the other way would drag
-- every edited record silently back to the day it was moved off.
--
-- Matt's decision, 2026-08-04: a date with no tour_dates row gets one created
-- rather than the record being left unplaced, so nothing ends up on a day that
-- is not in the tour's Dates list.
--
-- This must run BEFORE the composite foreign keys in the next migration. Live
-- data violates them today, so adding them first just fails.
--
-- Safe to run twice. Every statement below is a no-op once the rows agree.
--
-- ---------------------------------------------------------------------------
-- To see what this will change before running it, and that it changed it
-- afterwards, run this. It writes nothing. Every count should be zero when the
-- migration has done its job.
--
--   select 'shows' as table_name, count(*) as desynced
--   from shows s join tour_dates td on td.id = s.tour_date_id
--   where td.date <> s.date
--   union all
--   select 'hotel_stays', count(*)
--   from hotel_stays h join tour_dates td on td.id = h.tour_date_id
--   where h.check_in_date is distinct from td.date
--   union all
--   select 'transport_segments', count(*)
--   from transport_segments seg
--   join tour_dates td on td.id = seg.tour_date_id
--   join tours t on t.id = seg.tour_id
--   where seg.depart_at is not null
--     and (seg.depart_at at time zone coalesce(t.timezone, 'UTC'))::date <> td.date;
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. shows
-- ---------------------------------------------------------------------------

-- The three steps run in this order for a reason. 1a has to see the world
-- before anything moves, because once the links are repointed there is no way
-- left to tell a day that has just been emptied from one that never had a show.
-- Doing it this way avoids needing a scratch table to remember, which would
-- behave differently depending on whether the migration runs in one
-- transaction.

-- 1a. A day every show is leaving stops being a show day, or the Dates sidebar
-- keeps a phantom "Show day" with nothing behind it. Same fallback
-- revertDayTypeIfOrphaned uses in application code: travel if transport is
-- already linked to the day, otherwise day off, and clear a custom title that
-- was almost certainly naming the show that is leaving.
--
-- Deliberately narrow. A day marked "Show Day" with no show at all is a state a
-- TM can create on purpose through Edit Day, so this only touches days that
-- have a show right now, where none of those shows is staying, and where no
-- other show is about to arrive.
update tour_dates td
set day_type = case
      when exists (select 1 from transport_segments ts where ts.tour_date_id = td.id)
        then 'travel'
      else 'day_off'
    end,
    custom_title = null
where td.day_type = 'show'
  and exists (select 1 from shows s where s.tour_date_id = td.id)
  and not exists (
    select 1 from shows s where s.tour_date_id = td.id and s.date = td.date
  )
  and not exists (
    select 1 from shows s
    where s.tour_id = td.tour_id and s.date = td.date and s.tour_date_id <> td.id
  );

-- 1b. Every date a show claims must exist as a tour_dates row, and must be a
-- show day. Same upsert create_show_with_dependents already performs, so a show
-- that moves onto an existing travel day relabels it exactly as creating one
-- there would have.
insert into tour_dates (tour_id, date, day_type)
select distinct s.tour_id, s.date, 'show'
from shows s
join tour_dates td on td.id = s.tour_date_id
where td.date <> s.date
on conflict (tour_id, date) do update set day_type = 'show';

-- 1c. Repoint the link at the day the show's own date names.
update shows s
set tour_date_id = target.id
from tour_dates current_day, tour_dates target
where current_day.id = s.tour_date_id
  and current_day.date <> s.date
  and target.tour_id = s.tour_id
  and target.date = s.date;

-- ---------------------------------------------------------------------------
-- 2. hotel_stays
-- ---------------------------------------------------------------------------

-- 2a. A linked stay with no check-in date has nothing to derive a date from, so
-- this is the one case where the link is the better source. Backfilling keeps
-- the stay on the day it was attached to instead of dropping it off the
-- schedule, and it is what the composite key needs to have something to check.
update hotel_stays h
set check_in_date = td.date
from tour_dates td
where td.id = h.tour_date_id
  and h.check_in_date is null;

-- 2b. Every check-in date a linked stay claims must exist as a day. No day_type
-- is set: a hotel does not tell us what kind of day this is, and guessing would
-- put a chip in the sidebar the TM never chose. New rows take the table default
-- of 'day_off'.
insert into tour_dates (tour_id, date)
select distinct h.tour_id, h.check_in_date
from hotel_stays h
join tour_dates td on td.id = h.tour_date_id
where h.check_in_date <> td.date
on conflict (tour_id, date) do nothing;

-- 2c. Repoint the link at the check-in day.
update hotel_stays h
set tour_date_id = target.id
from tour_dates current_day, tour_dates target
where current_day.id = h.tour_date_id
  and current_day.date <> h.check_in_date
  and target.tour_id = h.tour_id
  and target.date = h.check_in_date;

-- Stays with a check-in date and no link at all (the planner writes it that
-- way) are deliberately left alone. The day query matches hotels on date, so
-- they already render correctly, the composite key does not apply to a null
-- link, and linking them would create days in the sidebar the TM never added.
-- The first edit through updateHotelStay links them.

-- ---------------------------------------------------------------------------
-- 3. transport_segments
-- ---------------------------------------------------------------------------
--
-- No constraint follows for this table (Matt's decision, 2026-08-04: depart_at
-- is a timestamptz, so the day it falls on depends on the tour timezone, and
-- every database mechanism for that goes stale the moment a tour's timezone is
-- edited). The repair still matters, and more than for the other two: the day
-- query is now date-guarded on both sides, so a segment whose link disagrees
-- with its departure is excluded by the linked query and excluded by the
-- unlinked fallback, and renders on no day at all until this runs.
--
-- The day a departure belongs to is its local date in the tour's timezone, not
-- its UTC date: 22:00Z on the 14th is the 15th in Auckland.

-- 3a. Every day a linked segment departs on must exist as a tour_dates row.
insert into tour_dates (tour_id, date)
select distinct seg.tour_id, (seg.depart_at at time zone coalesce(t.timezone, 'UTC'))::date
from transport_segments seg
join tour_dates td on td.id = seg.tour_date_id
join tours t on t.id = seg.tour_id
where seg.depart_at is not null
  and (seg.depart_at at time zone coalesce(t.timezone, 'UTC'))::date <> td.date
on conflict (tour_id, date) do nothing;

-- 3b. Repoint the link at the departure day.
update transport_segments seg
set tour_date_id = target.id
from tour_dates current_day, tour_dates target, tours t
where current_day.id = seg.tour_date_id
  and t.id = seg.tour_id
  and seg.depart_at is not null
  and current_day.date <> (seg.depart_at at time zone coalesce(t.timezone, 'UTC'))::date
  and target.tour_id = seg.tour_id
  and target.date = (seg.depart_at at time zone coalesce(t.timezone, 'UTC'))::date;

-- A linked segment with no departure time keeps its link: it is the only thing
-- placing it, and the day query returns it on the strength of the link alone.
