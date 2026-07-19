-- Fix Supabase security advisor warnings on the two Telegram uniqueness
-- trigger functions, mirroring the fix already applied to their WhatsApp
-- equivalents in 20260617100000_security_advisor_fixes.sql and
-- 20260617110000_revoke_function_public_grants.sql.
--
-- enforce_person_telegram_unique and enforce_contact_telegram_unique are
-- trigger-only: invoked by the DB engine on INSERT/UPDATE of people/contacts,
-- never meant to be called directly. Postgres grants EXECUTE to PUBLIC by
-- default when a function is created, which is what the advisor is flagging
-- (anon_security_definer_function_executable and
-- authenticated_security_definer_function_executable). Revoking from PUBLIC
-- closes the /rpc/ endpoint for both roles at once; the explicit anon/
-- authenticated revokes are redundant once PUBLIC is revoked but are kept
-- for symmetry with the WhatsApp fix and to make the intent unambiguous.

revoke execute on function enforce_person_telegram_unique() from public;
revoke execute on function enforce_person_telegram_unique() from anon;
revoke execute on function enforce_person_telegram_unique() from authenticated;

revoke execute on function enforce_contact_telegram_unique() from public;
revoke execute on function enforce_contact_telegram_unique() from anon;
revoke execute on function enforce_contact_telegram_unique() from authenticated;
