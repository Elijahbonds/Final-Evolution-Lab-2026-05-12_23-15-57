#!/usr/bin/env zsh
# Ship Pass 2, Phase 2 — build the production bundle into .next-verify (never
# the dev server's .next) and serve it on :3004 for a production-mode gauntlet.
#   zsh scripts/prod-serve.sh build     # NEXT_DIST_DIR=.next-verify next build
#   zsh scripts/prod-serve.sh start     # next start -p 3004 (logs → $LOG)
#   zsh scripts/prod-serve.sh stop
set -e
LOG=${LOG:-/tmp/fel-prod-3004.log}; PIDF=${PIDF:-/tmp/fel-prod-3004.pid}
case "$1" in
  build) NEXT_DIST_DIR=.next-verify npx next build ;;
  start)
    [ -f "$PIDF" ] && kill "$(cat "$PIDF")" 2>/dev/null || true
    NEXT_DIST_DIR=.next-verify nohup npx next start -p 3004 > "$LOG" 2>&1 &
    echo $! > "$PIDF"; echo "prod server pid $(cat "$PIDF") → :3004, log $LOG"
    for i in $(seq 1 40); do curl -s -o /dev/null --max-time 2 http://localhost:3004/ && { echo "up"; exit 0; }; sleep 1; done
    echo "did not answer in 40 s"; tail -5 "$LOG"; exit 1 ;;
  stop) [ -f "$PIDF" ] && { kill "$(cat "$PIDF")" 2>/dev/null; rm -f "$PIDF"; echo stopped; } || echo "not running" ;;
  *) echo "usage: prod-serve.sh build|start|stop"; exit 2 ;;
esac
