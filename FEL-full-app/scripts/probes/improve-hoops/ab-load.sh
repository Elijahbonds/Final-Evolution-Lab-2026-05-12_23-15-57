#!/bin/bash
# improve-hoops phase 3: the load A/B, sides interleaved, N runs a side, inside ONE gate hold:
#   /home/user/wt/gate-run.sh 3500 bash scripts/probes/improve-hoops/with-sites.sh <site> -- bash scripts/probes/improve-hoops/ab-load.sh <out> <runs> <modes> "<off-feel>"
# The ON side is the build's defaults (`&playtest=1`); the OFF side puts the knobs at 0 through the feel panel's storage.
OUT=$1; RUNS=$2; MODES=$3; OFF=$4
cd "$(dirname "$0")/../../.."
for r in $(seq 1 "$RUNS"); do
  QS='&playtest=1' node scripts/probes/improve-hoops/loadprof.mjs "$OUT" "on$r" "$MODES"
  QS="&playtest=1&feel=$OFF" node scripts/probes/improve-hoops/loadprof.mjs "$OUT" "off$r" "$MODES"
done
