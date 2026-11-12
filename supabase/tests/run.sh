#!/usr/bin/env bash
# Applies the migration to a throwaway database on a local PostgreSQL and runs tests/security.sql.
# Needs PostgreSQL 16 (any 14+ should do) and a superuser (no extensions needed).
#   supabase/tests/run.sh                    local server: connects as the `postgres` OS user (su / sudo)
#   PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres supabase/tests/run.sh
#                                            over TCP (CI service container, Docker): plain `psql`, standard PG* variables
#   TEST_DB=name                             throwaway database to (re)create; default tambola_v2_test
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${TEST_DB:-tambola_v2_test}"
# In the sandbox the local cluster may be stopped.
if [ -z "${PGHOST:-}${PGUSER:-}" ] && command -v pg_lsclusters >/dev/null && pg_lsclusters -h | grep -q " down "; then
  pg_ctlcluster 16 main start 2>/dev/null || sudo pg_ctlcluster 16 main start 2>/dev/null || true
  sleep 2
fi
command -v psql >/dev/null || { echo "psql not found — install the PostgreSQL client (e.g. apt-get install postgresql-client)" >&2; exit 1; }

if [ -n "${PGHOST:-}${PGUSER:-}" ]; then run() { psql "$@"; }
elif [ "$(id -u)" = 0 ]; then run() { su postgres -c "psql $(printf '%q ' "$@")"; }
else run() { sudo -u postgres psql "$@"; }
fi
sql() { run -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }

run -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
sql < tests/stub_supabase.sql
for f in migrations/*.sql; do echo "apply $f"; sql < "$f"; done
sql < tests/security.sql
run -X -q -d postgres -c "drop database $DB"
echo "SQL tests passed"
