#!/bin/bash
# build-sets.sh — the owner's two Blender jobs end to end, for both kit bodies (lane/kit-mac-jobs, 2026-11-18):
#   job 1 (docs/SHORTS-BUILD-STEPS.md) onepiece-shorts.py → fit-outfit.py --slot shorts → graft.ts (replace shorts_court, shorts_glitch)
#   job 2 (docs/JERSEY-BUILD-STEPS.md) jersey.py basketball + football → fit-outfit.py --slot tops → graft.ts (add)
# into public/models/kits/sets/fel-kit-<sex>.{shorts1p,jerseys}.glb, which lib/babylon/core/kitGarmentSet.ts loads behind the
# knobs kit.onePieceShorts and kit.newJerseys.
#
#   BLENDER_PY=<python with bpy, or "blender -b --python"> WORK=<scratch dir> bash scripts/avatar/kit-fit/build-sets.sh [male female]
# With the bpy module: BLENDER_PY="<venv>/bin/python -I" and BLENDER_USER_RESOURCES pointing at a Blender user folder whose
# extensions/user_default/mpfb holds MPFB 2 (extensions.blender.org) and whose MPFB user data holds the MakeHuman asset packs
# pants01 and shirts01 (CC0). With a Blender install: BLENDER_PY="blender -b --python" (MPFB enabled as an extension).
set -euo pipefail
cd "$(dirname "$0")/../../.."
PY=${BLENDER_PY:?set BLENDER_PY}
WORK=${WORK:?set WORK}
OUTDIR=${OUTDIR:-public/models/kits/sets}
mkdir -p "$WORK" "$OUTDIR"
M=scripts/avatar/mpfb
run() { $PY "$@" 2>&1 | grep -E '^(ONEPIECE|JERSEY|FELFIT)|Error|Traceback' | grep -v ' next:' || true; }
for SEX in "${@:-male female}"; do
  for S in $SEX; do
    KIT=public/models/candidates/fel-kit-$S.glb
    echo "== $S: job 1, the one-piece short"
    run $M/onepiece-shorts.py -- --sex $S --out "$WORK/court-$S.blend"
    run $M/fit-outfit.py -- --sex $S --slot shorts --item shorts_court --mesh "$WORK/court-$S.blend" --object Kit_shorts_shorts_court \
      --no-align --tris 2500 --out "$WORK/shorts_court-$S.glb"
    npx tsx scripts/avatar/kit-fit/graft.ts --kit $KIT --out "$OUTDIR/fel-kit-$S.shorts1p.glb" \
      "$WORK/shorts_court-$S.glb=Kit_shorts_shorts_court=Kit_shorts_shorts_court=replace=shorts_court,shorts_glitch"
    echo "== $S: job 2, the jerseys"
    for KIND in basketball football; do
      run $M/jersey.py -- --sex $S --kind $KIND --out "$WORK/$KIND-$S.blend"
      TRIS=$([ $KIND = basketball ] && echo 3000 || echo 4000)
      run $M/fit-outfit.py -- --sex $S --slot tops --item top_$KIND --mesh "$WORK/$KIND-$S.blend" --object Kit_tops_top_$KIND \
        --no-align --tris $TRIS --out "$WORK/top_$KIND-$S.glb"
    done
    npx tsx scripts/avatar/kit-fit/graft.ts --kit $KIT --out "$OUTDIR/fel-kit-$S.jerseys.glb" \
      "$WORK/top_basketball-$S.glb=Kit_tops_top_lab=Kit_tops_top_basketball=add" \
      "$WORK/top_football-$S.glb=Kit_tops_top_lab=Kit_tops_top_football=add"
  done
done
ls -la "$OUTDIR"
