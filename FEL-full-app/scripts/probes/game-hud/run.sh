#!/bin/bash
# game-hud: one gate hold — the static server for the two sites (before on 127.0.0.1, after on localhost), the driver, then
# the server stopped by its own PID (never left running past the hold).
#   /home/user/wt/gate-run.sh 900 scripts/probes/game-hud/run.sh <outDir> <siteA> <siteB> <tag> <host> <modes>
HERE=$(cd "$(dirname "$0")" && pwd); APP=$(cd "$HERE/../../.." && pwd)
OUT=$1; A=$2; B=$3; TAG=$4; HOST=$5; MODES=$6
node "$HERE/../gameplay-clean/serve.mjs" "${PORT:-3372}" 127.0.0.1="$A" localhost="$B" > "$OUT/serve.log" 2>&1 &
SP=$!
trap 'kill $SP 2>/dev/null' EXIT
sleep 1
cd "$APP" && npx tsx "$HERE/hud.mts" "$OUT" "$TAG" "$HOST" "$MODES"
