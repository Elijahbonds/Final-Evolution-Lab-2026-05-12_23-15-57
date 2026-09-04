#!/bin/zsh
# FEL gauntlet — the full regression sweep. Prints a compact table and a diff
# against the previous run; the /loop reports only what changed.
set -u
cd "$(dirname "$0")/.."
BASE=${BASE:-http://localhost:3000}   # ship pass 2: BASE=http://localhost:3004 points at the production server
G="${GAUNTLET_DIR:?set GAUNTLET_DIR}"; mkdir -p "$G" "$G/logs"
OUT="$G/run-$(date +%Y%m%d-%H%M%S).txt"
{
  printf "tsc        : "; if npx tsc --noEmit 2>&1 | grep -vE "\.next/types|node_modules" | grep -q .; then echo FAIL; else echo PASS; fi
  printf "vitest     : "; npx vitest run 2>&1 | grep -oE "Tests +[0-9]+ passed \([0-9]+\)|[0-9]+ failed" | head -1
  for m in dunk threepoint threevthree onevone dunkduel karate_vs karate mixedcombat skateboard surf snowboard_slalom bigair gymnastics volleyball tennis golf derby penalty football carnival dance; do
    # full output kept per mode so a frame-guard hit is inspectable after the fact
    r=$(URL=$BASE/dev/mode/$m PUMP=1 STEER=1 HOLD=700 GAP=70 KEYS=j,k,l NAME=$m LOG_CHARS=400 OUT_DIR="$G/shots" REPS=8 npx tsx scripts/capture-mode-play.mts 2>&1)
    echo "$r" > "$G/logs/$m.txt"
    line=$(echo "$r" | grep -oE "FEL-FRAME [0-9]+ \| MISSING CLIP [0-9]+ \| errors [0-9]+" | head -1)
    perf=$(echo "$r" | grep -oE "perf  : .*" | sed 's/perf  : //' | head -1)
    printf "%-16s: %-46s %s\n" "$m" "${line:-NO RESULT}" "${perf:-}"
  done
  # logged-in captures, one mode per family: only a session runs applyIdentity
  # (tint clones, morphs, hair style, jersey plate) on top of the spawn layers.
  # The Closet caught a never-ready skin material 21 anonymous runs could not.
  for m in onevone skateboard karate; do
    r=$(LOGIN=1 URL=$BASE/dev/mode/$m PUMP=1 STEER=1 HOLD=700 GAP=70 KEYS=j,k,l NAME=login_$m LOG_CHARS=400 OUT_DIR="$G/shots" REPS=4 npx tsx scripts/capture-mode-play.mts 2>&1)
    echo "$r" > "$G/logs/login-$m.txt"
    line=$(echo "$r" | grep -oE "FEL-FRAME [0-9]+ \| MISSING CLIP [0-9]+ \| errors [0-9]+" | head -1)
    ident=$(echo "$r" | grep -oE "ident : .*" | sed 's/ident : //' | head -1)
    printf "%-16s: %-46s %s\n" "login/$m" "${line:-NO RESULT}" "${ident:-}"
  done
  # mobile QUALITY TIER, one mode per family: a phone-shaped touch context makes
  # detectQualityTier pick the mobile tier (Phase 1 gate: both tiers measured).
  for m in dunk karate skateboard volleyball golf football dance; do
    r=$(TIER=mobile URL=$BASE/dev/mode/$m PUMP=1 STEER=1 HOLD=700 GAP=70 KEYS=j,k,l NAME=mtier_$m LOG_CHARS=400 OUT_DIR="$G/shots" REPS=4 npx tsx scripts/capture-mode-play.mts 2>&1)
    echo "$r" > "$G/logs/mtier-$m.txt"
    line=$(echo "$r" | grep -oE "FEL-FRAME [0-9]+ \| MISSING CLIP [0-9]+ \| errors [0-9]+" | head -1)
    perf=$(echo "$r" | grep -oE "perf  : .*" | sed 's/perf  : //' | head -1)
    printf "%-16s: %-46s %s\n" "mtier/$m" "${line:-NO RESULT}" "${perf:-}"
  done
  # phone captures on the shipping routes, one mode per family (ship pass 2, Phase 7)
  for r in "skateboard PUMP POP" "volleyball HIT BLOCK" "tennis DRIVE SLICE" "dunk CHARGE SLAM" "karate BLOCK JAB" "football TRUCK HURDLE" "golf SWING CLUB"; do
    set -- ${=r}   # zsh does not word-split an unquoted variable; ${=r} forces it
    mr=$(URL=$BASE/play/$1 HOLD_VERB=$2 TAP_VERB=$3 OUT_DIR="$G/shots" npx tsx scripts/capture-mobile-touch.mts 2>&1)
    echo "$mr" > "$G/logs/mobile-$1.txt"
    e=$(echo "$mr" | grep -oE "^errors: [0-9]+" | head -1)
    printf "%-16s: %s\n" "mobile/$1" "${e:-NO RESULT}"
  done
} > "$OUT" 2>&1
echo "=== RESULT ($OUT) ==="; cat "$OUT"
if [ -f "$G/latest.txt" ]; then
  echo "=== DIFF vs previous (regressions) ==="
  # only lines whose status changed; perf numbers are stripped for the compare
  diff <(sed -E 's/ +[0-9]+fps.*$//' "$G/latest.txt") <(sed -E 's/ +[0-9]+fps.*$//' "$OUT") && echo "(no change)"
else
  echo "=== BASELINE established ==="
fi
cp "$OUT" "$G/latest.txt"
