-- C1: Tighten documents storage bucket policies to scope by tour ownership.
-- The prior policies checked only that the caller was authenticated, meaning
-- any logged-in account could read, overwrite, or delete any tour's documents.
-- Paths follow the pattern {tour_id}/..., so the first folder segment is the
-- tour_id. owns_tour() (defined in the first migration) checks that the
-- caller's auth.uid() owns that tour.

drop policy if exists "owner reads documents storage" on storage.objects;
drop policy if exists "owner writes documents storage" on storage.objects;
drop policy if exists "owner deletes documents storage" on storage.objects;

create policy "owner reads documents storage"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and owns_tour((storage.foldername(name))[1]::uuid)
  );

create policy "owner writes documents storage"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and owns_tour((storage.foldername(name))[1]::uuid)
  );

create policy "owner deletes documents storage"
  on storage.objects for delete
  using (
    bucket_id = 'documents'
    and owns_tour((storage.foldername(name))[1]::uuid)
  );

-- M7: Revoke the blanket anon grants added in 20260610120000_grant_service_role.sql.
-- RLS on every table already blocks anon from reading or writing any row.
-- Keeping grant all to anon deletes that second layer of defence.
-- anon needs only usage on the schema (required for the PostgREST connection to work).

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all routines in schema public from anon;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on routines from anon;

-- Re-grant schema usage so PostgREST can still resolve the schema for auth flow.
grant usage on schema public to anon;
