#!/bin/bash
# KIT-TIGHT: one round of the repeated-runs bar (KIT-FIT-PLAN §10.1a) for kit.fitTightness, one tier, inside a gate hold:
#   /home/user/wt/gate-run.sh 2700 bash scripts/probes/kit-tight/run.sh <out> <round> <tier> <value>
# before = the knob at 0 (today), after = the knob at <value>; rival-halo (no kit tee or short) is the unchanged control.
# Judge after 3 rounds: node scripts/probes/kit-tight/bar.cjs <out> t0 t<value> rival-halo
set -u
OUT=$1; R=$2; T=$3; V=$4
cd "$(dirname "$0")/../../.."
if [ "$T" = mobile ]; then S=closet-male-default,closet-female-default,closet-male-girth-max,closet-female-girth-max,game-male-default,game-female-default,game-male-girth-max,pack-football-player,rival-halo
else S=closet-male-default,closet-female-default,closet-male-girth-max,closet-female-girth-max,pack-football-player,rival-halo; fi
for side in "t0:0" "t$V:$V"; do n=${side%%:*}; k=${side##*:}
  env OUT="$OUT" NAME="$n-$T-$R" KNOBS="{\"kit.fitTightness\":$k}" TIERS="$T" SUBJECTS="$S" npx tsx scripts/probes/kit-glitch/rig.mts matrix 2>&1 | grep -cE " s$"
done
echo "=== $R $T done $(date +%T)"
