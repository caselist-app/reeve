-- transport_segments: one table for all modes of travel (bus, truck, flight,
-- rail, ground, hire). mode is the discriminator.
-- CRITICAL: status defaults to 'planned'. The logistics planner only ever
-- writes 'planned'. The TM promotes to 'booked' after booking off-platform
-- and pasting the reference. Nothing in the codebase may auto-set 'booked'.
-- source_provider, door_to_site_at, and book_url are set when written from
-- a ranked planner option; null for manually entered segments.
create table transport_segments (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  mode text not null check (mode in ('bus', 'truck', 'flight', 'rail', 'ground', 'hire')),
  origin text,
  destination text,
  depart_at timestamptz,
  arrive_at timestamptz,
  carrier_operator text,
  vehicle_or_flight_no text,
  booking_reference text,
  status text not null default 'planned'
    check (status in ('planned', 'booked', 'ticketed', 'changed', 'cancelled')),
  company text,
  driver_contact text,
  details_json jsonb not null default '{}',
  -- planner provenance
  source_provider text,
  door_to_site_at timestamptz,
  book_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on transport_segments(tour_id, depart_at);
create index on transport_segments(tour_id, status);
alter table transport_segments enable row level security;

create policy "owner reads transport" on transport_segments
  for select using (owns_tour(tour_id));

create policy "owner writes transport" on transport_segments
  for all using (owns_tour(tour_id))
  with check (owns_tour(tour_id));

-- transport_assignments: the many-to-many join between segments and people.
-- Holds per-person travel detail (seat, PNR, boarding pass).
-- boarding_pass_document_id FK is added in the documents migration once that
-- table exists.
-- unique(segment_id, person_id) prevents duplicate assignments.
create table transport_assignments (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  segment_id uuid not null references transport_segments(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  seat text,
  baggage text,
  meal_pref text,
  frequent_flyer_no text,
  known_traveller_no text,
  ticket_reference text,
  boarding_pass_document_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(segment_id, person_id)
);

create index on transport_assignments(tour_id, person_id);
alter table transport_assignments enable row level security;

create policy "owner reads assignments" on transport_assignments
  for select using (owns_tour(tour_id));

create policy "owner writes assignments" on transport_assignments
  for all using (owns_tour(tour_id))
  with check (owns_tour(tour_id));
