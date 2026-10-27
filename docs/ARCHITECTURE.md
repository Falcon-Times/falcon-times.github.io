# Architecture & security

## The moving parts

| Piece | Where it runs | Why |
| --- | --- | --- |
| Public site, newsroom and admin pages | GitHub Pages (static files built by GitHub Actions) | free, fast, no server to maintain |
| Data, accounts, photo storage | Supabase (Postgres + Auth + Storage) | GitHub Pages can't store anything |
| `admin-users` function | Supabase Edge Function | the only place that may create/disable logins |
| Live weather in the top bar | Open-Meteo (no key, no account) | optional, hidden if it fails |

There is no server of our own. Browsers talk straight to Supabase using its public key; **the database
decides what each request may do**.

## Who can do what

Roles live in `public.profiles`. Only an admin (or the `admin-users` function) can change them.

| | Reader | Writer | Section leader | Admin |
| --- | :-: | :-: | :-: | :-: |
| Read published stories, polls, scores | ✅ | ✅ | ✅ | ✅ |
| Vote in a poll / send a tip | ✅ | ✅ | ✅ | ✅ |
| Draft & submit stories in their sections | | ✅ | ✅ | ✅ (any) |
| Edit a story after it's published | | | ✅ own sections | ✅ |
| Publish, schedule, unpublish, feature, set the lead story | | | ✅ own sections | ✅ |
| Read & triage tips | | | ✅ own sections + general | ✅ all |
| Scoreboard (sports leader), polls, announcements, quotes | | | ✅ | ✅ |
| Edit own bio/photo | | ✅ | ✅ | ✅ |
| Accounts, staff roster, sections, settings, activity log | | | | ✅ **(needs 2FA)** |

A "section" is assigned to each person by an admin (`profiles.sections`). A writer for *Sports* cannot
touch *School News*, even by crafting requests by hand — the database refuses.

## Defence in depth

1. **Row-level security (RLS)** on every table (`supabase/migrations/…01_schema.sql`). Anonymous visitors
   can only `select` public content, `insert` a tip, and call two tiny RPCs (`cast_vote`, `record_view`).
   The tip table has *no* public `select` policy — not even the tipster can read tips back.
2. **Field-level guards** (database triggers). RLS chooses rows; triggers choose fields. A writer can't
   flip `featured`/`is_lead`/`published_at`, nobody but an admin can change a role, editors can't rewrite
   what a tipster sent, `created_by` can't be forged, published URLs can't change, and the last active admin
   can't be demoted, disabled or deleted.
3. **Two-factor for admins.** `effective_role()` only treats someone as an admin if the session's JWT says
   `aal2` (a TOTP code was verified). A stolen admin password is therefore *worthless on its own* — it
   grants no more power than a stranger's. The same check protects the Edge Function.
   *Bypass codes:* an admin can issue a one-time, 10-digit code (stored only as a bcrypt hash in
   `private.mfa_bypass_codes`, never exposed by the API) that stands in for the TOTP step. Redeeming it
   (`redeem_mfa_bypass`, password session required) records the login's `session_id` in
   `private.mfa_bypass_sessions` for 8 hours, and `effective_role()` accepts that as an alternative to
   `aal2`. Codes are single-use, bound to one account, die after 5 wrong guesses and replace any earlier
   code; failures all look identical so guesses reveal nothing. Everything is audited (the digits never are).
   The helper functions behind those policies (`is_staff`, `edits_section`, …) are `SECURITY DEFINER` and
   live in a `private` schema the API does not expose, so they can't be called as `/rest/v1/rpc/…`. The few
   things the browser needs (`cast_vote`, `record_view`, `trending_article_ids`, `is_admin`, `staff_directory`)
   are thin `SECURITY INVOKER` wrappers in `public`. This keeps Supabase's Security Advisor clean.
4. **Service-role key isolation.** Creating and deleting logins needs Supabase's all-powerful service-role key.
   It exists only inside the Edge Function's environment (injected by Supabase), never in this repo, GitHub, or
   a browser. The function first calls `is_admin()` with the *caller's* token.
