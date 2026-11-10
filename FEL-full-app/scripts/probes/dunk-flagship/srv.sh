#!/bin/bash
# dunk-flagship rig: the static server on the lane's port (LANES.md: 3611), started if it is not up. Prints its PID file's path;
# stop it with `kill $(cat $DUNK_RIG/server.pid)` — by its own PID, never by name.
R=${DUNK_RIG:?set DUNK_RIG}; PORT=${DUNK_PORT:-3611}
curl -sf -o /dev/null "http://127.0.0.1:$PORT/index.html" && exit 0
cd "$R/site" && nohup python3 -m http.server "$PORT" --bind 127.0.0.1 > "$R/server.log" 2>&1 &
echo $! > "$R/server.pid"
sleep 2; curl -sf -o /dev/null "http://127.0.0.1:$PORT/index.html" && echo "up (pid $(cat "$R/server.pid"))"
