-- Brief 36 Part 4: tour_dates.notes is the one notes field.
--
-- A day's notes were stored in three places. shows.notes was written by the day
-- info panel on a show day. A day_events row with the sentinel title
-- __day_notes__ was written by the same panel on every other day.
-- tour_dates.notes was written by Add/Edit Day, and read by the Dates sidebar
-- and the press-day header.
--
-- So a note typed in the day info panel never appeared in the sidebar, and a
-- note typed in Add Day never appeared in the panel: two inputs, both labelled
-- Notes, on the same screen, writing to different tables. On a show day the
-- sidebar read a value the panel could not write.
--
-- Matt's call, 2026-08-04: notes belong to the day, not the show.
--
-- deploy-order: this drops a column and deletes rows, so it lands only after
-- BOTH runtimes are running the code that stopped reading them. Vercel and
-- Trigger.dev deploy separately and CI deploys Trigger.dev on merge to main, so
-- "both" means after that merge has finished, not after the build went green.
-- Nothing under trigger/jobs/ read shows.notes or the sentinel, so the blast
-- radius is the Next.js app alone. That is not a reason to skip the wait: the
-- same was believed about shows.load_in_at on 2026-08-04, and /itinerary told a
-- crew member their tour had no shows.

-- ---------------------------------------------------------------------------
-- 1. Give orphan sentinel rows a day to land on.
-- ---------------------------------------------------------------------------

-- day_events has no foreign key to tour_dates, so a sentinel row can sit on a
-- date the tour has no day for. Its note has nowhere to go, so add the day.
-- This is what updateDayNotes now does when a TM types a note on a date that is
-- not yet on the tour, so the migration and the running code agree.
--
-- No day_type: the table default ('day_off') is right. Nothing about a note
-- says what kind of day it is, and guessing would put a chip in the sidebar the
-- TM never chose.
insert into tour_dates (tour_id, date)
select distinct de.tour_id, de.date
from day_events de
where de.title = '__day_notes__'
  and nullif(btrim(de.notes), '') is not null
  and not exists (
    select 1
    from tour_dates td
    where td.tour_id = de.tour_id
      and td.date = de.date
  )
on conflict (tour_id, date) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Backfill, before anything is dropped.
-- ---------------------------------------------------------------------------

-- On the live data when this was written, all three columns were empty on every
-- row, so this copies nothing. It is written to be correct anyway: the code
-- deploys before this migration runs, and a TM can type a note in that window.
--
-- Where the day already has a note and the show or the sentinel also has one,
-- both are kept, joined by a blank line. Picking a winner would silently
-- destroy something a TM typed, which is the exact class of bug this brief
-- exists to remove, and a day holding two notes is rare enough to be worth one
-- ugly row rather than one lost sentence.
with incoming as (
  select
    tour_date_id,
    string_agg(notes, E'\n\n') as notes
  from (
    select
      s.tour_date_id,
      nullif(btrim(s.notes), '') as notes
    from shows s
    where s.tour_date_id is not null
      and nullif(btrim(s.notes), '') is not null

    union all

    select
      td.id as tour_date_id,
      nullif(btrim(de.notes), '') as notes
    from day_events de
    join tour_dates td
      on td.tour_id = de.tour_id
     and td.date = de.date
    where de.title = '__day_notes__'
      and nullif(btrim(de.notes), '') is not null
  ) sources
  group by tour_date_id
)
update tour_dates td
set notes = case
  when nullif(btrim(td.notes), '') is null then incoming.notes
  when btrim(td.notes) = incoming.notes then td.notes
  else td.notes || E'\n\n' || incoming.notes
end
from incoming
where incoming.tour_date_id = td.id;

-- ---------------------------------------------------------------------------
-- 3. Drop the two that lost.
-- ---------------------------------------------------------------------------

delete from day_events
where title = '__day_notes__';

alter table shows
  drop column notes;
