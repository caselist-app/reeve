-- Freeform timeline events: meals, press calls, meetings, after shows, etc.
-- starts_at is nullable so that __day_notes__ sentinel rows (used by the day
-- info panel notes field) can be stored without a time value.
create table day_events (
  id         uuid        primary key default gen_random_uuid(),
  tour_id    uuid        not null references tours(id) on delete cascade,
  show_id    uuid        references shows(id) on delete set null,
  date       date        not null,
  starts_at  timestamptz,
  ends_at    timestamptz,
  title      text        not null,
  location   text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table day_events enable row level security;

create policy "owner can manage day_events"
  on day_events for all
  using  (owns_tour(tour_id))
  with check (owns_tour(tour_id));

grant all on day_events to authenticated;

-- Trigger to keep updated_at current.
create trigger set_updated_at
  before update on day_events
  for each row execute function set_updated_at();

-- Notes field on shows for the day info panel inline editor.
alter table shows add column if not exists notes text;
