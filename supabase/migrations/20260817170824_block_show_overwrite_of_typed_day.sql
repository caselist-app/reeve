-- REE-97: create_show_with_dependents rewrote a day's type without asking.
--
-- The upsert in 20260806120000_drop_day_sheets_and_day_events.sql does
-- `on conflict (tour_id, date) do update set day_type = 'show'`
-- unconditionally: a TM who sets a day to Press, then adds a venue to it (via
-- the Edit Day dropdown, or an email extraction confirming a show for a date
-- that already carries a deliberate type), silently loses that classification
-- with no warning and no record of what it used to be. This is the exact
-- inverse of the guarded behaviour on the delete side, where
-- revertDayTypeIfOrphaned (lib/schedule/day-type-revert.ts) works out what a
-- day should become rather than assuming.
--
-- The confirmExtraction path (lib/actions/extractions.ts) is the one that
-- actually surfaces this silently: it calls this RPC once per extracted show
-- with no day-type UI in front of the TM at all, so a Press day the TM set by
-- hand can flip to a show day from a batch confirm.
--
-- Decision (Matt): block. A day already carrying an explicit, non-default
-- type is data the RPC does not get to overwrite on the caller's behalf,
-- mirroring updateTourDate's existing guard the other direction (you must
-- delete the show or rehearsal before changing a day away from it). 'day_off'
-- is the only type a show may silently claim, since a day off carries no
-- decision to lose; 'show' is left in place too, since a second show on a
-- show day is additive, not a type change (a day can carry more than one).
-- Every other type ('rehearsal', 'travel', 'press') now blocks with a message
-- telling the TM to change the day to a day off first, the same explicit
-- second step the delete-side guard already asks for.
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
  v_tour_date_id  uuid;
  v_show_id       uuid;
  v_existing_type text;
  v_type_label    text;
begin
  if not owns_tour(p_tour_id) then
    raise exception 'Not authorized';
  end if;

  select day_type into v_existing_type
  from tour_dates
  where tour_id = p_tour_id and date = (p_show_data->>'date')::date;

  if v_existing_type is not null and v_existing_type not in ('day_off', 'show') then
    v_type_label := case v_existing_type
      when 'rehearsal' then 'Rehearsal'
      when 'travel'    then 'Travel'
      when 'press'     then 'Press'
      else initcap(v_existing_type)
    end;
    raise exception '% is already a % day. Change it to a day off first, then add the show.',
      to_char((p_show_data->>'date')::date, 'FMMonth FMDD'), v_type_label;
  end if;

  -- Upsert the tour_dates row. If a row already exists for this (tour, date),
  -- it is 'day_off' or already 'show' (blocked above otherwise), so setting
  -- day_type to 'show' is always safe here. If it does not exist, create it.
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
