#!/bin/bash
# hoops-sound (2026-11-12): the dribble probe (./dribble.mts) under the shared browser gate, with its own static server around it.
#   scripts/probes/hoops-sound/run.sh <siteDir> <port> <cap seconds> [ENV=value ...]
# The site is the show rig's build (scripts/probes/hoops-audit/show/build.mts <siteDir>). The server starts only once the gate is ours
# and is stopped by its own PID when the job ends (never pkill by name); gate-run.sh is flock -o, so the server never holds the lock.
set -u
if [ "${1:-}" = "--inner" ]; then
  shift; site=$1; port=$2; shift 2
  node scripts/probes/hoops-gap/serve.mjs "$site" "$port" > "$site/serve.log" 2>&1 &
  SP=$!
  trap 'kill $SP 2>/dev/null' EXIT
  for i in $(seq 1 30); do curl -s -o /dev/null "http://127.0.0.1:$port/" && break; sleep 1; done
  env "$@" BASE="http://127.0.0.1:$port" nice -n 5 npx tsx scripts/probes/hoops-sound/dribble.mts
  exit $?
fi
APP=$(cd "$(dirname "$0")/../../.." && pwd)
site=$1; port=$2; cap=$3; shift 3
cd "$APP"
exec /home/user/wt/gate-run.sh "$cap" bash "$APP/scripts/probes/hoops-sound/run.sh" --inner "$site" "$port" "$@"
