# Setup guide

Everything here is point-and-click except pasting a few values. Budget about 30 minutes.

**What you'll end up with:** the site on GitHub Pages, a Supabase project holding the data and
logins, and a handful of GitHub Secrets connecting the two.

> **About secrets.** Two values in this setup look like keys but are *public by design* —
> the Supabase **URL** and **anon (publishable) key** are compiled into every web page, exactly
> like any other Supabase site. They can't do anything the database's security rules don't
> allow. We still keep them out of the code and supply them from GitHub Secrets so the repo
> stays clean and you can rotate them. Everything actually sensitive — the **service-role
> key**, your **database password** and your **access token** — is never committed and never
> reaches a browser.

## 1. Create the Supabase project

1. Sign up at <https://supabase.com> (free) and **New project**. Pick a region near Connecticut
   (e.g. *East US (N. Virginia)*).
2. Choose a strong **database password** and save it in your password manager — you'll need it in step 3.
3. When creating the project, in the **Security** section choose:

   | Setting | Choose | Why |
   | --- | --- | --- |
   | Enable Data API | **On** | the site talks to the database through it |
   | Automatically expose new tables | **Off** (recommended) | nothing is reachable unless the migrations grant it — they grant exactly what the site needs (the setup also works if you leave it on) |
   | Enable automatic RLS | **On** | any table added later starts locked down (row-level security on) until you write a policy |

   These can be changed later under **Project Settings → Data API**.
4. When it's ready, note these (all under **Project Settings**):
   * **Project URL** — *API* page, looks like `https://abcdxyz.supabase.co`
   * **Project ref** — the `abcdxyz` part of that URL
   * **anon / publishable key** — *API Keys* page (the one marked *public* / *anon*; **not** `service_role`/secret)

## 2. Lock down sign-ups and set password rules

Under **Authentication** in the Supabase dashboard:

* **Sign In / Providers →** turn **off** *Allow new users to sign up*.
  Accounts are created only by an admin from the admin panel.
* **Sign In / Providers → Email →** set *Minimum password length* to **12** and *Password requirements*
  to **Lowercase, uppercase letters and digits**. The sign-in screens already explain and check exactly
  these rules; if you ever change them in the dashboard, update
  `supabase/functions/_shared/passwordPolicy.ts` to match (Supabase is the authority, that file just
  produces the friendly messages).
* **Multi-Factor →** make sure **TOTP** is enabled (it is by default).
  Admins are required to use it; other members may opt in.
* Optional: **Attack Protection →** enable CAPTCHA or leaked-password protection if your plan offers it.

## 3. Create the GitHub Secrets

In this repository: **Settings → Secrets and variables → Actions → New repository secret**. Add:

| Secret | Value | Used for |
| --- | --- | --- |
| `SUPABASE_URL` | Project URL from step 1 | building the site (public value) |
| `SUPABASE_ANON_KEY` | anon / publishable key from step 1 | building the site (public value) |
| `SUPABASE_PROJECT_REF` | the project ref | deploying the database & function |
| `SUPABASE_DB_PASSWORD` | database password from step 1 | applying migrations |
| `SUPABASE_ACCESS_TOKEN` | a personal access token from <https://supabase.com/dashboard/account/tokens> | the Supabase CLI in Actions |

## 4. Deploy the database and the account function

1. Go to **Actions → "Deploy database & functions" → Run workflow**.
2. It applies the files in `supabase/migrations/` (tables, security rules, storage bucket, starter
   sections/roster/settings/quotes/poll/welcome story) and deploys the `admin-users` Edge Function.

<details><summary>Prefer to do it by hand?</summary>

In Supabase's **SQL Editor**, run each file in `supabase/migrations/` in order (`…01_schema.sql`,
`…02_storage.sql`, `…03_seed_reference_data.sql`). The `admin-users` function must be deployed with the
Supabase CLI: `supabase functions deploy admin-users --no-verify-jwt --project-ref <ref>`.
</details>

## 5. Turn on GitHub Pages from Actions

**Settings → Pages → Build and deployment → Source: GitHub Actions.**
Then merge to `main` (or run **Actions → "Deploy site" → Run workflow**). The site appears at
<https://falcon-times.github.io> within a couple of minutes.

## 6. Create the first super admin (you)

1. Supabase dashboard → **Authentication → Users → Add user → Create new user**.
   Enter your email and a strong password, and tick **Auto Confirm User**.
2. **SQL Editor** → run (with your real email and name):

   ```sql
   select public.bootstrap_super_admin('you@example.com', 'Your Name');
   ```
3. Open `https://falcon-times.github.io/admin/`, sign in, and follow the prompt to scan a QR code
   with an authenticator app (Google Authenticator, Authy, 1Password…). Admin access only works
   after this second step.

