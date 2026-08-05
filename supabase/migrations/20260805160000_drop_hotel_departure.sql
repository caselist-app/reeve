-- Brief 36 Part 3, decision 3, second half. The destructive one.
--
-- 20260805130000_add_lobby_call.sql added day_sheets.lobby_call and copied
-- hotel_departure into it. Every reader and writer in the app moved to the new
-- name in the same commit, and that commit is merged and deployed to both
-- runtimes. So these two columns now have no reader anywhere:
--
--   hotel_departure  the old name for the same fact, a stale copy since the add
--   lobby_call_at    read by the day timeline, written by nothing, always null
--
-- deploy-order: this is the drop half of an expand-and-contract, and the wait it
-- exists for has already happened. The code that stopped reading these columns
-- shipped with the previous commit, and CI deploys Trigger.dev on merge to main,
-- so both runtimes were running it before this file existed. That matters more
-- than usual here: lib/ai/context.ts selects the day sheet and is reached from
-- the WhatsApp routers, which run on Trigger.dev and nowhere else, which is the
-- exact path that took /itinerary down on 2026-08-04.
--
-- Nothing to back up. lobby_call_at never had a writer in the repo's history, so
-- every value is null, and hotel_departure's data was copied to lobby_call
-- before anything started writing the new column.

alter table day_sheets
  drop column hotel_departure;

alter table day_sheets
  drop column lobby_call_at;
