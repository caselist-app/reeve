-- Update create_show_with_dependents to also upsert the tour_dates row
-- and wire shows.tour_date_id. Upsert on the unique (tour_id, date) constraint
-- so creating a show on a date that already has a tour_dates row works cleanly.

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
    v_tour_date_id,
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

  insert into show_advance (show_id, tour_id)
  values (v_show_id, p_tour_id);

  insert into day_sheets (show_id, tour_id)
  values (v_show_id, p_tour_id);

  return v_show_id;
end;
$$;
