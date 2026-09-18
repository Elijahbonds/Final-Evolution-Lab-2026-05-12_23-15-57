#!/usr/bin/env zsh
# Ship Pass 2, Phase 2 — build the production bundle into .next-verify (never
# the dev server's .next) and serve it for a production-mode gauntlet.
#   zsh scripts/prod-serve.sh build            # NEXT_DIST_DIR=.next-verify next build
#   zsh scripts/prod-serve.sh start [port]     # next start -p <port> (default 3004; logs → $LOG)
#   zsh scripts/prod-serve.sh stop  [port]
#   zsh scripts/prod-serve.sh status [port]
# Ship pass 4, phase 10 (2026-09-04): the port is an argument (or PORT=), so the
# RC lane serves on :3006 while :3004 stays free for another checkout. LOG and
# PIDF follow the port unless given.
set -e
PORT=${2:-${PORT:-3004}}
case "$PORT" in (<1024-65535>) ;; (*) echo "port must be 1024–65535, got '$PORT'"; exit 2 ;; esac
LOG=${LOG:-/tmp/fel-prod-$PORT.log}; PIDF=${PIDF:-/tmp/fel-prod-$PORT.pid}
case "$1" in
  build) NEXT_DIST_DIR=.next-verify npx next build ;;
  start)
    [ -f "$PIDF" ] && kill "$(cat "$PIDF")" 2>/dev/null || true
    NEXT_DIST_DIR=.next-verify nohup npx next start -p "$PORT" > "$LOG" 2>&1 &
    echo $! > "$PIDF"; echo "prod server pid $(cat "$PIDF") → :$PORT, log $LOG"
    for i in $(seq 1 40); do curl -s -o /dev/null --max-time 2 "http://localhost:$PORT/" && { echo "up"; exit 0; }; sleep 1; done
    echo "did not answer in 40 s"; tail -5 "$LOG"; exit 1 ;;
  stop) [ -f "$PIDF" ] && { kill "$(cat "$PIDF")" 2>/dev/null; rm -f "$PIDF"; echo stopped; } || echo "not running" ;;
  status)
    if [ -f "$PIDF" ] && kill -0 "$(cat "$PIDF")" 2>/dev/null; then echo "running pid $(cat "$PIDF") → :$PORT"; else echo "not running"; exit 1; fi ;;
  *) echo "usage: prod-serve.sh build|start|stop|status [port]"; exit 2 ;;
esac
