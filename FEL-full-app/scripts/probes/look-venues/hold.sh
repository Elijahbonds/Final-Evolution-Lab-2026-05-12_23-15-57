#!/bin/bash
# LOOK-VENUES: one self-contained gate hold — build, measure, delete the build (the machine keeps at most one build on disk, and only
# while a hold uses it). Run it UNDER gate-run.sh:
#   /home/user/wt/gate-run.sh 1790 scripts/probes/look-venues/hold.sh <outDir> "<venue-walk args>" ["<venue-walk args>" ...]
# Each quoted argument is one venue-walk.mts invocation (e.g. "perf --ids=tennis,onevone --variants=aa=0,aa=1 --runs=1 --from=1
# --tag=b1p"). An invocation starts only while at least LV_MIN_LEFT seconds (default 600) of the hold's LV_HOLD_S (default 1790) are
# left, so nothing is cut off mid-run; the build is deleted and the rig's database stopped whatever happens.
# Needs the rig env (ES_PG_DIR ES_PG_PORT ES_PORT ES_DIST ES_OUT FEEL_PANEL_ENABLED CHROMIUM_EXE) exported by the caller.
set -u
cd "$(dirname "$0")/../../.."
OUT=$1; shift
T0=$(date +%s); HOLD=${LV_HOLD_S:-1790}; MIN=${LV_MIN_LEFT:-600}
cleanup() { rm -rf "${ES_DIST:?}"; git checkout -- tsconfig.json 2>/dev/null; npx tsx scripts/every-screen/rig.mts db-down >/dev/null 2>&1; echo "== cleaned $(date +%T)"; }
trap cleanup EXIT
trap "exit 143" TERM INT HUP
# the machine has OOM-killed builds twice when tests ran beside them: build only with 10 GB available (wait up to 5 minutes)
for i in $(seq 1 30); do [ "$(free -g | awk '/^Mem:/{print $7}')" -ge 10 ] && break; sleep 10; done
[ "$(free -g | awk '/^Mem:/{print $7}')" -ge 10 ] || { echo "== under 10 GB available: no build this hold"; exit 1; }
echo "== build $(date +%T)"
npx tsx scripts/every-screen/rig.mts build > "$OUT/build-$(date +%H%M).log" 2>&1 || { echo "build failed"; exit 1; }
git checkout -- tsconfig.json 2>/dev/null
echo "== built $(date +%T)"
for a in "$@"; do
  left=$(( HOLD - ($(date +%s) - T0) ))
  if [ "$left" -lt "$MIN" ]; then echo "== skipped (only ${left}s left): $a"; continue; fi
  echo "== walk $(date +%T) ($left s left): $a"
  # shellcheck disable=SC2086
  timeout $(( left - 60 )) npx tsx scripts/probes/look-venues/venue-walk.mts "$OUT" $a
done
