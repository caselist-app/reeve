-- Add show_id to document_shares so the acknowledge API knows which show
-- to advance. Nullable for existing rows; new shares always set it.
-- The acknowledge handler reads this column directly rather than trying to
-- reverse-walk the document -> show link, which has no guaranteed path.
alter table document_shares
  add column if not exists show_id uuid references shows(id) on delete set null;

create index on document_shares(show_id) where show_id is not null;

grant select, insert, update on document_shares to authenticated;
grant select, insert, update on document_shares to service_role;
