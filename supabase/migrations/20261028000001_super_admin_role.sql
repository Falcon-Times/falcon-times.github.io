-- "Super admin": a role above admin, like Google Workspace's super admins.
--
--   writer < editor (section leader) < admin < super_admin
--
-- A super admin can do everything an admin can, and is the only one who can manage
-- *admin-level* accounts: create, promote, demote, disable, delete, reset the password
-- or two-factor of, or issue a bypass code for, an admin or another super admin. Plain
-- admins keep running the site (content, settings, writers and section leaders) but can no
-- longer change who the admins are. Super admins use two-factor like admins do, and at least
-- one active super admin must always remain.
--
-- The rules are enforced in the database (the guard trigger below) and again in the
-- admin-users Edge Function, so a hand-crafted request fails either way.

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('writer', 'editor', 'admin', 'super_admin'));

-- Admin-level accounts only count once a second factor has been passed (or a live bypass code).
create or replace function private.effective_role() returns text
  language sql stable security definer set search_path = ''
as $$
  select case
    when p.role in ('admin', 'super_admin')
         and coalesce(auth.jwt() ->> 'aal', '') <> 'aal2'
         and not private.mfa_bypassed() then null
    else p.role
  end
  from public.profiles p
  where p.id = auth.uid() and p.active
$$;

create or replace function private.is_editor() returns boolean
  language sql stable security definer set search_path = ''
as $$ select coalesce(private.effective_role() in ('editor', 'admin', 'super_admin'), false) $$;

-- Super admins are admins too, so every existing admin check keeps working for them.
create or replace function private.is_admin() returns boolean
  language sql stable security definer set search_path = ''
as $$ select coalesce(private.effective_role() in ('admin', 'super_admin'), false) $$;

create function private.is_super_admin() returns boolean
  language sql stable security definer set search_path = ''
as $$ select coalesce(private.effective_role() = 'super_admin', false) $$;

create function public.is_super_admin() returns boolean
  language sql stable security invoker set search_path = ''
as $$ select private.is_super_admin() $$;

-- Who may change which profile.
create or replace function public.guard_profiles() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  by_user      boolean := auth.uid() is not null;   -- false for the service role / SQL editor
  caller_admin boolean := private.is_admin();
  caller_super boolean := private.is_super_admin();
begin
  if tg_op = 'UPDATE' and by_user then
    -- Only super admins may touch admin-level accounts, or hand out admin-level roles.
    if not caller_super and old.id <> auth.uid()
       and (old.role in ('admin', 'super_admin') or new.role in ('admin', 'super_admin')) then
      raise exception 'Only super admins can change admin accounts.' using errcode = '42501';
    end if;
    if not caller_super and old.id = auth.uid() then
      new.role := old.role;                 -- an admin can't promote (or demote) themselves
    end if;
    if not caller_admin then
      -- Everyone else may only rename themselves.
      new.id              := old.id;
      new.email           := old.email;
      new.role            := old.role;
      new.sections        := old.sections;
      new.staff_member_id := old.staff_member_id;
      new.active          := old.active;
      new.created_at      := old.created_at;
    end if;
  end if;

  -- Never lock everyone out: an admin-level account and a super admin must always remain.
  if old.role in ('admin', 'super_admin') and old.active
     and (tg_op = 'DELETE' or new.role not in ('admin', 'super_admin') or not new.active)
     and not exists (select 1 from public.profiles p
                     where p.id <> old.id and p.role in ('admin', 'super_admin') and p.active)
  then
    raise exception 'At least one active admin account must remain.' using errcode = 'P0001';
  end if;
  if old.role = 'super_admin' and old.active
     and (tg_op = 'DELETE' or new.role <> 'super_admin' or not new.active)
     and not exists (select 1 from public.profiles p
                     where p.id <> old.id and p.role = 'super_admin' and p.active)
  then
    raise exception 'At least one active super admin account must remain.' using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Bypass codes for admin-level accounts: super admins only.
create or replace function private.create_mfa_bypass(p_user uuid, p_minutes integer default 60) returns text
  language plpgsql security definer set search_path = ''
as $$
declare
  target public.profiles;
  me     public.profiles;
  digits text;
  new_id uuid;
