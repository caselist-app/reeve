-- Private Storage bucket for all tour documents (boarding passes, riders, tech packs).
-- Files are never served publicly; the boarding pass job generates short-lived signed
-- URLs at send time. The bucket name must match the storage_path prefix used in
-- lib/actions/transport.ts when uploading boarding passes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  10485760, -- 10 MB per file
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Only the authenticated owner of the tour may read or write their documents.
-- Paths follow the pattern: {tour_id}/boarding-passes/{assignment_id}.pdf
create policy "owner reads documents storage"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and auth.role() = 'authenticated'
  );

create policy "owner writes documents storage"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and auth.role() = 'authenticated'
  );

create policy "owner deletes documents storage"
  on storage.objects for delete
  using (
    bucket_id = 'documents'
    and auth.role() = 'authenticated'
  );

-- Grant service_role full access for signed URL generation from jobs.
grant all on storage.objects to service_role;
grant all on storage.buckets to service_role;
