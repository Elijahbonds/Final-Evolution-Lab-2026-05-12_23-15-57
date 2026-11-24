#!/bin/bash
# LOOK-AUDIT (2026-11-24): every before-state picture and the phone readouts, each job in its own gate hold (≤ 30 min a hold).
#   scripts/probes/look-audit/run-all.sh <outDir> [job ...]     jobs: portrait landscape desktop perf ab   (default: all five)
#   final: one short hold — the phone readouts for six places, the full-scale (?perf=off) upright pictures, the desktop 3D pictures
#          and the two switched-off look lifts (the jobs above, cut to what fits in 30 minutes)
# Needs the rig's production build first (scripts/every-screen/rig.mts build with the same ES_* env). The server each hold starts is
# stopped by rig.mts's serve() when the hold's process ends; nothing outlives the hold.
set -u
cd "$(dirname "$0")/../../.."
OUT=$1; shift
JOBS=${*:-portrait landscape desktop perf ab}
export ES_PG_DIR=${ES_PG_DIR:-/var/lib/postgresql/look-audit-pg} ES_PG_PORT=${ES_PG_PORT:-55531} ES_PORT=${ES_PORT:-3911} ES_DIST=${ES_DIST:-.next-look}
export ES_OUT=${ES_OUT:-$OUT/es-state} FEEL_PANEL_ENABLED=1
W="npx tsx scripts/probes/look-audit/look-walk.mts $OUT"
for j in $JOBS; do
  echo "== $j $(date +%T)"
  case $j in
    portrait|landscape|desktop) env -u DATABASE_URL -u DIRECT_URL /home/user/wt/gate-run.sh 1750 $W shots --tier=$j ;;
    perf) env -u DATABASE_URL -u DIRECT_URL /home/user/wt/gate-run.sh 1750 $W perf ;;
    # the switched-off look lifts, as a player would see them on: the prefiltered sky light (?vq=ibl), the dressed story
    ab) env -u DATABASE_URL -u DIRECT_URL /home/user/wt/gate-run.sh 1200 $W shots --tier=desktop --only=onevone-ibl,threevthree-ibl,dunk-ibl --tag=ab
        env -u DATABASE_URL -u DIRECT_URL /home/user/wt/gate-run.sh 600 $W shots --tier=desktop --only=adventure --tag=ab-dressed --feel=story.worldDressed:1
        env -u DATABASE_URL -u DIRECT_URL /home/user/wt/gate-run.sh 600 $W shots --tier=portrait --only=onevone-perfoff,dunk-perfoff --tag=ab ;;
    final) env -u DATABASE_URL -u DIRECT_URL /home/user/wt/gate-run.sh 1790 bash -c "$W perf --only=tennis,onevone,dunk,arena-hoops,venice,adventure; \
        $W shots --tier=portrait --only=onevone-perfoff,dunk-perfoff --tag=ab; \
        $W shots --tier=desktop --only=onevone,dunk,arena-hoops,adventure --tag=b1; \
        $W shots --tier=desktop --only=onevone-ibl --tag=ab; \
        $W shots --tier=desktop --only=adventure --tag=ab-dressed --feel=story.worldDressed:1" ;;
  esac
  echo "== $j done $(date +%T) exit $?"
done
