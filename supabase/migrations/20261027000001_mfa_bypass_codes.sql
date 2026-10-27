-- Two-factor bypass codes ("override codes").
--
-- An admin can hand someone a one-time code that lets them past the two-factor step
-- once -- e.g. they forgot their phone -- without removing their authenticator.
--
--   * The code is 10 random digits, valid for a window the admin picks (5 min - 24 h).
--   * It only works for the person it was made for, who must still sign in with their
--     own password first, and it can be used once.
--   * Only a salted bcrypt hash is stored. After 5 wrong guesses the code is dead, so the
--     (typeable) 10 digits cannot be brute-forced. Everything is written to the audit log.
--   * Redeeming it vouches for the *current login session* for 8 hours, in place of the
--     TOTP step. Admin powers are gated by `aal2` (see private.effective_role), so that
--     function now also accepts a live bypass session.
--
-- Everything lives in the unexposed "private" schema; the browser only sees thin
-- SECURITY INVOKER wrappers in "public", like the other helpers.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table private.mfa_bypass_codes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  code_hash       text not null,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  used_at         timestamptz,
  revoked_at      timestamptz,
  failed_attempts integer not null default 0
);
create index mfa_bypass_codes_user_idx on private.mfa_bypass_codes (user_id);

create table private.mfa_bypass_sessions (
  session_id uuid primary key,                       -- the "session_id" claim of the login JWT
  user_id    uuid not null references public.profiles (id) on delete cascade,
  code_id    uuid references private.mfa_bypass_codes (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table private.mfa_bypass_codes enable row level security;
alter table private.mfa_bypass_sessions enable row level security;
revoke all on private.mfa_bypass_codes, private.mfa_bypass_sessions from public, anon, authenticated;

-- Has the caller's current login session redeemed a bypass code that is still live?
create function private.mfa_bypassed() returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from private.mfa_bypass_sessions s
    where s.user_id = auth.uid()
      and s.expires_at > now()
      and s.session_id::text = coalesce(auth.jwt() ->> 'session_id', '')
  )
$$;

-- Admins only count as admins after a second factor -- or a redeemed bypass code.
create or replace function private.effective_role() returns text
  language sql stable security definer set search_path = ''
as $$
  select case
    when p.role = 'admin'
         and coalesce(auth.jwt() ->> 'aal', '') <> 'aal2'
         and not private.mfa_bypassed() then null
    else p.role
  end
  from public.profiles p
  where p.id = auth.uid() and p.active
$$;

-- Admin: make a code for someone else. Returns the 10 digits -- the only time they exist.
create function private.create_mfa_bypass(p_user uuid, p_minutes integer default 60) returns text
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
  select * into me from public.profiles where id = auth.uid();

  -- Housekeeping, and only one live code per person at a time.
  delete from private.mfa_bypass_codes where expires_at < now() - interval '7 days';
  delete from private.mfa_bypass_sessions where expires_at < now() - interval '1 day';
  update private.mfa_bypass_codes set revoked_at = now()
    where user_id = p_user and used_at is null and revoked_at is null;

  -- 56 random bits reduced to 10 digits: modulo bias is ~1e-7.
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

-- Admin: cancel a code that has not been used yet.
create function private.revoke_mfa_bypass(p_user uuid) returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  n integer;
begin
  if not private.is_admin() then
    raise exception 'Only admins who have signed in with two-factor can do this.' using errcode = '42501';
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

-- Admin: who currently holds an unused, unexpired code (never the code itself).
create function private.mfa_bypass_overview()
  returns table (user_id uuid, expires_at timestamptz, failed_attempts integer)
  language sql stable security definer set search_path = ''
as $$
  select c.user_id, c.expires_at, c.failed_attempts
  from private.mfa_bypass_codes c
  where private.is_admin() and c.used_at is null and c.revoked_at is null and c.expires_at > now()
$$;

-- Anyone signed in (password only): try a code. One generic answer for every failure so a
-- guess reveals nothing; five wrong guesses kill the code.
create function private.redeem_mfa_bypass(p_code text) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare
  uid    uuid := auth.uid();
  sid    uuid;
  digits text := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
  rec    private.mfa_bypass_codes;
  who    text;
begin
  begin
    sid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when others then
    sid := null;
  end;
  if uid is null or sid is null or length(digits) <> 10 then return false; end if;
  select email into who from public.profiles where id = uid and active;
  if who is null then return false; end if;

  select * into rec from private.mfa_bypass_codes c
    where c.user_id = uid and c.used_at is null and c.revoked_at is null
      and c.expires_at > now() and c.failed_attempts < 5
    order by c.created_at desc limit 1
    for update;
  if not found then return false; end if;

  if extensions.crypt(digits, rec.code_hash) = rec.code_hash then
    update private.mfa_bypass_codes set used_at = now() where id = rec.id;
    insert into private.mfa_bypass_sessions (session_id, user_id, code_id, expires_at)
    values (sid, uid, rec.id, now() + interval '8 hours')
    on conflict (session_id) do update set code_id = excluded.code_id, expires_at = excluded.expires_at;
    insert into public.audit_log (actor, actor_email, table_name, op, row_id, summary)
    values (uid, who, 'profiles', 'ACCOUNT', uid::text, 'signed in with a 2FA bypass code');
    return true;
  end if;

  update private.mfa_bypass_codes set failed_attempts = failed_attempts + 1 where id = rec.id;
  if rec.failed_attempts + 1 >= 5 then
    insert into public.audit_log (actor, actor_email, table_name, op, row_id, summary)
    values (uid, who, 'profiles', 'ACCOUNT', uid::text, '2FA bypass code locked after 5 wrong guesses');
  end if;
  return false;
end;
$$;

-- API-visible wrappers (SECURITY INVOKER: no extra privilege).
create function public.create_mfa_bypass(p_user uuid, p_minutes integer default 60) returns text
  language sql security invoker set search_path = ''
as $$ select private.create_mfa_bypass(p_user, p_minutes) $$;

create function public.revoke_mfa_bypass(p_user uuid) returns void
  language sql security invoker set search_path = ''
as $$ select private.revoke_mfa_bypass(p_user) $$;

create function public.mfa_bypass_overview()
  returns table (user_id uuid, expires_at timestamptz, failed_attempts integer)
  language sql stable security invoker set search_path = ''
as $$ select * from private.mfa_bypass_overview() $$;

create function public.redeem_mfa_bypass(p_code text) returns boolean
  language sql security invoker set search_path = ''
as $$ select private.redeem_mfa_bypass(p_code) $$;

create function public.mfa_bypass_active() returns boolean
  language sql stable security invoker set search_path = ''
as $$ select private.mfa_bypassed() $$;

-- Privileges: signed-in users only (nothing for anon).
revoke all on function private.mfa_bypassed(), private.create_mfa_bypass(uuid, integer),
  private.revoke_mfa_bypass(uuid), private.mfa_bypass_overview(), private.redeem_mfa_bypass(text)
  from public, anon;
grant execute on function private.mfa_bypassed(), private.create_mfa_bypass(uuid, integer),
  private.revoke_mfa_bypass(uuid), private.mfa_bypass_overview(), private.redeem_mfa_bypass(text)
  to authenticated;

revoke all on function public.create_mfa_bypass(uuid, integer), public.revoke_mfa_bypass(uuid),
  public.mfa_bypass_overview(), public.redeem_mfa_bypass(text), public.mfa_bypass_active()
  from public, anon, authenticated;
grant execute on function public.create_mfa_bypass(uuid, integer), public.revoke_mfa_bypass(uuid),
  public.mfa_bypass_overview(), public.redeem_mfa_bypass(text), public.mfa_bypass_active()
  to authenticated;
