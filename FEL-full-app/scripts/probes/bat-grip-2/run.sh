#!/bin/bash
# BAT-GRIP-2: a static server on the built site + one bat-live run, then the server is stopped by its own PID.
# Always inside the shared browser lock, through the coordinator's wrapper (it does not leak the lock to the server):
#   /home/user/wt/gate-run.sh 880 scripts/probes/bat-grip-2/run.sh <siteDir> <outDir> <tag> [modes] [bat-live flags...]
# The site is the gameplay-clean rig's build of THIS worktree (the real /play pages, production bundle, no Next server):
#   /home/user/wt/cpu-run.sh node scripts/probes/gameplay-clean/build.mjs <siteDir>
SITE=${1:?site dir}; OUT=${2:?out dir}; TAG=${3:?tag}; MODES=${4:-derby,baseball}; shift 4
PORT=${BAT_PORT:-3311}
mkdir -p "$OUT"
HERE=$(cd "$(dirname "$0")" && pwd)
echo "HOLD $(date -u +%T)"
(cd "$SITE" && exec python3 -m http.server "$PORT" --bind 127.0.0.1) > "$OUT/server-$TAG.log" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT TERM INT   # the wrapper's timeout ends this script with TERM: the server goes with it
sleep 1
CHROMIUM_EXE=/opt/pw-browsers/chromium timeout 840 npx tsx "$HERE/bat-live.mts" "$PORT" "$OUT" "$TAG" "$MODES" "$@" > "$OUT/$TAG.log" 2>&1
echo "rc=$? $TAG"
kill $SRV 2>/dev/null; wait $SRV 2>/dev/null
echo "RELEASE $(date -u +%T)"
