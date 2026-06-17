-- Postgres grants EXECUTE to PUBLIC on all functions by default.
-- Revoking from specific roles (anon, authenticated) has no effect while the
-- PUBLIC grant remains. This migration revokes from PUBLIC first, then
-- re-grants only to the roles that legitimately need access.
--
-- After this runs:
--   owns_tour                     : authenticated + service_role only
--   create_show_with_dependents   : authenticated + service_role only
--   add_contact_to_tour           : authenticated + service_role only
--   enforce_*_whatsapp_unique     : no role (trigger-only, called by DB engine)
--
-- Supabase will still warn that authenticated users can call the first three.
-- That is expected: they are legitimately callable by signed-in users, and
-- each one checks owns_tour() internally before doing anything. The anon
-- warnings should be gone after this runs.

revoke execute on function owns_tour(uuid) from public;
grant execute on function owns_tour(uuid) to authenticated, service_role;

revoke execute on function create_show_with_dependents(uuid, jsonb) from public;
grant execute on function create_show_with_dependents(uuid, jsonb) to authenticated, service_role;

revoke execute on function add_contact_to_tour(uuid, uuid, text, text) from public;
grant execute on function add_contact_to_tour(uuid, uuid, text, text) to authenticated, service_role;

revoke execute on function enforce_person_whatsapp_unique() from public;
revoke execute on function enforce_contact_whatsapp_unique() from public;
