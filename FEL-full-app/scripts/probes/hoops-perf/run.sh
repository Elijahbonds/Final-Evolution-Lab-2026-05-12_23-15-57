#!/bin/bash
# hoops-perf (2026-11-12): one browser job under the shared gate, with this lane's static server (port 3383) around it.
#   scripts/probes/hoops-perf/run.sh <siteDir> <cap seconds> perf|census|diff|heap [ENV=value ...]
#     perf    — scripts/probes/_perf-sweep.mts on the bare mode bundle (<site>/mode.html); env MODES OUT RASTER SEED TAG SECONDS
#     census  — scripts/probes/hoops-p08/scene-census.mts (what the phone draws, by mesh); env MODES OUT TAG
#     diff    — ./merge-diff.mts (the same frame merged and not); env MODES OUT RASTER
#     heap    — ./heap-profile.mts (where the court modes allocate); env MODES OUT SECONDS
# <site> is built by `node scripts/probes/hoops-gap/build.mjs <site> mode` (entry.mjs, production). The server starts once the gate
# is ours and is stopped by its own PID when the job ends (never pkill by name); gate-run.sh is flock -o, so it never holds the lock.
set -u
PORT=${PORT:-3383}
if [ "${1:-}" = "--inner" ]; then
  shift; site=$1; job=$2; shift 2
  if curl -s -o /dev/null "http://127.0.0.1:$PORT/"; then echo "run.sh: port $PORT is already serving — stop that server first"; exit 3; fi
  node scripts/probes/hoops-gap/serve.mjs "$site" "$PORT" > "$site/serve.log" 2>&1 &
  SP=$!
  trap 'kill $SP 2>/dev/null' EXIT
  for i in $(seq 1 30); do curl -s -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 1; done
  P="http://127.0.0.1:$PORT/mode.html"
  case "$job" in
    perf) env QUERY='?perf=off' "$@" PAGE="$P" nice -n 5 npx tsx scripts/probes/_perf-sweep.mts ;;
    census) env "$@" PAGE="$P" nice -n 5 npx tsx scripts/probes/hoops-p08/scene-census.mts ;;
    diff) env "$@" PAGE="$P" nice -n 5 npx tsx scripts/probes/hoops-perf/merge-diff.mts ;;
    heap) env "$@" PAGE="$P" nice -n 5 npx tsx scripts/probes/hoops-perf/heap-profile.mts ;;
    effects) env "$@" PAGE="$P" nice -n 5 npx tsx scripts/probes/hoops-perf/effect-churn.mts ;;
    *) echo "job must be perf, census, diff or heap"; exit 2 ;;
  esac
  exit $?
fi
APP=$(cd "$(dirname "$0")/../../.." && pwd)
site=$1; cap=$2; job=$3; shift 3
cd "$APP"
exec /home/user/wt/gate-run.sh "$cap" bash "$APP/scripts/probes/hoops-perf/run.sh" --inner "$site" "$job" "$@"
