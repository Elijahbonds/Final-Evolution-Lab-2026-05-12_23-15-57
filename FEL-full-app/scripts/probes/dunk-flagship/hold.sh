#!/bin/bash
# dunk-flagship rig: ONE gate-lock hold (keep it ≤ ~15 min): hold.sh <budgetSec> <jobfile>
# Each job line: <tag> <page> <SCEN> <reps> <rep0> [VAR=val ...] [Q=query]   (Q is appended to the page's query, e.g. Q=feel=dunk.finishOverRing:1)
# Records land in $DUNK_RIG/out/<tag>/<SCEN>-r<rep0>/. A job that would not fit the budget is skipped and says so.
HERE=$(cd "$(dirname "$0")" && pwd); APP=$(cd "$HERE/../../.." && pwd)
R=${DUNK_RIG:?set DUNK_RIG}; budget=$1; jobs=$2; PORT=${DUNK_PORT:-3611}
exec 9>${GATE_LOCK:-/home/user/wt/gate-queue.lock}; flock 9
t0=$(date +%s); echo "LOCK $(date -u +%H:%M:%S) $jobs"
"$HERE/srv.sh" >/dev/null 2>&1
cd "$APP"
while read -r tag pg scen reps rep0 rest; do
  [ -z "$tag" ] && continue; case "$tag" in \#*) continue;; esac
  left=$(( budget - ($(date +%s) - t0) )); [ $left -lt 60 ] && { echo "SKIP (budget) $tag $scen r$rep0"; continue; }
  q=""; envs=""; for kv in $rest; do case "$kv" in Q=*) q="${kv#Q=}";; *) envs="$envs $kv";; esac; done
  out=$R/out/$tag/$scen-r$rep0; mkdir -p "$R/out/$tag"
  env VW=320 VH=180 PROGRESS=1 $envs BASE=http://127.0.0.1:$PORT PAGE="$pg.html?mode=dunk&tier=mobile&perf=off${q:+&$q}" OUT=$out SCEN=$scen REPS=$reps REP0=$rep0 \
    timeout $left npx tsx scripts/probes/_dunk-flagship-probe.mts > $out.log 2>&1
  echo "exit $? $tag $scen r$rep0 x$reps $(date -u +%H:%M:%S) ($(( $(date +%s) - t0 )) s into the hold)"
done < "$jobs"
flock -u 9; echo "UNLOCK $(date -u +%H:%M:%S)"
