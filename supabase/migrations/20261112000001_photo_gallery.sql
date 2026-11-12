-- A shared photo gallery.
--
-- Photographers (and admins, and the Photography + Video section leader) upload photos here
-- *without* needing a story first; anyone on staff can browse the gallery and pick a photo
-- for a story's cover or body. A story keeps its own copy of the photo's link and text, so
-- removing a gallery entry never breaks a published story.
--
--   * read:   every signed-in staff role (writer, section leader, photographer, admin)
--   * add:    photographers, admins, and section leaders of "photo-video"
--   * change: the uploader, admins, and section leaders of "photo-video"
--             (title, description, caption, credit and tags; never the photo link itself)
--   * delete: same as change. The image file stays in storage, so stories that already use it are fine.
--
-- The files themselves live in the existing public "media" bucket, which every staff role can upload to.

create function private.can_manage_gallery() returns boolean
  language sql stable security definer set search_path = ''
as $$
  select private.is_photographer() or private.is_admin() or private.edits_section('photo-video')
$$;
revoke all on function private.can_manage_gallery() from public, anon;
grant execute on function private.can_manage_gallery() to authenticated;

create table public.gallery_images (
  id          uuid primary key default gen_random_uuid(),
  url         text not null check (url ~ '^https?://' and length(url) <= 2000),
  title       text not null default '' check (length(title) <= 200),
  alt_text    text not null default '' check (length(alt_text) <= 300),   -- description for readers who can't see it
  caption     text not null default '' check (length(caption) <= 500),
  credit      text not null default '' check (length(credit) <= 200),
  tags        text[] not null default '{}',
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);
create index gallery_images_created_idx on public.gallery_images (created_at desc);
create index gallery_images_uploader_idx on public.gallery_images (uploaded_by);

alter table public.gallery_images enable row level security;

create policy gallery_read on public.gallery_images for select to authenticated
  using (private.is_staff());
create policy gallery_insert on public.gallery_images for insert to authenticated
  with check (private.can_manage_gallery());
create policy gallery_update on public.gallery_images for update to authenticated
  using (private.can_manage_gallery() and (uploaded_by = auth.uid() or private.is_admin() or private.edits_section('photo-video')))
  with check (private.can_manage_gallery());
create policy gallery_delete on public.gallery_images for delete to authenticated
  using (private.can_manage_gallery() and (uploaded_by = auth.uid() or private.is_admin() or private.edits_section('photo-video')));

-- The uploader is always the caller, the photo link never changes, timestamps are the server's.
create function public.guard_gallery() returns trigger
  language plpgsql security invoker set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.uploaded_by := auth.uid(); end if;
    new.created_at := now();
    new.updated_at := null;
  else
    new.id := old.id;
    new.url := old.url;
    new.uploaded_by := old.uploaded_by;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end;
$$;
create trigger guard_gallery before insert or update on public.gallery_images
  for each row execute function public.guard_gallery();
create trigger audit_gallery after insert or update or delete on public.gallery_images
  for each row execute function public.audit_row();
revoke execute on function public.guard_gallery() from public, anon, authenticated;

-- Privileges: the outer wall (works whichever way "Automatically expose new tables" is set).
revoke all on public.gallery_images from public, anon, authenticated;
grant select, insert, update, delete on public.gallery_images to authenticated;
grant all on public.gallery_images to service_role;
