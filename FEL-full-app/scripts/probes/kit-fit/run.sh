#!/bin/bash
# KIT-FIT browser before/after in ONE gate hold (lane/kit-fit). Before = public/ as committed on the base + the new knob off;
# after = the rebaked files from an overlay folder + the knob on. Same code, same build, same machine.
#   /home/user/wt/gate-run.sh 1800 bash scripts/probes/kit-fit/run.sh <out-dir> <overlay-dir|-> [subjects]
# <overlay-dir> holds models/candidates/*.glb, models/rivals/*.glb, models/kits/*.glb ('-' = the after run reads public/ too,
# e.g. once the rebake is committed: then pass BEFORE_OVERLAY=<dir with the old files>).
set -u
OUT=$1; OV=$2; SUBJ=${3:-closet-male-default,closet-female-default,closet-male-girth-max,closet-female-girth-max,game-male-default,game-female-default,pack-football-player,pack-football-female,rival-grit,rival-yara}
cd "$(dirname "$0")/../../.."
mkdir -p "$OUT"
CELLS='closet-male-default|desktop|idle|close-front;closet-male-default|desktop|kick|close-front;closet-female-default|desktop|lunge|close-front;game-male-default|desktop|run|close-front;closet-male-girth-max|desktop|overhead|close-front;closet-female-girth-max|desktop|overhead|close-front;rival-grit|desktop|kick|mid-front;pack-football-player|desktop|run|close-front;pack-football-female|desktop|idle|close-front'
OFF='{"kit.garmentFollowBody":0}'
B=${BEFORE_OVERLAY:-}
run() { env OUT="$OUT" "$@" npx tsx scripts/probes/kit-glitch/rig.mts "${JOB}"; }
JOB=matrix; run OVERLAY="$B" KNOBS="$OFF" NAME=before TIERS=desktop SUBJECTS="$SUBJ" 2>&1 | tail -14
JOB=matrix; [ "$OV" = - ] && OVA= || OVA=$OV; run OVERLAY="$OVA" NAME=after TIERS=desktop SUBJECTS="$SUBJ" 2>&1 | tail -14
JOB=cells; run OVERLAY="$B" KNOBS="$OFF" NAME=cells-before CELLS="$CELLS" 2>&1 | tail -3
JOB=cells; run OVERLAY="$OVA" NAME=cells-after CELLS="$CELLS" 2>&1 | tail -3
npx tsx scripts/probes/kit-glitch/rig.mts sheet "$OUT/cells-before.json" "$OUT/cells-after.json" "$OUT/kit-fit-before-after.jpg" 2>&1 | tail -3
npx tsx scripts/probes/kit-glitch/compare.mts "$OUT/before.json" "$OUT/after.json"
