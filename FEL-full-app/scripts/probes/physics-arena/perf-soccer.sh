#!/bin/bash
# lane/physics-arena §9: one round of soccer's phone-tier cost (scripts/probes/_perf-sweep.mts on the esbuild page, inside rig.sh):
# tennis (the control), the arena's 1v1 (the arena's own row) and soccer, upright; with LANDSCAPE=1 soccer sideways too.
#   scripts/probes/physics-arena/perf-soccer.sh <outDir> <round>
OUT=$1; R=$2
export PAGE="http://127.0.0.1:${PORT:-3871}/arena.html" SEED=7 RASTER=4 SECONDS=6 THROTTLE=4 OUT
export CHROMIUM_EXE=${CHROMIUM_EXE:-/opt/pw-browsers/chromium-1243/chrome-linux64/chrome}
PROFILES=portrait TAG=$R QUERY="?perf=off" MODES=tennis,physics_arena,physics_arena_soccer timeout 900 npx tsx scripts/probes/_perf-sweep.mts
if [ -n "$LANDSCAPE" ]; then PROFILES=landscape TAG=$R-land QUERY="?perf=off" MODES=physics_arena_soccer timeout 400 npx tsx scripts/probes/_perf-sweep.mts; fi
