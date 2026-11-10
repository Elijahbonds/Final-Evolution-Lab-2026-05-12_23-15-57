#!/bin/bash
# hoops-p05: several rig runs under ONE hold of the shared gate lock (the lock is the scarce thing: other lanes queue on it, and a hold is
# capped at 900 s). It does NOT take the lock itself: run it through the coordinator's wrapper, which closes the lock's descriptor
# before the command starts (a server started inside a plain `flock FILE cmd` inherits the lock and keeps it after the run):
#   /home/user/wt/gate-run.sh 890 scripts/probes/hoops-gap/run-set.sh <siteDir> <outDir> <line> [<line> ...]
#   each <line> is "<mode> <scen> KEY=VAL KEY=VAL ..." (the driver's env: TAG, PAGE, POSS, SEED, NODRAW, POP_LIST, POSS_MOTION, FEEL ...;
#   a value may not hold a space — FEEL's JSON has none)
#   env: PORT (3695)  HOLD_S (870: the whole set's budget, under the wrapper's cap)  RUN_S (each run's cap, default what is left)
# It starts the static server on $PORT itself and stops it by PID when it ends, however it ends.
# Example: 3 identical 1v1 runs for determinism.mjs
#   gate-run.sh 890 run-set.sh $SITE $OUT "onevone poss TAG=d1 POSS=1 POSS_MOTION=1 POP_LIST=1 NODRAW=1" "onevone poss TAG=d2 ..." "onevone poss TAG=d3 ..."
SITE=$1; OUT=$2; shift 2
HERE=$(cd "$(dirname "$0")" && pwd); PORT=${PORT:-3695}; HOLD_S=${HOLD_S:-870}
mkdir -p "$OUT/logs"
T0=$(date +%s); echo "lock at $(date +%T)"
SRV=; RUN=
cleanup() { [ -n "$RUN" ] && kill "$RUN" 2>/dev/null; [ -n "$SRV" ] && kill "$SRV" 2>/dev/null; echo "released at $(date +%T) after $(( $(date +%s) - T0 )) s"; }
trap cleanup EXIT; trap 'exit 143' TERM INT
node "$HERE/serve.mjs" "$SITE" "$PORT" > "$OUT/logs/serve.log" 2>&1 & SRV=$!
sleep 1
for line in "$@"; do
  left=$(( HOLD_S - ($(date +%s) - T0) )); [ "$left" -lt 30 ] && { echo "skipped (budget spent): $line"; continue; }
  cap=${RUN_S:-$left}; [ "$cap" -gt "$left" ] && cap=$left
  set -- $line; mode=$1; scen=$2; shift 2
  tag=$(for kv in "$@"; do case $kv in TAG=*) echo "${kv#TAG=}";; esac; done)
  echo "start $mode $scen ${tag:-run} $(date +%T) (cap ${cap}s)"
  env PORT="$PORT" "$@" timeout "$cap" node "$HERE/drive.mjs" "$mode" "$scen" "$OUT" > "$OUT/logs/$mode-$scen-${tag:-run}.log" 2>&1 & RUN=$!
  wait "$RUN"; echo "end   $mode $scen ${tag:-run} $(date +%T) rc $?"; RUN=
done
