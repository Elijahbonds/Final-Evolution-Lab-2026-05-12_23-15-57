#!/bin/bash
# KIT-TIGHT phase 2: one round of the 10.1a bar, one tier, several sides (each a knob set), rival-halo the unchanged control:
#   /home/user/wt/gate-run.sh 3000 bash scripts/probes/kit-tight/run2.sh <out> <round> <tier> 'name={"knob":v,…};name2={…}' [subjects]
# Judge: node scripts/probes/kit-tight/bar.cjs <out> <name-a> <name-b> rival-halo
set -u
OUT=$1; R=$2; T=$3; SIDES=$4
SUBJ=${5:-closet-male-default,closet-female-default,game-male-default,game-female-default,pack-football-female,rival-halo}
cd "$(dirname "$0")/../../.."
IFS=';' read -ra SS <<< "$SIDES"
for side in "${SS[@]}"; do n=${side%%=*}; k=${side#*=}
  ls "$OUT/$n-$T-$R.json" >/dev/null 2>&1 && continue
  env OUT="$OUT" NAME="$n-$T-$R" KNOBS="$k" TIERS="$T" SUBJECTS="$SUBJ" npx tsx scripts/probes/kit-glitch/rig.mts matrix 2>&1 | grep -cE " s$"
done
rm -rf "$OUT/site"
echo "=== $R $T done $(date +%T)"
