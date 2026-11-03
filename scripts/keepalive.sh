#!/usr/bin/env bash
# Gives the Supabase project some real activity so the free plan doesn't pause it.
# Used by .github/workflows/keepalive.yml; run it by hand to test:
#   URL=https://<project>.supabase.co KEY=<anon key> ./scripts/keepalive.sh
#
# The anon key is public by design (it ships in the website), but it still comes from a
# GitHub Secret so it isn't committed. Anything that must work exits non-zero, so a broken
# heartbeat shows up as a failed workflow run (GitHub emails you) instead of silently passing.
set -euo pipefail

if [ -z "${URL:-}" ] || [ -z "${KEY:-}" ]; then
  echo "::error::SUPABASE_URL and SUPABASE_ANON_KEY must be set (repository secrets)."
  exit 1
fi
URL="${URL%/}"
auth=(-H "apikey: $KEY" -H "Authorization: Bearer $KEY")
get()  { curl -fsS --retry 3 --retry-delay 5 --retry-all-errors --max-time 30 "$@"; }

echo "1/4 database write (heartbeat):"
get -X POST "$URL/rest/v1/rpc/keepalive" "${auth[@]}" -H "Content-Type: application/json" -d '{}'
echo

echo "2/4 database read:"
get "$URL/rest/v1/sections?select=id&limit=1" "${auth[@]}" > /dev/null && echo "ok"

echo "3/4 auth service:"
get "$URL/auth/v1/settings" -H "apikey: $KEY" > /dev/null && echo "ok"

echo "4/4 storage (best effort):"
if get -X POST "$URL/storage/v1/object/list/media" "${auth[@]}" -H "Content-Type: application/json" -d '{"prefix":"","limit":1}' > /dev/null; then
  echo "ok"
else
  echo "::warning::storage check failed (not fatal)"
fi

echo "Backend is awake."
