#!/bin/bash
# hoops-audit-play (2026-11-12): one hold of the shared gate lock running the gameplay-clean counter (../gameplay-clean/audit.mjs)
# over the hoops routes. It starts the static server itself on $PORT and stops it by PID however it ends; it does NOT take the
# lock: run it through the coordinator's wrapper so the server never inherits the lock:
#   /home/user/wt/gate-run.sh 890 scripts/probes/hoops-audit/gc-hold.sh <siteDir> <outDir> <jobsFile>
# <jobsFile>: "<mode> <tag> [qs]" a line (mode = an entry.tsx key: onevone threevthree threepoint dunk dunkduel carnival).
# A job whose JSON exists is skipped, so a second hold picks up where the first stopped. env: PORT (3352, this lane's row),
# PAR (2), HOLD_S (870), MODE_S (200: the least budget left to start a job), AUDIT (the driver: audit.mjs, or ./mash-audit.mjs with
# PLAYER=mash|idle), and audit.mjs's own env (PLAY_S, SHOTS, FAST, ...).
SITE=$1; OUT=$2; JOBS=$3; HERE=$(cd "$(dirname "$0")/../gameplay-clean" && pwd)
PORT=${PORT:-3352}; PAR=${PAR:-2}; HOLD_S=${HOLD_S:-870}; MODE_S=${MODE_S:-200}
mkdir -p "$OUT/logs"; t0=$(date +%s); echo "LOCK $(date -u +%T)"
SRV=; cleanup() { [ -n "$SRV" ] && kill "$SRV" 2>/dev/null; echo "UNLOCK $(date -u +%T) after $(( $(date +%s) - t0 )) s"; }
trap cleanup EXIT; trap 'exit 143' TERM INT
node "$HERE/serve.mjs" "$PORT" 127.0.0.1="$SITE" > "$OUT/logs/serve.log" 2>&1 & SRV=$!
sleep 1
todo() { grep -v '^\s*\(#\|$\)' "$JOBS" | while read -r m tag qs; do [ -f "$OUT/$m-$tag.json" ] || echo "$m $tag $qs"; done; }
while :; do
  left=$(( HOLD_S - ($(date +%s) - t0) )); [ $left -lt $MODE_S ] && break
  batch=$(todo | head -n "$PAR"); [ -z "$batch" ] && break
  pids=
  while read -r m tag qs; do
    ( PORT=$PORT TAG=$tag HOST=127.0.0.1 QS=$qs timeout $left node "${AUDIT:-$HERE/audit.mjs}" "$OUT" "$m" > "$OUT/logs/$m-$tag.log" 2>&1
      [ -f "$OUT/$m-$tag.json" ] || echo "{\"mode\":\"$m\",\"tag\":\"$tag\",\"fail\":\"timeout or crash in the hold\"}" > "$OUT/$m-$tag.json"
      echo "[$m $tag] done $(date -u +%T)" ) & pids="$pids $!"
  done <<< "$batch"
  wait $pids   # (a bare `wait` would wait for the server too)
done
[ -z "$(todo)" ] && echo ALLDONE
