-- Add date_of_birth to contacts.
-- Required for flight bookings, visa applications, and crew travel documents.
-- Stored as a date (not text) so it sorts correctly and is unambiguous.
alter table contacts
  add column if not exists date_of_birth date;

grant select, insert, update, delete on contacts to authenticated;
grant select, insert, update, delete on contacts to service_role;
