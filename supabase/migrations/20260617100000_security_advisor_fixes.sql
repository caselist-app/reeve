-- Fix Supabase security advisor warnings.
--
-- 1. set_updated_at: add fixed search_path (function_search_path_mutable warning).
-- 2. Revoke anon execute from all SECURITY DEFINER functions exposed via REST.
-- 3. Revoke authenticated execute from the two trigger functions
--    (enforce_*_whatsapp_unique) -- they are called by the trigger mechanism,
--    not by users directly.
--
-- owns_tour, create_show_with_dependents, and add_contact_to_tour keep their
-- EXECUTE grant for authenticated because authenticated users and RLS policies
-- call them legitimately.

-- 1. Recreate set_updated_at with a fixed search_path.
create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2. Revoke anon execute from all exposed SECURITY DEFINER functions.
revoke execute on function owns_tour(uuid) from anon;
revoke execute on function create_show_with_dependents(uuid, jsonb) from anon;
revoke execute on function add_contact_to_tour(uuid, uuid, text, text) from anon;
revoke execute on function enforce_person_whatsapp_unique() from anon;
revoke execute on function enforce_contact_whatsapp_unique() from anon;

-- 3. Revoke authenticated execute from trigger-only functions.
--    Triggers are invoked by the DB engine, not by roles, so this does not
--    break them. It just closes the /rpc/ endpoint for those functions.
revoke execute on function enforce_person_whatsapp_unique() from authenticated;
revoke execute on function enforce_contact_whatsapp_unique() from authenticated;
