#!/bin/bash
# COAST & ISLANDS: one browser-lock hold for the lane's browser jobs (the shared queue is long: one wait, not two; coordinator
# 2026-11-18: at most ONE hold queued at a time, and no build on disk while waiting).
#   /home/user/wt/gate-run.sh 3000 bash scripts/probes/coast-islands/gate-hold.sh <out-dir>
# 1. when there is a build (.next-coast, built first with `cpu-run.sh env ES_DIST=.next-coast ES_PORT=3811 ES_PG_PORT=55491
#    ES_PG_DIR=/var/lib/postgresql/coast-islands-pg npx tsx scripts/every-screen/rig.mts build`): the every-screen score of
#    /play/coast (the scorer's planted-fault controls first), the creature log's picture on the real page (log-shot.mts), and
#    then the build is DELETED, before the rig, so it is on the shared disk as briefly as possible;
# 2. the phone rig (zone-rig.mts): the zone ×RUNS against the Venice hub ×RUNS (CONTROL=phaseA: against the zone with its
#    partner and creatures off), in the same browser. SKIP_RIG=1: no rig.
# Every server either job starts is stopped by that job before it returns.
set -u
OUT=${1:?out dir}
cd "$(dirname "$0")/../../.."
mkdir -p "$OUT"
# BUILD_FIRST=1: make the production build INSIDE this hold (coordinator 2026-11-18: no build on disk while waiting in the
# queue), only if the build rules hold right now (>= 12.5 GB memory available, >= 6 GB disk, no other next build running)
if [ "${BUILD_FIRST:-0}" = 1 ] && [ ! -f .next-coast/BUILD_ID ]; then
  a=$(free -m | awk '/Mem:/{print $7}'); d=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
  if [ "$a" -ge 12500 ] && [ "$d" -ge 6 ] && ! pgrep -f "next build" >/dev/null; then
    echo "build start $(date) mem=$a disk=${d}G"
    NODE_OPTIONS=--max-old-space-size=4096 ES_DIST=.next-coast ES_PORT=3811 ES_PG_PORT=55491 ES_PG_DIR=/var/lib/postgresql/coast-islands-pg ES_OUT="$OUT/es" \
      /home/user/wt/cpu-run.sh npx tsx scripts/every-screen/rig.mts build > "$OUT/build.log" 2>&1
    echo "build exit $? $(date)"; git checkout -- tsconfig.json
  else
    echo "build rules not met (mem=$a disk=${d}G or another build): every-screen skipped this hold"
  fi
fi
if [ -f .next-coast/BUILD_ID ]; then
  ES_DIST=.next-coast ES_PORT=3811 ES_PG_PORT=55491 ES_PG_DIR=/var/lib/postgresql/coast-islands-pg ES_OUT="$OUT/es" \
    npx tsx scripts/every-screen/score.mts --routes=/play/coast --budget=900 > "$OUT/score.log" 2>&1
  echo "score exit $?"
  ES_DIST=.next-coast ES_PORT=3811 ES_PG_PORT=55491 ES_PG_DIR=/var/lib/postgresql/coast-islands-pg ES_OUT="$OUT/es" \
    npx tsx scripts/probes/coast-islands/log-shot.mts "$OUT" > "$OUT/log-shot.log" 2>&1
  echo "log-shot exit $?"
  rm -rf .next-coast && echo "build deleted $(date)"
else
  echo "no .next-coast build: every-screen skipped"
fi
[ "${SKIP_RIG:-0}" = 1 ] || OUT="$OUT" RUNS="${RUNS:-3}" CONTROL="${CONTROL:-}" npx tsx scripts/probes/coast-islands/zone-rig.mts > "$OUT/zone-rig.log" 2>&1
echo "zone-rig exit $?"
