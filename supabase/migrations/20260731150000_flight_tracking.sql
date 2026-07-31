-- Brief 31: flight search, add, and live tracking via AirLabs.
--
-- Adds live-tracking fields to transport_segments (mode='flight' rows only,
-- but kept as plain nullable columns rather than a separate table since
-- transport_segments is already the one-table-per-mode shape used everywhere
-- else). flight_status is deliberately separate from the existing
-- booking-lifecycle `status` column: `status` tracks whether the TM has
-- booked/ticketed the segment, `flight_status` tracks what the airline is
-- reporting right now. Never conflate the two.
--
-- Also adds airlines_reference, a small cached lookup table seeded from
-- AirLabs' airlines endpoint (see Commit 2), used by the Add Flight search
-- step so airline matching is instant and never round-trips to AirLabs per
-- keystroke.

alter table transport_segments
  add column origin_iata text,
  add column destination_iata text,
  add column flight_status text
    check (flight_status in ('scheduled', 'delayed', 'cancelled', 'departed', 'landed')),
  add column actual_depart_at timestamptz,
  add column actual_arrive_at timestamptz,
  add column gate text,
  add column terminal text,
  add column last_tracked_at timestamptz;

-- transport_segments already has RLS enabled and owner policies from its
-- original migration (20260609120003_transport.sql); new columns on an
-- existing table need no new grants or policies.

create table airlines_reference (
  id uuid primary key default gen_random_uuid(),
  iata_code text,
  icao_code text,
  name text not null,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Client-side search filters this table by iata/icao/name substring, so index
-- all three even though Postgres text search isn't the bottleneck here; the
-- table is small (a few thousand rows) and read in full by the seed/refresh
-- job, not queried live per keystroke.
create index on airlines_reference(iata_code);
create index on airlines_reference(icao_code);

-- Reference data, not tour-scoped: no tour_id, no owns_tour policy. Every
-- authenticated account reads the same cached airline list. RLS is still
-- enabled per the project-wide rule; the policy just isn't ownership-scoped
-- because there is no owner.
alter table airlines_reference enable row level security;

create policy "authenticated reads airlines_reference" on airlines_reference
  for select using (true);

-- Writes come only from the seed/refresh job (service role). Per project
-- convention, every new table gets explicit grants for both roles rather
-- than relying on the catch-all default-privileges migration.
grant select on airlines_reference to authenticated;
grant select, insert, update, delete on airlines_reference to service_role;

create trigger set_updated_at before update on airlines_reference
  for each row execute function set_updated_at();
