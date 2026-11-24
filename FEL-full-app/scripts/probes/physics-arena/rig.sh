#!/bin/bash
# lane/physics-arena: several rig runs under ONE hold of the shared gate lock. Run it through the wrapper (never a plain flock):
#   /home/user/wt/gate-run.sh 890 scripts/probes/physics-arena/rig.sh <siteDir> <cmd> [<cmd> ...]
# Starts ../hoops-gap/serve.mjs on $PORT (3871) and stops it by PID when it ends, however it ends. Each <cmd> is a shell line run
# from the app's root with PORT exported.
SITE=$1; shift
HERE=$(cd "$(dirname "$0")" && pwd); APP=$(cd "$HERE/../../.." && pwd); export PORT=${PORT:-3871}
T0=$(date +%s); echo "lock at $(date +%T)"
SRV=
cleanup() { [ -n "$SRV" ] && kill "$SRV" 2>/dev/null; echo "released at $(date +%T) after $(( $(date +%s) - T0 )) s"; }
trap cleanup EXIT; trap 'exit 143' TERM INT
node "$HERE/../hoops-gap/serve.mjs" "$SITE" "$PORT" > /dev/null 2>&1 & SRV=$!
sleep 1
cd "$APP"
for c in "$@"; do echo "== $c"; bash -c "$c"; done
