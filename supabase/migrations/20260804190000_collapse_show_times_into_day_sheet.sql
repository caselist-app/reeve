-- Brief 36 step 3: collapse shows.load_in_at and shows.curfew_at into the day
-- sheet, so a show has one load-in and one curfew rather than two of each.
--
-- shows.load_in_at and day_sheets.load_in both meant "when is load-in". The show
-- page's Venue tab wrote the first, its Schedule tab and the day view's show
-- panel wrote the second, and nothing synced them. The split in the consumers was
-- the dangerous part: the logistics planner's feasibility ranking, the AI tour
-- context, broadcast change alerts and the /itinerary reply sent to crew all read
-- the show column, while the timeline the TM looks at read the day sheet. So a
-- crew member could be sent a load-in time the TM could not see anywhere on their
-- schedule, and no amount of care in the application code closed that, because
-- both columns were writable and neither was derived.
--
-- Matt's call, 2026-08-04: a show has times, the day sheet is those times, and
-- everything else feeds off it.
--
-- ORDER MATTERS HERE. Backfill first, so no TM's data is dropped with the
-- columns. Replace the function second, because it inserts both columns and would
-- break the moment they are gone. Drop last. Every reader and writer in the
-- application was repointed before this migration was written, and the build is
-- clean without these columns; dropping them before that code ships would break
-- production the moment it applied.

-- ---------------------------------------------------------------------------
-- 1. Backfill, so the collapse does not lose a time a TM entered.
-- ---------------------------------------------------------------------------

-- Only where the day sheet has nothing. Where both hold a value the day sheet
-- wins, because it is the surviving source of truth and the one the day view has
-- been writing, so it holds the more recent edit in every case a TM would
-- recognise.
--
-- The instant is copied as-is rather than re-derived against the show's date.
-- Day-sheet times are normally pinned to the show's own date, and shows.load_in_at
-- was a free timestamptz that could sit on any date, so a copied value can land
-- off the show's day. That is the TM's own data and keeping it beats discarding
-- it; the timeline will show it where it actually is, which is the visible,
-- correctable outcome rather than the silent one.
update day_sheets ds
set load_in = s.load_in_at
from shows s
where ds.show_id = s.id
  and ds.load_in is null
  and s.load_in_at is not null;

update day_sheets ds
set curfew = s.curfew_at
from shows s
where ds.show_id = s.id
  and ds.curfew is null
  and s.curfew_at is not null;

-- A show with no day_sheets row at all cannot be backfilled by the statements
-- above. create_show_with_dependents has always inserted one, so this is the
-- defensive case rather than the expected one, but a row created by any other
-- path would otherwise lose its times silently, which is the exact failure mode
-- this brief exists to remove.
insert into day_sheets (show_id, tour_id, load_in, curfew)
select s.id, s.tour_id, s.load_in_at, s.curfew_at
from shows s
where not exists (select 1 from day_sheets ds where ds.show_id = s.id)
  and (s.load_in_at is not null or s.curfew_at is not null);

-- ---------------------------------------------------------------------------
-- 2. Replace the function, which inserts both columns today.
-- ---------------------------------------------------------------------------

-- Identical to 20260611210000_update_create_show_rpc.sql except that load_in_at
-- and curfew_at are gone from the column list and the values list. It still
-- inserts the empty day_sheets row, which is where a show's times now go, and the
-- timeline's placeholder card (Brief 36 step 4) is what makes a show with no times
-- reachable from the day view.
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

  insert into day_sheets (show_id, tour_id)
  values (v_show_id, p_tour_id);

  return v_show_id;
end;
$$;

-- Restated rather than assumed. CREATE OR REPLACE keeps the existing ACL, so
-- these are a no-op today, and stating them means the grants for this function
-- are visible in the migration that last touched it instead of only in
-- 20260617110000_revoke_function_public_grants.sql. A future replace that does
-- reset them cannot then quietly reopen the /rpc/ endpoint to anon.
revoke execute on function create_show_with_dependents(uuid, jsonb) from public;
revoke execute on function create_show_with_dependents(uuid, jsonb) from anon;
grant execute on function create_show_with_dependents(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Drop the columns, now that nothing reads or writes them.
-- ---------------------------------------------------------------------------

alter table shows drop column load_in_at;
alter table shows drop column curfew_at;
