#!/bin/bash
# game-hud: re-queue gate holds of run.sh until every mode has its before and after reading.
#   pair-all.sh <outDir> <siteA> <siteB> [waitPid]
HERE=$(cd "$(dirname "$0")" && pwd); OUT=$1
MODES=${GH_MODES:-football,tiebreak_v,story_boss,velocitykart,aeroaces,snowboard_slalom,penalty,freerun,karate,onevone,dunk}; AFTER=${GH_AFTER:-after}
[ -n "$4" ] && while kill -0 "$4" 2>/dev/null; do sleep 10; done
todo() { for m in ${MODES//,/ }; do for t in before $AFTER; do [ -f "$OUT/$m-$t.json" ] || echo "$m-$t"; done; done; }
while [ -n "$(todo)" ]; do
  /home/user/wt/gate-run.sh 900 "$HERE/run.sh" "$1" "$2" "$3"
  [ -n "$(todo)" ] && sleep 30
done
echo ALLDONE
