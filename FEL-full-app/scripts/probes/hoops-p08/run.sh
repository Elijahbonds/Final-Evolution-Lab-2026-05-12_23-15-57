#!/bin/bash
# hoops-p08 (2026-11-12): one browser job under the shared gate, with this lane's static server (port 3352) around it.
#   scripts/probes/hoops-p08/run.sh <siteDir> <cap seconds> overlap|perf|census [ENV=value ...]
#     overlap — ./hud-overlap.mts on the real hoops screens (<site>/host); env MODES VIEWS SECONDS OUT TAG
#     perf    — scripts/probes/_perf-sweep.mts on the bare mode bundle (<site>/mode.html); env MODES PROFILES SECONDS OUT RASTER SEED TAG
#     census  — ./scene-census.mts on the bare mode bundle: what the phone draws, by group; env MODES OUT TAG
# The server starts once the gate is ours and is stopped by its own PID when the job ends (never pkill by name). gate-run.sh is
# flock -o, so the server never holds the gate lock.
set -u
PORT=${PORT:-3352}
if [ "${1:-}" = "--inner" ]; then
  shift; site=$1; job=$2; shift 2
  # a server left on the port (a killed run) would serve the WRONG site to this job: refuse instead of measuring it
  if curl -s -o /dev/null "http://127.0.0.1:$PORT/"; then echo "run.sh: port $PORT is already serving — stop that server first"; exit 3; fi
  node scripts/probes/hoops-gap/serve.mjs "$site" "$PORT" > "$site/serve.log" 2>&1 &
  SP=$!
  trap 'kill $SP 2>/dev/null' EXIT
  for i in $(seq 1 30); do curl -s -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 1; done
  case "$job" in
    overlap) env "$@" BASE="http://127.0.0.1:$PORT" nice -n 5 npx tsx scripts/probes/hoops-p08/hud-overlap.mts ;;
    perf) env QUERY='?perf=off' "$@" PAGE="http://127.0.0.1:$PORT/mode.html" nice -n 5 npx tsx scripts/probes/_perf-sweep.mts ;;
    census) env "$@" PAGE="http://127.0.0.1:$PORT/mode.html" nice -n 5 npx tsx scripts/probes/hoops-p08/scene-census.mts ;;
    *) echo "job must be overlap, perf or census"; exit 2 ;;
  esac
  exit $?
fi
APP=$(cd "$(dirname "$0")/../../.." && pwd)
site=$1; cap=$2; job=$3; shift 3
cd "$APP"
exec /home/user/wt/gate-run.sh "$cap" bash "$APP/scripts/probes/hoops-p08/run.sh" --inner "$site" "$job" "$@"
