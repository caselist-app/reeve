-- attention_items: the enrichment feed. V1 ships the table empty so the
-- desktop home screen has its shape from day one. V2 Trigger.dev jobs
-- populate it (passport expiry, routing conflicts, visa gaps, rider issues).
-- related_table and related_id provide a deep-link target to the source record.
-- Resolved items are soft-deleted via resolved_at, never hard-deleted.
create table attention_items (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  kind text not null,
  severity smallint not null default 3,
  title text not null,
  detail text,
  related_table text,
  related_id uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index on attention_items(tour_id, resolved_at, severity desc);
alter table attention_items enable row level security;

create policy "owner reads attention" on attention_items
  for select using (owns_tour(tour_id));

create policy "owner writes attention" on attention_items
  for all using (owns_tour(tour_id))
  with check (owns_tour(tour_id));
