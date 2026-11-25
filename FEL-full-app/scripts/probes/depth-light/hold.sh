#!/bin/bash
# DEPTH-LIGHT (lane L, 2026-11-25): one production gate hold — the build, the walks, the build deleted (as ../depth-audit/run-hold.sh,
# on this lane's port, folder and throwaway database). Each walk is ./light-walk.mts with its own arguments (a tag, a tier, the routes
# and the `--q=` of `?look.<knob>=` values). Run it THROUGH the gate, ≤ 30 minutes:
#   /home/user/wt/gate-run.sh 1790 scripts/probes/depth-light/hold.sh <outDir> "<walk args>" ["<walk args>" ...]
#   e.g. hold.sh /tmp/x "--tier=portrait --only=onevone --tag=p1-before-1" "--tier=portrait --only=onevone --tag=p1-after-1 --q=look.phoneFeetPool=0.6"
# Needs free -g >= 10 GB available before it builds (checked here). The server each walk starts stops when that walk ends.
set -u
cd "$(dirname "$0")/../../.."
OUT=$1; shift
mkdir -p "$OUT"
export ES_PG_DIR=${ES_PG_DIR:-/var/lib/postgresql/depth-light-pg} ES_PG_PORT=${ES_PG_PORT:-55567} ES_PORT=${ES_PORT:-3967} ES_DIST=${ES_DIST:-.next-depth-light}
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
  # shellcheck disable=SC2086   (word-split on spaces only: a --q= value's '&' stays literal)
  env -u DATABASE_URL -u DIRECT_URL npx tsx scripts/probes/depth-light/light-walk.mts "$OUT/shots" $a
done
