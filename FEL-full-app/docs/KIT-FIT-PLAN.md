# Kit fit — how the clothes fit and how they look (lane/kit-fit, 2026-11-12)

The owner, 2026-11-12: **"We need to fix how the clothes fit, how they look. Do research and make the best decision."** Earlier the
same day: "The clothes look glitched out sometimes" — in the Closet / Studio, in games, on rivals and other players: skin poking
through, flicker or stripes, stretched or torn, wrong or missing. The three clothing art jobs the kit-glitch lane (#581) left
open were approved the same day.

## 0. The decision, in one paragraph

**Fit each garment to the body once, offline, the way sports and character games do, and let the game only show it, hide the
skin under it and move it with the skin.** Concretely: a garment's own shape is fitted to the body it is worn on (it may not
cross into another limb or sink under the skin), it takes the skin weights of the body under it (so cloth and skin move as
one), it has real UVs and a fabric surface (no cracks, no flat plastic), and it follows the body's shape morphs through the
skin under it (so the layers keep their gaps on any build). The game's existing per-spawn safety nets (the body mask, the edge
flare, the waistband fit, the lift) stay, and later phases move them into the asset too. Phase 1 is built in this lane: it fixes
all three approved art jobs and gives the player's kit real UVs, with every rig byte-identical.

## 1. What the best games do (plain words)

