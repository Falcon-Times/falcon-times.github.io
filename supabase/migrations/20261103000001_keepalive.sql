-- A tiny heartbeat the "Keep Supabase awake" workflow calls every day.
--
-- Supabase pauses free projects that look idle, and plain API reads evidently don't count
-- (the project got a pause warning although the old workflow read from it every 3 days).
-- This gives the workflow a real database *write* to make, through the same API path the
-- site uses. It touches one private row, at most once an hour, so spamming it does nothing.

create table private.keepalive (
  id        integer primary key default 1 check (id = 1),   -- exactly one row
  last_ping timestamptz not null default now(),
  pings     bigint not null default 0
);
alter table private.keepalive enable row level security;
revoke all on private.keepalive from public, anon, authenticated;
insert into private.keepalive default values;

create function private.keepalive() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  r private.keepalive;
begin
  update private.keepalive set last_ping = now(), pings = pings + 1
    where id = 1 and last_ping < now() - interval '1 hour'
    returning * into r;
  if not found then
    select * into r from private.keepalive where id = 1;
  end if;
  return jsonb_build_object('last_ping', r.last_ping, 'pings', r.pings);
end;
$$;

create function public.keepalive() returns jsonb
  language sql security invoker set search_path = ''
as $$ select private.keepalive() $$;

revoke all on function private.keepalive() from public;
grant execute on function private.keepalive() to anon, authenticated;
revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;