5. **No self-service sign-up.** Public sign-ups are disabled in Supabase; accounts come only from an admin.
   Temporary passwords are random, shown once, and must be replaced at first login. Passwords must be ≥ 12
   characters with lowercase, uppercase and a digit (set in Supabase; `supabase/functions/_shared/passwordPolicy.ts`
   mirrors it so the screens and the account function can explain it up front).
6. **Output safety.** Story bodies are Markdown rendered then sanitised with DOMPurify (no scripts, event
   handlers, iframes, forms, `javascript:` links). The only embed is YouTube via `youtube-nocookie.com`.
   All other UI is rendered by Preact, which escapes text by default.
7. **Public client is always anonymous.** Even if a section leader is signed in on the same browser, the
   public site uses a separate anonymous client, so it never shows unpublished drafts.
8. **Audit trail.** Changes to stories, accounts, roster, sections, settings, polls, scores, quotes,
   announcements and tips are logged with who/when/what-columns (never tip text).
9. **Abuse limits.** Tip submissions have length limits, a hidden honeypot field and a site-wide cap
   (60 per 10 minutes). Poll votes are one-per-browser (remembered locally) — good for a school poll, not a
   ballot box. Supabase rate-limits sign-in attempts.

Tested by `supabase/tests/10_rls.test.sql` (≈100 assertions run in CI) and an end-to-end browser suite.

## Supabase Security Advisor

Run it from *Advisors → Security Advisor* after deploying. Expected result: no errors and no function warnings.
One warning may remain: **Leaked Password Protection Disabled**. That is a Supabase dashboard setting
(*Authentication → Sign In / Providers → Email*) and is only available on paid plans. It's low risk here
because accounts are created by admins with random temporary passwords, members must choose 12+ characters,
and admins also need a second factor. Enable it if you ever upgrade.

## Secrets: what lives where

| Value | Public? | Stored in |
| --- | --- | --- |
| Supabase URL, anon/publishable key | Public by design (in every page) | GitHub Secrets → injected at build time |
| Supabase **service-role** key | **Secret** | Supabase Edge Function environment only |
| Database password, access token, project ref | **Secret** | GitHub Secrets, used only by the deploy workflow |
| Club contact email, social links | Public | Database (*Site settings*) — editable without a deploy |
| Members' passwords | **Secret** | Supabase Auth (hashed); never visible to anyone |

## Data model (short version)

`sections` → `articles` (status: draft → submitted → published → archived) · `article_comments` (private editor
notes) · `article_views` (anonymous daily counters for "trending") · `staff_members` (public roster/bios) ·
`profiles` (login accounts; separate from the roster) · `tips` · `polls` + `poll_tallies` · `games` · `quotes` ·
`announcements` · `site_settings` · `audit_log`. Photos live in the public `media` storage bucket.

"Trending" = stories an editor pinned, then most-read in the last 7 days, then newest.

## Privacy notes for a student publication

* The site stores **no analytics, cookies or trackers.** Fonts are self-hosted. Two optional third-party
  requests exist: Open-Meteo (weather; sends the visitor's IP to them) and YouTube (only when a story embeds a video).
* The tip line collects only what the sender types. Don't ask for more than you need; delete resolved tips
  you no longer need (admins can).
* The staff roster publishes **names, titles, optional bios and photos of students**. Confirm each student
  (and their family, per school policy) is comfortable with that before listing them or adding a photo, and
  remove anyone who asks — *Staff roster → Edit → Listed on the site*.
* Photos are public once uploaded. Credit photographers and avoid identifying minors beyond what the school permits.

## Known limitations

* Article links are `#/article/…` (hash routing) so GitHub Pages needs no server rules. They share fine, but
  social-media link previews show the site's generic card rather than the story's headline.
* Search covers the 150 newest stories, in the browser.
* One poll vote per browser is not tamper-proof.
* Free Supabase projects pause when idle; the keep-alive workflow mitigates this.
