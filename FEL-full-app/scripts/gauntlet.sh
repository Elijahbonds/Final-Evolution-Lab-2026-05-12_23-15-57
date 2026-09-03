#!/bin/zsh
# FEL gauntlet — the full regression sweep. Prints a compact table and a diff
# against the previous run; the /loop reports only what changed.
set -u
cd "$(dirname "$0")/.."
G="${GAUNTLET_DIR:?set GAUNTLET_DIR}"; mkdir -p "$G"
OUT="$G/run-$(date +%Y%m%d-%H%M%S).txt"
{
  printf "tsc        : "; if npx tsc --noEmit 2>&1 | grep -vE "\.next/types|node_modules" | grep -q .; then echo FAIL; else echo PASS; fi
  printf "vitest     : "; npx vitest run 2>&1 | grep -oE "Tests +[0-9]+ passed \([0-9]+\)|[0-9]+ failed" | head -1
  for m in dunk threepoint threevthree onevone karate_vs karate skateboard surf snowboard_slalom volleyball tennis golf derby penalty; do
    r=$(URL=http://localhost:3000/dev/mode/$m PUMP=1 STEER=1 HOLD=700 GAP=70 KEYS=j,k,l NAME=$m OUT_DIR="$G/shots" REPS=8 npx tsx scripts/capture-mode-play.mts 2>&1)
    line=$(echo "$r" | grep -oE "FEL-FRAME [0-9]+ \| MISSING CLIP [0-9]+ \| errors [0-9]+" | head -1)
    perf=$(echo "$r" | grep -oE "perf  : .*" | sed 's/perf  : //' | head -1)
    printf "%-16s: %-46s %s\n" "$m" "${line:-NO RESULT}" "${perf:-}"
  done
  for r in "skateboard PUMP POP" "volleyball CARVE CUTBACK" "tennis DRIVE SLICE"; do
    set -- $r
    e=$(URL=http://localhost:3000/play/$1 HOLD_VERB=$2 TAP_VERB=$3 OUT_DIR="$G/shots" npx tsx scripts/capture-mobile-touch.mts 2>&1 | grep -oE "^errors: [0-9]+" | head -1)
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
