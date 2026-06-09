-- Generic trigger function: keeps updated_at current on every write.
-- Applied to every table that carries an updated_at column.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at before update on accounts
  for each row execute function set_updated_at();

create trigger set_updated_at before update on tours
  for each row execute function set_updated_at();

create trigger set_updated_at before update on people
  for each row execute function set_updated_at();

create trigger set_updated_at before update on crew_detail
  for each row execute function set_updated_at();

create trigger set_updated_at before update on shows
  for each row execute function set_updated_at();

create trigger set_updated_at before update on show_advance
  for each row execute function set_updated_at();

create trigger set_updated_at before update on day_sheets
  for each row execute function set_updated_at();

create trigger set_updated_at before update on transport_segments
  for each row execute function set_updated_at();

create trigger set_updated_at before update on transport_assignments
  for each row execute function set_updated_at();

create trigger set_updated_at before update on hotel_stays
  for each row execute function set_updated_at();

create trigger set_updated_at before update on room_assignments
  for each row execute function set_updated_at();

create trigger set_updated_at before update on documents
  for each row execute function set_updated_at();
