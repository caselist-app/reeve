-- Brief 42 step 8 (REE-23): the contract half. Drop day_sheets and day_events.
--
-- 20260805170000_create_day_items.sql was the EXPAND half. It added day_items,
-- moved every stored time into it with backfill_day_items(), and moved
-- catering_type onto shows. Nothing was removed there, so it was safe to apply
-- before or after the code shipped. This is the file that finally removes the
-- two old tables, and the function that fed the new one from them.
--
-- Every reader and writer moved to day_items in Brief 42, merged to main
-- (REE-19 f3d4dfc and the day-item work that followed it). Since then day_sheets
-- and day_events have had no reader and no writer anywhere in the app:
--
--   day_sheets   the old twenty-column-per-show shape, superseded by day_items
--   day_events   the old freeform-by-date shape, superseded by day_items
--
-- deploy-order: this drops two tables, so it carries the marker. The wait it
-- exists for has already happened. The code that stopped reading these tables
-- shipped with Brief 42 and CI deploys Trigger.dev on merge to main, so both
-- runtimes were running it well before this file existed. That split is the one
-- that took /itinerary down on 2026-08-04: the crew-facing reads (/itinerary,
-- the AI context) run only on Trigger.dev, which deploys separately from Vercel,
-- and a table dropped before that runtime caught up fails there while Vercel
-- looks healthy. It has caught up: lib/schedule, lib/ai/context and lib/comms
-- all read day_items now, and the integration suite proves every surface agrees.

-- ---------------------------------------------------------------------------
-- 1. Stop the create-show RPC seeding an empty day_sheets row.
-- ---------------------------------------------------------------------------

-- Identical to the definition in 20260804190000_collapse_show_times_into_day_sheet.sql
-- except that the `insert into day_sheets` is gone: a show's times are day_items
-- rows now, added by the TM from the day view, not a placeholder row created with
-- the show. This must be redefined before day_sheets is dropped, or the function
-- keeps a reference to a table that no longer exists.
create or replace function create_show_with_dependents(
  p_tour_id  uuid,
  p_show_data jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tour_date_id uuid;
  v_show_id      uuid;
begin
  if not owns_tour(p_tour_id) then
    raise exception 'Not authorized';
  end if;

  -- Upsert the tour_dates row. If a row already exists for this (tour, date),
  -- set day_type to 'show' and return its id. If it does not exist, create it.
  insert into tour_dates (tour_id, date, day_type)
  values (p_tour_id, (p_show_data->>'date')::date, 'show')
  on conflict (tour_id, date) do update set day_type = 'show'
  returning id into v_tour_date_id;

  insert into shows (
    tour_id,
    tour_date_id,
    date,
    venue_name,
    address,
    venue_type,
    capacity,
    stage_dimensions,
    parking,
    shore_power,
    union_stage,
    stagehands,
    dressing_rooms,
    production_office,
    showers,
    house_pa_spec,
    house_lighting_plot
  ) values (
    p_tour_id,
    v_tour_date_id,
    (p_show_data->>'date')::date,
    p_show_data->>'venue_name',
    nullif(p_show_data->>'address', ''),
    nullif(p_show_data->>'venue_type', ''),
    (p_show_data->>'capacity')::integer,
    nullif(p_show_data->>'stage_dimensions', ''),
    nullif(p_show_data->>'parking', ''),
    nullif(p_show_data->>'shore_power', ''),
    (p_show_data->>'union_stage')::boolean,
    (p_show_data->>'stagehands')::integer,
    nullif(p_show_data->>'dressing_rooms', ''),
    (p_show_data->>'production_office')::boolean,
    (p_show_data->>'showers')::boolean,
    nullif(p_show_data->>'house_pa_spec', ''),
    nullif(p_show_data->>'house_lighting_plot', '')
  )
  returning id into v_show_id;

  insert into show_advance (show_id, tour_id)
  values (v_show_id, p_tour_id);

  return v_show_id;
end;
$$;

-- Restated for the same reason the previous definition restated them: CREATE OR
-- REPLACE keeps the existing ACL, so these are a no-op today, and stating them
-- keeps the grants visible in the migration that last touched the function.
revoke execute on function create_show_with_dependents(uuid, jsonb) from public;
revoke execute on function create_show_with_dependents(uuid, jsonb) from anon;
grant execute on function create_show_with_dependents(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Drop the one-time backfill function.
-- ---------------------------------------------------------------------------

-- backfill_day_items read day_sheets and day_events to fill day_items, and ran
-- once from the expand migration. It has no caller left and reads two tables
-- that are about to go. Dropped explicitly rather than left to break silently:
-- a plpgsql body is not dependency-tracked, so dropping the tables would leave
-- this function in place, compiling until the first call, which is the failure
-- mode this repo has been bitten by before.
drop function if exists backfill_day_items(uuid);

-- ---------------------------------------------------------------------------
-- 3. Drop the tables.
-- ---------------------------------------------------------------------------

-- Their RLS policies, indexes and set_updated_at triggers drop with them. Cascade
-- is defensive: nothing is known to depend on either table, and if something
-- did, this surfaces it here rather than in the next migration.
drop table if exists day_sheets cascade;
drop table if exists day_events cascade;