begin
  if not private.is_admin() then
    raise exception 'Only admins who have signed in with two-factor can do this.' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'Ask another admin for a bypass code; you can already use your own authenticator.' using errcode = 'P0001';
  end if;
  if p_minutes is null or p_minutes < 5 or p_minutes > 1440 then
    raise exception 'A bypass code must last between 5 minutes and 24 hours.' using errcode = 'P0001';
  end if;
  select * into target from public.profiles where id = p_user and active;
  if not found then
    raise exception 'No active account with that id.' using errcode = 'P0001';
  end if;
  if target.role in ('admin', 'super_admin') and not private.is_super_admin() then
    raise exception 'Only super admins can issue bypass codes for admin accounts.' using errcode = '42501';
  end if;
  select * into me from public.profiles where id = auth.uid();

  delete from private.mfa_bypass_codes where expires_at < now() - interval '7 days';
  delete from private.mfa_bypass_sessions where expires_at < now() - interval '1 day';
  update private.mfa_bypass_codes set revoked_at = now()
    where user_id = p_user and used_at is null and revoked_at is null;

  digits := lpad(((('x' || encode(extensions.gen_random_bytes(7), 'hex'))::bit(56)::bigint) % 10000000000)::text, 10, '0');
  insert into private.mfa_bypass_codes (user_id, code_hash, created_by, expires_at)
  values (p_user, extensions.crypt(digits, extensions.gen_salt('bf', 8)), auth.uid(), now() + make_interval(mins => p_minutes))
  returning id into new_id;

  insert into public.audit_log (actor, actor_email, table_name, op, row_id, summary)
  values (auth.uid(), me.email, 'profiles', 'ACCOUNT', p_user::text,
          format('created a 2FA bypass code for %s (valid %s min)', target.email, p_minutes));
  return digits;
end;
$$;

create or replace function private.revoke_mfa_bypass(p_user uuid) returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  n integer;
  target_role text;
begin
  if not private.is_admin() then
    raise exception 'Only admins who have signed in with two-factor can do this.' using errcode = '42501';
  end if;
  select role into target_role from public.profiles where id = p_user;
  if target_role in ('admin', 'super_admin') and not private.is_super_admin() then
    raise exception 'Only super admins can manage bypass codes for admin accounts.' using errcode = '42501';
  end if;
  update private.mfa_bypass_codes set revoked_at = now()
    where user_id = p_user and used_at is null and revoked_at is null;
  get diagnostics n = row_count;
  if n > 0 then
    insert into public.audit_log (actor, actor_email, table_name, op, row_id, summary)
    values (auth.uid(), (select email from public.profiles where id = auth.uid()), 'profiles', 'ACCOUNT', p_user::text,
            format('revoked the 2FA bypass code for %s', (select email from public.profiles where id = p_user)));
  end if;
end;
$$;

-- The first super admin is created from the SQL editor, like the first admin (docs/SETUP.md).
create function public.bootstrap_super_admin(p_email text, p_name text default '') returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is null then
    raise exception 'No auth user with that email. Create it first under Authentication -> Users.';
  end if;
  insert into public.profiles (id, email, display_name, role, active)
  values (uid, lower(p_email), coalesce(nullif(p_name, ''), split_part(p_email, '@', 1)), 'super_admin', true)
  on conflict (id) do update set role = 'super_admin', active = true;
end;
$$;

-- Existing sites: the first admin ever created (the one who bootstrapped the site) becomes the
-- super admin, so nobody is locked out of managing admins. Check People & access afterwards.
update public.profiles set role = 'super_admin'
where id = (select id from public.profiles where role = 'admin' and active order by created_at, id limit 1)
  and not exists (select 1 from public.profiles where role = 'super_admin');

-- Privileges: the wrapper is for signed-in users; bootstrap stays unexecutable for API roles.
revoke all on function private.is_super_admin() from public, anon;
grant execute on function private.is_super_admin() to authenticated;
revoke all on function public.is_super_admin() from public, anon, authenticated;
grant execute on function public.is_super_admin() to authenticated;
revoke all on function public.bootstrap_super_admin(text, text) from public, anon, authenticated;
