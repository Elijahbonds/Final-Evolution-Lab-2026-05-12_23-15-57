#!/bin/bash
# hoops-followups (2026-11-18): every-screen on the two hoops pages, with this lane's own throwaway database, build folder and port.
#   scripts/probes/hoops-followups/es.sh build <outDir>                  the production build (run it through /home/user/wt/cpu-run.sh)
#   scripts/probes/hoops-followups/es.sh score <outDir> <cap s> [tag]    ONE gate hold: the planted-fault control, then both pages
#   scripts/probes/hoops-followups/es.sh inplay <outDir> <cap s>         ONE gate hold: build, ./inplay.mts on both pages, delete the build
#                                                                        (ES_SCORE=1: every-screen on both pages too, the planted faults first;
#                                                                        ROUTES=a,b: the pages inplay.mts reads; ES_REVERSE_COMMIT=<sha> with
#                                                                        ES_REVERSE_FILES="<paths from the repo root>": a before build)
#   scripts/probes/hoops-followups/es.sh clean                           delete the build folder (do it right after scoring)
# Never keep the build on disk between holds (coordinator 2026-11-18: one 3.3 GB build blocked the release smoke).
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
  inplay)
    export ES_OUT=$1; cap=$2
    exec /home/user/wt/gate-run.sh "$cap" bash -c '
      trap "rm -rf \"$PWD/$ES_DIST\"; echo removed $ES_DIST" EXIT; trap "exit 143" TERM INT
      free=$(df --output=avail -BG / | tail -1 | tr -dc 0-9); mem=$(free -g | awk "/^Mem:/ {print \$7}")
      if [ "$free" -lt 6 ] || [ "$mem" -lt 12 ] || pgrep -f "[n]ext build" > /dev/null; then echo "no room to build: ${free} GB disk, ${mem} GB memory, or another Next.js production build is running"; exit 4; fi
      TOP=$(git rev-parse --show-toplevel)
      if [ -n "${ES_REVERSE_COMMIT:-}" ]; then
        # a "before" build: the changes the named commit made to ES_REVERSE_FILES are taken out for the build only, then put back
        trap "git -C $TOP checkout -- $ES_REVERSE_FILES; rm -rf \"$PWD/$ES_DIST\"; echo removed $ES_DIST" EXIT
        git -C "$TOP" diff "$ES_REVERSE_COMMIT~1" "$ES_REVERSE_COMMIT" -- $ES_REVERSE_FILES | git -C "$TOP" apply -R || { echo reverse failed; exit 1; }
        echo "built without $ES_REVERSE_COMMIT in: $ES_REVERSE_FILES"
      fi
      echo build $(date +%T); /home/user/wt/cpu-run.sh npx tsx scripts/every-screen/rig.mts build > "$ES_OUT/build.log" 2>&1 || { echo build failed; tail -5 "$ES_OUT/build.log"; exit 1; }
      [ -n "${ES_REVERSE_COMMIT:-}" ] && git -C "$TOP" checkout -- $ES_REVERSE_FILES
      git checkout -- tsconfig.json next-env.d.ts 2>/dev/null
      if [ -n "${ES_SCORE:-}" ]; then echo score $(date +%T); npx tsx scripts/every-screen/score.mts --routes=/play/onevone,/play/threevthree --redo --budget=1200 2>&1 | tail -16; fi
      echo inplay $(date +%T); npx tsx scripts/probes/hoops-followups/inplay.mts "$ES_OUT/inplay"; echo end $(date +%T)' ;;
  clean) rm -rf "$APP/$ES_DIST"; echo "removed $ES_DIST" ;;
  *) echo "build | score | inplay | clean"; exit 2 ;;
esac
