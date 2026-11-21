#!/bin/bash
# hoops-followups (2026-11-18): the 3v3 phone worst frame, several runs in ONE gate hold, with this lane's static server (:3821)
# started inside the hold and stopped by its own PID.
#   scripts/probes/hoops-followups/perf3v3.sh <siteDir> <outDir> <cap seconds> "TAG [ENV=value ...]" ...
# Each run is scripts/probes/_perf-sweep.mts on <site>/mode.html (build: node scripts/probes/hoops-gap/build.mjs <site> mode), 3v3,
# portrait, SEED 7, 6 game seconds, RASTER 3, TRACE_WORST=1 (the shadow cache and body merge per frame). QUERY defaults to
# ?perf=off (the content measurement); a run's own QUERY=... replaces it, e.g. QUERY='?perf=off&feel={"perf.bodyMergeOn":0}'.
# START_WHEN_BAKED=1 in a run presses START only after the shadow cache's first bake (a player who reads the READY card).
set -u
PORT=${PORT:-3821}
if [ "${1:-}" = "--inner" ]; then
  shift; site=$1; out=$2; shift 2
  if curl -s -o /dev/null "http://127.0.0.1:$PORT/"; then echo "perf3v3.sh: port $PORT is already serving — stop that server first"; exit 3; fi
  node scripts/probes/hoops-gap/serve.mjs "$site" "$PORT" > "$out/serve.log" 2>&1 &
  SP=$!
  trap 'kill $SP 2>/dev/null' EXIT
  for i in $(seq 1 30); do curl -s -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 1; done
  for spec in "$@"; do
    read -r tag rest <<< "$spec"
    echo "run $tag $(date +%T)"
    eval "env QUERY='?perf=off' PAGE=http://127.0.0.1:$PORT/mode.html MODES=threevthree PROFILES=portrait SECONDS=6 SEED=7 RASTER=3 TRACE_WORST=1 OUT=$out TAG=$tag PLAY_CAP_S=240 $rest nice -n 5 npx tsx scripts/probes/_perf-sweep.mts" 2>&1 | tail -2
  done
  echo "end $(date +%T)"
  exit 0
fi
APP=$(cd "$(dirname "$0")/../../.." && pwd)
site=$1; out=$2; cap=$3; shift 3
mkdir -p "$out"
cd "$APP"
exec /home/user/wt/gate-run.sh "$cap" bash "$APP/scripts/probes/hoops-followups/perf3v3.sh" --inner "$site" "$out" "$@"
