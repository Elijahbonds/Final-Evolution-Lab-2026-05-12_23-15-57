#!/bin/bash
# game-hud: one gate hold. The static server for the two sites (before on 127.0.0.1, after on localhost), then, mode by
# mode, the BEFORE and the AFTER reading back to back (the same load on the box for both), until BUDGET_S is spent; the
# server is stopped by its own PID (never left running past the hold).
#   /home/user/wt/gate-run.sh 900 scripts/probes/game-hud/run.sh <outDir> <siteA> <siteB> [modes]
HERE=$(cd "$(dirname "$0")" && pwd); APP=$(cd "$HERE/../../.." && pwd)
OUT=$1; A=$2; B=$3
DEF=snowboard_slalom,penalty,football,tiebreak_v,story_boss,velocitykart,aeroaces,freerun,karate,onevone,dunk
MODES=${GH_MODES:-$DEF}
# (a 4th argument is a mode list only when it names one: an older caller passed a tag there)
case "$4" in *football*|*_*|*kart*|*aero*|*karate*|*freerun*|*penalty*|*dunk*|*onevone*) MODES=$4;; esac
AFTER=${GH_AFTER:-after}
node "$HERE/../gameplay-clean/serve.mjs" "${PORT:-3372}" 127.0.0.1="$A" localhost="$B" > "$OUT/serve.log" 2>&1 &
SP=$!
trap 'kill $SP 2>/dev/null' EXIT
sleep 1
t0=$(date +%s); BUDGET=${BUDGET_S:-480}
cd "$APP"
for m in ${MODES//,/ }; do
  for pair in before:127.0.0.1 $AFTER:localhost; do
    tag=${pair%%:*}; host=${pair#*:}
    [ -f "$OUT/$m-$tag.json" ] && continue
    [ $(( $(date +%s) - t0 )) -gt $BUDGET ] && { echo "budget: stop before $m $tag"; exit 0; }
    only=phone,desktop; case $m in onevone|dunk) only=phone;; esac
    ONLY=$only npx tsx "$HERE/hud.mts" "$OUT" "$tag" "$host" "$m" 2>&1 | grep -v '^\[probe\]'
  done
done
echo HOLD-DONE
