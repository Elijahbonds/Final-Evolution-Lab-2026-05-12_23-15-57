#!/bin/bash
# device-perf (2026-11-12): build the bare mode bundle with the readout, serve it on this lane's port (3761), run one job under
# the shared gate, stop the server by its own PID.
#   scripts/probes/device-perf/run.sh <siteDir> <cap seconds> [ENV=value ...]      (env for ./readout-run.mts: MODES ENGINES SECONDS OUT ...)
# JOB=bare runs the WebGPU control instead (build ./bare-entry.mjs as <site>/bare first).
# Build first (a short job):  ENTRY=../device-perf/entry.mjs /home/user/wt/cpu-short.sh node scripts/probes/hoops-gap/build.mjs <siteDir> mode
set -u
PORT=${PORT:-3761}
if [ "${1:-}" = "--inner" ]; then
  shift; site=$1; shift
  if curl -s -o /dev/null "http://127.0.0.1:$PORT/"; then echo "run.sh: port $PORT is already serving — stop that server first"; exit 3; fi
  node scripts/probes/hoops-gap/serve.mjs "$site" "$PORT" > "$site/serve.log" 2>&1 &
  SP=$!
  trap 'kill $SP 2>/dev/null' EXIT
  for i in $(seq 1 30); do curl -s -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 1; done
  # JOB=bare: the control — a bare Babylon WebGPU scene (./bare-entry.mjs, built as <site>/bare.html), in this box's Chrome and in
  # the playwright Chromium, to tell the box's WebGPU from the app's
  if [ "${JOB:-readout}" = "bare" ]; then
    env "$@" PAGE="http://127.0.0.1:$PORT/bare.html" nice -n 5 npx tsx scripts/probes/device-perf/bare-run.mts
    env "$@" CHROMIUM_EXE=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome PAGE="http://127.0.0.1:$PORT/bare.html" nice -n 5 npx tsx scripts/probes/device-perf/bare-run.mts
    exit $?
  fi
  # which launch flags give this box's Chromium a WebGPU adapter (none: the WebGPU runs fall back to WebGL, and say so)
  best=$(BASE="http://127.0.0.1:$PORT/mode.html?mode=none" nice -n 5 npx tsx scripts/probes/device-perf/webgpu-avail.mts 2>&1 | tee "$site/webgpu-avail.log" | sed -n 's/^BEST=//p')
  echo "webgpu flags: ${best:-none}"
  env CHROME_ARGS="${best:---enable-unsafe-webgpu}" "$@" PAGE="http://127.0.0.1:$PORT/mode.html" nice -n 5 npx tsx scripts/probes/device-perf/readout-run.mts
  exit $?
fi
APP=$(cd "$(dirname "$0")/../../.." && pwd)
site=$1; cap=$2; shift 2
cd "$APP"
exec /home/user/wt/gate-run.sh "$cap" bash "$APP/scripts/probes/device-perf/run.sh" --inner "$site" "$@"
