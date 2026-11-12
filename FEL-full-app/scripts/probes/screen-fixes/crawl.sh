#!/bin/bash
# SCREEN-FIXES (2026-11-10): the every-screen crawl in lock holds of at most 15 minutes, one queued at a time, until no
# screen is left. The first hold runs the scorer's planted-fault controls; the rest skip them (--no-plant).
#   scripts/probes/screen-fixes/crawl.sh <ES_OUT> [extra score.mts args]
set -u
cd "$(dirname "$0")/../../.."
OUT=$1; shift
export ES_PORT=${ES_PORT:-3761} ES_PG_PORT=${ES_PG_PORT:-55461} ES_PG_DIR=${ES_PG_DIR:-/var/lib/postgresql/screen-fixes-pg} ES_DIST=${ES_DIST:-.next-sf} ES_OUT=$OUT
plant=""
for i in $(seq 1 30); do
  log="$OUT/crawl-$i.log"; mkdir -p "$OUT"
  /home/user/wt/gate-run.sh 900 env -u DATABASE_URL -u DIRECT_URL npx tsx scripts/every-screen/score.mts --budget=780 $plant "$@" > "$log" 2>&1
  echo "hold $i: exit $? — $(grep -E 'PLANT|screens left|budget reached' "$log" | tr '\n' ' ')"
  plant="--no-plant"
  grep -q " 0 screens left" "$log" && break
done
