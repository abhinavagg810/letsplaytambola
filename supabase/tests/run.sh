#!/usr/bin/env bash
# Applies the migrations to a throwaway database on a local PostgreSQL and runs the RLS smoke test.
#   supabase/tests/run.sh            (uses `sudo -u postgres psql`, or plain `psql` when PGHOST/PGUSER are set)
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${TEST_DB:-tambola_rls_test}"

if [ -n "${PGHOST:-}${PGUSER:-}" ]; then run() { psql "$@"; }
elif [ "$(id -u)" = 0 ]; then run() { su postgres -c "psql $(printf '%q ' "$@")"; }
else run() { sudo -u postgres psql "$@"; }
fi
sql() { run -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }

run -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
sql < tests/stub_supabase.sql
for f in migrations/*.sql; do echo "apply $f"; sql < "$f"; done
sql < tests/rls_smoke.sql
run -X -q -d postgres -c "drop database $DB"
echo "RLS smoke test passed"
