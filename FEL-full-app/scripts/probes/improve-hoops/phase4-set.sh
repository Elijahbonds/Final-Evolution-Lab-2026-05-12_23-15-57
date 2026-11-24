#!/bin/bash
# improve-hoops-2 phase 4: the 1v1 flow, five seeds a side — the two ON rules (hoops.makeBeatHoldsShot, hoops.rivalChaseAroundBody) at their
# defaults against both at 0 (the knob-off control), on the hoops-gap dev rig (scripts/probes/hoops-gap: build.mjs <site> fix --dev).
#   /home/user/wt/gate-run.sh 2400 bash scripts/probes/improve-hoops/phase4-set.sh <site> <out>
SITE=$1; OUT=$2; cd "$(dirname "$0")/../../.."
EXT=$PWD/scripts/probes/hoops-play/flow-ext.mjs
OFF='FEEL={"hoops.makeBeatHoldsShot":0,"hoops.rivalChaseAroundBody":0}'
L=()
for s in ${SEEDS:-7 11 23 31 47}; do
  L+=("onevone ext TAG=on$s SEED=$s PAGE=fix NODRAW=1 WD_OFF=1 VIEW=320x180 FLOW_FRAMES=${FRAMES:-3000} EXT=$EXT")
  L+=("onevone ext TAG=off$s SEED=$s PAGE=fix NODRAW=1 WD_OFF=1 VIEW=320x180 FLOW_FRAMES=${FRAMES:-3000} EXT=$EXT $OFF")
done
PORT=${PORT:-3881} HOLD_S=${HOLD_S:-2300} bash scripts/probes/hoops-gap/run-set.sh "$SITE" "$OUT" "${L[@]}"
