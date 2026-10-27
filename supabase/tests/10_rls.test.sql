-- Row-level-security regression tests. Run with scripts/test-db.sh.
-- Everything happens inside one transaction that is rolled back at the end.
\set ON_ERROR_STOP on
begin;

create schema tests;
grant usage on schema tests to public;

create function tests.login(uid uuid, aal text default 'aal1', sid uuid default null) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal, 'session_id', sid)::text, true);
  execute 'set local role authenticated';
end $$;
create function tests.anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
end $$;
create function tests.logout() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
create function tests.count(q text) returns bigint language plpgsql as $$
declare n bigint;
begin execute 'select count(*) from (' || q || ') t' into n; return n; end $$;
create function tests.eq(actual anyelement, expected anyelement, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL - %: expected %, got %', msg, expected, actual;
  end if;
  raise notice 'ok - %', msg;
end $$;
create function tests.fails(q text, msg text, pattern text default '.') returns void language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    if sqlerrm !~* pattern then raise exception 'FAIL - %: wrong error: %', msg, sqlerrm; end if;
    raise notice 'ok - % (%)', msg, sqlerrm;
    return;
  end;
  raise exception 'FAIL - %: statement succeeded but should have been rejected', msg;
end $$;
-- A statement that RLS silently turns into "0 rows affected".
create function tests.affects(q text, expected bigint, msg text) returns void language plpgsql as $$
declare n bigint;
begin
  execute q;
  get diagnostics n = row_count;
  if n <> expected then raise exception 'FAIL - %: expected % rows affected, got %', msg, expected, n; end if;
  raise notice 'ok - %', msg;
end $$;

-- ---------------------------------------------------------------- fixtures
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'admin@example.test'),
  ('00000000-0000-0000-0000-000000000002', 'sports.editor@example.test'),
  ('00000000-0000-0000-0000-000000000003', 'news.editor@example.test'),
  ('00000000-0000-0000-0000-000000000004', 'news.writer@example.test'),
  ('00000000-0000-0000-0000-000000000005', 'sports.writer@example.test'),
  ('00000000-0000-0000-0000-000000000006', 'noprofile@example.test'),
  ('00000000-0000-0000-0000-000000000007', 'inactive@example.test');

insert into public.profiles (id, email, display_name, role, sections, active) values
  ('00000000-0000-0000-0000-000000000001', 'admin@example.test', 'Admin', 'admin', '{}', true),
  ('00000000-0000-0000-0000-000000000002', 'sports.editor@example.test', 'Sports Ed', 'editor', '{sports}', true),
  ('00000000-0000-0000-0000-000000000003', 'news.editor@example.test', 'News Ed', 'editor', '{school-news}', true),
  ('00000000-0000-0000-0000-000000000004', 'news.writer@example.test', 'News Writer', 'writer', '{school-news}', true),
  ('00000000-0000-0000-0000-000000000005', 'sports.writer@example.test', 'Sports Writer', 'writer', '{sports}', true),
  ('00000000-0000-0000-0000-000000000007', 'inactive@example.test', 'Inactive', 'writer', '{school-news}', false);

insert into public.articles (id, slug, title, section_id, status, published_at, created_by) values
  ('a0000000-0000-0000-0000-000000000001', 'pub-news', 'Published news', 'school-news', 'published', now() - interval '1 day', '00000000-0000-0000-0000-000000000004'),
  ('a0000000-0000-0000-0000-000000000002', 'draft-news', 'Draft news', 'school-news', 'draft', null, '00000000-0000-0000-0000-000000000004'),
  ('a0000000-0000-0000-0000-000000000003', 'draft-sports', 'Draft sports', 'sports', 'draft', null, '00000000-0000-0000-0000-000000000005'),
  ('a0000000-0000-0000-0000-000000000004', 'future-news', 'Scheduled', 'school-news', 'published', now() + interval '2 days', '00000000-0000-0000-0000-000000000004');

