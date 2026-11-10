#!/bin/bash
# gameplay-clean: audit every listed mode inside the shared gate lock, in holds of at most ~15 min (the lane fairness rule): a hold
# starts a mode only while MODE_S seconds are left of it, then lets go and waits 60 s before queueing again. A mode whose JSON is
# already in <outDir> is skipped (a re-run picks up where it stopped).
#   run-all.sh <outDir> <mode,mode,...>     env: HOLD_S=870 MODE_S=330 PAR=1 TAG=base GATE=/home/user/wt/gate-run.sh (+ audit.mjs's env)
# clean-5 (2026-11-10): the lock is taken through the coordinator's gate-run.sh (`flock -o`: no child inherits the lock — a browser
# orphaned by a timeout can no longer hold every lane's queue), and PAR browsers run side by side inside the hold (the clock is
# virtual, so the motion numbers do not depend on the load; the box has 4 cores).
OUT=$1; MODES=$2; HERE=$(cd "$(dirname "$0")" && pwd); GATE=${GATE:-/home/user/wt/gate-run.sh}
HOLD_S=${HOLD_S:-870}; MODE_S=${MODE_S:-330}; TAG=${TAG:-base}; PAR=${PAR:-1}
mkdir -p "$OUT"
todo() { for m in ${MODES//,/ }; do [ -f "$OUT/$m-$TAG.json" ] || echo "$m"; done; }
if [ "$3" = --hold ]; then            # the body of one hold (run by gate-run.sh, below)
  t0=$(date +%s); echo "LOCK $(date -u +%T)"
  while :; do
    left=$(( HOLD_S - ($(date +%s) - t0) ))
    [ $left -lt $MODE_S ] && break
    batch=$(todo | head -n "$PAR"); [ -z "$batch" ] && break
    for m in $batch; do
      ( TAG=$TAG timeout $left node "$HERE/audit.mjs" "$OUT" "$m" 2>&1 | grep -v '^\s*$' | tail -3
        [ -f "$OUT/$m-$TAG.json" ] || echo "{\"mode\":\"$m\",\"tag\":\"$TAG\",\"fail\":\"timeout or crash in the hold\"}" > "$OUT/$m-$TAG.json" ) &
    done
    wait
  done
  echo "UNLOCK $(date -u +%T)"; exit 0
fi
while [ -n "$(todo)" ]; do
  HOLD_S=$HOLD_S MODE_S=$MODE_S TAG=$TAG PAR=$PAR "$GATE" $(( HOLD_S + 20 )) "$0" "$OUT" "$MODES" --hold
  [ -n "$(todo)" ] && sleep 60
done
echo ALLDONE
