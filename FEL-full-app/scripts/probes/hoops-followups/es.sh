#!/bin/bash
# hoops-followups (2026-11-18): every-screen on the two hoops pages, with this lane's own throwaway database, build folder and port.
#   scripts/probes/hoops-followups/es.sh build <outDir>                  the production build (run it through /home/user/wt/cpu-run.sh)
#   scripts/probes/hoops-followups/es.sh score <outDir> <cap s> [tag]    ONE gate hold: the planted-fault control, then both pages
#   scripts/probes/hoops-followups/es.sh clean                           delete the build folder (do it right after scoring)
# The scorer re-proves itself on the planted-fault controls first in the same hold; read <outDir>/plant.json before the pages.
set -u
APP=$(cd "$(dirname "$0")/../../.." && pwd); cd "$APP"
export ES_PORT=${ES_PORT:-3821} ES_PG_PORT=${ES_PG_PORT:-55821} ES_PG_DIR=${ES_PG_DIR:-/var/lib/postgresql/hoops-followups-pg} ES_DIST=${ES_DIST:-.next-es-hf}
cmd=$1; shift
case "$cmd" in
  build) export ES_OUT=$1; npx tsx scripts/every-screen/rig.mts build ;;
  score)
    export ES_OUT=$1; cap=$2; tag=${3:-routes}
    # score.mts runs the planted-fault controls at the start of the hold (PLANT OK / PLANT FAILED; kept in <outDir>/plant.json)
    exec /home/user/wt/gate-run.sh "$cap" bash -c "echo start \$(date +%T); npx tsx scripts/every-screen/score.mts --routes=/play/onevone,/play/threevthree --redo --budget=1200 --label=$tag 2>&1 | tail -40; echo end \$(date +%T)" ;;
  clean) rm -rf "$APP/$ES_DIST"; echo "removed $ES_DIST" ;;
  *) echo "build | score | clean"; exit 2 ;;
esac
