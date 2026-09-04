#!/usr/bin/env zsh
# Ship Pass 2, Phase 1 — the SHIPPING-ROUTE gauntlet: every mode on /play/<route>,
# logged in through the real form (capture-mode-play.mts fills it when the
# /play → /login redirect lands). Route keys differ from registry keys.
#   GAUNTLET_DIR=<dir> BASE=http://localhost:3000 zsh scripts/gauntlet-play.sh
G=${GAUNTLET_DIR:-/tmp/fel-gauntlet}; BASE=${BASE:-http://localhost:3000}; mkdir -p "$G/logs" "$G/shots"
OUT="$G/play-$(date +%Y%m%d-%H%M%S).txt"
# registry key → /play route
typeset -A ROUTE=(dunk dunk threepoint threepoint threevthree threevthree onevone onevone dunkduel dunkduel
  karate_vs karate-vs karate karate mixedcombat mixedcombat skateboard skateboard surf surf snowboard_slalom snowboard
  bigair big-air gymnastics gymnastics volleyball volleyball tennis tennis golf golf derby baseball penalty soccer
  football football carnival carnival dance dance)
{
  # dunkduel is NOT here: /play/dunkduel is PROVE IT, the owner's real-footage
  # head-to-head contest (re-lock 2026-09-01) — no canvas, no Babylon mode. The
  # Babylon DunkDuelMode stays registry-only at /dev/mode/dunkduel.
  for m in dunk threepoint threevthree onevone karate_vs karate mixedcombat skateboard surf snowboard_slalom bigair gymnastics volleyball tennis golf derby penalty football carnival dance; do
    r=$(URL=$BASE/play/${ROUTE[$m]} PUMP=1 STEER=1 HOLD=700 GAP=70 KEYS=j,k,l NAME=play_$m LOG_CHARS=400 OUT_DIR="$G/shots" REPS=4 npx tsx scripts/capture-mode-play.mts 2>&1)
    echo "$r" > "$G/logs/play-$m.txt"
    line=$(echo "$r" | grep -oE "FEL-FRAME [0-9]+ \| MISSING CLIP [0-9]+ \| errors [0-9]+" | head -1)
    route=$(echo "$r" | grep -oE "route : .*" | sed 's/route : //' | head -1)
    perf=$(echo "$r" | grep -oE "perf  : .*" | sed 's/perf  : //' | head -1)
    printf "%-16s: %-46s %-22s %s\n" "play/$m" "${line:-NO RESULT}" "${route:-?}" "${perf:-}"
  done
} > "$OUT" 2>&1
echo "=== RESULT ($OUT) ==="; cat "$OUT"
if [ -f "$G/play-latest.txt" ]; then
  echo "=== DIFF vs previous ==="
  diff <(sed -E 's/ +[0-9]+fps.*$//' "$G/play-latest.txt") <(sed -E 's/ +[0-9]+fps.*$//' "$OUT") && echo "(no change)"
else echo "=== BASELINE established ==="; fi
cp "$OUT" "$G/play-latest.txt"
