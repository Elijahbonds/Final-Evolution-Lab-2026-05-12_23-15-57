#!/bin/bash
# studio-22 (2026-11-11): the eleven creator tasks at both widths, N runs; each width-run in two gate holds of five or six tasks
# (so another lane's rig is never queued behind a 40-minute block). The Studio and game bundles must be built first:
#   npx tsx scripts/probes/_studio-easy-probe.mts <outDir> <label> --build-only [--prod]
#   node scripts/probes/studio-22/game-build.mjs <outDir>/game-<prod|dev> [--dev]
# Usage (from FEL-full-app): scripts/probes/studio-22/series.sh <outDir> <label> <prod|dev> "<run numbers, e.g. 1 2 3>" [port]
# Then: node scripts/probes/studio-22/summary.mjs <outDir>/<label>
set -u
OUT=$1; LABEL=$2; KIND=$3; RUNS=$4; PORT=${5:-3711}
FLAGS=(--game="$OUT/game-$KIND" --port="$PORT"); [ "$KIND" = prod ] && FLAGS+=(--prod)
for r in $RUNS; do
  for w in desktop phone; do
    for half in new,firstcourt,place,arrows,ai,character script,playtest,save,reopen,publish; do
      CHROMIUM_EXE=${CHROMIUM_EXE:-/opt/pw-browsers/chromium} /home/user/wt/gate-run.sh 1500 \
        npx tsx scripts/probes/_studio-easy-probe.mts "$OUT" "$LABEL" --widths="$w" --tasks="$half" --run="$r" "${FLAGS[@]}"
    done
  done
done
