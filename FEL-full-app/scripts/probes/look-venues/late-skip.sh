#!/bin/bash
# LOOK-VENUES: run a command only if it got the gate lock before a deadline (epoch seconds), else release at once (exit 3).
# A background job's time limit counts its wait in the gate queue; a job that got the lock too late would be killed mid-run.
#   /home/user/wt/gate-run.sh 1790 scripts/probes/look-venues/late-skip.sh <deadline-epoch> <command...>
d=$1; shift
if [ "$(date +%s)" -gt "$d" ]; then echo "== got the lock after the deadline: skipped, re-queue $(date +%T)"; exit 3; fi
exec "$@"
