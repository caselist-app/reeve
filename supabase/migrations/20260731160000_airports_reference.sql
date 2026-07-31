-- Brief 31 follow-up: ranked airport search for the "Find by route" step's
-- From/To fields (searchable by IATA code or city name, e.g. "London" ->
-- LHR), matching the same cached-reference pattern airlines_reference
-- already uses for the Airline field. Seeded from AirLabs' airports
-- endpoint (see seed-airports-reference.ts).
--
-- iata_code is not null here (unlike airlines_reference.iata_code): an
-- airport with no IATA code can never be used as a route search's dep_iata
-- or arr_iata, so the seed job filters those out before insert and there is
-- no reason to store them at all.

create table airports_reference (
  id uuid primary key default gen_random_uuid(),
  iata_code text not null,
  icao_code text,
  name text not null,
  city text,
  country_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on airports_reference(iata_code);
create index on airports_reference(city);

-- Reference data, not tour-scoped, same rationale as airlines_reference.
alter table airports_reference enable row level security;

create policy "authenticated reads airports_reference" on airports_reference
  for select using (true);

grant select on airports_reference to authenticated;
grant select, insert, update, delete on airports_reference to service_role;

create trigger set_updated_at before update on airports_reference
  for each row execute function set_updated_at();
