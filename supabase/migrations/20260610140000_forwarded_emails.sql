-- forwarded_emails: raw emails forwarded by the TM to the per-tour inbound address.
-- Claude proposes structured rows (proposed_rows); nothing lands in the spine
-- until the TM confirms each row through the extraction UI.
-- extraction_status tracks the lifecycle: pending -> extracted -> confirmed | failed.
create table forwarded_emails (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  from_address text,
  subject text,
  body_text text,
  attachments_json jsonb not null default '[]',   -- [{filename, storage_path}]
  extraction_status text not null default 'pending'
    check (extraction_status in ('pending', 'extracted', 'confirmed', 'failed')),
  proposed_rows jsonb,    -- Claude's extracted output, stored pre-confirmation
  created_at timestamptz not null default now()
);

create index on forwarded_emails(tour_id, extraction_status);

alter table forwarded_emails enable row level security;

create policy "owner reads forwarded_emails" on forwarded_emails
  for select using (owns_tour(tour_id));

create policy "owner updates forwarded_emails" on forwarded_emails
  for update using (owns_tour(tour_id));

-- Service role (Trigger.dev jobs) writes rows and updates extraction_status.
grant select, insert, update on forwarded_emails to authenticated;
grant select, insert, update on forwarded_emails to service_role;
grant usage, select on all sequences in schema public to authenticated;
grant usage, select on all sequences in schema public to service_role;