insert into public.tips (id, category, section_id, message) values
  ('b0000000-0000-0000-0000-000000000001', 'story', 'sports', 'A sports tip about the team'),
  ('b0000000-0000-0000-0000-000000000002', 'story', 'school-news', 'A school news tip for editors'),
  ('b0000000-0000-0000-0000-000000000003', 'feedback', null, 'A general website feedback tip');

-- ------------------------------------------------------------ anonymous
select tests.anon();
select tests.eq(tests.count('select 1 from public.articles'), 2::bigint, 'anon sees seeded welcome + published news only (no drafts / scheduled)');
select tests.eq(tests.count($$select 1 from public.articles where slug in ('draft-news','future-news','draft-sports')$$), 0::bigint, 'anon cannot see drafts or scheduled articles');
select tests.eq(tests.count('select 1 from public.sections') > 5, true, 'anon reads sections');
select tests.eq(tests.count('select 1 from public.staff_members') > 10, true, 'anon reads staff');
select tests.fails('select * from public.tips', 'anon cannot read tips', 'permission denied');
select tests.fails('select * from public.profiles', 'anon cannot read profiles', 'permission denied');
select tests.fails('select * from public.audit_log', 'anon cannot read audit log', 'permission denied');
select tests.fails('select * from public.article_comments', 'anon cannot read comments', 'permission denied');
select tests.fails($$update public.articles set title = 'x'$$, 'anon cannot update articles', 'permission denied');
select tests.fails($$insert into public.articles (slug, title, section_id) values ('x','x','sports')$$, 'anon cannot insert articles', 'permission denied');

insert into public.tips (category, message, contact) values ('story', 'This is an anonymous tip', null);
select tests.fails($$insert into public.tips (category, message, status) values ('story', 'This tip tries to pre-resolve itself', 'resolved')$$, 'anon cannot set tip status', 'row-level security');
select tests.fails($$insert into public.tips (category, message, internal_notes) values ('story', 'This tip tries to write notes', 'x')$$, 'anon cannot write internal notes', 'row-level security');
select tests.fails($$insert into public.tips (category, message) values ('story', 'short')$$, 'too-short tip rejected', 'check constraint');
select tests.fails($$insert into public.tips (category, message) values ('bogus', 'This category does not exist')$$, 'bad category rejected', 'check constraint');

-- anon RPCs
select tests.anon();
select public.cast_vote((select id from public.polls limit 1), 'sports');
select public.cast_vote((select id from public.polls limit 1), 'sports');
select tests.eq((select votes from public.poll_tallies where option_id = 'sports'), 2, 'votes are tallied');
select tests.fails($$select public.cast_vote((select id from public.polls limit 1), 'not-an-option')$$, 'unknown poll option rejected', 'Unknown poll');
select tests.fails($$update public.poll_tallies set votes = 999$$, 'anon cannot edit tallies directly', 'permission denied');
select public.record_view('a0000000-0000-0000-0000-000000000001');
select public.record_view('a0000000-0000-0000-0000-000000000001');
select public.record_view('a0000000-0000-0000-0000-000000000002');  -- draft: ignored
select tests.eq((select count(*) from public.trending_article_ids(4)), 1::bigint, 'only published articles trend');
select tests.eq((select views from public.trending_article_ids(4) limit 1), 2::bigint, 'trending counts views');
select tests.fails('select public.bootstrap_admin(''admin@example.test'')', 'anon cannot call bootstrap_admin', 'permission denied');

-- the API-visible surface: private helpers aren't in public, and anon can't read the colleague list
select tests.eq((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.prosecdef
                   and p.proname in ('effective_role','is_staff','is_editor','my_sections','can_write_section','edits_section','my_staff_member_id','cast_vote','record_view','trending_article_ids','staff_directory','is_admin')), 0::bigint,
  'no SECURITY DEFINER helper is exposed in the public schema');
