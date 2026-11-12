#!/bin/bash
# game-hud: measure every listed mode, one gate hold at a time (each hold stops starting modes after BUDGET_S, ~14 min),
# re-queueing until each mode's JSON exists.   run-all.sh <outDir> <siteA> <siteB> <tag> <host> <mode,mode,...>
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=$1; MODES=$6; TAG=$4
todo() { for m in ${MODES//,/ }; do [ -f "$OUT/$m-$TAG.json" ] || echo "$m"; done; }
while [ -n "$(todo)" ]; do
  BUDGET_S=${BUDGET_S:-480} /home/user/wt/gate-run.sh 900 "$HERE/run.sh" "$@"
  [ -n "$(todo)" ] && sleep 30
done
echo ALLDONE
