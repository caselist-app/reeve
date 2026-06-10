-- Add reminder_count to document_shares.
-- Used by advance-reminder job to key idempotency per-reminder-send
-- without storing the index elsewhere.
-- Starts at 0; job increments it atomically after each reminder send.
alter table document_shares
  add column if not exists reminder_count integer not null default 0;

grant select, insert, update on document_shares to authenticated;
grant select, insert, update on document_shares to service_role;