select tests.fails('select * from public.staff_directory()', 'anon cannot list colleagues', 'permission denied');
select tests.fails('select private.staff_directory()', 'anon cannot call the private directory function', 'permission denied');
select tests.fails('select public.is_admin()', 'anon cannot call the is_admin wrapper', 'permission denied');

-- ------------------------------------------------------------ no profile / inactive
select tests.login('00000000-0000-0000-0000-000000000006');
select tests.eq(private.is_staff(), false, 'user without profile has no staff rights');
select tests.fails($$insert into public.articles (slug, title, section_id, created_by) values ('np','np','sports','00000000-0000-0000-0000-000000000006')$$, 'user without profile cannot write', 'row-level security');
select tests.eq(tests.count('select 1 from public.tips'), 0::bigint, 'user without profile reads no tips');
select tests.login('00000000-0000-0000-0000-000000000007');
select tests.eq(private.is_staff(), false, 'inactive account has no rights');

-- ------------------------------------------------------------ writer (school news)
select tests.login('00000000-0000-0000-0000-000000000004');
select tests.eq(tests.count('select 1 from public.articles where status <> ''published'''), 1::bigint, 'writer sees own drafts only');
insert into public.articles (slug, title, section_id, status, featured, is_lead, published_at, body_md)
  values ('w-new', 'Writer piece', 'school-news', 'submitted', true, true, now(), 'hello');
select tests.eq((select featured from public.articles where slug = 'w-new'), false, 'writer cannot self-feature');
select tests.eq((select is_lead from public.articles where slug = 'w-new'), false, 'writer cannot self-promote to lead');
select tests.eq((select published_at from public.articles where slug = 'w-new'), null::timestamptz, 'writer cannot set published_at');
select tests.eq((select created_by from public.articles where slug = 'w-new'), '00000000-0000-0000-0000-000000000004'::uuid, 'created_by forced to caller');
select tests.fails($$insert into public.articles (slug, title, section_id) values ('w-sports','x','sports')$$, 'writer cannot write outside own section', 'row-level security');
select tests.fails($$insert into public.articles (slug, title, section_id, status) values ('w-pub','x','school-news','published')$$, 'writer cannot insert published', 'row-level security');
update public.articles set body_md = 'edited' where slug = 'w-new';
select tests.eq((select body_md from public.articles where slug = 'w-new'), 'edited', 'writer edits own submission');
select tests.fails($$update public.articles set status = 'published' where slug = 'w-new'$$, 'writer cannot publish', 'row-level security');
select tests.affects($$update public.articles set title = 'hax' where slug = 'pub-news'$$, 0, 'writer cannot edit own already-published article');
select tests.affects($$update public.articles set title = 'hax' where slug = 'draft-sports'$$, 0, 'writer cannot edit others'' drafts');
select tests.affects($$delete from public.articles where slug = 'draft-sports'$$, 0, 'writer cannot delete others'' drafts');
select tests.affects($$delete from public.articles where slug = 'pub-news'$$, 0, 'writer cannot delete published article');
select tests.eq(tests.count('select 1 from public.tips'), 0::bigint, 'writer reads no tips');
select tests.eq(tests.count('select 1 from public.profiles'), 1::bigint, 'writer sees only own profile');
update public.profiles set role = 'admin', sections = '{sports,school-news}', active = true where id = auth.uid();
select tests.eq((select role from public.profiles where id = auth.uid()), 'writer', 'writer cannot escalate own role');
select tests.eq((select sections from public.profiles where id = auth.uid()), '{school-news}'::text[], 'writer cannot change own sections');
update public.profiles set display_name = 'Renamed Writer' where id = auth.uid();
select tests.eq((select display_name from public.profiles where id = auth.uid()), 'Renamed Writer', 'writer can rename self');
select tests.fails($$insert into public.profiles (id, email, role) values (gen_random_uuid(), 'x@example.test', 'admin')$$, 'cannot insert profiles via API', 'permission denied');
select tests.fails($$insert into public.sections (id, name) values ('hack', 'hack')$$, 'writer cannot create sections', 'row-level security');
select tests.affects($$update public.site_settings set value = '{}'::jsonb$$, 0, 'writer cannot edit settings');
select tests.affects($$update public.games set status = 'cancelled'$$, 0, 'writer cannot edit games');
select tests.fails($$insert into public.polls (question, options) values ('q?', '[{"id":"a","label":"a"},{"id":"b","label":"b"}]')$$, 'writer cannot create polls', 'row-level security');
insert into public.article_comments (article_id, author_id, body) values ('a0000000-0000-0000-0000-000000000002', auth.uid(), 'Question for the editor');
select tests.fails($$insert into public.article_comments (article_id, author_id, body) values ('a0000000-0000-0000-0000-000000000003', auth.uid(), 'Comment on someone else''s draft')$$, 'writer cannot comment on unrelated drafts', 'row-level security');
-- writer's staff bio
select tests.eq(tests.count('select 1 from public.staff_directory()'), 6::bigint, 'staff directory lists colleagues (no emails)');

