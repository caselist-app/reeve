-- ai_call_log: append-only log of every Claude inference call.
-- Used to verify the per-tour cost target (under $5/active tour/month).
-- trigger_case is one of: crew_qa, email_extraction, logistics_synthesis.
-- Writes come exclusively from the AI layer via the service role client.
-- The TM can read their own tour's log; no one may update or delete rows.
create table ai_call_log (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  model text not null,
  trigger_case text not null check (trigger_case in ('crew_qa', 'email_extraction', 'logistics_synthesis')),
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  duration_ms integer not null default 0,
  created_at timestamptz not null default now()
);

create index on ai_call_log(tour_id, created_at desc);
alter table ai_call_log enable row level security;

create policy "owner reads ai_call_log" on ai_call_log
  for select using (owns_tour(tour_id));
