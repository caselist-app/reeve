-- Grant table-level privileges to the roles Supabase uses.
-- RLS policies control what rows each role can actually touch.
-- Without these grants, even valid RLS policies return "permission denied".

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines in schema public to anon, authenticated, service_role;

-- Ensure tables created in future migrations also get these grants automatically.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on routines to anon, authenticated, service_role;