-- ------------------------------------------------------------ other writer (sports)
select tests.login('00000000-0000-0000-0000-000000000005');
select tests.eq(tests.count($$select 1 from public.articles where slug = 'draft-news'$$), 0::bigint, 'writers cannot read each other''s drafts');
select tests.eq(tests.count('select 1 from public.article_comments'), 0::bigint, 'comment threads are private to author + editors');

-- ------------------------------------------------------------ news editor
select tests.login('00000000-0000-0000-0000-000000000003');
select tests.eq(tests.count($$select 1 from public.articles where slug = 'draft-news'$$), 1::bigint, 'editor reads drafts in own section');
select tests.eq(tests.count($$select 1 from public.articles where slug = 'draft-sports'$$), 0::bigint, 'editor cannot read drafts of other sections');
select tests.eq(tests.count('select 1 from public.article_comments'), 1::bigint, 'editor reads feedback thread in own section');
update public.articles set status = 'published', is_lead = true where slug = 'w-new';
select tests.eq((select published_at is not null from public.articles where slug = 'w-new'), true, 'publishing stamps published_at');
select tests.eq((select is_lead from public.articles where slug = 'w-new'), true, 'editor can set lead story');
select tests.eq(tests.count('select 1 from public.articles where is_lead'), 1::bigint, 'only one lead story at a time');
update public.articles set title = 'Retitled', update_note = 'Corrected a name.' where slug = 'w-new';
select tests.eq((select updated_at is not null from public.articles where slug = 'w-new'), true, 'update note stamps updated_at');
update public.articles set slug = 'changed-slug' where slug = 'w-new';
select tests.eq(tests.count($$select 1 from public.articles where slug = 'w-new'$$), 1::bigint, 'published slugs are immutable');
select tests.affects($$update public.articles set title = 'nope' where slug = 'draft-sports'$$, 0, 'editor cannot edit other sections');
select tests.fails($$update public.articles set section_id = 'sports' where slug = 'draft-news'$$, 'editor cannot move article into foreign section', 'row-level security');
select tests.affects($$delete from public.articles where slug = 'w-new'$$, 0, 'editor cannot delete published articles');
-- tips: own section + unassigned only
select tests.eq(tests.count('select 1 from public.tips'), 3::bigint, 'news editor sees news tip + general tips (+ the anonymous one)');
select tests.eq(tests.count($$select 1 from public.tips where section_id = 'sports'$$), 0::bigint, 'news editor cannot see sports tips');
update public.tips set status = 'in_review', internal_notes = 'Looking into it', message = 'REWRITTEN' where id = 'b0000000-0000-0000-0000-000000000002';
select tests.eq((select status from public.tips where id = 'b0000000-0000-0000-0000-000000000002'), 'in_review', 'editor triages tips');
select tests.eq((select message from public.tips where id = 'b0000000-0000-0000-0000-000000000002'), 'A school news tip for editors', 'editor cannot rewrite a tip''s message');
select tests.affects($$delete from public.tips where id = 'b0000000-0000-0000-0000-000000000002'$$, 0, 'editor cannot delete tips');
select tests.affects($$update public.games set status = 'cancelled'$$, 0, 'news editor cannot edit games');
insert into public.polls (question, options) values ('Pick one?', '[{"id":"a","label":"A"},{"id":"b","label":"B"}]');
select tests.eq(tests.count($$select 1 from public.polls where question = 'Pick one?'$$), 1::bigint, 'editors create polls');
select tests.fails($$insert into public.sections (id, name) values ('hack', 'hack')$$, 'editor cannot create sections', 'row-level security');
select tests.eq(tests.count('select 1 from public.audit_log'), 0::bigint, 'editor cannot read audit log');

