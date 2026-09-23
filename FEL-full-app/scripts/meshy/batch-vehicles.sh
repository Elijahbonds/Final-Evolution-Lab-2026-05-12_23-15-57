#!/bin/bash
# batch-vehicles — the models pass phase 5: bake the Meshy plane / kart bodies (1.2-1.5 M triangles, 35-61 MB each) into
# game-ready GLBs with bake-prop.py. Two groups by MESH-SPACE shape (the Meshy root carries a −90° X rotation, so mesh z
# is world x): mesh x-long bodies (1.9 x 0.82 x 1.34) are the KARTS, mesh z-long bodies (1.5 x 0.9 x 1.9) the PLANES (a
# cartoon plane with a pilot sculpted in the cockpit — the viewer frames showed both). In WORLD space both are long along
# x with the nose toward −x. Karts: 1.95 m long (the floor pan), pivot bottom. Planes: 3.6 m long (the toy plane's
# fuselage is 2.6 m; the sculpt is stubby — wingspan ≈ 0.8 of its length), pivot centre — it flies.
#   scripts/meshy/batch-vehicles.sh <raw-dir> <out-dir>   (raw: v-<id8>.glb copies of Meshy_AI_model.glb)
set -u
RAW=${1:?raw dir}; OUT=${2:?out dir}; B=/Applications/Blender.app/Contents/MacOS/Blender
mkdir -p "$OUT"
for f in "$RAW"/v-*.glb; do
  n=$(basename "$f" .glb)
  # the long axis decides the group: x-long = plane, z-long = kart (measured off the drop's bounds)
  kind=$(/opt/homebrew/bin/python3.12 - "$f" <<'PY'
import json, struct, sys
p=sys.argv[1]
with open(p,'rb') as fh:
    fh.read(12); clen, ctype = struct.unpack('<II', fh.read(8)); j=json.loads(fh.read(clen))
mn=[1e9]*3; mx=[-1e9]*3
for m in j['meshes']:
    for pr in m['primitives']:
        a=j['accessors'][pr['attributes']['POSITION']]; mn=[min(x,y) for x,y in zip(mn,a['min'])]; mx=[max(x,y) for x,y in zip(mx,a['max'])]
sz=[b-a for a,b in zip(mn,mx)]; print('kart' if sz[0] > sz[2] else 'plane')
PY
)
  if [ "$kind" = plane ]; then args="x 3.6 center 0.03 2048"; else args="x 1.95 bottom 0.02 2048"; fi
  echo "== $n ($kind: $args)"
  $B -b --python scripts/meshy/bake-prop.py -- "$f" "$OUT/$n.$kind.glb" $args 2>&1 | grep "FELBAKE\|Error\|Traceback" | cut -c1-200
done
echo "VEHICLES-DONE $(ls "$OUT"/v-*.glb | wc -l) files"
