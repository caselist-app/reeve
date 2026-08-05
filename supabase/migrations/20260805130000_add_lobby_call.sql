-- Brief 36 Part 3, decision 3: lobby call is the term, so it is the column name.
--
-- day_sheets holds two columns for one real-world event. lobby_call_at is read
-- by the day timeline and written by nothing at all, so it is always null and
-- its card never renders. hotel_departure is fully wired (validator, both
-- forms, the writer, the timeline, the AI context) and holds the same fact:
-- when the party leaves the hotel.
--
-- Matt's call, 2026-08-04: lobby call is what a TM says, and
-- lib/comms/notify/types.ts already calls the event lobby_call. Renaming the
-- column rather than relabelling the input puts the right word in the data as
-- well as on the screen.
--
-- THIS MIGRATION IS THE FIRST OF TWO, AND THE SPLIT IS THE POINT.
--
-- A rename in one statement has no safe moment to run. Before the deploy, the
-- running code reads hotel_departure and the column has gone. After the deploy,
-- the running code reads lobby_call and the column does not exist yet. Either
-- way the day view and the crew Q&A context break for however long the gap is,
-- and the gap is a deploy, not a second. That is the same shape as the change
-- that told a crew member their tour had no shows on 2026-08-04, and the
-- deploy-order rule does not fix it, because there is no order that works.
--
-- So this one only adds. It is safe to apply at any time, before or after the
-- code that uses it ships, because the old column is untouched and old code
-- keeps working from it. 20260805140000_drop_hotel_departure.sql does the
-- destructive half, and only lands once both runtimes have been running the new
-- code long enough to be sure.

alter table day_sheets
  add column lobby_call timestamptz;

-- Carry every value across. hotel_departure keeps its copy until the second
-- migration drops it, so this is a copy rather than a move and nothing depends
-- on which of the two ran first.
update day_sheets
set lobby_call = hotel_departure
where hotel_departure is not null;
