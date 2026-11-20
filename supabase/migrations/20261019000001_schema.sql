-- The Falcon Times — core schema, row-level security and helper functions.
--
-- Security model (summary; see docs/ARCHITECTURE.md for the long version):
--   * Everything is protected by row-level security (RLS). The public "anon"
--     key that ships in the website can only do what the policies below allow.
--   * Roles: writer < editor (section leader) < admin. Roles live in
--     public.profiles and are only ever changed by an admin (or by the
--     service-role key inside the admin-users Edge Function).
--   * Admin powers additionally require a second factor: the session must be
--     at assurance level "aal2" (TOTP). An admin signed in with only a
--     password has *no* elevated rights.

------------------------------------------------------------------------
-- Profiles (one per login account)
------------------------------------------------------------------------
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  email            text not null,
  display_name     text not null default '',
  role             text not null default 'writer' check (role in ('writer', 'editor', 'admin')),
  sections         text[] not null default '{}',
  staff_member_id  uuid,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

------------------------------------------------------------------------
-- Public reference data
------------------------------------------------------------------------
create table public.sections (
  id           text primary key check (id ~ '^[a-z0-9-]+$'),
  name         text not null,
  description  text not null default '',
  icon         text not null default 'newspaper',
  subsections  text[] not null default '{}',
  sort_order   integer not null default 100,
  active       boolean not null default true
);

create table public.staff_members (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name        text not null check (char_length(name) between 1 and 120),
  title       text not null default 'Staff Writer' check (char_length(title) <= 120),
  sections    text[] not null default '{}',
  lead_of     text[] not null default '{}',
  bio         text not null default '' check (char_length(bio) <= 2000),
  photo_url   text,
  active      boolean not null default true,
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_staff_member_fk
  foreign key (staff_member_id) references public.staff_members (id) on delete set null;

create table public.site_settings (
  key    text primary key,
  value  jsonb not null
);

create table public.quotes (
  id           uuid primary key default gen_random_uuid(),
  text         text not null check (char_length(text) between 1 and 400),
  attribution  text not null default '' check (char_length(attribution) <= 200),
  active       boolean not null default true,
  sort_order   integer not null default 100
);

create table public.announcements (
  id         uuid primary key default gen_random_uuid(),
  text       text not null check (char_length(text) between 1 and 300),
  link_url   text check (link_url is null or link_url ~ '^(https?://|/|#)'),
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz,
  active     boolean not null default true
);

------------------------------------------------------------------------
-- Articles
------------------------------------------------------------------------
create table public.articles (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9-]+$' and char_length(slug) <= 120),
  title            text not null check (char_length(title) between 1 and 200),
  deck             text not null default '' check (char_length(deck) <= 400),
  body_md          text not null default '' check (char_length(body_md) <= 100000),
  section_id       text not null references public.sections (id) on update cascade,
  subsection       text,
  cover_image_url  text,
  image_alt        text not null default '' check (char_length(image_alt) <= 300),
  image_caption    text not null default '' check (char_length(image_caption) <= 500),
  photo_credit     text not null default '' check (char_length(photo_credit) <= 200),
  byline_ids       uuid[] not null default '{}',
  tags             text[] not null default '{}',
  status           text not null default 'draft' check (status in ('draft', 'submitted', 'published', 'archived')),
  featured         boolean not null default false,
  is_lead          boolean not null default false,
  created_by       uuid references auth.users (id) on delete set null,
  published_at     timestamptz,
  updated_at       timestamptz,
  update_note      text not null default '' check (char_length(update_note) <= 300),
  last_edited_at   timestamptz not null default now(),
  created_at       timestamptz not null default now()
);
create index articles_section_idx on public.articles (section_id, published_at desc);
create index articles_status_idx on public.articles (status, published_at desc);

-- Private editor <-> writer feedback thread.
create table public.article_comments (
  id          uuid primary key default gen_random_uuid(),
  article_id  uuid not null references public.articles (id) on delete cascade,
  author_id   uuid references auth.users (id) on delete set null,
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);

