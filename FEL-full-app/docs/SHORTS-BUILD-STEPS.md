# Shorts build steps: the one-piece short, for the owner's Mac (Blender + MPFB)

This is job 1, "the crotch stretch", approved by the owner on 2026-11-12. The kit short is three pieces: a waistband plus two leg
tubes, and each tube reaches about 6 cm past the middle into the other leg. Every stride pulls one leg's cloth across the crotch.
Fitting each tube to its own thigh in code cut the torn edges by about 80 %, but it opened the gap between the legs. More skin then
showed on screen, so that fit ships off (`docs/KIT-FIT-PLAN.md` §9.4).

The fix is the garment itself: **one piece of cloth with a real crotch**. This page is the whole job, start to finish. It takes
about an hour per sex.

You need the same set-up as `docs/JERSEY-BUILD-STEPS.md`:
- Blender 5.1;
- the MPFB2 extension and its asset packs;
- this repository checked out.

## 1. Make the body with today's short on it

In Terminal, from the repository's `FEL-full-app` folder:

```bash
blender -b --python scripts/avatar/mpfb/dress-kit.py -- --sex male --out /tmp/kit-male-src.glb
```

1. Open Blender with the UI (`blender`).
2. **File → Import → glTF** `/tmp/kit-male-src.glb`.
3. Select the object `Kit_shorts_shorts_court`. This is MakeHuman's `cortu_jeans_shorts` (CC0), the short the game wears today.
4. Delete every other `Kit_*` garment, so only the body and this short are left.
5. Save as `~/shorts/court-male.blend`.

## 2. Make it one piece

Work in **Edit Mode** on the short, in the front view (**numpad 1**) with **X-ray on** (**Alt-Z**):

1. **Cut the overlap.**
   1. The body's left leg is on the **+X** side. Box-select every vertex of the left leg tube that has crossed the middle line
      (x < 0), and delete it (**X → Vertices**). The 3D cursor at the origin marks the middle.
   2. Do the same for the right tube's vertices that crossed to x > 0.
   3. Each tube now stops at the middle line.
2. **Join the legs.**
   1. Select the two inner open edges (**Alt-click** each loop; hold **Shift** for the second).
   2. Run **Edge → Bridge Edge Loops** with **Number of Cuts 2** and **Smoothness 0.5**. This is the crotch gusset. It must hang
      **2–3 cm below** the body's crotch, never touching it: the game tucks nothing here.
3. **Join the band.**
   1. Select all and run **Mesh → Clean Up → Merge by Distance** (0.5 mm), so the waistband and both legs share their seam
      vertices.
   2. Check **Select → Select All by Trait → Non Manifold**. Only the waist opening and the two leg openings should light up.
      Any other hole needs **F** (fill) on its edges.
4. **Smooth.** Select all, then run **Smooth Vertices** (factor 0.3, 3 repeats). Leave the waist and leg opening loops out of the
   selection: their height is the fit the game measures.
5. **UVs.** Select all, **U → Smart UV Project** (angle 66°, island margin 0.02). The kit's fabric weave tiles on these. A short
   with no UVs gets cut into one piece a triangle at runtime, which opens hairline cracks.

Save. Then do the same for the female body (`--sex female`, `~/shorts/court-female.blend`).

## 3. Export the way the game expects

Use the repository's exporter, as for the jerseys:

```bash
blender -b --python scripts/avatar/mpfb/fit-outfit.py -- \
  --sex male --slot shorts --item shorts_court --mesh ~/shorts/court-male.blend --object Kit_shorts_shorts_court \
  --no-align --tris 2500 --out ~/shorts/shorts_court-male.glb
```

Read its `FELFIT` lines. It does, and checks:
- **22 bones, unprefixed**, with the kit body's own armature and bind pose (GATE 0: the rig must not move).
- **Skin weights from the body** (nearest face, blended), at most 4 per vertex. The gusset takes both thighs' weights evenly,
  which is what stops the stretch.
- **One mesh named `Kit_shorts_shorts_court`**, with its material named `shorts.shorts_court` (the Closet's colour lands on `shorts`).
- **Shorts ease 0.012 m** (the default) out of the skin. Do not pass `--ease` unless something sinks.
- **Textures capped** at 1024 × 1024, and the mesh **decimated to 2,500 triangles** (the shorts budget).

`fit-outfit.py` has not been run on a Mac yet (its header says so). If a step fails, send back the FELFIT lines with the
`.blend`, and we fix the script, not the short.

## 4. Look at it before handing it back

In Blender, put the body in a stride. In the **Pose Mode** timeline, the run clip at its widest step is a good test. Check that:
- the gusset follows both legs;
- no thigh comes through the front or back;
- the waistband stays on the hips.

## 5. Hand the files back

Put `shorts_court-male.glb` and `shorts_court-female.glb` in a folder. Then either drag them into the chat, or commit them to a
branch named `art/shorts`.

We then:
1. Graft each one into the kit bodies in place of today's three-piece short. This is GLB surgery with
   `scripts/avatar/kit-fit/glb.ts`; the bones are untouched, and `scripts/kit-fit-tests.ts` pins them.
2. Do the same for the phone files.
3. Measure the torn edges (`scripts/kit-glitch-tests.ts`).
4. Run the browser rig before and after (`scripts/probes/kit-fit/run.sh`). The skin under the short and the flicker must each be
   at or below today's on every body.
5. Do the rivals' baggy shorts the same way afterwards. They share the three-piece cut.

Nothing is merged until those numbers are green.
