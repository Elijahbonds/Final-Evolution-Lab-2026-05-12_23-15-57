#!/bin/bash
# DEPTH-AUDIT (2026-11-25): one gate hold = one production build, the walks named, then the build deleted (lane rule: a build never
# outlives its hold). Run it THROUGH the gate:
#   /home/user/wt/gate-run.sh 1790 scripts/probes/depth-audit/run-hold.sh <outDir> "<walk args>" ["<walk args>" ...]
#   e.g. run-hold.sh /tmp/x "--tier=portrait" "--tier=desktop --only=onevone,dunk"
# Needs free -g >= 10 GB available before it starts (checked here). The server each walk starts stops when that walk ends.
set -u
cd "$(dirname "$0")/../../.."
OUT=$1; shift
export ES_PG_DIR=${ES_PG_DIR:-/var/lib/postgresql/depth-audit-pg} ES_PG_PORT=${ES_PG_PORT:-55571} ES_PORT=${ES_PORT:-3959} ES_DIST=${ES_DIST:-.next-depth}
export ES_OUT=${ES_OUT:-$OUT/es-state} FEEL_PANEL_ENABLED=1
avail=$(free -g | awk '/^Mem:/{print $7}')
if [ "${avail:-0}" -lt 10 ]; then echo "only ${avail} GB available: not building"; exit 3; fi
cleanup() { rm -rf "$ES_DIST"; git checkout -- tsconfig.json 2>/dev/null; npx tsx scripts/every-screen/rig.mts db-down >/dev/null 2>&1; echo "== build deleted $(date +%T)"; }
trap cleanup EXIT
echo "== build $(date +%T)"
env -u DATABASE_URL -u DIRECT_URL npx tsx scripts/every-screen/rig.mts build > "$OUT/build-$(date +%H%M).log" 2>&1 || { echo "build failed"; tail -30 "$OUT"/build-*.log; exit 1; }
git checkout -- tsconfig.json 2>/dev/null
echo "== built $(date +%T)"
for a in "$@"; do
  echo "== walk $a $(date +%T)"
  # shellcheck disable=SC2086
  env -u DATABASE_URL -u DIRECT_URL npx tsx scripts/probes/depth-audit/depth-walk.mts "$OUT/shots" $a
done
