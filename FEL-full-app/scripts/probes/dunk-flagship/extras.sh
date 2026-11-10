#!/bin/bash
# dunk-flagship Phase 10, one gate-lock hold: the dunk host's layout shift at 390×844 (_dunk-host-cls.mts, page host10) and the
# phone-profile frame time (_dunk-phone-perf.mts), the baseline page and the current one interleaved so machine load hits both.
#   DUNK_RIG=<scratch> scripts/probes/dunk-flagship/extras.sh [pages…]      (default: base cur10 base cur10)
HERE=$(cd "$(dirname "$0")" && pwd); APP=$(cd "$HERE/../../.." && pwd)
R=${DUNK_RIG:?set DUNK_RIG}; PORT=${DUNK_PORT:-3611}; PAGES=${*:-base cur10 base cur10}
exec 9>${GATE_LOCK:-/home/user/wt/gate-queue.lock}; flock 9; echo "LOCK $(date -u +%H:%M:%S) extras"
"$HERE/srv.sh" >/dev/null 2>&1; cd "$APP"; mkdir -p "$R/out"
if [ -z "$SKIP_CLS" ]; then BASE=http://127.0.0.1:$PORT OUT=$R/out/cls timeout 320 npx tsx scripts/probes/_dunk-host-cls.mts > "$R/out/cls.log" 2>&1; echo "cls exit $? $(date -u +%H:%M:%S)"; fi
for pg in $PAGES; do BASE=http://127.0.0.1:$PORT PAGE=$pg FRAMES=${FRAMES:-120} THROTTLE=4 OUT=$R/out/perf.jsonl timeout 240 npx tsx scripts/probes/_dunk-phone-perf.mts >> "$R/out/perf.log" 2>&1; echo "perf $pg exit $? $(date -u +%H:%M:%S)"; done
flock -u 9; echo "UNLOCK $(date -u +%H:%M:%S)"
