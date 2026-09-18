-- Qaydli phase 0 — private Storage bucket for receipt/invoice images.
--
-- Objects are keyed by business: the first path segment is the business_id, so
-- one RLS check ("your folder") keeps every business's photos private.
-- Example key: <business_id>/<document_id>.jpg

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Read own business's objects.
create policy "documents read own business"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.current_business_id()::text
  );

-- Insert into own business's folder.
create policy "documents insert own business"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.current_business_id()::text
  );

-- Update own business's objects.
create policy "documents update own business"
  on storage.objects for update
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.current_business_id()::text
  );

-- Delete own business's objects.
create policy "documents delete own business"
  on storage.objects for delete
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.current_business_id()::text
  );
