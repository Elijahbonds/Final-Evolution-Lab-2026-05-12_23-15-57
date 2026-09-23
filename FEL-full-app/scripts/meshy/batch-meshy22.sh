#!/bin/bash
# batch-meshy22 — the models pass (2026-09-22) phase 3: every rigged Meshy character in a drop onto the FEL 22-joint rig,
# packed to the two tier budgets, plus a manifest. Route B of the route test (docs/PLAN-MODELS-10PHASE.md): the shipped
# Meshy rig is A-pose bound with Spine01/Spine02/neck spellings and Gate 0 rejects it; skin-transfer.py rebinds the mesh
# onto the T-posed donor by proximity, and every FEL clip plays unchanged.
#
#   scripts/meshy/batch-meshy22.sh <drop-dir> <out-dir> [height_m=1.78]
#   e.g. scripts/meshy/batch-meshy22.sh ~/Downloads/Meshy_models_20260922_120651 public/models/candidates/meshy22
#
# Writes <out-dir>/m22-<id8>.glb (desktop: full mesh, 2K) and <out-dir>/m22-<id8>.mobile.glb (0.6 decimate, 1K), and
# <out-dir>/manifest.json (source folder → files → bytes). Names are the source UUID's first 8 characters until the owner
# casts them (the contact sheet); the cast renames them into public/models/athletes/.
set -u
DROP=${1:?drop dir}; OUT=${2:?out dir}; H=${3:-1.78}
B=/Applications/Blender.app/Contents/MacOS/Blender
DONOR=public/models/elijah-meshy.glb
mkdir -p "$OUT" "$OUT/.tmp"
echo '[' > "$OUT/manifest.json"; first=1
for d in "$DROP"/*/; do
  id=$(basename "$d"); id8=${id:0:8}; src="$d/Meshy_AI_Character_output.glb"
  [ -f "$src" ] || { echo "skip $id8 (no Character_output.glb)"; continue; }
  raw="$OUT/.tmp/$id8.raw.glb"
  echo "== $id8"
  $B -b --python scripts/meshy/skin-transfer.py -- "$src" "$DONOR" "$raw" "$H" 2048 2>&1 | grep "^WROTE\|^ARMS\|Error\|Traceback" | cut -c1-160
  $B -b --python scripts/meshy/decimate-pack.py -- "$raw" "$OUT/m22-$id8.glb" 1.0 2048 2>&1 | grep "FELDEC wrote\|Error\|Traceback" | cut -c1-160
  $B -b --python scripts/meshy/decimate-pack.py -- "$raw" "$OUT/m22-$id8.mobile.glb" 0.6 1024 2>&1 | grep "FELDEC wrote\|Error\|Traceback" | cut -c1-160
  b1=$(stat -f%z "$OUT/m22-$id8.glb" 2>/dev/null || echo 0); b2=$(stat -f%z "$OUT/m22-$id8.mobile.glb" 2>/dev/null || echo 0)
  [ $first = 1 ] || echo ',' >> "$OUT/manifest.json"; first=0
  printf '  {"id": "%s", "source": "%s", "desktop": "m22-%s.glb", "desktopBytes": %s, "mobile": "m22-%s.mobile.glb", "mobileBytes": %s}' "$id8" "$id" "$id8" "$b1" "$id8" "$b2" >> "$OUT/manifest.json"
done
echo ']' >> "$OUT/manifest.json"
rm -rf "$OUT/.tmp"
echo "BATCH-DONE $(ls "$OUT"/m22-*.glb | wc -l) files"
