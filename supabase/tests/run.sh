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

# A brand-new database with every migration applied.
fresh() {
  run -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
  sql < tests/stub_supabase.sql
  for f in migrations/*.sql; do [ -n "${1:-}" ] && echo "apply $f"; sql < "$f"; done
}

fresh verbose
sql < tests/security.sql
# The insights (migration 0003): lock-down, writes, purge, erase — then SQL ↔ TypeScript parity on a seeded dataset.
fresh
sql < tests/helpers.sql
sql < tests/insights.sql
fresh
sql < tests/helpers.sql
sql < tests/insights_parity.sql | tail -n 1
# What the site meets when 0003 has NOT been run yet: the first two migrations alone must still pass their own checks.
run -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
sql < tests/stub_supabase.sql
sql < migrations/0001_init.sql
sql < migrations/0002_admin.sql
sql -c "set role service_role" -c "select purge_expired_games()" -c "select admin_list_games()" > /dev/null
echo "ok   migrations 0001 + 0002 alone still work (0003 not yet run)"
# QA (docs/qa/TEST_PLAN_ADMIN.md, MIG-*): a fresh database; each migration applied a SECOND time must stop
# with a clear "already exists" error and change nothing; then the lock-down is checked from pg_catalog, object by object.
fresh
sql < tests/helpers.sql
before=$(run -X -q -At -d "$DB" -c "select md5(string_agg(x, '|' order by x)) from (select 'f:' || p.oid::regprocedure || ':' || md5(p.prosrc) || ':' || coalesce(p.proacl::text, '') as x from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' union all select 'c:' || table_name || '.' || column_name || ':' || data_type from information_schema.columns where table_schema = 'public' union all select 't:' || c.relname || ':' || c.relrowsecurity || ':' || coalesce(c.relacl::text, '') from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public') s")
for f in migrations/*.sql; do
  if out=$(run -X -q -v ON_ERROR_STOP=1 -1 -d "$DB" < "$f" 2>&1); then echo "FAILED: re-applying $f did not stop with an error" >&2; exit 1; fi
  echo "$out" | grep -q "already exists" || { echo "FAILED: re-applying $f gave an unclear error: $out" >&2; exit 1; }
done
after=$(run -X -q -At -d "$DB" -c "select md5(string_agg(x, '|' order by x)) from (select 'f:' || p.oid::regprocedure || ':' || md5(p.prosrc) || ':' || coalesce(p.proacl::text, '') as x from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' union all select 'c:' || table_name || '.' || column_name || ':' || data_type from information_schema.columns where table_schema = 'public' union all select 't:' || c.relname || ':' || c.relrowsecurity || ':' || coalesce(c.relacl::text, '') from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public') s")
[ "$before" = "$after" ] || { echo "FAILED: re-applying the migrations changed the schema, a function or a grant" >&2; exit 1; }
echo "ok   each migration, run a second time, stops with \"already exists\" and changes nothing"
sql -At < tests/qa_admin.sql
run -X -q -d postgres -c "drop database $DB"
echo "SQL tests passed"
