-- REE-213: let create_show_with_dependents write venue_lat/venue_lng when the
-- TM picked the venue from Places Autocomplete (REE-212 already captures them
-- client-side; lib/actions/shows.ts and lib/validators/show.ts carry them
-- through as p_show_data.lat / p_show_data.lng). Both columns already exist
-- (20260609120010_shows_geocode_hotel_status.sql) and are already writable by
-- the resolve-hub job, so this is additive: no new column, no rename, no drop,
-- just two more keys read out of the same jsonb payload the RPC already reads.
--
-- updateShow needs no equivalent migration: it writes to shows directly with
-- .update(), not through this RPC, so lib/actions/shows.ts maps lat/lng to
-- venue_lat/venue_lng itself.
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
    house_lighting_plot,
    venue_lat,
    venue_lng
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
    nullif(p_show_data->>'house_lighting_plot', ''),
    (p_show_data->>'lat')::double precision,
    (p_show_data->>'lng')::double precision
  )
  returning id into v_show_id;

  insert into show_advance (show_id, tour_id)
  values (v_show_id, p_tour_id);

  return v_show_id;
end;
$$;

-- Restated for the same reason every prior redefinition restated them: CREATE OR
-- REPLACE keeps the existing ACL, so these are a no-op today, and stating them
-- keeps the grants visible in the migration that last touched the function.
revoke execute on function create_show_with_dependents(uuid, jsonb) from public;
revoke execute on function create_show_with_dependents(uuid, jsonb) from anon;
grant execute on function create_show_with_dependents(uuid, jsonb) to authenticated, service_role;