-- Anonymous, per-day view counters used to rank "trending" stories.
create table public.article_views (
  article_id  uuid not null references public.articles (id) on delete cascade,
  day         date not null default current_date,
  views       integer not null default 0,
  primary key (article_id, day)
);

------------------------------------------------------------------------
-- Tip hotline
------------------------------------------------------------------------
create table public.tips (
  id              uuid primary key default gen_random_uuid(),
  category        text not null check (category in ('story', 'correction', 'letter', 'poll', 'scores', 'feedback', 'other')),
  section_id      text references public.sections (id) on delete set null,
  message         text not null check (char_length(message) between 10 and 4000),
  contact         text check (contact is null or char_length(contact) <= 200),
  status          text not null default 'new' check (status in ('new', 'in_review', 'resolved', 'dismissed')),
  assigned_to     uuid references auth.users (id) on delete set null,
  internal_notes  text not null default '' check (char_length(internal_notes) <= 4000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index tips_created_idx on public.tips (created_at desc);

------------------------------------------------------------------------
-- Polls, scoreboard
------------------------------------------------------------------------
create table public.polls (
  id          uuid primary key default gen_random_uuid(),
  category    text not null default 'Campus Life' check (char_length(category) <= 40),
  question    text not null check (char_length(question) between 1 and 250),
  options     jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 8),
  active      boolean not null default true,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.poll_tallies (
  poll_id    uuid not null references public.polls (id) on delete cascade,
  option_id  text not null,
  votes      integer not null default 0,
  primary key (poll_id, option_id)
);

create table public.games (
  id                 uuid primary key default gen_random_uuid(),
  sport              text not null check (char_length(sport) between 1 and 80),
  opponent           text not null check (char_length(opponent) between 1 and 120),
  is_home            boolean not null default true,
  starts_at          timestamptz not null,
  location           text not null default '' check (char_length(location) <= 160),
  status             text not null default 'scheduled' check (status in ('scheduled', 'final', 'postponed', 'cancelled')),
  our_score          integer check (our_score is null or our_score >= 0),
  their_score        integer check (their_score is null or their_score >= 0),
  recap_article_id   uuid references public.articles (id) on delete set null
);
create index games_starts_idx on public.games (starts_at desc);

------------------------------------------------------------------------
-- Audit log (what changed, who changed it — never the content itself)
------------------------------------------------------------------------
create table public.audit_log (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  actor        uuid,
  actor_email  text,
  table_name   text not null,
  op           text not null,
  row_id       text,
  summary      text not null default ''
);
create index audit_log_at_idx on public.audit_log (at desc);

------------------------------------------------------------------------
-- Authorisation helpers
------------------------------------------------------------------------
-- The caller's *effective* role. Admins only count as admins when the session
-- has passed a second factor (aal2); inactive accounts have no role at all.
create function public.effective_role() returns text
  language sql stable security definer set search_path = ''
as $$
  select case
    when p.role = 'admin' and coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then null
    else p.role
  end
  from public.profiles p
  where p.id = auth.uid() and p.active
$$;

create function public.is_staff() returns boolean
  language sql stable security definer set search_path = ''
as $$ select public.effective_role() is not null $$;

create function public.is_editor() returns boolean
  language sql stable security definer set search_path = ''
as $$ select coalesce(public.effective_role() in ('editor', 'admin'), false) $$;

create function public.is_admin() returns boolean
  language sql stable security definer set search_path = ''
as $$ select coalesce(public.effective_role() = 'admin', false) $$;

create function public.my_sections() returns text[]
  language sql stable security definer set search_path = ''
as $$
  select coalesce((select p.sections from public.profiles p where p.id = auth.uid() and p.active), '{}')
$$;

-- May the caller write articles in this section at all?
create function public.can_write_section(sec text) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select public.is_admin() or (public.is_staff() and sec = any (public.my_sections()))
$$;

-- May the caller edit/publish *other people's* articles in this section?
create function public.edits_section(sec text) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select public.is_admin() or (public.is_editor() and sec = any (public.my_sections()))
$$;

create function public.my_staff_member_id() returns uuid
  language sql stable security definer set search_path = ''
as $$
  select p.staff_member_id from public.profiles p where p.id = auth.uid() and p.active
$$;

------------------------------------------------------------------------
-- Row-level security
------------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.sections         enable row level security;
alter table public.staff_members    enable row level security;
alter table public.site_settings    enable row level security;
alter table public.quotes           enable row level security;
alter table public.announcements    enable row level security;
alter table public.articles         enable row level security;
alter table public.article_comments enable row level security;
alter table public.article_views    enable row level security;
alter table public.tips             enable row level security;
alter table public.polls            enable row level security;
alter table public.poll_tallies     enable row level security;
alter table public.games            enable row level security;
alter table public.audit_log        enable row level security;

-- profiles --------------------------------------------------------------
create policy profiles_select_self  on public.profiles for select to authenticated
  using (id = auth.uid());
create policy profiles_select_admin on public.profiles for select to authenticated
  using (public.is_admin());
create policy profiles_update_self  on public.profiles for update to authenticated
  using (id = auth.uid() and public.is_staff())
  with check (id = auth.uid());
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- No insert/delete policies: accounts are created and removed only by the
-- admin-users Edge Function (service role).

-- sections --------------------------------------------------------------
create policy sections_read  on public.sections for select to anon, authenticated using (true);
create policy sections_admin on public.sections for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- staff_members ---------------------------------------------------------
create policy staff_read_public on public.staff_members for select to anon, authenticated
  using (active);
create policy staff_read_admin  on public.staff_members for select to authenticated
  using (public.is_admin());
create policy staff_admin_write on public.staff_members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy staff_update_own  on public.staff_members for update to authenticated
  using (id = public.my_staff_member_id() and public.is_staff())
  with check (id = public.my_staff_member_id());

-- site_settings / quotes / announcements ----------------------------------
create policy settings_read  on public.site_settings for select to anon, authenticated using (true);
create policy settings_admin on public.site_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy quotes_read  on public.quotes for select to anon, authenticated using (active);
create policy quotes_staff_read on public.quotes for select to authenticated using (public.is_editor());
create policy quotes_write on public.quotes for all to authenticated
  using (public.is_editor()) with check (public.is_editor());

create policy announcements_read on public.announcements for select to anon, authenticated
  using (active and starts_at <= now() and (ends_at is null or ends_at > now()));
create policy announcements_staff_read on public.announcements for select to authenticated
  using (public.is_editor());
create policy announcements_write on public.announcements for all to authenticated
  using (public.is_editor()) with check (public.is_editor());

-- articles --------------------------------------------------------------
create policy articles_read_public on public.articles for select to anon, authenticated
  using (status = 'published' and published_at <= now());
create policy articles_read_own on public.articles for select to authenticated
  using (created_by = auth.uid() and public.is_staff());
create policy articles_read_editor on public.articles for select to authenticated
  using (public.edits_section(section_id));

create policy articles_insert on public.articles for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.can_write_section(section_id)
    and (status in ('draft', 'submitted') or public.edits_section(section_id))
  );

create policy articles_update_own on public.articles for update to authenticated
  using (created_by = auth.uid() and status in ('draft', 'submitted') and public.can_write_section(section_id))
  with check (created_by = auth.uid() and status in ('draft', 'submitted') and public.can_write_section(section_id));
create policy articles_update_editor on public.articles for update to authenticated
  using (public.edits_section(section_id))
  with check (public.edits_section(section_id));

create policy articles_delete_own on public.articles for delete to authenticated
  using (created_by = auth.uid() and status in ('draft', 'submitted') and public.is_staff());
create policy articles_delete_editor on public.articles for delete to authenticated
  using (public.edits_section(section_id) and (status <> 'published' or public.is_admin()));

-- article_comments ----------------------------------------------------------
create policy comments_read on public.article_comments for select to authenticated
  using (exists (
    select 1 from public.articles a
    where a.id = article_id and (a.created_by = auth.uid() or public.edits_section(a.section_id))
  ));
create policy comments_insert on public.article_comments for insert to authenticated
  with check (
    public.is_staff() and author_id = auth.uid()
    and exists (
      select 1 from public.articles a
      where a.id = article_id and (a.created_by = auth.uid() or public.edits_section(a.section_id))
    )
  );
create policy comments_delete on public.article_comments for delete to authenticated
  using (public.is_admin() or (author_id = auth.uid() and public.is_staff()));

-- article_views: anyone may read the counters; writes go through record_view().
create policy views_read on public.article_views for select to anon, authenticated using (true);

-- tips ------------------------------------------------------------------
-- Anyone can *submit* a tip. Nobody but editors can ever read one back.
create policy tips_submit on public.tips for insert to anon, authenticated
  with check (status = 'new' and assigned_to is null and internal_notes = '');
create policy tips_read on public.tips for select to authenticated
  using (public.is_admin() or (public.is_editor() and (section_id is null or section_id = any (public.my_sections()))));
create policy tips_update on public.tips for update to authenticated
  using (public.is_admin() or (public.is_editor() and (section_id is null or section_id = any (public.my_sections()))))
  with check (public.is_admin() or (public.is_editor() and (section_id is null or section_id = any (public.my_sections()))));
create policy tips_delete on public.tips for delete to authenticated
  using (public.is_admin());

-- polls -----------------------------------------------------------------
create policy polls_read on public.polls for select to anon, authenticated using (active);
create policy polls_staff_read on public.polls for select to authenticated using (public.is_editor());
create policy polls_write on public.polls for all to authenticated
  using (public.is_editor()) with check (public.is_editor());
create policy tallies_read on public.poll_tallies for select to anon, authenticated using (true);
create policy tallies_admin_clear on public.poll_tallies for delete to authenticated using (public.is_editor());

-- games -----------------------------------------------------------------
create policy games_read on public.games for select to anon, authenticated using (true);
create policy games_write on public.games for all to authenticated
  using (public.edits_section('sports')) with check (public.edits_section('sports'));

-- audit_log -------------------------------------------------------------
create policy audit_read on public.audit_log for select to authenticated using (public.is_admin());

------------------------------------------------------------------------
-- Column-level guards (RLS decides *which rows*, triggers decide *which fields*)
------------------------------------------------------------------------
create function public.guard_profiles() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and not public.is_admin() and auth.uid() is not null then
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
create trigger guard_profiles before update or delete on public.profiles
  for each row execute function public.guard_profiles();

create function public.guard_staff_members() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() and auth.uid() is not null then
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
create trigger guard_staff_members before update on public.staff_members
  for each row execute function public.guard_staff_members();

create function public.guard_articles() returns trigger
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

  editor := public.edits_section(new.section_id);

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
create trigger guard_articles before insert or update on public.articles
  for each row execute function public.guard_articles();

-- Only one lead story at a time.
create function public.single_lead() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if new.is_lead then
    perform set_config('falcon.skip_guard', '1', true);
    update public.articles set is_lead = false where id <> new.id and is_lead;
    perform set_config('falcon.skip_guard', '', true);
  end if;
  return null;
end;
$$;
create trigger single_lead after insert or update of is_lead on public.articles
  for each row when (new.is_lead) execute function public.single_lead();

create function public.guard_tips() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Cheap flood protection: at most 60 tips per 10 minutes site-wide.
    if (select count(*) from public.tips where created_at > now() - interval '10 minutes') >= 60 then
      raise exception 'The tip line is busy right now. Please try again in a few minutes.' using errcode = 'P0001';
    end if;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  -- Editors can triage, but never rewrite what the tipster sent.
  new.id         := old.id;
  new.category   := old.category;
  new.message    := old.message;
  new.contact    := old.contact;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;
create trigger guard_tips before insert or update on public.tips
  for each row execute function public.guard_tips();

------------------------------------------------------------------------
-- Public RPCs (security definer, narrowly scoped)
------------------------------------------------------------------------
create function public.cast_vote(p_poll uuid, p_option text) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.polls p, jsonb_array_elements(p.options) o
    where p.id = p_poll and p.active and o ->> 'id' = p_option
  ) then
    raise exception 'Unknown poll or option.' using errcode = 'P0001';
  end if;
  insert into public.poll_tallies (poll_id, option_id, votes) values (p_poll, p_option, 1)
  on conflict (poll_id, option_id) do update set votes = public.poll_tallies.votes + 1;
