-- Brief 19: Dates as spine.
-- Introduces tour_dates as the primary entity. Everything hangs off a date.
-- show -> tour_date (not the other way around)
-- transport_segments and hotel_stays get an optional tour_date_id FK.
-- rehearsals is a new table for non-show days with a location.
-- day_sheets gains lobby_call_at.

-- ---------------------------------------------------------------------------
-- 1. tour_dates
-- ---------------------------------------------------------------------------

create table tour_dates (
  id          uuid primary key default gen_random_uuid(),
  tour_id     uuid not null references tours(id) on delete cascade,
  date        date not null,
  day_type    text not null default 'day_off'
                check (day_type in ('show', 'rehearsal', 'travel', 'press', 'day_off')),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(tour_id, date)
);

create index on tour_dates(tour_id, date);
alter table tour_dates enable row level security;

create policy "owner reads tour_dates" on tour_dates
  for select using (owns_tour(tour_id));

create policy "owner writes tour_dates" on tour_dates
  for all using (owns_tour(tour_id))
  with check (owns_tour(tour_id));

grant select, insert, update, delete on tour_dates to service_role;

-- ---------------------------------------------------------------------------
-- 2. rehearsals
-- ---------------------------------------------------------------------------

create table rehearsals (
  id             uuid primary key default gen_random_uuid(),
  tour_id        uuid not null references tours(id) on delete cascade,
  tour_date_id   uuid not null references tour_dates(id) on delete cascade,
  location_name  text not null,
  address        text,
  google_maps_url text,
  start_at       timestamptz,
  end_at         timestamptz,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index on rehearsals(tour_id, tour_date_id);
alter table rehearsals enable row level security;

create policy "owner reads rehearsals" on rehearsals
  for select using (owns_tour(tour_id));

create policy "owner writes rehearsals" on rehearsals
  for all using (owns_tour(tour_id))
  with check (owns_tour(tour_id));

grant select, insert, update, delete on rehearsals to service_role;

-- ---------------------------------------------------------------------------
-- 3. Link shows to tour_dates
-- ---------------------------------------------------------------------------

-- Add nullable first so the backfill can run.
alter table shows add column tour_date_id uuid references tour_dates(id) on delete cascade;

-- Backfill: for each distinct (tour_id, date) pair in shows, create a
-- tour_dates row with day_type = 'show', then wire up shows.tour_date_id.
with inserted as (
  insert into tour_dates (tour_id, date, day_type)
  select distinct tour_id, date, 'show'
  from shows
  on conflict (tour_id, date) do update set day_type = 'show'
  returning id, tour_id, date
)
update shows s
set tour_date_id = i.id
from inserted i
where i.tour_id = s.tour_id
  and i.date    = s.date;

-- Now enforce not null. Every show must have a date.
alter table shows alter column tour_date_id set not null;

-- ---------------------------------------------------------------------------
-- 4. lobby_call_at on day_sheets
-- ---------------------------------------------------------------------------

alter table day_sheets add column lobby_call_at timestamptz;

-- ---------------------------------------------------------------------------
-- 5. Optional tour_date_id on transport_segments
-- ---------------------------------------------------------------------------

alter table transport_segments
  add column tour_date_id uuid references tour_dates(id) on delete set null;

create index on transport_segments(tour_date_id);

-- ---------------------------------------------------------------------------
-- 6. Optional tour_date_id on hotel_stays
-- ---------------------------------------------------------------------------

alter table hotel_stays
  add column tour_date_id uuid references tour_dates(id) on delete set null;

create index on hotel_stays(tour_date_id);

-- ---------------------------------------------------------------------------
-- 7. updated_at triggers for new tables
-- ---------------------------------------------------------------------------

create trigger set_updated_at
  before update on tour_dates
  for each row execute procedure set_updated_at();

create trigger set_updated_at
  before update on rehearsals
  for each row execute procedure set_updated_at();
