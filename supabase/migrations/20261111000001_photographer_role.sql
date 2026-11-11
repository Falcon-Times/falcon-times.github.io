-- "Photographer": a staff role that can see every story and change only its photos.
--
--   * Reads every article (any section, any status) so they can find what needs pictures.
--   * May update an article, but only its image fields: cover photo, description (alt text),
--     caption and photo credit. Every other column -- headline, summary, text, section, tags,
--     bylines, status, scheduling, pins -- is put back to its old value by the guard trigger, so
--     even a hand-made request can't touch the writing. They can change images on live stories too.
--   * Can't create or delete stories, can't read the internal notes, tips, polls or quotes.
--   * Can upload to the media library (every signed-in staff role can) and edit their own bio.
--   * Doesn't belong to a section, so they never count as a writer anywhere.
--
-- Two-factor is optional for photographers, as for writers and section leaders.

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('writer', 'editor', 'photographer', 'admin', 'super_admin'));

-- A photographer with sections would count as a writer for them (can_write_section), so forbid it.
alter table public.profiles add constraint profiles_photographer_no_sections
  check (role <> 'photographer' or sections = '{}');

create function private.is_photographer() returns boolean
  language sql stable security definer set search_path = ''
as $$ select coalesce(private.effective_role() = 'photographer', false) $$;

revoke all on function private.is_photographer() from public, anon;
grant execute on function private.is_photographer() to authenticated;

-- Read every story; update (image fields only, enforced by the trigger below).
create policy articles_read_photographer on public.articles for select to authenticated
  using (private.is_photographer());
create policy articles_update_photographer on public.articles for update to authenticated
  using (private.is_photographer())
  with check (private.is_photographer());

-- guard_articles: add the photographer rule (everything else is unchanged from migration 05).
create or replace function public.guard_articles() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  editor boolean;
  kept   public.articles;
begin
  -- Service-role / SQL-editor access (no JWT) and the single_lead() helper are trusted.
  if auth.uid() is null or coalesce(current_setting('falcon.skip_guard', true), '') = '1' then
    if tg_op = 'INSERT' then new.last_edited_at := coalesce(new.last_edited_at, now()); end if;
    return new;
  end if;

  editor := private.edits_section(new.section_id);

  -- Photographers: keep the row exactly as it was, except for the four image fields.
  if tg_op = 'UPDATE' and not editor and private.is_photographer() then
    kept := old;
    kept.cover_image_url := new.cover_image_url;
    kept.image_alt       := new.image_alt;
    kept.image_caption   := new.image_caption;
    kept.photo_credit    := new.photo_credit;
    kept.last_edited_at  := now();
    return kept;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.last_edited_at := now();
    if not editor then
      new.featured := false;
      new.is_lead := false;
      new.published_at := null;
      new.updated_at := null;
      new.update_note := '';
    end if;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.last_edited_at := now();
    if old.status = 'published' then
      new.slug := old.slug;                       -- never break a published link
    end if;
    if not editor then
      new.featured := old.featured;
      new.is_lead := old.is_lead;
      new.published_at := old.published_at;
      new.updated_at := old.updated_at;
      new.update_note := old.update_note;
    elsif new.update_note is distinct from old.update_note and new.update_note <> '' then
      new.updated_at := now();
    elsif new.update_note = '' then
      new.updated_at := null;
    end if;
  end if;

  if editor then
    if new.status = 'published' and new.published_at is null then
      new.published_at := now();
    end if;
  end if;

  if new.is_lead and new.status <> 'published' then
    new.is_lead := false;
  end if;
  return new;
end;
$$;
