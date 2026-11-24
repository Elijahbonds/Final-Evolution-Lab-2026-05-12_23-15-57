#!/bin/bash
# lane/physics-arena, look pass: one round of the phone-tier cost (scripts/probes/_perf-sweep.mts against the esbuild page on $PORT):
# tennis (the control) and the arena's three games with the set off and on, upright; with LANDSCAPE=1 also the three games
# sideways with the set off (the budget row is the worse of the two). Run inside rig.sh (it serves the page).
#   scripts/probes/physics-arena/perf-round.sh <outDir> <round>
OUT=$1; R=$2
export PAGE="http://127.0.0.1:${PORT:-3871}/arena.html" SEED=7 RASTER=4 SECONDS=6 THROTTLE=4 OUT
export CHROMIUM_EXE=${CHROMIUM_EXE:-/opt/pw-browsers/chromium-1243/chrome-linux64/chrome}
ON='%7B%22arena.setV1%22%3A1%7D'; OFF='%7B%22arena.setV1%22%3A0%7D'
PROFILES=portrait TAG=$R-off QUERY="?perf=off&feel=$OFF" MODES=tennis,physics_arena,physics_arena_3v3,physics_arena_3pt timeout 900 npx tsx scripts/probes/_perf-sweep.mts
PROFILES=portrait TAG=$R-on QUERY="?perf=off&feel=$ON" MODES=physics_arena,physics_arena_3v3,physics_arena_3pt timeout 700 npx tsx scripts/probes/_perf-sweep.mts
if [ -n "$LANDSCAPE" ]; then PROFILES=landscape TAG=$R-land-off QUERY="?perf=off&feel=$OFF" MODES=physics_arena,physics_arena_3v3,physics_arena_3pt timeout 700 npx tsx scripts/probes/_perf-sweep.mts; fi
