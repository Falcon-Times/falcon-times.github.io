-- Move the security-definer helpers out of the API-exposed "public" schema.
--
-- Supabase's Security Advisor (rightly) warns about SECURITY DEFINER functions in an
-- exposed schema, because every one of them becomes callable as /rest/v1/rpc/<name>.
-- The row-level-security helpers (effective_role, is_staff, is_editor, my_sections,
-- can_write_section, edits_section, my_staff_member_id) only report on the *caller*, but
-- there is no reason for the public API to offer them. They now live in a "private"
-- schema that the API does not expose, yet policies and triggers still use them.
--
-- The few things the browser does need (is_admin for the account function, voting,
-- view counting, trending, and the colleague list) stay available in "public" as thin
-- SECURITY INVOKER wrappers around the private functions. Behaviour is unchanged.
-- The old staff_directory VIEW (security-definer semantics) becomes a function.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- 1. Move the functions. Policies and triggers reference functions by identity, so they
--    keep working; the sql bodies below are re-created to call each other by new name.

alter function public.effective_role() set schema private;
alter function public.is_staff() set schema private;
alter function public.is_editor() set schema private;
alter function public.is_admin() set schema private;
alter function public.my_sections() set schema private;
alter function public.can_write_section(text) set schema private;
alter function public.edits_section(text) set schema private;
alter function public.my_staff_member_id() set schema private;
alter function public.cast_vote(uuid, text) set schema private;
alter function public.record_view(uuid) set schema private;
alter function public.trending_article_ids(integer) set schema private;

-- 2. Re-create the helpers that call other helpers (sql bodies are re-parsed at call time).

create or replace function private.is_staff() returns boolean
  language sql stable security definer set search_path = ''
as $$ select private.effective_role() is not null $$;

create or replace function private.is_editor() returns boolean
  language sql stable security definer set search_path = ''
as $$ select coalesce(private.effective_role() in ('editor', 'admin'), false) $$;

create or replace function private.is_admin() returns boolean
  language sql stable security definer set search_path = ''
as $$ select coalesce(private.effective_role() = 'admin', false) $$;

create or replace function private.can_write_section(sec text) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select private.is_admin() or (private.is_staff() and sec = any (private.my_sections()))
$$;

create or replace function private.edits_section(sec text) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select private.is_admin() or (private.is_editor() and sec = any (private.my_sections()))
$$;

-- 3. Re-create the trigger functions that call helpers (plpgsql bodies resolve names at run time).

create or replace function public.guard_profiles() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and not private.is_admin() and auth.uid() is not null then
    -- Everyone else may only rename themselves.
    new.id              := old.id;
    new.email           := old.email;
    new.role            := old.role;
    new.sections        := old.sections;
    new.staff_member_id := old.staff_member_id;
    new.active          := old.active;
    new.created_at      := old.created_at;
  end if;

  -- Never allow the last active admin to disappear (lock-out protection).
  if old.role = 'admin' and old.active
     and (tg_op = 'DELETE' or new.role <> 'admin' or not new.active)
     and not exists (select 1 from public.profiles p where p.id <> old.id and p.role = 'admin' and p.active)
  then
    raise exception 'At least one active admin account must remain.' using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.guard_staff_members() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_admin() and auth.uid() is not null then
    -- Staff may only edit their own bio and photo.
    new.id         := old.id;
    new.slug       := old.slug;
    new.name       := old.name;
    new.title      := old.title;
    new.sections   := old.sections;
    new.lead_of    := old.lead_of;
    new.active     := old.active;
    new.sort_order := old.sort_order;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create or replace function public.guard_articles() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  editor boolean;
begin
  -- Service-role / SQL-editor access (no JWT) and the single_lead() helper are trusted.
  if auth.uid() is null or coalesce(current_setting('falcon.skip_guard', true), '') = '1' then
    if tg_op = 'INSERT' then new.last_edited_at := coalesce(new.last_edited_at, now()); end if;
    return new;
  end if;

  editor := private.edits_section(new.section_id);

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

-- 4. Public, API-visible wrappers (SECURITY INVOKER: they add no privilege of their own).
create function public.is_admin() returns boolean
  language sql stable security invoker set search_path = ''
as $$ select private.is_admin() $$;

create function public.cast_vote(p_poll uuid, p_option text) returns void
  language sql security invoker set search_path = ''
as $$ select private.cast_vote(p_poll, p_option) $$;

create function public.record_view(p_article uuid) returns void
  language sql security invoker set search_path = ''
as $$ select private.record_view(p_article) $$;

create function public.trending_article_ids(p_limit integer default 4)
  returns table (article_id uuid, views bigint)
  language sql stable security invoker set search_path = ''
as $$ select * from private.trending_article_ids(p_limit) $$;

-- Names of colleagues for writers/editors (no emails): was a security-definer view.
drop view public.staff_directory;
create function private.staff_directory()
  returns table (id uuid, display_name text, role text, sections text[], staff_member_id uuid, active boolean)
  language sql stable security definer set search_path = ''
as $$
  select p.id, p.display_name, p.role, p.sections, p.staff_member_id, p.active
  from public.profiles p
  where private.is_staff()
$$;
create function public.staff_directory()
  returns table (id uuid, display_name text, role text, sections text[], staff_member_id uuid, active boolean)
  language sql stable security invoker set search_path = ''
as $$ select * from private.staff_directory() $$;

-- 5. Privileges.
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on all functions in schema private to anon, authenticated;
revoke execute on function private.staff_directory() from anon;

revoke all on function public.is_admin(), public.cast_vote(uuid, text), public.record_view(uuid),
  public.trending_article_ids(integer), public.staff_directory() from public, anon, authenticated;
grant execute on function public.cast_vote(uuid, text), public.record_view(uuid),
  public.trending_article_ids(integer) to anon, authenticated;
grant execute on function public.is_admin(), public.staff_directory() to authenticated;
