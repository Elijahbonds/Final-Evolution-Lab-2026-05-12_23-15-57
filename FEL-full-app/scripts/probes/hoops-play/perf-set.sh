#!/bin/bash
# hoops-play: phone-profile frame-time runs (scripts/probes/hoops-gap/perf.mjs: 390x844, DPR 3, 4x CPU throttle, the prod bundle built with
# ENTRY=perf-entry.mjs) under ONE hold of the shared gate lock, knobs off against on. Run it through the coordinator's wrapper:
#   /home/user/wt/gate-run.sh 890 scripts/probes/hoops-play/perf-set.sh <siteDir> <out.jsonl> <line> [<line> ...]
#   each <line> is "<mode> <tag> <feel-json-or-->" (the JSON without spaces; '-' = no knob values)
#   env: PORT (3831)  PLAY_S (12)  PAGE (perf)
# It starts the static server on $PORT itself and stops it by PID when it ends, however it ends.
SITE=$1; OUT=$2; shift 2
HERE=$(cd "$(dirname "$0")" && pwd); GAP="$HERE/../hoops-gap"; PORT=${PORT:-3831}
mkdir -p "$(dirname "$OUT")"
SRV=; RUN=
cleanup() { [ -n "$RUN" ] && kill "$RUN" 2>/dev/null; [ -n "$SRV" ] && kill "$SRV" 2>/dev/null; echo "released at $(date +%T)"; }
trap cleanup EXIT; trap 'exit 143' TERM INT
node "$GAP/serve.mjs" "$SITE" "$PORT" > "$OUT.serve.log" 2>&1 & SRV=$!
sleep 1
for line in "$@"; do
  set -- $line; mode=$1; tag=$2; fj=$3
  qs=""; [ "$fj" != "-" ] && qs="&feel=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$fj")"
  echo "start $mode $tag $(date +%T)"
  PORT=$PORT PLAY_S=${PLAY_S:-12} QS="$qs" TAG=$tag node "$GAP/perf.mjs" "${PAGE:-perf}" "$mode" "$OUT" & RUN=$!
  wait "$RUN"; echo "end   $mode $tag $(date +%T) rc $?"; RUN=
done