-- ------------------------------------------------------------ sports editor
select tests.login('00000000-0000-0000-0000-000000000002');
insert into public.games (sport, opponent, starts_at, status, our_score, their_score)
  values ('Football', 'Somewhere HS', now() - interval '1 day', 'final', 21, 14);
select tests.eq(tests.count('select 1 from public.games'), 1::bigint, 'sports editor manages scoreboard');
select tests.eq(tests.count('select 1 from public.tips'), 3::bigint, 'sports editor sees sports tip + general tips');

-- ------------------------------------------------------------ admin, password only (no 2FA yet)
select tests.login('00000000-0000-0000-0000-000000000001', 'aal1');
select tests.eq(public.is_admin(), false, 'admin without 2FA has no admin rights');
select tests.eq(private.is_staff(), false, 'admin without 2FA has no staff rights either');
select tests.eq(tests.count('select 1 from public.profiles'), 1::bigint, 'admin without 2FA only sees own profile');
select tests.eq(tests.count('select 1 from public.tips'), 0::bigint, 'admin without 2FA cannot read tips');
select tests.affects($$update public.sections set name = 'Hacked' where id = 'sports'$$, 0, 'admin without 2FA cannot edit sections');

-- ------------------------------------------------------------ admin with 2FA
select tests.login('00000000-0000-0000-0000-000000000001', 'aal2');
select tests.eq(public.is_admin(), true, 'admin with 2FA is admin');
select tests.eq(tests.count('select 1 from public.profiles'), 6::bigint, 'admin reads all profiles');
select tests.eq(tests.count('select 1 from public.tips'), 4::bigint, 'admin reads all tips');
update public.profiles set role = 'editor', sections = '{sports}' where id = '00000000-0000-0000-0000-000000000005';
select tests.eq((select role from public.profiles where id = '00000000-0000-0000-0000-000000000005'), 'editor', 'admin changes roles');
select tests.fails($$update public.profiles set role = 'writer' where id = '00000000-0000-0000-0000-000000000001'$$, 'last admin cannot be demoted', 'At least one active admin');
select tests.fails($$update public.profiles set active = false where id = '00000000-0000-0000-0000-000000000001'$$, 'last admin cannot be deactivated', 'At least one active admin');
update public.sections set subsections = '{A,B}' where id = 'sports';
select tests.eq((select subsections from public.sections where id = 'sports'), '{A,B}'::text[], 'admin edits sections');
update public.site_settings set value = jsonb_set(value, '{tagline}', '"New tagline"') where key = 'site';
select tests.eq((select value ->> 'tagline' from public.site_settings where key = 'site'), 'New tagline', 'admin edits settings');
insert into public.staff_members (slug, name) values ('new-person', 'New Person');
select tests.eq(tests.count($$select 1 from public.staff_members where slug = 'new-person'$$), 1::bigint, 'admin adds staff');
delete from public.tips where id = 'b0000000-0000-0000-0000-000000000001';
select tests.eq(tests.count('select 1 from public.tips'), 3::bigint, 'admin deletes tips');
select tests.eq(tests.count('select 1 from public.audit_log') >= 5, true, 'admin reads audit log');
select tests.eq(tests.count($$select 1 from public.audit_log where summary like '%Looking into it%' or summary like '%tip%'$$), 0::bigint, 'audit log never contains tip contents');

