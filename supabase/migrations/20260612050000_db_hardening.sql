-- Commit 7: DB hardening (H6, H7, M7).

-- H6: Artist slug must be globally unique because it maps to a global email
-- subdomain ({slug}.yourreeve.com). Per-account uniqueness allows two accounts
-- to register the same slug, which would route advancing@ email from the second
-- account through the first account's Resend domain configuration.
-- Drop the per-account index and replace it with a global one.
drop index if exists artists_account_slug_unique;
create unique index artists_slug_unique on artists(slug) where slug is not null;

-- H7: Protect append-only ledgers from cascade deletes.

-- document_shares is the read-receipt ledger (CLAUDE.md: "append-mostly, do not
-- delete share rows"). Deleting a document or a person must not silently erase
-- sent/opened/acknowledged history. The TM must remove the share rows explicitly
-- (which they cannot do via the UI by design) before deleting the parent.
alter table document_shares
  drop constraint document_shares_document_id_fkey,
  add constraint document_shares_document_id_fkey
    foreign key (document_id) references documents(id) on delete restrict;

alter table document_shares
  drop constraint document_shares_recipient_person_id_fkey,
  add constraint document_shares_recipient_person_id_fkey
    foreign key (recipient_person_id) references people(id) on delete restrict;

-- notification_log is the durable double-send guard. If a person row is deleted
-- and re-added (new UUID), the dedup index resets and crew can be double-sent.
-- Change to RESTRICT so deletion is blocked until the TM explicitly handles it.
alter table notification_log
  drop constraint notification_log_person_id_fkey,
  add constraint notification_log_person_id_fkey
    foreign key (person_id) references people(id) on delete restrict;

-- M7 part 1: Missing foreign-key indexes.

-- tours.artist_id has no index; every tour query that joins artists does a seq scan.
create index if not exists tours_artist_id_idx on tours(artist_id);

-- shows.tour_date_id is used in every calendar query.
create index if not exists shows_tour_date_id_idx on shows(tour_date_id);

-- room_assignments.hotel_stay_id backs the common "who is in this hotel" query.
create index if not exists room_assignments_hotel_stay_id_idx on room_assignments(hotel_stay_id);

-- document_shares.recipient_person_id backs the "what has this person received" query
-- and is now a restricted FK; it must resolve efficiently.
create index if not exists document_shares_recipient_person_id_idx on document_shares(recipient_person_id);

-- crew_detail.tour_id has no index; scoped queries seq-scan the table.
create index if not exists crew_detail_tour_id_idx on crew_detail(tour_id);

-- transport_assignments.boarding_pass_document_id backs the boarding-pass lookup.
create index if not exists transport_assignments_boarding_pass_doc_idx
  on transport_assignments(boarding_pass_document_id)
  where boarding_pass_document_id is not null;

-- M7 part 2: room_assignments integrity.

-- Unique constraint: same person cannot be put in the same hotel twice.
-- transport_assignments already has unique(segment_id, person_id); hotels need it too.
alter table room_assignments
  add constraint room_assignments_hotel_stay_person_unique
  unique (hotel_stay_id, person_id);

-- sharing_with has no ON DELETE action, so deleting person B raises a raw FK
-- violation error in the TM's face when they try to remove person B from a tour.
-- SET NULL is the right behaviour: the room assignment survives, the share reference
-- is cleared. Postgres requires us to drop and re-add to change the action.
alter table room_assignments
  drop constraint room_assignments_sharing_with_fkey,
  add constraint room_assignments_sharing_with_fkey
    foreign key (sharing_with) references people(id) on delete set null;
