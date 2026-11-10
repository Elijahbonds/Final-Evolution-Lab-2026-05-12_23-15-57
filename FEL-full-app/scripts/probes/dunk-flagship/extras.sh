#!/bin/bash
# dunk-flagship Phase 10, one hold of the shared browser lock (≤ 15 min): the dunk host's layout shift at 390×844
# (_dunk-host-cls.mts) and the phone-profile frame time (_dunk-phone-perf.mts), the baseline page and the current one
# interleaved so machine load hits both.   DUNK_RIG=<scratch> scripts/probes/dunk-flagship/extras.sh
#   HOSTS="host10 host10b" measures each built host page (before / after), into out/cls-<name>; SKIP_CLS=1 / SKIP_PERF=1 leave
#   one out; PAGES=base,cur10,base,cur10 FRAMES=40 HWSCALE=<n> pass through to the frame-time probe.
# The lock is taken through /home/user/wt/gate-run.sh (flock -o) and the static server is stopped on the way out (see srv.sh).
HERE=$(cd "$(dirname "$0")" && pwd); APP=$(cd "$HERE/../../.." && pwd)
R=${DUNK_RIG:?set DUNK_RIG}; PORT=${DUNK_PORT:-3611}
if [ -z "$DUNK_IN_HOLD" ]; then exec env DUNK_IN_HOLD=1 "${GATE_RUN:-/home/user/wt/gate-run.sh}" "${HOLD_SEC:-900}" "$0" "$@"; fi
export CHROMIUM_EXE=${CHROMIUM_EXE:-/opt/pw-browsers/chromium}
trap '"$HERE/srv.sh" stop; echo "UNLOCK $(date -u +%H:%M:%S)"' EXIT; trap 'exit 143' TERM INT
echo "LOCK $(date -u +%H:%M:%S) extras"
"$HERE/srv.sh" >/dev/null 2>&1; cd "$APP"; mkdir -p "$R/out"
if [ -z "$SKIP_CLS" ]; then for h in ${HOSTS:-host10}; do BASE=http://127.0.0.1:$PORT HOST_NAME=$h OUT=$R/out/cls-$h timeout ${CLS_TIMEOUT:-200} npx tsx scripts/probes/_dunk-host-cls.mts > "$R/out/cls-$h.log" 2>&1 < /dev/null; echo "cls $h exit $? $(date -u +%H:%M:%S)"; done; fi
if [ -z "$SKIP_PERF" ]; then BASE=http://127.0.0.1:$PORT PAGES=${PAGES:-base,cur10,base,cur10} FRAMES=${FRAMES:-40} THROTTLE=4 OUT=$R/out/perf.jsonl timeout ${PERF_TIMEOUT:-440} npx tsx scripts/probes/_dunk-phone-perf.mts >> "$R/out/perf.log" 2>&1 < /dev/null; echo "perf exit $? $(date -u +%H:%M:%S)"; fi