-- ------------------------------------------------------------ staff bio self-service
select tests.logout();
update public.profiles set staff_member_id = (select id from public.staff_members where slug = 'allison-bailey') where id = '00000000-0000-0000-0000-000000000005';
select tests.login('00000000-0000-0000-0000-000000000005');
update public.staff_members set bio = 'My bio', name = 'Hacked Name', sections = '{sports,school-news}' where slug = 'allison-bailey';
select tests.eq((select bio from public.staff_members where slug = 'allison-bailey'), 'My bio', 'staff edit own bio');
select tests.eq((select name from public.staff_members where slug = 'allison-bailey'), 'Allison Bailey', 'staff cannot rename their masthead entry');
select tests.affects($$update public.staff_members set bio = 'x' where slug = 'molly-krenicky'$$, 0, 'staff cannot edit others'' bios');

-- ------------------------------------------------------------ storage
select tests.login('00000000-0000-0000-0000-000000000004');
insert into storage.objects (bucket_id, name, owner) values ('media', 'a.jpg', auth.uid());
select tests.anon();
select tests.fails($$insert into storage.objects (bucket_id, name) values ('media', 'evil.jpg')$$, 'anon cannot upload', 'permission denied');
select tests.login('00000000-0000-0000-0000-000000000006');
select tests.fails($$insert into storage.objects (bucket_id, name, owner) values ('media', 'evil.jpg', auth.uid())$$, 'users without a profile cannot upload', 'row-level security');

-- ------------------------------------------------------------ 2FA bypass codes
select tests.logout();
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000011', 'admin2@example.test'),
  ('00000000-0000-0000-0000-000000000012', 'lost.phone@example.test');
insert into public.profiles (id, email, display_name, role, active) values
  ('00000000-0000-0000-0000-000000000011', 'admin2@example.test', 'Second Admin', 'admin', true),
  ('00000000-0000-0000-0000-000000000012', 'lost.phone@example.test', 'Lost Phone', 'admin', true);

select tests.login('00000000-0000-0000-0000-000000000004', 'aal2');
select tests.fails($$select public.create_mfa_bypass('00000000-0000-0000-0000-000000000012')$$, 'writers cannot make bypass codes', 'Only admins');
select tests.login('00000000-0000-0000-0000-000000000011', 'aal1');
select tests.fails($$select public.create_mfa_bypass('00000000-0000-0000-0000-000000000012')$$, 'admins without 2FA cannot make bypass codes', 'Only admins');
select tests.anon();
select tests.fails($$select public.create_mfa_bypass('00000000-0000-0000-0000-000000000012')$$, 'anon cannot make bypass codes', 'permission denied');
select tests.fails($$select public.redeem_mfa_bypass('1234567890')$$, 'anon cannot redeem bypass codes', 'permission denied');
select tests.login('00000000-0000-0000-0000-000000000012', 'aal1');
select tests.fails($$select * from private.mfa_bypass_codes$$, 'signed-in users cannot read the code table', 'permission denied');
select tests.fails($$select * from private.mfa_bypass_sessions$$, 'signed-in users cannot read bypass sessions', 'permission denied');

