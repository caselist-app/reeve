-- shows: one row per date on the tour.
-- The hub resolution cache columns (transport_hub_iata, transport_hub_rail,
-- hub_ground_minutes, hub_resolved_at) are written by lib/logistics/hub-resolver
-- and are the key input to the logistics planner. They are cached indefinitely
-- until the venue address changes.
-- tech_pack_document_id FK is added in the documents migration once that table exists.
create table shows (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  date date not null,
  venue_name text not null,
  address text,
  venue_type text check (venue_type in ('club', 'theatre', 'arena', 'festival', 'outdoor', 'other')),
  capacity integer,
  load_in_at timestamptz,
  curfew_at timestamptz,
  stage_dimensions text,
  parking text,
  shore_power text,
  union_stage boolean,
  stagehands integer,
  dressing_rooms text,
  production_office boolean,
  showers boolean,
  house_pa_spec text,
  house_lighting_plot text,
  tech_pack_document_id uuid,
  -- venue hub resolution cache
  transport_hub_iata text,
  transport_hub_rail text,
  hub_ground_minutes integer,
  hub_resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on shows(tour_id, date);
alter table shows enable row level security;

create policy "owner reads shows" on shows
  for select using (owns_tour(tour_id));

create policy "owner writes shows" on shows
  for all using (owns_tour(tour_id))
  with check (owns_tour(tour_id));

-- show_advance: advance status per department, one row per show.
-- Automation can nudge these toward done (e.g. when a rider is acknowledged)
-- but never force them. The TM always has final say.
create table show_advance (
  show_id uuid primary key references shows(id) on delete cascade,
  tour_id uuid not null references tours(id) on delete cascade,
  status_audio text not null default 'not_started'
    check (status_audio in ('not_started', 'in_progress', 'done')),
  status_lighting text not null default 'not_started'
    check (status_lighting in ('not_started', 'in_progress', 'done')),
  status_staging text not null default 'not_started'
    check (status_staging in ('not_started', 'in_progress', 'done')),
  status_hospitality text not null default 'not_started'
    check (status_hospitality in ('not_started', 'in_progress', 'done')),
  status_travel text not null default 'not_started'
    check (status_travel in ('not_started', 'in_progress', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table show_advance enable row level security;

create policy "owner reads show_advance" on show_advance
  for select using (owns_tour(tour_id));

create policy "owner writes show_advance" on show_advance
  for all using (owns_tour(tour_id))
  with check (owns_tour(tour_id));

-- day_sheets: the minute-by-minute schedule for a show day.
-- These are the source data for the morning WhatsApp message to crew.
create table day_sheets (
  show_id uuid primary key references shows(id) on delete cascade,
  tour_id uuid not null references tours(id) on delete cascade,
  venue_access timestamptz,
  load_in timestamptz,
  line_check timestamptz,
  soundcheck timestamptz,
  vip timestamptz,
  doors timestamptz,
  support_on timestamptz,
  support_off timestamptz,
  changeover timestamptz,
  headliner_on timestamptz,
  headliner_off timestamptz,
  curfew timestamptz,
  load_out timestamptz,
  hotel_departure timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table day_sheets enable row level security;

create policy "owner reads day_sheets" on day_sheets
  for select using (owns_tour(tour_id));

create policy "owner writes day_sheets" on day_sheets
  for all using (owns_tour(tour_id))
  with check (owns_tour(tour_id));
