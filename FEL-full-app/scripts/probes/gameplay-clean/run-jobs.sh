#!/bin/bash
# gameplay-clean: one gate hold of mixed rig jobs, PAR at a time — for a before / after / knob-off set on one build (serve.mjs serves
# a site per host name). A job whose JSON is already in <outDir> is skipped, so a second hold picks up where the first stopped.
#   run-jobs.sh <outDir> <jobsFile>        env: HOLD_S=870 MODE_S=170 PAR=2 GATE=/home/user/wt/gate-run.sh (+ audit.mjs's env)
# <jobsFile>: one job a line, "<mode> <tag> <host> [qs]"   e.g.  showdown off localhost &playtest=1&feel=anim.fadeHoldEnded:0
OUT=$1; JOBS=$2; HERE=$(cd "$(dirname "$0")" && pwd); GATE=${GATE:-/home/user/wt/gate-run.sh}
HOLD_S=${HOLD_S:-870}; MODE_S=${MODE_S:-170}; PAR=${PAR:-2}
mkdir -p "$OUT"
todo() { grep -v '^\s*\(#\|$\)' "$JOBS" | while read -r m tag host qs; do [ -f "$OUT/$m-$tag.json" ] || echo "$m $tag $host $qs"; done; }
if [ "$3" = --hold ]; then
  t0=$(date +%s); echo "LOCK $(date -u +%T)"
  while :; do
    left=$(( HOLD_S - ($(date +%s) - t0) ))
    [ $left -lt $MODE_S ] && break
    batch=$(todo | head -n "$PAR"); [ -z "$batch" ] && break
    while read -r m tag host qs; do
      ( TAG=$tag HOST=$host QS=$qs timeout $left node "$HERE/audit.mjs" "$OUT" "$m" 2>&1 | grep -v '^\s*$' | tail -1 | sed "s/^/[$tag] /"
        [ -f "$OUT/$m-$tag.json" ] || echo "{\"mode\":\"$m\",\"tag\":\"$tag\",\"fail\":\"timeout or crash in the hold\"}" > "$OUT/$m-$tag.json" ) &
    done <<< "$batch"
    wait
  done
  echo "UNLOCK $(date -u +%T)"; exit 0
fi
while [ -n "$(todo)" ]; do
  HOLD_S=$HOLD_S MODE_S=$MODE_S PAR=$PAR "$GATE" $(( HOLD_S + 20 )) "$0" "$OUT" "$JOBS" --hold
  [ -n "$(todo)" ] && sleep 60
done
echo ALLDONE