end;
$$;

create function public.record_view(p_article uuid) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.articles a where a.id = p_article and a.status = 'published' and a.published_at <= now()
  ) then
    return;
  end if;
  insert into public.article_views (article_id, day, views) values (p_article, current_date, 1)
  on conflict (article_id, day) do update set views = public.article_views.views + 1;
end;
$$;

-- Ranked by the last 7 days of reads; ties broken by recency.
create function public.trending_article_ids(p_limit integer default 4)
  returns table (article_id uuid, views bigint)
  language sql stable security definer set search_path = ''
as $$
  select v.article_id, sum(v.views)::bigint as views
  from public.article_views v
  join public.articles a on a.id = v.article_id
  where v.day >= current_date - 7 and a.status = 'published' and a.published_at <= now()
  group by v.article_id, a.published_at
  order by sum(v.views) desc, a.published_at desc
  limit greatest(least(p_limit, 20), 1)
$$;

-- Names of colleagues, for editors/writers (no emails).
create view public.staff_directory as
  select p.id, p.display_name, p.role, p.sections, p.staff_member_id, p.active
  from public.profiles p
  where public.is_staff();

-- The first admin is created from the SQL editor (see docs/SETUP.md).
create function public.bootstrap_admin(p_email text, p_name text default '') returns void
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
  values (uid, lower(p_email), coalesce(nullif(p_name, ''), split_part(p_email, '@', 1)), 'admin', true)
  on conflict (id) do update set role = 'admin', active = true;
