#!/usr/bin/env bash
# Admin + analytics end-to-end suite (docs/qa/TEST_PLAN_ADMIN.md). Needs a production build and Playwright (global).
#
#   npm run build && bash e2e/admin/run.sh
#
# Starts six local servers in memory mode on ports 8600–8605 (placeholder credentials only), runs every check, stops them.
#   8600 / 8604  the QA dataset preloaded (e2e/admin/seed-data.cjs: a hand-designed core with known numbers + 320 generated games)
#   8601         admin switched off        8602  another ADMIN_PASSWORD        8603  empty, rate limits on
#   8605         the dataset, with every analytics read made to fail (error states)
# Results: e2e/admin/.out/results.json (one line per case), screenshots and timings next to it. Exits 1 if a case failed.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
export QA_OUT="${QA_OUT:-$HERE/.out}"; mkdir -p "$QA_OUT"; rm -f "$QA_OUT/results.json"
APPDIR="${APPDIR:-$ROOT}"; export APPDIR
[ -f "$APPDIR/.next/BUILD_ID" ] || { echo "No build in $APPDIR/.next — run: npm run build" >&2; exit 2; }
PIDS=()
start() { # port mode [VAR=value…]
  local port=$1 mode=$2; shift 2
  fuser -k "$port/tcp" >/dev/null 2>&1 || true
  local envs=(NODE_ENV=production)
  [ "$mode" != off ] && envs+=(ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=test-password-123)
  [ "$mode" = seed ] && envs+=(QA_NOW="$(date +%s%3N)" QA_SEED=1 QA_SEED_WRITE=1 PORT_TAG="$port" NODE_OPTIONS="--require=$HERE/seed-preload.cjs")
  (cd "$APPDIR" && env "${envs[@]}" "$@" npx next start -p "$port" > "$QA_OUT/server-$port.log" 2>&1) &
  PIDS+=($!)
  for _ in $(seq 1 80); do curl -s -o /dev/null "http://localhost:$port/robots.txt" && return 0; sleep 0.5; done
  echo "server on $port did not start" >&2; exit 2
}
stop() { for p in 8600 8601 8602 8603 8604 8605 8610 8611; do fuser -k "$p/tcp" >/dev/null 2>&1 || true; done; }
trap stop EXIT
start 8600 seed; start 8601 off; start 8602 plain ADMIN_PASSWORD=another-password-456; start 8603 plain; start 8604 seed; start 8605 seed QA_FAIL_KEY=1
cd "$HERE"
node dump.cjs && node verify-data.cjs
node verify-auth.cjs
node verify-capture.cjs
node verify-sec.cjs
node verify-ui.cjs
node verify-extra.cjs
node verify-erase.cjs          # last: it deletes data on 8604
[ "${QA_SHOTS:-0}" = 1 ] && node ui.cjs
node -e "
const r = require(process.env.QA_OUT + '/results.json');
const bad = r.filter((x) => x.status !== 'pass');
console.log('\n' + r.length + ' admin cases: ' + (r.length - bad.length) + ' passed, ' + bad.length + ' failed');
for (const b of bad) console.log('  FAIL ' + b.id + ' ' + b.title + ' — ' + b.detail);
process.exit(bad.length ? 1 : 0);"
