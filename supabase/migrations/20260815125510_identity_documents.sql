-- Brief 45: Identity Documents.
--
-- A place to keep passport and visa scans against a contact. Account-scoped,
-- not tour-scoped: a passport belongs to the person, not to whichever tour they
-- are on today, and it should read the same on every tour they work. This is
-- deliberately not `documents` (tour-scoped, RLS via owns_tour, read by
-- sendDocument): identity is never sendable, so keeping it out of that table is
-- what stops a passport ever reaching a send flow.
--
-- All additive: a new table, so it is safe to apply before or after the code
-- ships and there is no -- deploy-order: line.
--
-- account_id is denormalised from contacts.account_id, written server-side from
-- the contact row at insert, never taken from the client. It is both the RLS
-- predicate here and, in the companion bucket migration, the first path segment
-- storage policies check against auth.uid().
create table identity_documents (
  id                uuid        primary key default gen_random_uuid(),
  account_id        uuid        not null references accounts(id) on delete cascade,
  contact_id        uuid        not null references contacts(id) on delete cascade,
  kind              text        not null check (kind in ('passport', 'visa')),
  is_primary        boolean     not null default false,

  storage_path      text        not null,
  file_name         text        not null,
  mime_type         text        not null,
  byte_size         integer     not null,

  document_number   text,
  surname           text,
  given_names       text,
  issuing_country   text,
  issue_date        date,
  expiry_date       date,

  -- Visa-only. issuing_country above is who printed the document; this is which
  -- country it grants entry to, and the two disagree on purpose (a UK passport
  -- holder's US P-2 has issuing_country USA, valid_for_country USA; a German
  -- Schengen permit has issuing_country DEU, valid_for_country SCHENGEN).
  valid_for_country text,
  visa_type         text,

  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- A passport carries no visa-only fields. Same shape as
  -- guest_list_entries_pass_type_other: the discriminator gates which columns
  -- may be non-null.
  constraint identity_documents_visa_fields
    check (kind = 'visa' or (valid_for_country is null and visa_type is null))
);

create index identity_documents_contact_idx on identity_documents (contact_id);
create index identity_documents_account_idx on identity_documents (account_id);

-- One primary document per kind per contact: a contact can have a primary
-- passport and a primary visa at once, but not two primary passports. Partial
-- on is_primary so non-primary rows never collide.
create unique index identity_documents_one_primary_per_kind_idx
  on identity_documents (contact_id, kind)
  where is_primary;

alter table identity_documents enable row level security;

create policy "account reads own identity_documents" on identity_documents
  for select using (account_id = auth.uid());

create policy "account writes own identity_documents" on identity_documents
  for all using (account_id = auth.uid())
  with check (account_id = auth.uid());

-- authenticated and service_role only, deliberately not anon (anon grants were
-- revoked repo-wide in 20260611165116_storage_policies_anon_revoke.sql; this
-- table never had one to begin with).
grant all on identity_documents to authenticated;
grant all on identity_documents to service_role;

create trigger set_updated_at
  before update on identity_documents
  for each row execute function set_updated_at();