select tests.login('00000000-0000-0000-0000-000000000011', 'aal2');
select tests.fails($$select public.create_mfa_bypass('00000000-0000-0000-0000-000000000011')$$, 'admins cannot make a bypass code for themselves', 'another admin');
select tests.fails($$select public.create_mfa_bypass('00000000-0000-0000-0000-000000000012', 1)$$, 'bypass codes last at least 5 minutes', 'between 5 minutes');
select tests.fails($$select public.create_mfa_bypass('00000000-0000-0000-0000-000000000012', 5000)$$, 'bypass codes last at most 24 hours', 'between 5 minutes');
select tests.fails($$select public.create_mfa_bypass('00000000-0000-0000-0000-000000000099')$$, 'bypass codes need a real account', 'No active account');
select set_config('tests.code', public.create_mfa_bypass('00000000-0000-0000-0000-000000000012', 30), false);
select tests.eq(current_setting('tests.code') ~ '^[0-9]{10}$', true, 'a bypass code is 10 digits');
select tests.eq(tests.count('select 1 from public.mfa_bypass_overview()'), 1::bigint, 'admin sees the outstanding code');
select tests.eq((select user_id from public.mfa_bypass_overview()), '00000000-0000-0000-0000-000000000012'::uuid, 'overview names who holds it');
select tests.logout();
select tests.eq(tests.count($$select 1 from private.mfa_bypass_codes where code_hash = current_setting('tests.code') or code_hash not like '$2%'$$), 0::bigint, 'only a bcrypt hash of the code is stored');
select tests.eq(tests.count($$select 1 from public.audit_log where summary like 'created a 2FA bypass code for lost.phone@example.test%'$$), 1::bigint, 'creating a code is audited');
select tests.eq(tests.count($$select 1 from public.audit_log where summary like '%' || current_setting('tests.code') || '%'$$), 0::bigint, 'the code itself is never logged');

-- the person it was made for
select tests.login('00000000-0000-0000-0000-000000000012', 'aal1', 'aaaaaaaa-0000-0000-0000-000000000001');
select tests.eq(public.mfa_bypass_active(), false, 'no bypass before redeeming');
select tests.eq(public.is_admin(), false, 'password-only admin is not admin');
select tests.eq(tests.count('select 1 from public.mfa_bypass_overview()'), 0::bigint, 'non-admins see no overview');
select tests.eq(public.redeem_mfa_bypass('0000000000'), false, 'a wrong code is refused');
select tests.eq(public.redeem_mfa_bypass('12'), false, 'a malformed code is refused');
select tests.eq(public.is_admin(), false, 'still not admin after a wrong guess');
select tests.login('00000000-0000-0000-0000-000000000004', 'aal1', 'aaaaaaaa-0000-0000-0000-000000000002');
select tests.eq(public.redeem_mfa_bypass(current_setting('tests.code')), false, 'someone else cannot redeem the code');
select tests.login('00000000-0000-0000-0000-000000000012', 'aal1');
select tests.eq(public.redeem_mfa_bypass(current_setting('tests.code')), false, 'a session without an id cannot redeem');
select tests.login('00000000-0000-0000-0000-000000000012', 'aal1', 'aaaaaaaa-0000-0000-0000-000000000001');
select tests.eq(public.redeem_mfa_bypass(substr(current_setting('tests.code'), 1, 3) || ' - ' || substr(current_setting('tests.code'), 4, 3) || '-' || substr(current_setting('tests.code'), 7)), true, 'the right code works, however it is typed');
select tests.eq(public.mfa_bypass_active(), true, 'the session is now bypassed');
select tests.eq(public.is_admin(), true, 'a bypassed admin session has admin rights');
select tests.eq(tests.count('select 1 from public.tips'), 3::bigint, 'and can read admin-only data');
select tests.eq(public.redeem_mfa_bypass(current_setting('tests.code')), false, 'a code works only once');
select tests.login('00000000-0000-0000-0000-000000000012', 'aal1', 'aaaaaaaa-0000-0000-0000-000000000003');
select tests.eq(public.is_admin(), false, 'a different login session is not bypassed');
select tests.login('00000000-0000-0000-0000-000000000011', 'aal1', 'aaaaaaaa-0000-0000-0000-000000000001');
select tests.eq(public.is_admin(), false, 'nor is another account on the same session id');
select tests.logout();
update private.mfa_bypass_sessions set expires_at = now() - interval '1 minute';
select tests.login('00000000-0000-0000-0000-000000000012', 'aal1', 'aaaaaaaa-0000-0000-0000-000000000001');
select tests.eq(public.is_admin(), false, 'a bypassed session expires');
select tests.logout();
select tests.eq(tests.count($$select 1 from public.audit_log where summary = 'signed in with a 2FA bypass code' and actor_email = 'lost.phone@example.test'$$), 1::bigint, 'using a code is audited');

