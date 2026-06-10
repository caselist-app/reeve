-- broadcast_log: one row per person per broadcast send.
-- change_type mirrors ChangeDescriptor.type from lib/comms/affected.ts.
-- wamid is the Meta WhatsApp message ID, used to match delivery/read
-- receipt webhooks back to the log row. Null when sent via Twilio fallback.
-- delivered_at and read_at are written by the inbound webhook status handler.
create table broadcast_log (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  change_type text not null,
  message text not null,
  wamid text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index on broadcast_log(tour_id, person_id);
-- Sparse index: wamid is null for non-Meta sends, so only index present values.
create index on broadcast_log(wamid) where wamid is not null;

alter table broadcast_log enable row level security;

create policy "owner reads broadcast_log" on broadcast_log
  for select using (owns_tour(tour_id));

create policy "owner creates broadcast_log" on broadcast_log
  for insert with check (owns_tour(tour_id));

-- Service role (Trigger.dev jobs) writes rows and sets delivery/read timestamps.
-- authenticated role is for direct TM reads via the RLS policy above.
grant select, insert, update on broadcast_log to authenticated;
grant select, insert, update on broadcast_log to service_role;
