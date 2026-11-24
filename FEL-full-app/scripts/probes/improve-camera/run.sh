#!/bin/bash
# improve-camera (phase 8): one batch of possession runs under ONE gate hold — hoops-cam's run.sh on this lane's port (3893), with the
# probe per job (1v1 = ../hoops-cam/possession.mjs, 3v3 = ./three.mjs). The static server is stopped by its own PID before the hold ends.
#   /home/user/wt/gate-run.sh 3000 bash scripts/probes/improve-camera/run.sh <siteA> <siteB> <outDir> <job> [<job> ...]
#   a job is  name:host:VW:VH:THROTTLE:TOUCH:FEEL:SHOT_AT:QS:PROBE   (host a = 127.0.0.1 → siteA, b = localhost → siteB; FEEL '-' = none,
#   else id=value[,id=value] — sent as &playtest=1&feel=id:value;
#   PROBE 1 = 1v1 (default), 3 = 3v3; QS without ':' e.g. &location=canopy)
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
A="$1"; B="$2"; OUT="$3"; shift 3
PORT=${PORT:-3893}
node "$HERE/../gameplay-clean/serve.mjs" $PORT 127.0.0.1="$A" localhost="$B" >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
sleep 1
for job in "$@"; do
  IFS=: read -r name host vw vh thr touch feel shot qs probe <<<"$job"
  h=127.0.0.1; [ "$host" = b ] && h=localhost
  [ "$feel" = - ] && feel=''
  # a knob override goes in through the rig's own door (gameplay-clean entry.tsx: `&playtest=1&feel=id:value`, after its storage clear;
  # the panel's gates still decide), so FEEL= on the probe (set before that clear) is not used
  [ -n "$feel" ] && qs="${qs:-}&playtest=1&feel=${feel//=/:}" && feel=''
  P="$HERE/../hoops-cam/possession.mjs"; [ "${probe:-1}" = 3 ] && P="$HERE/three.mjs"
  PORT=$PORT HOST=$h VW=$vw VH=$vh THROTTLE=$thr TOUCH=$touch FEEL="$feel" SHOT_AT="$shot" QS="${qs:-}" FAST="${FAST:-1}" DUMP="${DUMP:-0}" PRESS_AT="${PRESS_AT:-1.0}" \
    timeout 900 node "$P" "$OUT" "$name"
done
kill $SRV 2>/dev/null
