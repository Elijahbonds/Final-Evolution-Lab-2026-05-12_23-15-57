#!/bin/bash
# hoops-audit-show (2026-11-12): one browser job under the shared gate, with this lane's static server around it.
#   scripts/probes/hoops-audit/show/run.sh <siteDir> <port> <cap seconds> show|perf [ENV=value ...]
#     show — ./show.mts (the real hoops screens: shots, camera, framing, sound, load; env: MODES PROFILE SECONDS OUT RASTER SHOT_EVERY
#            LOCATION)
#     perf — scripts/probes/_perf-sweep.mts on the bare mode bundle (<site>/mode.html: the phone profile, 4x throttle; env: MODES
#            PROFILES SECONDS OUT RASTER SEED)
# The server starts only once the gate is ours (a server started before a long queue died under memory pressure on the shared box
# and the run found nothing to load), and it is stopped by its own PID when the job ends — never pkill by name. gate-run.sh is
# flock -o, so the server never holds the gate lock.
set -u
if [ "${1:-}" = "--inner" ]; then
  shift; site=$1; port=$2; job=$3; shift 3
  node scripts/probes/hoops-gap/serve.mjs "$site" "$port" > "$site/serve.log" 2>&1 &
  SP=$!
  trap 'kill $SP 2>/dev/null' EXIT
  for i in $(seq 1 30); do curl -s -o /dev/null "http://127.0.0.1:$port/" && break; sleep 1; done
  case "$job" in
    show) env "$@" BASE="http://127.0.0.1:$port" nice -n 5 npx tsx scripts/probes/hoops-audit/show/show.mts ;;
    perf) env QUERY='?perf=off' "$@" PAGE="http://127.0.0.1:$port/mode.html" nice -n 5 npx tsx scripts/probes/_perf-sweep.mts ;;
    *) echo "job must be show or perf"; exit 2 ;;
  esac
  exit $?
fi
APP=$(cd "$(dirname "$0")/../../../.." && pwd)
site=$1; port=$2; cap=$3; job=$4; shift 4
cd "$APP"
exec /home/user/wt/gate-run.sh "$cap" bash "$APP/scripts/probes/hoops-audit/show/run.sh" --inner "$site" "$port" "$job" "$@"
