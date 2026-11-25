#!/bin/bash
# DEPTH-LIGHT (lane L, 2026-11-25): one exploration hold on the static rig — the server up, ./look.mts over the variants, the
# server down (by its own PID). Run it THROUGH the gate:
#   /home/user/wt/gate-run.sh 1500 scripts/probes/depth-light/explore.sh <siteDir> <bundleTag> <outDir> '<variant>' ...
# Port 3967 (this lane's row in docs/LANES.md); ES_PORT overrides it.
set -u
cd "$(dirname "$0")/../../.."
SITE=$1 TAG=$2 OUT=$3; shift 3
PORT=${ES_PORT:-3967}
mkdir -p "$OUT"
node scripts/probes/hoops-gap/serve.mjs "$SITE" "$PORT" > "$OUT/serve.log" 2>&1 &
SPID=$!
trap 'kill $SPID 2>/dev/null; wait $SPID 2>/dev/null; echo "== server $SPID stopped $(date +%T)"' EXIT
sleep 1
echo "== look $(date +%T)"
npx tsx scripts/probes/depth-light/look.mts "$OUT" "$PORT" "$TAG" "$@"