-- guess limit, replacement, revoking, expiry
select tests.login('00000000-0000-0000-0000-000000000011', 'aal2');
select set_config('tests.code', public.create_mfa_bypass('00000000-0000-0000-0000-000000000012', 60), false);
select tests.login('00000000-0000-0000-0000-000000000012', 'aal1', 'aaaaaaaa-0000-0000-0000-000000000004');
select tests.eq(
  (select (public.redeem_mfa_bypass(case when current_setting('tests.code') = '1111111111' then '2222222222' else '1111111111' end)) from generate_series(1, 5) group by 1),
  false, 'five wrong guesses are all refused');
select tests.eq(public.redeem_mfa_bypass(current_setting('tests.code')), false, 'after five wrong guesses even the right code is dead');
select tests.eq(public.is_admin(), false, 'so the session is not bypassed');
select tests.login('00000000-0000-0000-0000-000000000011', 'aal2');
select tests.eq((select failed_attempts from public.mfa_bypass_overview()), 5, 'admin can see that it was locked');
select tests.eq(tests.count($$select 1 from public.audit_log where summary like '2FA bypass code locked%'$$), 1::bigint, 'locking is audited');
select set_config('tests.old', public.create_mfa_bypass('00000000-0000-0000-0000-000000000012', 60), false);
select set_config('tests.code', public.create_mfa_bypass('00000000-0000-0000-0000-000000000012', 60), false);
select tests.eq(tests.count('select 1 from public.mfa_bypass_overview()'), 1::bigint, 'a new code replaces the old one');
select tests.login('00000000-0000-0000-0000-000000000012', 'aal1', 'aaaaaaaa-0000-0000-0000-000000000005');
select tests.eq(public.redeem_mfa_bypass(current_setting('tests.old')), false, 'the replaced code no longer works');
select tests.login('00000000-0000-0000-0000-000000000011', 'aal2');
select public.revoke_mfa_bypass('00000000-0000-0000-0000-000000000012');
select tests.eq(tests.count('select 1 from public.mfa_bypass_overview()'), 0::bigint, 'revoking clears the outstanding code');
select tests.login('00000000-0000-0000-0000-000000000012', 'aal1', 'aaaaaaaa-0000-0000-0000-000000000005');
select tests.eq(public.redeem_mfa_bypass(current_setting('tests.code')), false, 'a revoked code no longer works');
select tests.login('00000000-0000-0000-0000-000000000011', 'aal2');
select set_config('tests.code', public.create_mfa_bypass('00000000-0000-0000-0000-000000000012', 5), false);
select tests.logout();
update private.mfa_bypass_codes set expires_at = now() - interval '1 second' where used_at is null;
select tests.login('00000000-0000-0000-0000-000000000012', 'aal1', 'aaaaaaaa-0000-0000-0000-000000000005');
select tests.eq(public.redeem_mfa_bypass(current_setting('tests.code')), false, 'an expired code no longer works');
select tests.eq(public.is_admin(), false, 'and grants nothing');

-- ------------------------------------------------------------ server-side invariants
select tests.logout();
select tests.eq((select created_at > now() - interval '1 minute' from public.tips order by created_at desc limit 1), true, 'tip timestamps are server-controlled');
do $$
begin
  for i in 1..60 loop
    insert into public.tips (category, message) values ('other', 'flood test message number ' || i);
  end loop;
  raise exception 'flood protection did not trigger';
exception when others then
  if sqlerrm !~ 'busy' then raise; end if;
  raise notice 'ok - tip flood protection (%)', sqlerrm;
end $$;

rollback;
\echo ALL RLS TESTS PASSED
