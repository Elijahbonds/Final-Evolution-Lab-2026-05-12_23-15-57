#!/bin/bash
# DEPTH-LIGHT (lane L, 2026-11-25): the three gates before a push, in ONE gate hold (the depth pass's memory rule: tsc, vitest and
# ci-suite run through /home/user/wt/gate-run.sh, one hold at a time). Writes each log to <outDir> and prints the counts.
#   /home/user/wt/gate-run.sh 1790 scripts/probes/depth-light/gates.sh <outDir> [tsc-ci|vitest|all]
# The full vitest run does not fit one 30-minute hold behind tsc and ci-suite (measured 2026-11-25: tsc 3 min, ci-suite 9 min, vitest
# past 17 min), so run `tsc-ci` and `vitest` as two holds.
set -u
cd "$(dirname "$0")/../../.."
OUT=$1; PART=${2:-all}; mkdir -p "$OUT"
avail=$(free -g | awk '/^Mem:/{print $7}')
if [ "${avail:-0}" -lt 8 ]; then echo "only ${avail} GB available: not running the gates"; exit 3; fi
if [ "$PART" != vitest ]; then
echo "== tsc $(date +%T)"
env -u DATABASE_URL -u DIRECT_URL npx tsc --noEmit > "$OUT/tsc.log" 2>&1; echo "tsc exit $? ($(grep -c 'error TS' "$OUT/tsc.log") errors)"
echo "== ci-suite $(date +%T)"
env -u DATABASE_URL -u DIRECT_URL npx tsx scripts/ci-suite.ts > "$OUT/ci.log" 2>&1; echo "ci-suite exit $?"; tail -4 "$OUT/ci.log"
fi
if [ "$PART" != tsc-ci ]; then
echo "== vitest $(date +%T)"
env -u DATABASE_URL -u DIRECT_URL npx vitest run --minWorkers=1 --maxWorkers=2 > "$OUT/vitest.log" 2>&1; echo "vitest exit $?"
grep -E "^\s+(Test Files|Tests)\s" "$OUT/vitest.log" | tail -2
fi
echo "== done $(date +%T)"
