-- Deleting a gallery photo also deletes its image file -- but only when nothing still uses it.
--
-- A file counts as "in use" while a story's cover photo or body links to it, a staff portrait
-- uses it, or a gallery entry points at it. Stories keep their own copy of a photo's link, so
-- a file that a story still shows must never be removed just because its gallery entry was.
--
-- Supabase only removes the stored bytes through its Storage API (deleting storage.objects rows
-- in SQL would leave the file behind), so the flow is:
--   1. public.delete_gallery_photo(id) removes the gallery row (RLS decides who may) and says
--      which file, if any, is now unused;
--   2. the app asks Storage to remove that file; the policy below allows it only while the file
--      is unused (admins may still remove any file on purpose).
-- The policy also protects used files from other deletions, such as an uploader removing the
-- file of a story's cover photo through a hand-made request.

-- "/object/public/media/<path>" -> "<path>"
create function private.media_path(p_url text) returns text
  language sql immutable set search_path = ''
as $$ select nullif(substring(p_url from '/object/public/media/(.+)$'), '') $$;

create function private.media_in_use(p_name text) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select p_name is not null and p_name <> '' and (
    exists (select 1 from public.articles a
            where strpos(coalesce(a.cover_image_url, ''), '/object/public/media/' || p_name) > 0
               or strpos(a.body_md, '/object/public/media/' || p_name) > 0)
    or exists (select 1 from public.staff_members s
               where strpos(coalesce(s.photo_url, ''), '/object/public/media/' || p_name) > 0)
    or exists (select 1 from public.gallery_images g
               where strpos(g.url, '/object/public/media/' || p_name) > 0)
  )
$$;

revoke all on function private.media_path(text), private.media_in_use(text) from public, anon;
grant execute on function private.media_path(text), private.media_in_use(text) to authenticated;

-- Remove a gallery photo; returns the storage path of its file when no story/portrait/other
-- gallery entry uses it any more (so the caller may delete it), otherwise null.
create function public.delete_gallery_photo(p_id uuid) returns text
  language plpgsql security invoker set search_path = ''
as $$
declare
  removed public.gallery_images;
  path    text;
begin
  delete from public.gallery_images where id = p_id returning * into removed;
  if not found then
    raise exception 'You don''t have permission to remove this photo.' using errcode = '42501';
  end if;
  path := private.media_path(removed.url);
  if path is null or private.media_in_use(path) then return null; end if;
  return path;
end;
$$;
revoke all on function public.delete_gallery_photo(uuid) from public, anon;
grant execute on function public.delete_gallery_photo(uuid) to authenticated;

-- Postgres only lets a DELETE (or UPDATE) touch rows its caller may also SELECT, and Supabase's
-- Storage API removes files with such a statement. The bucket is public, so reading files by link
-- never needed a policy, which means the existing delete policy could not actually be used by
-- anyone but a database owner. Let signed-in staff see the media records.
create policy media_select on storage.objects for select to authenticated
  using (bucket_id = 'media' and private.is_staff());

-- Storage: a file can be deleted only while unused, by its uploader or the Photography + Video
-- section leader; admins may delete any file.
drop policy media_delete on storage.objects;
create policy media_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'media'
    and (
      private.is_admin()
      or (
        ((owner = auth.uid() and private.is_staff()) or private.edits_section('photo-video'))
        and not private.media_in_use(name)
      )
    )
  );
