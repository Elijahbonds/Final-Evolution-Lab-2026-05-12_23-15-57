#!/bin/bash
# SCREEN-FIXES (2026-11-10): the same screens scored on the baseline build and on the lane's build, back to back (one lock
# hold each, same machine, same minute), into <ES_OUT>/ab/. So a difference between the two crawls can be told apart from
# run-to-run noise (a game still loading, a toast, a slow tap on a busy machine).
#   scripts/probes/screen-fixes/ab.sh <before tree FEL-full-app> <after tree FEL-full-app> <before ES_OUT> <after ES_OUT> <routes,comma,list> [round]
set -u
B=$1; A=$2; OB=$3; OA=$4; ROUTES=$5; ROUND=${6:-ab}
export ES_PORT=${ES_PORT:-3761} ES_PG_PORT=${ES_PG_PORT:-55461} ES_PG_DIR=${ES_PG_DIR:-/var/lib/postgresql/screen-fixes-pg} ES_DIST=${ES_DIST:-.next-sf}
for side in before after; do
  if [ $side = before ]; then dir=$B; out=$OB; else dir=$A; out=$OA; fi
  ( cd "$dir" && ES_OUT=$out /home/user/wt/gate-run.sh 900 env -u DATABASE_URL -u DIRECT_URL npx tsx scripts/every-screen/score.mts --budget=840 --no-plant --redo --label=$ROUND --routes=$ROUTES > "$out/$ROUND.log" 2>&1 )
  echo "$side: exit $? — $(grep -c 'scored\|off \|alias' "$out/$ROUND.log") lines; $(grep 'screens left\|read this run' "$out/$ROUND.log" | tail -1)"
done
