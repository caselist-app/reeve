-- tours: add timezone column.
-- Stored as an IANA timezone name (e.g. Europe/London, America/New_York).
-- Used by the day sheet server action to combine relative time strings
-- (e.g. "09:00") with the show date before storing as timestamptz.
alter table tours add column timezone text;

-- create_show_with_dependents: atomic show creation.
-- Inserts show, show_advance, and day_sheets in a single transaction.
-- Using an RPC here instead of three sequential client calls prevents the
-- window where a show row exists without its dependents if a call fails mid-way.
-- SECURITY DEFINER so the function runs as the owner and can perform all three
-- inserts. owns_tour() is checked first; an exception is raised immediately if
-- the caller does not own the tour, preventing any write.
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
  v_show_id uuid;
begin
  if not owns_tour(p_tour_id) then
    raise exception 'Not authorized';
  end if;

  insert into shows (
    tour_id,
    date,
    venue_name,
    address,
    venue_type,
    capacity,
    load_in_at,
    curfew_at,
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
    (p_show_data->>'date')::date,
    p_show_data->>'venue_name',
    nullif(p_show_data->>'address', ''),
    nullif(p_show_data->>'venue_type', ''),
    (p_show_data->>'capacity')::integer,
    (p_show_data->>'load_in_at')::timestamptz,
    (p_show_data->>'curfew_at')::timestamptz,
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

  -- show_advance defaults all five department statuses to 'not_started' via DB defaults.
  insert into show_advance (show_id, tour_id)
  values (v_show_id, p_tour_id);

  -- day_sheets starts empty; all time fields are null until the TM fills them in.
  insert into day_sheets (show_id, tour_id)
  values (v_show_id, p_tour_id);

  return v_show_id;
end;
$$;
