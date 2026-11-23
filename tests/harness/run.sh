#!/usr/bin/env bash
# Starts the local Supabase stand-in for end-to-end tests.
#   needs: PostgreSQL reachable via PG* env vars, and POSTGREST_BIN (default: postgrest on PATH)
#   result: gateway on http://127.0.0.1:54330 (use it as VITE_SUPABASE_URL)
set -euo pipefail
cd "$(dirname "$0")/../.."
export E2E_DB="${E2E_DB:-falcon_e2e}"
export JWT_SECRET="${JWT_SECRET:-super-secret-jwt-token-for-local-tests-only-0123456789}"
PGPORT="${PGPORT:-5432}"; PGHOST="${PGHOST:-127.0.0.1}"

psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $E2E_DB" -c "create database $E2E_DB"
psql -v ON_ERROR_STOP=1 -q -v auto_expose="${AUTO_EXPOSE:-off}" -d "$E2E_DB" -f supabase/tests/00_local_shim.sql 2>/dev/null
for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -q -d "$E2E_DB" -f "$f"; done

PGRST_DB_URI="postgres://authenticator:authenticator@$PGHOST:$PGPORT/$E2E_DB" \
PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$JWT_SECRET" \
PGRST_SERVER_PORT=54331 PGRST_SERVER_HOST=127.0.0.1 PGRST_LOG_LEVEL=warn \
  "${POSTGREST_BIN:-postgrest}" &
PGRST_PID=$!
trap 'kill $PGRST_PID 2>/dev/null' EXIT
sleep 1
node tests/harness/server.mjs
