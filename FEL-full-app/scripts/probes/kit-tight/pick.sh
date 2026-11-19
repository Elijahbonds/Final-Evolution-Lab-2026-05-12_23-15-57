#!/bin/bash
# KIT-TIGHT: the owner's pick sheet, shots (inside one gate hold): /home/user/wt/gate-run.sh 2700 bash scripts/probes/kit-tight/pick.sh; then tile.sh. Paths: S = the lane scratch.
S=/tmp/claude-0/-home-user-Final-Evolution-Lab-2026-05-12-23-15-57/e156aa0c-5ac6-5a64-b2e0-57cb533692fe/scratchpad/kit-tight
cd /home/user/wt/kit-fit-a/FEL-full-app
C='closet-male-default|desktop|idle|close-front;closet-male-default|desktop|run|close-front;closet-female-default|desktop|idle|close-front;closet-female-default|desktop|run|close-front;game-male-default|desktop|idle|close-front;game-male-default|desktop|run|close-front;game-female-default|desktop|idle|close-front;game-female-default|desktop|run|close-front;closet-male-girth-max|desktop|idle|close-front;closet-male-girth-max|desktop|run|close-front;game-male-default|mobile|run|far-front;game-female-default|mobile|idle|far-front'
for side in 'today={"kit.onePieceShorts":0,"kit.newJerseys":0}' 'new={"kit.onePieceShorts":1,"kit.newJerseys":1,"kit.setLiftScale":1}' 'new50={"kit.onePieceShorts":1,"kit.newJerseys":1,"kit.setLiftScale":0.5}'; do n=${side%%=*}; k=${side#*=}
  [ -f $S/pick/$n.json ] || env OUT=$S/pick NAME=$n KNOBS="$k" CELLS="$C" npx tsx scripts/probes/kit-glitch/rig.mts cells 2>&1 | tail -1
done
rm -rf $S/pick/site