end;
$$;

------------------------------------------------------------------------
-- Audit trail
------------------------------------------------------------------------
create function public.audit_row() returns trigger
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
    where new_j -> k is distinct from old_j -> k and k not in ('last_edited_at');
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

create trigger audit_articles   after insert or update or delete on public.articles       for each row execute function public.audit_row();
create trigger audit_profiles   after insert or update or delete on public.profiles       for each row execute function public.audit_row();
create trigger audit_staff      after insert or update or delete on public.staff_members  for each row execute function public.audit_row();
create trigger audit_sections   after insert or update or delete on public.sections       for each row execute function public.audit_row();
create trigger audit_settings   after insert or update or delete on public.site_settings  for each row execute function public.audit_row();
create trigger audit_polls      after insert or update or delete on public.polls          for each row execute function public.audit_row();
create trigger audit_games      after insert or update or delete on public.games          for each row execute function public.audit_row();
create trigger audit_quotes     after insert or update or delete on public.quotes         for each row execute function public.audit_row();
create trigger audit_notices    after insert or update or delete on public.announcements  for each row execute function public.audit_row();
create trigger audit_tips       after update or delete on public.tips                     for each row execute function public.audit_row();

------------------------------------------------------------------------
-- Privileges. RLS above is the real gate; these grants are the outer wall.
------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant select on public.sections, public.staff_members, public.site_settings, public.quotes,
  public.announcements, public.articles, public.article_views, public.polls, public.poll_tallies,
  public.games to anon;
grant insert on public.tips to anon;

grant select, insert, update, delete on public.sections, public.staff_members, public.site_settings,
  public.quotes, public.announcements, public.articles, public.article_comments, public.polls,
  public.games to authenticated;
grant select on public.article_views, public.poll_tallies, public.audit_log to authenticated;
grant delete on public.poll_tallies to authenticated;
grant select, update (display_name, role, sections, staff_member_id, active) on public.profiles to authenticated;
grant select, insert, update, delete on public.tips to authenticated;
grant select on public.staff_directory to authenticated;

-- Functions the policies / clients rely on.
grant execute on function
  public.effective_role(), public.is_staff(), public.is_editor(), public.is_admin(),
  public.my_sections(), public.can_write_section(text), public.edits_section(text),
  public.my_staff_member_id()
  to anon, authenticated;
grant execute on function public.cast_vote(uuid, text), public.record_view(uuid),
  public.trending_article_ids(integer) to anon, authenticated;
-- bootstrap_admin() and the trigger functions stay unexecutable for API roles.
