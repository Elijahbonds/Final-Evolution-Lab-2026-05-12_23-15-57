#!/bin/bash
# LOOK-VENUES B1 (2026-11-24): the phone edge-smoothing A/B, each job in its own gate hold (<= 30 min a hold).
#   scripts/probes/look-venues/run-b1.sh <outDir> job ...
#   jobs: shots-portrait-<n>  one round (run n) of the upright phone pictures: 1v1, 3v3, Dunk x aa=0,1,2 at full render scale
#         shots-landscape-<n> the same held sideways (1v1, Dunk)
#         perf-<n>            one round of the phone-tier PERF readouts: tennis (the control, aa=0) then 1v1, Dunk, Venice, the story
#                             x aa=0,1,2, the perf guard on
#         b3-landscape-<n> / b3-desktop-<n> / b3-perf-<n>   phase B3's A/Bs (court and ground filtering; the crowd's variety)
# Needs the rig's production build (scripts/every-screen/rig.mts build) with the same ES_* env (set before calling):
#   ES_PG_DIR ES_PG_PORT ES_PORT ES_DIST ES_OUT, FEEL_PANEL_ENABLED=1, CHROMIUM_EXE.
set -u
cd "$(dirname "$0")/../../.."
OUT=$1; shift
W="npx tsx scripts/probes/look-venues/venue-walk.mts $OUT"
G="env -u DATABASE_URL -u DIRECT_URL /home/user/wt/gate-run.sh 1790"
for j in "$@"; do
  n=${j##*-}
  echo "== $j $(date +%T)"
  case $j in
    shots-portrait-*) $G $W shots --tier=portrait --ids=onevone,threevthree,dunk --variants=aa=0,aa=1,aa=2 --runs=1 --from=$n --tag=b1 ;;
    shots-landscape-*) $G $W shots --tier=landscape --ids=onevone,dunk --variants=aa=0,aa=1,aa=2 --runs=1 --from=$n --tag=b1 ;;
    perf-*) $G $W perf --ids=tennis,onevone,dunk,venice,adventure --variants=aa=0,aa=1,aa=2 --runs=1 --from=$n --tag=b1p ;;
    # B3: the court and ground filtering (?lookon=courtdetail) and the crowd's variety (?lookon=crowdvariety), against today
    b3-landscape-*) $G $W shots --tier=landscape --ids=onevone,dunk --variants=,lookon=courtdetail --runs=1 --from=$n --tag=b3 ;;
    b3-desktop-*) $G $W shots --tier=desktop --ids=dunk,threepoint --variants=,lookon=crowdvariety --runs=1 --from=$n --tag=b3 ;;
    b3-perf-*) $G $W perf --ids=tennis,onevone,dunk --variants=,lookon=courtdetail --runs=1 --from=$n --tag=b3p ;;
    *) echo "unknown job $j" ;;
  esac
  echo "== $j done $(date +%T) exit $?"
done
