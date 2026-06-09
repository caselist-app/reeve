-- hotel_stays: one row per hotel block.
-- parking_json holds bus/truck/car availability; used as a hard filter in the
-- planner (not a nice-to-have). room_types_json holds the block breakdown.
-- negotiated_rate is display-only in V1 (financial planning, lower priority).
create table hotel_stays (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  city text,
  name text,
  address text,
  phone text,
  check_in_date date,
  check_in_time time,
  check_out_date date,
  check_out_time time,
  room_block_size integer,
  room_types_json jsonb not null default '{}',
  negotiated_rate numeric(10, 2),
  rate_currency text,
  confirmation_number text,
  late_checkout boolean,
  parking_json jsonb not null default '{}',
  wifi_network text,
  wifi_password text,
  property_contact text,
  incidentals_policy text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on hotel_stays(tour_id, check_in_date);
alter table hotel_stays enable row level security;

create policy "owner reads hotels" on hotel_stays
  for select using (owns_tour(tour_id));

create policy "owner writes hotels" on hotel_stays
  for all using (owns_tour(tour_id))
  with check (owns_tour(tour_id));

-- room_assignments: one row per person per stay.
-- room_tier splits artist and crew rooms within the same hotel block.
-- sharing_with is a self-reference for room-share tracking.
create table room_assignments (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  hotel_stay_id uuid not null references hotel_stays(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  room_tier text not null check (room_tier in ('artist', 'crew')),
  room_type text,
  sharing_with uuid references people(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on room_assignments(tour_id, person_id);
alter table room_assignments enable row level security;

create policy "owner reads rooms" on room_assignments
  for select using (owns_tour(tour_id));

create policy "owner writes rooms" on room_assignments
  for all using (owns_tour(tour_id))
  with check (owns_tour(tour_id));
