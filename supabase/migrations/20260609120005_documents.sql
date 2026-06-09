-- documents: metadata for files stored in Supabase Storage.
-- storage_path is the path inside the Storage bucket; the file itself
-- is never stored in the database row.
-- is_current lets us version a document without losing old copies.
create table documents (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  doc_type text not null,
  title text not null,
  version integer not null default 1,
  storage_path text not null,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on documents(tour_id, doc_type);
alter table documents enable row level security;

create policy "owner reads documents" on documents
  for select using (owns_tour(tour_id));

create policy "owner writes documents" on documents
  for all using (owns_tour(tour_id))
  with check (owns_tour(tour_id));

-- document_shares: the append-only read-receipt ledger.
-- Drives both advance status (acknowledged -> nudge show_advance) and comms
-- (who has seen what). One row per recipient per document send.
-- IMPORTANT: no owner update or delete policy. State advances via the
-- service-role Resend webhook handler only. The TM cannot edit these rows.
-- share_token is the tracked link token embedded in outbound emails.
create table document_shares (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  recipient_person_id uuid not null references people(id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp', 'sms')),
  share_token text not null unique,
  sent_at timestamptz,
  opened_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

create index on document_shares(tour_id, document_id);
create index on document_shares(share_token);
alter table document_shares enable row level security;

create policy "owner reads shares" on document_shares
  for select using (owns_tour(tour_id));

create policy "owner creates shares" on document_shares
  for insert with check (owns_tour(tour_id));

-- Deferred foreign keys: these tables now exist so we can wire up the FKs
-- that were declared as plain uuid columns in earlier migrations.
alter table shows
  add constraint shows_tech_pack_document_id_fkey
  foreign key (tech_pack_document_id) references documents(id) on delete set null;

alter table transport_assignments
  add constraint transport_assignments_boarding_pass_document_id_fkey
  foreign key (boarding_pass_document_id) references documents(id) on delete set null;
