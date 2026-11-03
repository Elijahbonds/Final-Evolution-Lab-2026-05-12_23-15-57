#!/bin/bash
# gameplay-clean: audit every listed mode, one browser at a time, inside the shared gate lock, in holds of at most ~15 min
# (the lane fairness rule): a hold starts a mode only while HOLD_S - MODE_S seconds are left of it, then lets go and waits
# 60 s before queueing again. A mode whose JSON is already in <outDir> is skipped (a re-run picks up where it stopped).
#   run-all.sh <outDir> <mode,mode,...>     env: HOLD_S=870 MODE_S=330 LOCK=/home/user/wt/gate-queue.lock (+ audit.mjs's env)
OUT=$1; MODES=$2; HERE=$(cd "$(dirname "$0")" && pwd); LOCK=${LOCK:-/home/user/wt/gate-queue.lock}
HOLD_S=${HOLD_S:-870}; MODE_S=${MODE_S:-330}; TAG=${TAG:-base}
mkdir -p "$OUT"
todo() { for m in ${MODES//,/ }; do [ -f "$OUT/$m-$TAG.json" ] || echo "$m"; done; }
while [ -n "$(todo)" ]; do
  (
    flock 9
    t0=$(date +%s); echo "LOCK $(date -u +%T)"
    for m in $(todo); do
      left=$(( HOLD_S - ($(date +%s) - t0) ))
      [ $left -lt $MODE_S ] && break
      timeout $left node "$HERE/audit.mjs" "$OUT" "$m" 2>&1 | grep -v '^\s*$' | tail -3
      [ -f "$OUT/$m-$TAG.json" ] || echo "{\"mode\":\"$m\",\"tag\":\"$TAG\",\"fail\":\"timeout or crash in the hold\"}" > "$OUT/$m-$TAG.json"
    done
    echo "UNLOCK $(date -u +%T)"
  ) 9>"$LOCK"
  [ -n "$(todo)" ] && sleep 60
done
echo ALLDONE
