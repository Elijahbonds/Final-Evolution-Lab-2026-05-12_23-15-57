#!/bin/bash
# kit-mac-jobs: the garment sets on the steady browser rig, KIT-FIT-PLAN §10.1a's bar (lane/kit-mac-jobs, 2026-11-18).
# Before = the knobs off (today's files), after = kit.onePieceShorts and kit.newJerseys on; same build, same hold, RUNS runs a side,
# interleaved (before 1, after 1, before 2, …) so the machine's drift hits both; rival-halo is the unchanged control (a forge
# rival is not a kit body: the knobs do nothing to it) whose own spread is the noise band.
#   /home/user/wt/gate-run.sh 7000 bash scripts/probes/kit-mac-jobs/run.sh <out-dir>
# then: npx tsx scripts/probes/kit-mac-jobs/summary.mts <out-dir>
set -u
OUT=$1; RUNS=${RUNS:-3}
cd "$(dirname "$0")/../../.."
mkdir -p "$OUT"
ON='{"kit.onePieceShorts":1,"kit.newJerseys":1}'
DESK=${DESK:-closet-male-default,closet-female-default,game-male-default,game-female-default,pack-football-player,pack-football-female,rival-halo}
PHONE=${PHONE:-game-male-default,game-female-default,pack-football-player,rival-halo}
export POSES=${POSES:-idle,run,run2,squat,lunge,kick,dunk,overhead} CAMS=${CAMS:-close-front,close-side,mid-front,mid-back}
for r in $(seq 1 "$RUNS"); do
  for side in before after; do
    K='{}'; [ $side = after ] && K=$ON
    OUT=$OUT NAME=$side-desktop-$r KNOBS=$K TIERS=desktop SUBJECTS=$DESK npx tsx scripts/probes/kit-glitch/rig.mts matrix 2>&1 | grep -E 'FAILED|s$' | tail -9
    OUT=$OUT NAME=$side-mobile-$r KNOBS=$K TIERS=mobile SUBJECTS=$PHONE npx tsx scripts/probes/kit-glitch/rig.mts matrix 2>&1 | grep -E 'FAILED|s$' | tail -5
  done
done
# the pictures: the same cells before and after
C='closet-male-default|desktop|idle|close-front;closet-female-default|desktop|idle|close-front;game-male-default|desktop|run|close-front;game-female-default|desktop|lunge|close-front;game-male-default|desktop|run2|mid-back;pack-football-player|desktop|idle|close-front;pack-football-female|desktop|run|close-front;game-male-default|mobile|run|mid-front'
OUT=$OUT NAME=cells-before CELLS=$C KNOBS='{}' npx tsx scripts/probes/kit-glitch/rig.mts cells 2>&1 | tail -1
OUT=$OUT NAME=cells-after CELLS=$C KNOBS=$ON npx tsx scripts/probes/kit-glitch/rig.mts cells 2>&1 | tail -1
OUT=$OUT npx tsx scripts/probes/kit-glitch/rig.mts sheet "$OUT/cells-before.json" "$OUT/cells-after.json" "$OUT/kit-mac-jobs-before-after.jpg" 2>&1 | tail -1
rm -rf "$OUT/site"
# mesh and draw counts with the body merge on every tier (perf.bodyMergeOn 2), 40 still frames to let it settle, each side
JS='js:for(let i=0;i<40;i++)scene.render();const e=scene.getEngine();let d=0;const a=e.drawElementsType.bind(e),b=e.drawArraysType.bind(e);e.drawElementsType=(...x)=>{d++;return a(...x)};e.drawArraysType=(...x)=>{d++;return b(...x)};scene.render();e.drawElementsType=a;e.drawArraysType=b;return {meshes:scene.meshes.length,enabled:scene.meshes.filter(m=>m.isEnabled()).length,active:scene.getActiveMeshes().length,draws:d,verts:scene.getActiveMeshes().data.slice(0,scene.getActiveMeshes().length).reduce((s,m)=>s+m.getTotalVertices(),0)}'
for tier in desktop mobile; do for subj in game-male-default pack-football-female; do
  for side in before after; do
    K='{"perf.bodyMergeOn":2}'; [ $side = after ] && K='{"perf.bodyMergeOn":2,"kit.onePieceShorts":1,"kit.newJerseys":1}'
    echo "COUNTS $side $subj $tier $(OUT=$OUT KNOBS=$K COMPACT=1 npx tsx scripts/probes/kit-glitch/rig.mts diag $subj $tier idle "$JS" 2>&1 | grep '^js:' | sed 's/^js:.\{0,57\} //')"
  done
done; done | tee "$OUT/counts.txt"
rm -rf "$OUT/site"
