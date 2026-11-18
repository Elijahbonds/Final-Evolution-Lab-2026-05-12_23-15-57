#!/bin/bash
# COAST & ISLANDS: one browser-lock hold for the lane's two browser jobs (the shared queue is long; one wait, not two).
#   /home/user/wt/gate-run.sh 3000 bash scripts/probes/coast-islands/gate-hold.sh <out-dir>
# 1. the phone rig (zone-rig.mts): the zone ×RUNS against the Venice hub ×RUNS in the same browser, then the zone with streaming off
#    (CONTROL=phaseA: against the zone with its partner and creatures off; SKIP_RIG=1: no rig);
# 2. the every-screen score of /play/coast on this lane's production build (.next-coast, built first with
#    `cpu-run.sh env ES_DIST=.next-coast ES_PORT=3811 ES_PG_PORT=55491 ES_PG_DIR=/var/lib/postgresql/coast-islands-pg npx tsx scripts/every-screen/rig.mts build`),
#    the scorer's planted-fault controls first (they run at the start of every score), then the creature log's picture on the real
#    page (log-shot.mts). Skipped when there is no build.
# Every server either job starts is stopped by that job before it returns.
set -u
OUT=${1:?out dir}
cd "$(dirname "$0")/../../.."
mkdir -p "$OUT"
[ "${SKIP_RIG:-0}" = 1 ] || OUT="$OUT" RUNS="${RUNS:-3}" CONTROL="${CONTROL:-}" npx tsx scripts/probes/coast-islands/zone-rig.mts > "$OUT/zone-rig.log" 2>&1
echo "zone-rig exit $?"
if [ -f .next-coast/BUILD_ID ]; then
  ES_DIST=.next-coast ES_PORT=3811 ES_PG_PORT=55491 ES_PG_DIR=/var/lib/postgresql/coast-islands-pg ES_OUT="$OUT/es" \
    npx tsx scripts/every-screen/score.mts --routes=/play/coast --budget=900 > "$OUT/score.log" 2>&1
  echo "score exit $?"
  ES_DIST=.next-coast ES_PORT=3811 ES_PG_PORT=55491 ES_PG_DIR=/var/lib/postgresql/coast-islands-pg ES_OUT="$OUT/es" \
    npx tsx scripts/probes/coast-islands/log-shot.mts "$OUT" > "$OUT/log-shot.log" 2>&1
  echo "log-shot exit $?"
else
  echo "no .next-coast build: every-screen skipped"
fi
