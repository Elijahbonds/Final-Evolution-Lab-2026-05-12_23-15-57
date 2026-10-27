#!/bin/bash
# hoops-audit: every rig run, one at a time, each under the shared gate lock (one browser across all lanes).
#   run-all.sh <outDir> [steps...]   steps: game1 game3 input1 input3 perf1 perf3 (default: all)
# Needs the static server on $PORT (default 3647) over <site> with dev.html (build.mjs --dev) and prod.html (ENTRY=perf-entry.mjs).
OUT=$1; shift; HERE=$(cd "$(dirname "$0")" && pwd); LOCK=${LOCK:-/home/user/wt/gate-queue.lock}
mkdir -p "$OUT/logs"
run() { local name=$1; shift; ( flock 9; echo "start $name $(date +%T)"; "$@" > "$OUT/logs/$name.log" 2>&1; echo "end $name $(date +%T) rc $?" ) 9>"$LOCK"; }
for s in "${@:-game1 game3 input1 input3 perf1 perf3}"; do
  case $s in
    game1) run game1 env GAME_S=${GAME_S:-150} timeout 3600 node "$HERE/drive.mjs" onevone game "$OUT" ;;
    game3) run game3 env GAME_S=${GAME_S:-150} timeout 3600 node "$HERE/drive.mjs" threevthree game "$OUT" ;;
    input1) run input1 timeout 3600 node "$HERE/drive.mjs" onevone input "$OUT" ;;
    input3) run input3 timeout 3600 node "$HERE/drive.mjs" threevthree input "$OUT" ;;
    perf1) run perf1 env PLAY_S=${PLAY_S:-15} timeout 1800 node "$HERE/perf.mjs" prod onevone "$OUT/perf.jsonl" ;;
    perf3) run perf3 env PLAY_S=${PLAY_S:-15} timeout 1800 node "$HERE/perf.mjs" prod threevthree "$OUT/perf.jsonl" ;;
  esac
done
echo ALLDONE
