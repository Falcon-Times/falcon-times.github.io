-- Temporary passwords made when an account is CREATED expire after 15 minutes.
--
-- When an admin adds an account, the person gets a one-time temporary password. If they don't use
-- it, it should not stay valid forever, so the admin-users Edge Function now stamps the new profile
-- with `temp_password_expires_at` (15 minutes after creation). From then on:
--
--   * the moment that time passes, the account has no access at all: private.effective_role() (which
--     every permission check goes through) returns nothing, even for a sign-in that is still open;
--   * within about a minute, a scheduled job (pg_cron, every minute) makes the password itself
--     useless, by replacing it with a random one nobody knows, and signs the person out everywhere;
--   * the account stays blocked, and the People list says "Temp password expired", until an admin
--     chooses "Reset password". That gives a new temporary password that does NOT expire, exactly
--     like before;
--   * setting a real password (the first-sign-in password change) stops the clock for good.
--
-- Not affected: accounts that already exist (their column is empty), temporary passwords from
-- "Reset password", and two-factor bypass codes. Only the creation flow sets the clock.
--
-- If pg_cron is not available (plain PostgreSQL, such as CI), the job is not scheduled; access is
-- still cut off by the first rule. On Supabase, pg_cron is enabled here automatically; if that
-- fails you will see a warning in the deploy log -- then enable it under Database -> Extensions and
-- run the `cron.schedule(...)` line at the bottom of this file once.

alter table public.profiles
  add column temp_password_expires_at timestamptz,   -- when the creation-time temporary password stops working
  add column temp_password_revoked_at timestamptz;   -- when the job made it useless (the account stays blocked until a reset)

-- 1. The cut-off: every permission check goes through effective_role(). (Same as before, plus the clock.)
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
    and (p.temp_password_expires_at is null or p.temp_password_expires_at > now())
$$;

-- 2. Choosing a new password stops the clock (and lifts the block after an admin's reset).
--    The expiry job below changes the password too; it sets a flag so this does not undo it.
create function private.clear_temp_password_clock() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(current_setting('falcon.expiring_temp_password', true), '') = '1' then return null; end if;
  update public.profiles
  set temp_password_expires_at = null, temp_password_revoked_at = null
  where id = new.id and (temp_password_expires_at is not null or temp_password_revoked_at is not null);
  return null;
end;
$$;
create trigger clear_temp_password_clock after update of encrypted_password on auth.users
  for each row when (old.encrypted_password is distinct from new.encrypted_password)
  execute function private.clear_temp_password_clock();

-- 3. The job: make expired temporary passwords useless and end their sessions. Returns how many.
create function private.expire_temp_passwords() returns integer
  language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select id, email from public.profiles
    where temp_password_expires_at is not null and temp_password_expires_at <= now() and temp_password_revoked_at is null
  loop
    perform set_config('falcon.expiring_temp_password', '1', true);
    update auth.users set encrypted_password = extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')) where id = r.id;
    perform set_config('falcon.expiring_temp_password', '', true);
    delete from auth.sessions where user_id = r.id;
    update public.profiles set temp_password_revoked_at = now() where id = r.id;
    insert into public.audit_log (actor, actor_email, table_name, op, row_id, summary)
    values (null, null, 'profiles', 'ACCOUNT', r.id::text, format('temporary password expired for %s', r.email));
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function private.clear_temp_password_clock(), private.expire_temp_passwords() from public, anon, authenticated;

-- 4. The clock is bookkeeping, not an edit: keep it out of the activity log's "changed account" entries.
create or replace function public.audit_row() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  old_j jsonb;
  new_j jsonb;
  rid   text;
  changed text;
begin
  old_j := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_j := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  rid := coalesce(new_j ->> 'id', old_j ->> 'id', new_j ->> 'key', old_j ->> 'key');
  if tg_op = 'UPDATE' then
    select string_agg(k, ', ' order by k) into changed
    from jsonb_object_keys(new_j) k
    where new_j -> k is distinct from old_j -> k
      and k not in ('last_edited_at', 'temp_password_expires_at', 'temp_password_revoked_at');
    if changed is null then return null; end if;
  end if;
  insert into public.audit_log (actor, actor_email, table_name, op, row_id, summary)
  values (
    auth.uid(),
    (select p.email from public.profiles p where p.id = auth.uid()),
    tg_table_name, tg_op, rid,
    coalesce(changed, coalesce(new_j ->> 'title', new_j ->> 'name', new_j ->> 'question', old_j ->> 'title', old_j ->> 'name', old_j ->> 'question', ''))
  );
  return null;
end;
$$;

-- 5. Run the job every minute where pg_cron exists (Supabase: yes; a plain PostgreSQL: skipped).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron with schema pg_catalog;
      perform cron.unschedule(jobid) from cron.job where jobname = 'falcon-expire-temp-passwords';
      perform cron.schedule('falcon-expire-temp-passwords', '* * * * *', 'select private.expire_temp_passwords()');
    exception when others then
      raise warning 'Temporary-password expiry job NOT scheduled (%). Enable pg_cron under Database -> Extensions, then run: select cron.schedule(''falcon-expire-temp-passwords'', ''* * * * *'', ''select private.expire_temp_passwords()'');', sqlerrm;
    end;
  else
    raise notice 'pg_cron is not available here, so the temporary-password expiry job is not scheduled (access is still cut off at expiry).';
  end if;
end $$;
