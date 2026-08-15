-- Brief 45: Identity Documents storage bucket.
--
-- Private bucket for passport and visa scans. Never served publicly: the panel
-- requests a short-lived signed URL on click. Path convention is
-- {account_id}/{contact_id}/{identity_document_id}.{ext}, so the first folder
-- segment is the account id, and accounts.id is the auth user id, which is why
-- every policy compares that segment to auth.uid() directly rather than through
-- an owns_tour()-style helper: identity is account-scoped, not tour-scoped.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'identity-documents',
  'identity-documents',
  false,
  10485760, -- 10 MB per file, matching the documents bucket
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "account reads own identity files"
  on storage.objects for select
  using (
    bucket_id = 'identity-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "account writes own identity files"
  on storage.objects for insert
  with check (
    bucket_id = 'identity-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "account updates own identity files"
  on storage.objects for update
  using (
    bucket_id = 'identity-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'identity-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "account deletes own identity files"
  on storage.objects for delete
  using (
    bucket_id = 'identity-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Explicit, matching 20260610130000_documents_storage_bucket.sql: service_role
-- needs full access to generate signed URLs and clean up orphaned uploads from
-- server actions and jobs.
grant all on storage.objects to service_role;
grant all on storage.buckets to service_role;