| Problem | What AAA games do | Examples |
|---|---|---|
| Skin pokes through clothes | **Hide the body under the garment** (body masking): the triangles a garment covers are not drawn at all, so they cannot poke through. Each garment carries its own "hide these body parts" mask. | MetaHuman outfits ship a body-hiding mask; Blender tools build one automatically from body + garment ([Niset Auto Mask](https://superhivemarket.com/products/metahuman-advanced-alpha-mask-creator)); UE forum advice: masking hides poke-through, but an edge weighted unlike the skin under it still pokes ([UE forum](https://forums.unrealengine.com/t/fitting-armour-clothing-to-metahumans-in-ue-5-8-3-best-workflow-to-avoid-hours-of-manual-fitting-per-set/2839852)). |
| Cloth and skin move differently in a stride, a kick, a reach | **Copy the skin's weights onto the garment** ("weight transfer", nearest surface point, blended), normalise, keep 4 influences — and keep each leg's / arm's cloth on its own limb. | Blender Data Transfer "nearest face interpolated" (the [Cyberpunk modding pipeline](https://wiki.redmodding.org/cyberpunk-2077-modding/for-mod-creators-theory/3d-modelling/weight-painting-for-gonks)); "limb bleeding between legs" is the known failure ([WeightForge](https://superhivemarket.com/products/weight-forge-pro-voxel-skinning-clothing-weight-transfer/docs)); manual weighting is the industry's bottleneck ([GDC 2025, MetaTailor](https://schedule.gdconf.com/session/ending-the-skin-weighting-bottleneck-with-metatailor-v25-presented-by-metatailor/918130)). |
| One garment, many bodies | **Fit the garment to each body shape**: either an outfit is warped from the body it was made on to the target body, or a few sizes are made, or the garment carries morphs matching the body's. | Epic's MetaHuman Outfit Assets resize from a source body to a target ([Epic docs](https://dev.epicgames.com/documentation/metahuman/getting-started-for-creating-parametric-clothing-in-metahuman)); NBA 2K built several jersey and short sizes per body model so cloth does not pass through the legs ([LJWorld 2005](https://www2.ljworld.com/news/2005/oct/06/video_game_fabric_simulation_scores_realism/), [2K18](https://2kgam.es/2x2hS5u)); Reallusion "conform" and paired body/clothing shape keys ([Reallusion](https://manual.reallusion.com/Character-Creator-4/Content/ENU/4.0/08_Cloth/Conforming_Clothing.htm), [UE forum](https://forums.unrealengine.com/t/character-creation-body-customization-shape-keys-and-clothes-adjustment-how-to-best-practices/155194)). |
| Shirt and shorts fight at the waist | **A fixed layer order with a gap per layer**: the inner layer is always pulled in under the outer one where they overlap. | Every outfit system; the same rule as our Creator clothes' `LAYER_GAP`. |
| Loose parts (a jersey's hem, a short's legs) | **Cloth simulation** on consoles (2K has simulated shorts and jerseys since 2005, colliding with the legs); on phones, **baked secondary motion** (a few extra bones or a cheap vertex sway), never a full simulation. | NBA 2K ([LJWorld](https://www2.ljworld.com/news/2005/oct/06/video_game_fabric_simulation_scores_realism/)); MetaHuman outfits drive a detailed mesh from a light simulation mesh. |
| Clothes look like plastic | **Real UVs and fabric materials**: a tiling knit or mesh normal map, baked folds, a cloth sheen; numbers and names on a second UV set so every player can wear their own. | Every sports game; our own `docs/BRIEF-WARDROBE.md` recommends the second UV set. |
| Cost on phones | **Levels of detail**: a lighter garment for far bodies and phones. | Standard. |

## 2. Our pipeline, audited end to end

| Piece | Where | State before this lane |
|---|---|---|
| Garment authoring | `scripts/avatar/mpfb/dress.py`, `dress-kit.py`, `fit-outfit.py`, `rival.py`, `style.py` (Blender + MPFB2) | MakeHuman CC0 garments fitted by MPFB to the base mesh, then **decimated** (60 %) and rebaked 2026-10-20. **They need the owner's Mac**: the MPFB2 extension and its asset packs (`/Users/elijahbonds/Library/Application Support/Blender/5.1/extensions/.user/user_default/mpfb/data`) are not on this machine, and `bpy` from PyPI has no MPFB2. So this lane rebakes the **exported** GLBs instead (§4); nothing needs MPFB. |
| Kit packs | `scripts/meshy/fit-garment.py` → `public/models/kits/*.glb` | The football jersey is a Meshy cut-out scaled by its bounding box to one body (no shrink-wrap), 18,710 triangles. |
| The forge contract | `scripts/avatar/rivals.mts`, `rivalWear.mts` | Rivals carry one top, one bottom, two shoes; tops and bottoms are MakeHuman garments cut in Blender. |
| Runtime kit | `lib/babylon/core/kit.ts` | Shows one garment per slot, attaches packs, schedules the mask. |
| Runtime fixes | `garmentFixes.ts` (UV atlas for UV-less garments, the lift, the shoe fold), `bodyMask.ts` (skin hidden under garments, edge flare, the waistband fit), `fabric.ts` / `skinShading.ts` (weave) | All per spawn, on the CPU, paced one fit a frame. |
| Creator shape | `lib/babylon/creator/shape/renderShape.ts` + `inflate.ts` | Girth bulks every mesh through **its own** skin weights. |
| Creator clothes | `lib/babylon/creator/clothes/**` | Already the AAA answer for tight clothes: cut from the body's own surface, the body's own weights and UVs, a gap per layer, the skin under them hidden. |
| Probes | `scripts/probes/kit-glitch/**`, `scripts/kit-glitch-tests.ts` | Headless (tears, floats, skin through cloth) and browser (pixels) rigs; extended here (§7). |

## 3. What was wrong — measured

Every number is from the shipped files through the real kit and mask code. The headless probe (`scripts/probes/kit-glitch/cpu.ts`,
10 poses: idle, run ×2, jump shot, landing crouch, defensive lunge, high kick, tomahawk, celebration, karate jump) counts **torn
edges** (a garment edge stretched past ×2 and past ×1.5 of the skin under it), the **farthest garment vertex off the skin** and
**skin vertices through cloth**. Each probe was checked against a control first: my GLB reader was checked against Babylon's
loader on the same vertices (it caught that the browser-side probe prints x mirrored — the glTF loader flips handedness).

### 3.1 The findings

1. **The short is three pieces whose legs cross into each other** (approved job 1, "the crotch stretch"). The 9-inch kit short
   (and every rival's baggy short, cargo pant and jean short) is a pelvis band plus two leg tubes, and each tube reaches about
   **6 cm past the midline into the other leg** (left tube x −0.06…0.20 m, right −0.19…0.07; the body's crotch at 0.648 m). Its
   weights followed: vertices on the left thigh carried **26–100 % of the right thigh's bone**. Every stride, lunge and kick pulled
   one leg's cloth across the crotch. This is why kit-glitch's skin transfer "made the crotch worse": the transfer was right,
   the geometry under it was not.
2. **The player's tee, short and sock had no UVs** (since the 2026-10-20 rebake). The runtime cut them into one cell per triangle
   for Creator paint, which unwelds the mesh — the per-vertex fixes then open hairline cracks (the dark slits in kit-glitch's
   garments-alone shots) — and the fabric weave striped, so kit-glitch switched it off: the kit is flat colour, "plastic".
3. **The football jersey sinks into the body** (approved job 2). On the player's own body 36 % (male) and 26 % (female) of its
   outer surface sat under the skin at rest, down to 89 mm deep; its lower band sat under the short's waistband, so the short
   showed through its lower front. It is also a Meshy cut-out: its texture atlas carries footballs and skin fragments, some
   lettering reads mirrored ("24", "WARRIORS"), it has a full-strength emissive map, and it is 18,710 triangles on every
   football player.
4. **Garments bulked by their own weights** (approved job 3). On a Creator build the girth morph swells each garment through
   its own skin weights: the tee's hem rides the spine, the short's waistband the hips, so on the girth-max body the waistband
   outgrew the hem and showed through it with the arms up.
5. **Wrong piece**: the "Bonds Signature Jersey" (`top_bonds`) has been the same compression tee as the Lab tee (`top_lab`) since
   2026-10-20 — same mesh, same 408 vertices. There is no basketball jersey cut (HOOPS-AAA-GAP-SHOW §3.3).
6. **The rivals' tees tear even standing** (6–10 torn edges at idle on ace and grit): their own weights, not fixed here (§5).

### 3.2 Before → after, headless (10 poses each)

| Body | Torn edges, all garments | of which the short's | Farthest garment vertex off the skin | Skin vertices through cloth, under the short |
|---|---|---|---|---|
| Kit male | 98 → **18** | 92 → **12** | 0.124 → **0.084** m | 298 → **248** |
| Kit female | 136 → **27** | 136 → **27** | 0.146 → **0.086** m | 313 → **254** |
| Rival grit | 102 → **62** | 72 → **32** | 0.128 → **0.090** m | 342 → **277** |
| Rival yara | 107 → **65** | 107 → **65** | 0.126 → **0.086** m | 244 → **181** |
| Rival ace | 114 → **70** | 64 → **20** | 0.126 → **0.087** m | 323 → 351 (+9 %: not better) |

What is left on ace and grit is mostly their tee (finding 6: 50 and 30 torn edges, unchanged); on yara it is her baggy short in the high kick (21 edges, down from 28). The football jersey, at rest on the kit bodies (outer wall under the
skin): male **36 % → at most 6 %** in any height band, female **26 % → at most 5 %** (`scripts/avatar/kit-fit/_pack.ts`).

### 3.3 Before → after, on screen

KIT-FIT-BROWSER-NUMBERS

## 4. What phase 1 changed (built in this lane)

All asset changes are made by `scripts/avatar/kit-fit/bake.ts` and `pack.ts` with **GLB surgery**: the original JSON objects
and bytes are kept, new data is appended, and only the garment primitives are re-pointed. The bake refuses to write if the rig
fingerprint (every node, skin, inverse bind and animation) or any other primitive, material or texture changed; the kit file's
original 54 data blocks are still byte-for-byte the pass-3 kit's (pinned in `meshyProps.draco.test.ts`). **No Blender was
needed**: a Blender round trip rewrites the whole file and the rig would have to be re-proven; `bpy` was not installed.

1. **Real UVs** on the kit's tee, short and low sock (male, female, and their phone files): a chart per body part (torso,
   sleeves; pelvis, legs; each sock), unrolled round its own axis with the seams at the back, under the arm and inside the leg,
   relaxed to true lengths, packed at 1.0 m a UV unit (the rivals' textured garments measure 0.9–1.1). Shared texels 0–11 %,
   stretch p95 ×1.24. Result: no runtime unweld (no cracks), and the fabric weave is back on the player's kit.
2. **The short's legs fitted to their own thigh** (job 1): each leg tube's vertices past the midline or under its own thigh's
   skin go to that skin plus 4 mm (the runtime still lifts 20 mm), the move eased into the tube; then each vertex takes the skin
   weights under it **from its own leg only**. On the two kit bodies and all 24 rivals.
3. **The football jersey refitted** (job 2): its outer wall pushed out of both kit bodies (4 mm above the waist, 22 mm in the
   waist band, over the runtime's 13 mm lift), the push spread to the inner wall so the shell keeps its thickness, the larger of
   the two bodies' pushes kept (one file fits both; a little looser on the female's shoulders).
4. **Garments follow the body's shape** (job 3): `kit.garmentFollowBody` (feel knob, group "Kit · fit"; 1 on, 0 = as before) — a
   worn top or short takes the bulk of the skin under it (`inflate.followMap` / `followDelta`, 4 nearest skin points within
   8 cm), so the layers keep their gaps on any build. Runtime, small, in the Creator's shape code only.

**Cost.** Download: +79–80 KB a kit file (2–3 %), +22 KB a rival (3 %), +173 KB the football jersey (14 %: its positions are
32-bit floats, as the original's). The new data is stored in the files' own compact types (byte normals, weights and joints,
16-bit indices); the replaced garment data stays in the file unreferenced (a few KB a garment), so the original bytes are
provably untouched. No new mesh, material, texture or draw.

## 5. The phases

| Phase | What | Exit gate (measured) |
|---|---|---|
| **1 — Fit the kit (built)** | §4: UVs, the short's legs, the jersey, follow-the-body | `scripts/kit-fit-tests.ts` green (GATE 0 fingerprints of all 29 rebaked files, UVs, leg tubes, jersey); torn edges on the kit bodies ≤ 30 % of before (82 % / 80 % fewer); farthest vertex ≤ 0.10 m; the browser before/after (§3.3) |
| **2 — Bake the fit into every garment** | The rivals' tees (finding 6) through the same transfer; the body-hide mask, the lift and the edge flare baked into each garment file (the runtime keeps them as a fallback), so a spawn does no fitting on the CPU; the female tee's bust fold in its UVs (11 % shared texels) | Rival torn edges ≤ 20 a body over the 10 poses; mask and lift time per spawn → 0 ms on a baked garment (today paced over frames); skin through cloth ≤ 1 % of garment pixels on the browser rig |
| **3 — The right garments** | A real basketball jersey (wide armholes, hem over the short) for the court modes and as `top_bonds`, cut from the CC0 MakeHuman tee in Blender like the rivals' sleeveless jersey (`style.py cut_sleeves`), with a second UV set for the player's own number; a clean football jersey re-model (symmetric, no mirrored print, no emissive, ≤ 4k triangles) | A 1v1 / 3v3 frame reads "basketball kit" (owner's eye); numbers per player; the football jersey under 4k triangles |
| **4 — Cloth that moves** | A cheap sway on the short's hem and the jersey's tail in the vertex shader, driven by the body's speed (no new bones) | No new joint; ≤ 0.2 ms a frame on the phone profile; never through the legs (the browser rig's poke at the hem) |
| **5 — Phones** | A lighter garment level of detail for far bodies (the crowd, the 3v3 far side) | 3v3 and 3-Point back inside their phone rows (HOOPS-AAA-GAP-SHOW §3.9) |

## 6. Owner questions (multiple choice, recommendation first)

1. **Cloth that moves (phase 4).** (a) **A vertex sway in the shader, no rig change** — recommended: it keeps the owner's 22-bone
   spec, costs almost nothing on a phone, and covers a short's hem and a jersey's tail; (b) add 2–4 cloth bones to the rig — real
   secondary motion, but it changes the 22-bone spec every clip and test is built on (GATE 0); (c) no cloth motion.
2. **Who makes the basketball jersey and the new football jersey (phase 3).** (a) **In-house, free**: cut from the CC0 MakeHuman
   garments in Blender on the owner's Mac (the MPFB scripts are ready; this machine has no MPFB) — recommended; (b) buy or
   commission a sports-kit pack (money).

Everything else in this plan is reversible and is being done on the standing rule (take the recommended option, flag it).

## 7. How to re-run

```bash
# rebake (from the ORIGINAL files: the bake re-points primitives, so run it on a file that has not been baked)
npx tsx scripts/avatar/kit-fit/bake.ts <in.glb> <out.glb>            # kit / rival: UVs + the short's legs
npx tsx scripts/avatar/kit-fit/pack.ts <pack.glb> <out.glb> <body.glb>…   # the jersey against each kit body
# guards
npx tsx scripts/kit-fit-tests.ts          # GATE 0 + UVs + legs + jersey (in ci-suite)
npx tsx scripts/kit-glitch-tests.ts       # posed tears and floats (in ci-suite)
# headless probe, a candidate file, some poses
CLIPS=run@0.25,high_kick@0.5 npx tsx scripts/probes/kit-glitch/cpu.ts file:<candidate.glb>
npx tsx scripts/probes/kit-fit/tears.ts male high_kick@0.5          # where a garment tears, with its weights
# browser before/after in one gate hold (old files from an overlay folder, the new knob off for "before")
BEFORE_OVERLAY=<dir with models/…> /home/user/wt/gate-run.sh 2400 bash scripts/probes/kit-fit/run.sh <out> -
```

## 8. Not done, and why

- **The MPFB source garments** are unchanged (they live on the owner's Mac); a future `dress-kit.py` export would undo this rebake
  — run `bake.ts` on its output (the bake is deterministic and idempotent on an unbaked file).
- **Body masking is not changed**: it already exists (`bodyMask.ts`) and its baking is phase 2.
- **The mirrored football print and the emissive map** need the re-model (phase 3); the refit only fixes the fit.
- **The crowd** (`crowd/*.glb`) has its clothes baked into the body (no garments): nothing to fit; its variety is HOOPS-AAA-GAP-SHOW §3.3.