> **Super admin vs admin.** Like Google Workspace, a **super admin** can do everything an **admin** can *and* is the
> only one who can create, promote, demote, disable, delete or reset admin-level accounts (admins and other super
> admins). Admins run the site day to day — content, settings, writers and section leaders — but can't change who
> the admins are. Keep two super admins if you can; the last one can't be removed. (Sites set up before this role
> existed: the first admin ever created was promoted automatically — check **People & access**. To promote
> someone else from the SQL editor: `select public.bootstrap_super_admin('them@example.com');`.)

> **Lost your authenticator?** In the Supabase dashboard go to *Authentication → Users*, open your
> user and delete the MFA factor; you'll be asked to enrol a new one at next sign-in. Keep a second
> admin account (another trusted person) as a backup.

## 7. Add everyone else

In the admin panel → **People & access → Add account**.

| Person | Role | Sections |
| --- | --- | --- |
| Section leaders (School News, Sports, Opinion + Advice, Culture + Entertainment, Social Media, Photography + Video) | **Section leader** | their own section |
| Reporters, photographers, designers | **Writer** | the section(s) they write for |
| Trusted site administrators | **Admin** (only a super admin can create these) | (all) |
| Whoever owns the site's accounts (a teacher/advisor, a second owner) | **Super admin** | (all) |

* Each person gets **their own login**. The system generates a one-time temporary password that you
  hand over in person; they must choose their own at first sign-in.
* *Link a staff profile* so they can edit their own bio and photo from **My profile**.
* Share [docs/CONTENT-GUIDE.md](CONTENT-GUIDE.md) and the address `https://falcon-times.github.io/newsroom/` with them.
* To disable someone (graduated, left the club) use **Manage → Account enabled**. Their stories stay.
* **Which button?** In **Manage** each account action says what it does; in short:

  | Problem | Use | What happens |
  | --- | --- | --- |
  | Forgot their **password** | *Reset password* | Replaces it with a one-time temporary password you hand over; they choose their own at next sign-in. Two-factor is untouched. |
  | Forgot their **phone** today | *Create bypass code* | A one-time code gets them past the authenticator step once. Password and authenticator stay as they are. |
  | Lost the authenticator **for good** | *Reset two-factor* | Removes the authenticator; they set up a new one. Password is untouched. |

* **Lost phone or forgot the authenticator?** Open their row (**Manage → Two-factor bypass code**), choose how
  long the code is valid (15 minutes to 24 hours) and press *Create bypass code*. Read them the 10 digits
  (shown once, e.g. `482-915-7306`). On the two-factor screen they pick *Can't use your authenticator?*, type
  the code, and are in — their authenticator stays set up, so you don't need to reset it. A code works
  **once**, only for that person, only after they've entered their own password, and dies after 5 wrong
  guesses. The session it unlocks lasts 8 hours. Every code made or used is in the Activity log. Use
  *Reset two-factor* instead only if the device is gone for good.
  *(An admin can't make a code for themselves — ask another admin. If the only admin loses their
  authenticator, recover with the SQL editor: `delete from auth.mfa_factors where user_id = (select id from auth.users where email = 'you@example.org');`
  then sign in and set up a new authenticator.)*

## 8. Make it yours (admin panel)

* **Site settings** — tagline, the club's public contact email (leave blank to hide), social links, the
  tip-line intro, editorial standards. *Put the club email here, not in the code.*
* **Staff roster** — the public "Meet the newsroom" list and who can be credited in a byline. Add
  bios and photos (or let people add their own).
* **Sections & menu** — rename sections, edit the dropdown sub-sections, reorder, or hide a team.
* **Scoreboard / Polls / Announcement bar / Daily Spark quotes** — also available to section leaders.

## Day-to-day

* **Tips** arrive in *Tip line* (section leaders see tips for their own sections plus general ones).
  Only they and admins can read them. Nothing identifying is stored unless the sender types it in.
* **Activity log** (admin) shows who changed what. Tip text is never logged.
* **Backups:** Supabase's dashboard (*Database → Backups*) has daily backups on paid plans. On the
  free plan, occasionally export the `articles` and `staff_members` tables from *Table Editor*.
* **Free-tier pause:** Supabase pauses idle free projects after about a week. The "Keep Supabase awake"
  workflow pings the project every few days; keep GitHub Actions enabled.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Site shows "backend is not connected" | `SUPABASE_URL` / `SUPABASE_ANON_KEY` secrets missing or the site hasn't been rebuilt since adding them. Re-run **Deploy site**. |
| "Only admins who have signed in with two-factor…" | You're signed in without the 2FA step. Sign out and back in, enter the 6-digit code. |
| Sign-in works but "Your account has not been given access" | The account has no profile — create people through *People & access*, or run `bootstrap_admin` for the first admin. |
| A section leader can't publish | Their account needs the section ticked under *Sections*. |
| Can't create accounts ("Failed to send a request to the Edge Function") | Re-run **Deploy database & functions**; confirm the three Supabase secrets exist. |
| Photos won't upload | Check the `media` bucket exists (Storage) — it's created by migration `…02_storage.sql`. |
