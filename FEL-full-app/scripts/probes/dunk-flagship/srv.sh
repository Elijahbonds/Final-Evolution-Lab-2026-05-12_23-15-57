#!/bin/bash
# dunk-flagship rig: the static server on the lane's port (LANES.md: 3611).
#   srv.sh          start it if it is not up (its PID goes to $DUNK_RIG/server.pid)
#   srv.sh stop     stop it, by that PID only
# It is started with every inherited descriptor above stderr CLOSED. On 2026-11-10 this script, called from inside a
# `flock gate-queue.lock` hold, left the server holding the shared browser lock's descriptor after the run ended and every
# lane's rig queued behind it for 46 minutes. The holds (hold.sh, extras.sh) also take the lock through
# /home/user/wt/gate-run.sh (`flock -o`: children never inherit it) and stop the server on their way out.
R=${DUNK_RIG:?set DUNK_RIG}; PORT=${DUNK_PORT:-3611}
if [ "$1" = stop ]; then
  [ -f "$R/server.pid" ] || exit 0
  pid=$(cat "$R/server.pid"); rm -f "$R/server.pid"
  # only our own server: the PID must still be a python http.server on our port
  if [ -n "$pid" ] && ps -p "$pid" -o args= 2>/dev/null | grep -q "http.server $PORT"; then
    kill "$pid" 2>/dev/null; for _ in 1 2 3 4 5 6; do ps -p "$pid" >/dev/null 2>&1 || break; sleep 0.5; done
  fi
  exit 0
fi
curl -sf -o /dev/null "http://127.0.0.1:$PORT/index.html" && exit 0
cd "$R/site" || exit 1
# close every descriptor from 3 up in the child (the lock's included), then start it detached from this shell's files
( for fd in $(ls /proc/$BASHPID/fd 2>/dev/null); do [ "$fd" -gt 2 ] && eval "exec $fd>&-" 2>/dev/null; done
  exec python3 -m http.server "$PORT" --bind 127.0.0.1 > "$R/server.log" 2>&1 < /dev/null ) &
echo $! > "$R/server.pid"
sleep 2; curl -sf -o /dev/null "http://127.0.0.1:$PORT/index.html" && echo "up (pid $(cat "$R/server.pid"))"
