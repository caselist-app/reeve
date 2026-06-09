-- people: one table for everyone on tour (artist, crew, management, support).
-- dietary and allergies live here and ONLY here. Never duplicate onto riders.
-- home_city is the logistics planner's default "from" when someone joins fresh.
-- The unique index on (tour_id, whatsapp_number) is how inbound WhatsApp messages
-- are mapped back to a person without them ever identifying themselves.
create table people (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  person_type text not null check (person_type in ('artist', 'crew', 'management', 'support')),
  name text not null,
  role text,
  photo_url text,
  contact_email text,
  contact_phone text,
  preferred_channel text check (preferred_channel in ('whatsapp', 'sms')),
  whatsapp_number text,
  sms_number text,
  emergency_contact_name text,
  emergency_contact_phone text,
  dietary text,
  allergies text,
  home_city text,
  passport_number text,
  passport_expiry date,
  passport_country text,
  tshirt_size text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on people(tour_id);
create index on people(tour_id, person_type);
create unique index on people(tour_id, whatsapp_number) where whatsapp_number is not null;

alter table people enable row level security;

create policy "owner reads people" on people
  for select using (owns_tour(tour_id));

create policy "owner writes people" on people
  for all using (owns_tour(tour_id))
  with check (owns_tour(tour_id));

-- crew_detail: operational rates for crew members.
-- per_diem_rate and daily_wage_rate are in scope early (settlement, per diem).
-- Hotel and transport rates are lower priority and live elsewhere.
create table crew_detail (
  person_id uuid primary key references people(id) on delete cascade,
  tour_id uuid not null references tours(id) on delete cascade,
  per_diem_rate numeric(10, 2),
  per_diem_currency text,
  daily_wage_rate numeric(10, 2),
  wage_currency text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table crew_detail enable row level security;

create policy "owner reads crew_detail" on crew_detail
  for select using (owns_tour(tour_id));

create policy "owner writes crew_detail" on crew_detail
  for all using (owns_tour(tour_id))
  with check (owns_tour(tour_id));
