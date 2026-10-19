# Development

Requires Node 22+.

```bash
npm ci
npm run dev        # http://localhost:5173  (public site, /newsroom/, /admin/)
```

Without any configuration the public site runs on built-in starter content and the panels show a
"backend not connected" notice. To develop against a real Supabase project, copy `.env.example` to
`.env.local` and fill in your (public) URL and anon key.

## Tests

| Command | What it covers | Needs |
| --- | --- | --- |
| `npm run typecheck` | TypeScript | — |
| `npm test` | Unit tests (formatting, markdown sanitising, routing) | — |
| `npm run seed:check` | `supabase/migrations/…03_seed…` matches `data/seed.json` | — |
| `npm run test:db` | Applies all migrations to a scratch database and runs ~100 row-level-security assertions | PostgreSQL (`PGHOST/PGUSER/…` env vars; superuser) |
| `npm run test:e2e` | Browser tests of the whole newsroom workflow | PostgreSQL, a `postgrest` binary, Chromium, the harness below |

### End-to-end harness

`tests/harness/server.mjs` stands in for Supabase locally: PostgREST serves the real schema, a small fake of
GoTrue handles passwords/sessions/TOTP (code `123456`), storage is in memory, and the **real** `admin-users`
function code runs in-process. To run it:

```bash
export PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres POSTGREST_BIN=/path/to/postgrest
./tests/harness/run.sh &                                  # gateway on :54330
ANON=$(curl -s localhost:54330/__test/anon-key)
VITE_SUPABASE_URL=http://127.0.0.1:54330 VITE_SUPABASE_ANON_KEY=$ANON npm run dev &
npm run test:e2e
```

CI does exactly this (see `.github/workflows/ci.yml`).

## Changing the database

Add a **new** file in `supabase/migrations/` (timestamp-prefixed); never edit one that has been deployed.
Add RLS tests to `supabase/tests/10_rls.test.sql`. To change starter content, edit `data/seed.json` and run
`npm run seed:sql` (this only affects brand-new databases — existing sites edit content in the admin panel).

## Dependency updates

Dependabot proposes monthly minor/patch updates (grouped into one pull request) and GitHub Actions
updates. Major upgrades of npm packages are deliberately ignored — Vite, Preact and friends usually
need code changes. To upgrade one, do it on a branch (`npm i vite@latest`), fix what breaks, and
make `npm run build`, `npm test` and `npm run test:e2e` pass before merging.

## Conventions

[Conventional Commits](https://www.conventionalcommits.org) (`feat(newsroom): …`, `fix(db): …`), small focused
commits, and no secrets in the repo.
