-- Public bucket for article photos and staff portraits.
-- Anyone can *view* images; only signed-in staff can upload, and only
-- admins (or the uploader) can remove them.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media', 'media', true, 8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy media_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_staff());

create policy media_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and (public.is_admin() or (owner = auth.uid() and public.is_staff())))
  with check (bucket_id = 'media');

create policy media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (public.is_admin() or (owner = auth.uid() and public.is_staff())));
-- Reads need no policy: the bucket is public, so files are served by URL.
