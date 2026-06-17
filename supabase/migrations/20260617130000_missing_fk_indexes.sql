-- Add indexes for foreign key columns that were missing one.
--
-- Without an index on a FK column, Postgres must do a sequential scan of the
-- child table whenever the parent row is looked up, updated, or deleted. These
-- are all low-cost to add and will be used as the app grows.
--
-- Note: several tables already have composite indexes whose leading column is
-- the FK (e.g. transport_assignments(tour_id, person_id)), but Postgres still
-- needs a plain index on person_id alone for lookups and cascade operations
-- that filter only on person_id.
--
-- Unused-index warnings are intentionally NOT acted on. The database has
-- minimal traffic and all existing indexes were created deliberately. They will
-- be used as the app scales.

-- artists: account_id not covered by the partial unique index (which only
-- covers rows where slug is not null).
create index on artists(account_id);

-- broadcast_log: person_id not covered by the (tour_id, person_id) composite.
create index on broadcast_log(person_id);

-- day_events: no indexes at all on this table's FK columns.
create index on day_events(tour_id);
create index on day_events(show_id);

-- day_sheets: tour_id FK has no index.
create index on day_sheets(tour_id);

-- document_shares: document_id not covered (existing index leads with tour_id).
create index on document_shares(document_id);

-- notification_log: person_id FK has no index.
create index on notification_log(person_id);

-- rehearsals: tour_date_id not covered (existing index leads with tour_id).
create index on rehearsals(tour_date_id);

-- room_assignments: person_id not covered (existing index leads with tour_id).
-- sharing_with is a nullable self-referencing FK -- partial index skips nulls.
create index on room_assignments(person_id);
create index on room_assignments(sharing_with) where sharing_with is not null;

-- show_advance: tour_id FK has no index.
create index on show_advance(tour_id);

-- shows: tech_pack_document_id is nullable -- partial index skips nulls.
create index on shows(tech_pack_document_id) where tech_pack_document_id is not null;

-- transport_assignments: person_id not covered (existing index leads with tour_id).
create index on transport_assignments(person_id);
