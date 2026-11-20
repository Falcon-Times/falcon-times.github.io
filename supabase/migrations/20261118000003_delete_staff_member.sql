-- Deleting someone from the staff roster.
--
-- The roster ("Meet the newsroom" + who can be credited in a byline) is separate from login
-- accounts. Deleting a roster entry:
--   * removes the person from every story's byline (a story left with no byline is shown as
--     "The Falcon Times Staff", like any story without one) -- without counting as an edit
--     to those stories, so their "last edited" times don't change;
--   * leaves any login account linked to them in place, just unlinked (the existing foreign key
--     already does that); the account, its role and its stories are untouched;
--   * returns the storage path of their portrait when nothing else uses that file, so the app
--     can remove it (same approach as gallery photos);
--   * is for admins only (the roster's write policy), and an admin who is not a super admin
--     can't delete an entry that is linked to an admin-level account, since that would change
--     that account.
-- Tips, polls and the activity log keep nothing that points at the roster.

create or replace function public.guard_staff_delete() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  -- Only people signed in through the API are checked; the SQL editor / service role are trusted.
  if auth.uid() is not null and not private.is_super_admin()
     and exists (select 1 from public.profiles p
                 where p.staff_member_id = old.id and p.role in ('admin', 'super_admin')) then
    raise exception 'Only a super admin can delete a roster entry that is linked to an admin account.' using errcode = '42501';
  end if;

  -- Take them off every byline. The guard trigger on stories treats this as a trusted change
  -- (no "last edited" bump, no field rewrites).
  if exists (select 1 from public.articles where old.id = any (byline_ids)) then
    perform set_config('falcon.skip_guard', '1', true);
    update public.articles set byline_ids = array_remove(byline_ids, old.id) where old.id = any (byline_ids);
    perform set_config('falcon.skip_guard', '', true);
  end if;
  return old;
end;
$$;
create trigger guard_staff_delete before delete on public.staff_members
  for each row execute function public.guard_staff_delete();
revoke execute on function public.guard_staff_delete() from public, anon, authenticated;

-- Delete a roster entry; returns the storage path of its portrait when no story, other portrait
-- or gallery entry uses that file any more (so the caller may remove it), otherwise null.
create function public.delete_staff_member(p_id uuid) returns text
  language plpgsql security invoker set search_path = ''
as $$
declare
  removed public.staff_members;
  path    text;
begin
  delete from public.staff_members where id = p_id returning * into removed;
  if not found then
    raise exception 'You don''t have permission to delete this staff member.' using errcode = '42501';
  end if;
  path := private.media_path(removed.photo_url);
  if path is null or private.media_in_use(path) then return null; end if;
  return path;
end;
$$;
revoke all on function public.delete_staff_member(uuid) from public, anon;
grant execute on function public.delete_staff_member(uuid) to authenticated;
