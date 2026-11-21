#!/bin/bash
# hoops-cam: one batch of possession runs under ONE gate hold. The static server is started here and stopped by its own PID
# before the hold ends (lane rules: never leave a server holding the lock).
#   /home/user/wt/gate-run.sh 1500 bash scripts/probes/hoops-cam/run.sh <siteA> <siteB> <outDir> <job> [<job> ...]
#   a job is  name:host:VW:VH:THROTTLE:TOUCH:FEEL:SHOT_AT[:QS]   (host a = 127.0.0.1 → siteA, b = localhost → siteB; FEEL '-' = none)
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
A="$1"; B="$2"; OUT="$3"; shift 3
PORT=3721
node "$HERE/../gameplay-clean/serve.mjs" $PORT 127.0.0.1="$A" localhost="$B" >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
sleep 1
for job in "$@"; do
  IFS=: read -r name host vw vh thr touch feel shot qs <<<"$job"
  h=127.0.0.1; [ "$host" = b ] && h=localhost
  [ "$feel" = - ] && feel=''
  PORT=$PORT HOST=$h VW=$vw VH=$vh THROTTLE=$thr TOUCH=$touch FEEL="$feel" SHOT_AT="$shot" QS="${qs:-}" FAST="${FAST:-1}" DUMP="${DUMP:-0}" PRESS_AT="${PRESS_AT:--1}" \
    timeout 900 node "$HERE/possession.mjs" "$OUT" "$name"
done
kill $SRV 2>/dev/null
