#!/usr/bin/env bash
# Applies every migration to a scratch database on a plain PostgreSQL server
# (with a tiny Supabase shim) and runs the row-level-security test-suite.
#
#   PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres ./scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${TEST_DB_NAME:-falcon_test}"

# Supabase's "Automatically expose new tables" setting: run with it off (recommended)
# and on (platform default). Set EXPOSE_MODES="off" to run just one.
for mode in ${EXPOSE_MODES:-off on}; do
  echo "=== auto-expose new tables: $mode ==="
  psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
  run() { psql -v ON_ERROR_STOP=1 -q -v auto_expose="$mode" -d "$DB" -f "$1"; }
  run supabase/tests/00_local_shim.sql 2>/dev/null
  for f in supabase/migrations/*.sql; do echo "• $f"; run "$f"; done
  psql -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/10_rls.test.sql 2>&1 | grep -E "^(NOTICE|psql|ERROR|ALL)|FAIL|ok -" | sed 's/^psql:[^ ]* //'
done
