# The Falcon Times

The student newspaper of Avon High School — <https://falcon-times.github.io>

A fast, mobile-friendly news site with a built-in newsroom: reporters write and submit
stories, section leaders review and publish them, readers can vote in polls and send
anonymous tips, and an admin panel runs the whole thing — all protected by per-person
accounts (and two-factor sign-in for admins).

| Area | Address | Who |
| --- | --- | --- |
| The newspaper | `/` | everyone |
| Newsroom (write, review, tip line, polls, scoreboard) | `/newsroom/` | writers & section leaders |
| Admin (accounts, staff roster, sections, settings, activity log) | `/admin/` | admins only |

## How it works

```
 GitHub Pages  ──►  static site (Preact + Vite)  ──►  Supabase
 (built by GitHub Actions)                              ├─ Postgres + row-level security   (articles, tips, polls, …)
                                                        ├─ Auth (passwords + TOTP 2FA)    (one account per person)
                                                        ├─ Storage                         (article photos)
                                                        └─ Edge Function "admin-users"     (create/disable accounts)
```

GitHub Pages can only serve static files, so everything dynamic — logins, articles, the tip
line — lives in a small managed backend (Supabase's free tier is plenty). The browser only ever
holds Supabase's *public* key; **what each person may do is enforced inside the database**, not
in the page. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the security model.

## Getting it running

Follow **[docs/SETUP.md](docs/SETUP.md)** — about 30 minutes, no coding. In short:

1. Create a free Supabase project and run the database setup (one click via GitHub Actions).
2. Add a few **GitHub Secrets** (no keys or passwords live in this repository).
3. Switch GitHub Pages to deploy from GitHub Actions.
4. Create your admin account, then add everyone else from the admin panel.

Until the backend is connected the public site still loads, showing starter content.

## Documentation

| Doc | For |
| --- | --- |
| [docs/SETUP.md](docs/SETUP.md) | Whoever deploys and administers the site |
| [docs/CONTENT-GUIDE.md](docs/CONTENT-GUIDE.md) | **Section leaders & writers** — share this with the club |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Security model, data model, privacy notes |
| [docs/BRAND.md](docs/BRAND.md) | Colours, fonts, article layout |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Running and testing locally |

## Project layout

```
index.html, newsroom/, admin/   three entry pages (public, staff, admin)
src/site/                       the public newspaper
src/console/                    shared newsroom/admin code (auth, editor, tables, forms)
src/newsroom/, src/admin/       the two panels (just navigation + routes)
src/lib/, src/ui/, src/styles/  data access, helpers, components, brand tokens
data/seed.json                  starter sections, staff roster, settings, quotes, welcome story
supabase/migrations/            database schema, security policies, seed data
supabase/functions/admin-users/ account-management Edge Function
tests/                          unit, end-to-end and harness code (supabase/tests: RLS tests)
.github/workflows/              deploy, CI, database deploy, keep-alive
```

## Common commands

```bash
npm ci               # install
npm run dev          # local dev server (copy .env.example to .env.local first for a live backend)
npm run build        # type-check + production build into dist/
npm test             # unit tests
npm run test:db      # row-level-security tests (needs a local PostgreSQL)
npm run test:e2e     # full browser tests against a local Supabase stand-in
```
