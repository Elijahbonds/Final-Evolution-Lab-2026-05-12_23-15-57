#!/bin/bash
# KIT-FIT close-ups: one subject, poses, as shot + poke overlay, from public/ and from an overlay (the phase-0 files).
#   /home/user/wt/gate-run.sh 900 bash scripts/probes/kit-fit/diag.sh <out> <p0-overlay> <subject> <pose>…
OUT=$1; P0=$2; SUBJ=$3; shift 3
cd "$(dirname "$0")/../../.."
for pose in "$@"; do
  for tag in now p0; do
    ov=; [ $tag = p0 ] && ov=$P0
    env OUT="$OUT" OVERLAY="$ov" W=720 H=960 npx tsx scripts/probes/kit-glitch/rig.mts diag "$SUBJ" desktop "$pose" cam:1.2,25,5,-0.2 "shot:$SUBJ-$pose-$tag" "poke:$SUBJ-$pose-$tag-poke" gaps 2>&1 | grep -v "^\s*$" | tail -2
  done
done
