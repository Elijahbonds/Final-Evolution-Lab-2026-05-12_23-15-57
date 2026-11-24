#!/bin/bash
# improve-hoops (2026-11-22): serve one or two rig sites (scripts/probes/gameplay-clean/serve.mjs: 127.0.0.1 = A, localhost = B) on
# PORT, run a command, then stop the server by its own PID. Run it inside the gate hold:
#   /home/user/wt/gate-run.sh 2400 bash scripts/probes/improve-hoops/with-sites.sh <siteA> [<siteB>] -- <command...>
set -u
cd "$(dirname "$0")/../../.."
PORT=${PORT:-3881}
A=$1; shift; B=$A
if [ "$1" != "--" ]; then B=$1; shift; fi
shift
node scripts/probes/gameplay-clean/serve.mjs "$PORT" 127.0.0.1="$A" localhost="$B" > /dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null; wait $SRV 2>/dev/null' EXIT
sleep 1
PORT=$PORT "$@"
