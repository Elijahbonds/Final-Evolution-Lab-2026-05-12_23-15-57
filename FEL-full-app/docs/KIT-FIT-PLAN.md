# Kit fit — how the clothes fit and how they look (lane/kit-fit, 2026-11-12)

The owner, 2026-11-12: **"We need to fix how the clothes fit, how they look. Do research and make the best decision."** Earlier the
same day: "The clothes look glitched out sometimes" — in the Closet / Studio, in games, on rivals and other players: skin poking
through, flicker or stripes, stretched or torn, wrong or missing. The three clothing art jobs the kit-glitch lane (#581) left
open were approved the same day.

> **Status, 2026-11-17 (read §10 first).** The split PR `lane/kit-fit-a` ships the measuring tools, the build steps and this plan,
> and **no change to any garment or to the runtime**. Measured piece by piece on the steady browser rig, each runtime and asset
> piece of §4 and §9 was worse than phase 0 on at least one body: job 3 (more skin under the short in games), the football
> jersey refit (more flicker), the rivals' tee smoothing (more skin through the tee). They stay on `lane/kit-fit`. §0 and §9 below
> describe the lane as built; §10 is what the screen said about each piece.

## 0. The decision, in one paragraph

**Fit each garment to the body once, offline, the way sports and character games do, and let the game only show it, hide the
skin under it and move it with the skin.** Concretely: a garment's own shape is fitted to the body it is worn on (it may not
cross into another limb or sink under the skin), it takes the skin weights of the body under it (so cloth and skin move as
one), it has real UVs and a fabric surface (no cracks, no flat plastic), and it follows the body's shape morphs through the
skin under it (so the layers keep their gaps on any build). The game's existing per-spawn safety nets (the body mask, the edge
flare, the waistband fit, the lift) stay, and later phases move them into the asset too. Phase 1 is built in this lane, with every rig
byte-identical: the short's legs (job 1) and the football jersey (job 2) are refitted, and the player's kit has real UVs.
Phase 2 (§9) found and fixed job 3 (the Creator's shape was undoing the clothes' fit on every build), fitted the rivals' tees,
and measured the short's leg fit on a steady rig: it cut torn edges ~80 % but let more skin through on screen on 11 of 14 bodies,
so it **ships off** and the shorts keep phase 0's shape and weights (with their UVs). Job 1 (the crotch) needs a one-piece short:
the in-house art job (§9.4). Status against phase 0, every measured body: §9.6.

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

The browser rig (`scripts/probes/kit-fit/run.sh`: the real spawn, kit, mask and identity code in headless Chromium; the old files
served from an overlay and the new knob off for "before", one build, one gate hold), desktop, 10 subjects, 402 shots (every pose ×
5 cameras for the player's bodies, 3 for rivals). **Skin through cloth** = pixels of skin within 4 cm of a garment drawn inside
its silhouette; **flicker** = pixels whose class flips under a 0.4 mm camera nudge.

| Group | Skin through cloth, px (% of garment) | Flicker, px |
|---|---|---|
| Closet (5 bodies incl. girth max / min) | 63,077 (1.07 %) → 90,807 (1.62 %) — **worse**, see below | 629 → 1,634 |
| In a game (dunk scene, ink + light rig) | 24,115 (1.05 %) → 29,355 (1.27 %) — worse | 5,124 → 4,211 |
| Rivals (grit, yara) | 6,910 (1.41 %) → 5,944 (1.22 %) | 769 → **296** |
| Football jersey (male, female) | 66,472 (3.74 %) → 60,053 (3.37 %) | 19,687 → **10,930** |
| **All** | 160,574 (1.54 %) → 186,159 (1.83 %) | 26,209 → **17,071** |

Per subject, the worse rows have two causes, and the contact sheet shows both:
- **The "follow the body" switch (job 3) made the girth-max bodies worse**: male 18,730 → 26,692 px, female 13,773 → 34,875 px
  (her tee 5,298 → 20,755: bust and shoulders through it). It copies the NEAREST skin's movement, and where the cloth bridges a
  hollow (under the bust) the nearest skin barely moves while the skin it covers swells. It also does not touch what job 3
  really is — the short's waistband drawn over the tee's hem (a garment-over-garment fault the skin metric cannot see; it is
  visible as the ragged band in the girth-max rows, before and after). So it **ships off** (`kit.garmentFollowBody` 0 = exactly
  as before) and job 3 is **not fixed**: phase 2. A rerun of four subjects as SHIPPED (switch off, same
  rig, later hold): girth-max male 18,730 → 19,247 px, female 13,773 → 16,351 (her tee 5,298 → 5,189: the bust fault is gone with
  the switch); game male 14,593 → 18,930, game female 9,522 → 14,631.
- **The leg fit trades one big fault for many thin ones under the short — a regression to fix first in phase 2.** The kicking
  thigh no longer comes out through the short (male high kick 1,407 → 147 px; female lunge 1,487 → 647; grit's kick 714 → 151),
  but the short is three pieces (§3.1), and pulling each leg tube's inner top onto its own thigh widened the seam between the
  tubes and the pelvis band: thin slits of skin across the short's front in ordinary poses (as shipped: game male short
  1,138 → 6,038 px over 45 shots, game female 975 → 4,661; there were slits before too). The fix is geometric: weld the tubes to
  the band (or overlap them) in the bake, measured on the same rig. It is not done here.
- **Rig caveat, found here:** the rig's poses are not frame-identical between runs — the "run" cell caught a deep stride before
  and an upright moment after — so single cells are noisy; totals over many shots are the measure.
- The rig's noise is ±5–16 % a subject (kit-glitch measured it); the default male and female in the Closet improved
  (16,222 → 15,488 and 14,352 → 13,752).

**Contact sheet** (before | after; beauty shot, then the class pass with skin through cloth in red):
`kit-fit-before-after.jpg` in the lane's scratch folder (`…/scratchpad/kit-fit/rig/`; the path is in the lane report).

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
4. **Garments follow the body's shape** (job 3) — **built, measured worse, ships OFF**: `kit.garmentFollowBody` (feel knob,
   group "Kit · fit"; 0 = as before, the default) makes a worn top or short take the bulk of the nearest skin
   (`inflate.followMap` / `followDelta`). On screen it pushed the bust through the tee on the girth-max female (§3.3). Kept as a
   switch for phase 2, which redoes it by projection along the garment's normal.

**Cost.** Download: +79–80 KB a kit file (2–3 %), +22 KB a rival (3 %), +173 KB the football jersey (14 %: its positions are
32-bit floats, as the original's). The new data is stored in the files' own compact types (byte normals, weights and joints,
16-bit indices); the replaced garment data stays in the file unreferenced (a few KB a garment), so the original bytes are
provably untouched. No new mesh, material, texture or draw.

## 5. The phases

| Phase | What | Exit gate (measured) |
|---|---|---|
| **1 — Fit the kit (built)** | §4: UVs, the jersey; the short's leg fit and follow-the-body built but off (§9) | Met: `scripts/kit-fit-tests.ts` green (GATE 0 fingerprints of all 29 rebaked files, UVs, leg tubes, jersey); torn edges on the kit bodies ≤ 30 % of before (82 % / 80 % fewer); farthest vertex ≤ 0.10 m; flicker down a third on screen. **Not met**: skin through cloth on screen did not drop overall — the seam slits (§3.3) |
| **2 — Bake the fit into every garment** | FIRST: close the seam slits the leg fit widened (weld or overlap the short's leg tubes and band in the bake; game-scene skin under the short back to ≤ its before, 1,138 / 975 px); job 3 redone: the garment follows the skin it COVERS (projection along its normal) and a layer-order metric (the short drawn over the tee) on the rig; the slivers of thigh at the short's inner hem (§3.3); the rivals' tees (finding 6) through the same transfer; the body-hide mask, the lift and the edge flare baked into each garment file (the runtime keeps them as a fallback), so a spawn does no fitting on the CPU; the female tee's bust fold in its UVs (11 % shared texels) | Rival torn edges ≤ 20 a body over the 10 poses; mask and lift time per spawn → 0 ms on a baked garment (today paced over frames); skin through cloth ≤ 1 % of garment pixels on the browser rig |
| **3 — The right garments** | A real basketball jersey (wide armholes, hem over the short) for the court modes and as `top_bonds`, cut from the CC0 MakeHuman tee in Blender like the rivals' sleeveless jersey (`style.py cut_sleeves`), with a second UV set for the player's own number; a clean football jersey re-model (symmetric, no mirrored print, no emissive, ≤ 4k triangles) | A 1v1 / 3v3 frame reads "basketball kit" (owner's eye); numbers per player; the football jersey under 4k triangles |
| **4 — Cloth that moves** | A cheap sway on the short's hem and the jersey's tail in the vertex shader, driven by the body's speed (no new bones) | No new joint; ≤ 0.2 ms a frame on the phone profile; never through the legs (the browser rig's poke at the hem) |
| **5 — Phones** | A lighter garment level of detail for far bodies (the crowd, the 3v3 far side) | 3v3 and 3-Point back inside their phone rows (HOOPS-AAA-GAP-SHOW §3.9) |

## 6. Owner questions — ANSWERED (owner 2026-11-13, docs/OWNER-DECISIONS.md): 1 (a), 2 (a)

1. **Cloth that moves (phase 4).** (a) **A vertex sway in the shader, no rig change** — recommended: it keeps the owner's 22-bone
   spec, costs almost nothing on a phone, and covers a short's hem and a jersey's tail; (b) add 2–4 cloth bones to the rig — real
   secondary motion, but it changes the 22-bone spec every clip and test is built on (GATE 0); (c) no cloth motion.
2. **Who makes the basketball jersey and the new football jersey (phase 3).** (a) **In-house, free**: cut from the CC0 MakeHuman
   garments in Blender on the owner's Mac (the MPFB scripts are ready; this machine has no MPFB) — recommended; (b) buy or
   commission a sports-kit pack (money). The steps: docs/JERSEY-BUILD-STEPS.md.

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

## 9. Phase 2 (2026-11-13 → 11-17)

### 9.1 The rig had to be made repeatable first

The phase-1 browser comparison caught one "run" cell at two different moments (a deep stride before, upright after): breathing
(secondary motion) runs on a clock and foot planting had not settled. The rig now stops the breathing and lets a paused pose
settle for 30 frames (`STEADY`, default on). With steady poses the phase-1 claim "the kicking thigh no longer comes out through
the short" did **not** hold up — it was the two moments — and the short's skin-through rose on the Closet bodies (male 2,863 →
6,733 px over 50 shots). The rig also gained **pokeFront**: skin with the cloth's OUTSIDE behind it. The old count also calls skin
seen through an opening (up a leg, between the legs) "through cloth".

### 9.2 Job 3 — found and fixed: the Creator's shape undid the clothes' fit

The Creator's shape is a morph target holding ABSOLUTE positions taken before the garments' fit; the GPU draws it at influence 1,
so on every Creator build the waistband fit (the short tucked under the top), the edge flare and the shoe's fold were drawn as if
never done — 225 of the 293 waistband-fitted vertices on the male kit (`scripts/probes/kit-fit/morphfit.ts`). Now the fit moves
the morph with it (`lib/babylon/core/morphCarry.ts`) and the shape is built on the garment's current vertices
(`renderShape.ts`); knob `kit.shapeKeepsFit` (1; 0 = as before). Headless, girth 1.6, 8 poses, the short drawn over the tee
(`scripts/probes/kit-fit/exposed.ts`, validated: 53 at a normal build, 521 at girth 1.6): male 4,437 → 448, female 4,602 → 363.
On screen: girth-max male skin through cloth 20,228 → 17,168 px and its short 6,970 → 3,902. `kit.garmentFollowBody` now means
"never behind the skin" and stays off (better on the male, worse on the female, headless).

### 9.3 The rivals' tees

Body weights on a tee were much worse (ace 50 → 236 torn edges). Two rounds of smoothing the tee's own weights were measured on
all 24 rivals and kept on the 10 where both the tee's torn edges and the skin through it improved (ace 50 → 20 / 903 → 842,
dash 40 → 8, grit 30 → 8, lux 38 → 18, tusk 24 → 18, …: `bake.ts RIVAL_TEE_SMOOTHED`); on the other 14 it let more skin
through (their builds fill the tee differently), so they keep their own.

### 9.4 The short (item 1) — the leg fit ships OFF; the fix is a one-piece short

The short is three pieces whose legs crossed into each other. The phase-1 fit put each leg on its own thigh, and eased that move
into the neighbours, which pulled the front and back of each tube onto the thigh. Now an eased vertex never ends closer than 15 mm
to its thigh. Measured on the steady browser rig against phase 0, all 14 bodies (50 / 45 / 21 shots a body): skin under the short
rose on every Closet, game and rival body even so (Closet male 2,863 → 4,719 px, game female 906 → 3,428, the rivals +120 to
+450), while the headless torn edges fell ~80 % (male 98 → 18). Pixels on the cloth seen from OUTSIDE (pokeFront) confirm a real
part of it (Closet male +11 %), not only skin seen through the leg openings. So the leg fit is opt-in (`bake.ts --legs`) and the
shipped shorts are phase 0's shape and weights.

Tried and measured worse: lowering the band over the crotch (torn edges 18 → 30 male, 27 → 72 female), the body's weights only
where the old ones were wrong (no change on screen), a larger ease (torn edges 20 → 38 → 61), stopping the cloth at the midline
(47 / 42). What is left is coverage: in phase 0 the two crossed tubes double-covered the gap between the legs; any fit that keeps
each tube on its own leg opens it. **The fix is the garment itself**: a one-piece short with a real crotch, made the way the jerseys are
(docs/JERSEY-BUILD-STEPS.md's process applies: MakeHuman `cortu_jeans_shorts` welded into one piece in Blender, exported with
`fit-outfit.py --slot shorts`), then checked with `scripts/kit-glitch-tests.ts` (tears) and the browser rig (skin) before it ships.

### 9.5 Baking the skin-hiding into the files, and the perf lane's body merge (item 4 — written up, not built)

Today the body mask (and the waistband fit, the flare) runs after a spawn's first frames, on the CPU, paced one fitting a frame,
and rewrites the body's index buffer. The perf lane's body merge (`lib/babylon/core/bodyMerge.ts`, lane/hoops-perf) rebuilds a
body's merged mesh whenever a part's index buffer, geometry or morph changes, after `BODY_MERGE_SETTLE_FRAMES` (30) of stillness —
so today every spawn merges, unmerges when the mask lands, and merges again. Baking it:
1. the bake (`bake.ts`) runs the same pure `computeBodyMask` per garment item at rest and stores the hidden body vertices as a
   bit set in the garment mesh's extras (`felHide`), plus each (top, short) pair's waistband fit as a position delta;
2. `applyKit` applies the union of the shown items' bit sets to the body's indices synchronously, before the first frame, and
   skips the after-frame fitting when every shown garment carries one (a Creator shape, code-built clothes or a kit pack fall
   back to today's runtime fit);
3. the merge then builds once and never unmerges for the mask.
That changes `kit.ts` and `bodyMask.ts`'s scheduling, so it waits for the perf lane to merge first, then lands as its own lane
change with the browser rig before/after. Expected: no mask work per spawn on a default body; the look is the same rules.

### 9.6 Totals, every measured body (steady rig, desktop, phase 0 → phase 1 + 2)

As shipped (leg fit off), the browser rig with steady poses, desktop, 50 / 45 / 21 / 35 shots a body (Closet / game / rival /
football), phase 0 → now:

| Body | Skin through cloth, px | of which under the short | Flicker, px |
|---|---|---|---|
| closet-male-default | 16,478 → 16,431 (better) | 2,863 → 2,865 | 42 → 63 (worse) |
| closet-female-default | 13,255 → 13,569 (worse) | 3,029 → 3,364 | 52 → 55 (worse) |
| closet-male-girth-max | 20,228 → 19,144 (better) | 6,970 → 5,732 | 45 → 50 (worse) |
| closet-female-girth-max | 19,044 → 19,100 (worse) | 7,572 → 7,823 | 56 → 51  |
| game-male-default | 18,069 → 14,694 (better) | 3,702 → 327 | 28 → 45 (worse) |
| game-female-default | 10,711 → 11,598 (worse) | 906 → 2,083 | 38 → 22  |
| game-male-girth-max | 10,495 → 11,854 (worse) | 1,149 → 3,786 | 14 → 36 (worse) |
| rival-ace | 3,692 → 3,775 (worse) | 498 → 582 | 4 → 3  |
| rival-dash | 3,838 → 3,667 (better) | 711 → 566 | 5 → 5  |
| rival-grit | 3,565 → 3,798 (worse) | 473 → 608 | 5 → 1  |
| rival-halo | 3,345 → 3,061 (better) | 515 → 475 | 5 → 5  |
| rival-yara | 3,891 → 3,570 (better) | 572 → 450 | 6 → 6  |
| pack-football-player | 36,552 → 30,472 (better) | 1,493 → 1,975 | 60 → 76 (worse) |
| pack-football-female | 30,255 → 27,819 (better) | 2,156 → 2,032 | 41 → 45 (worse) |

**Not every body is better (the coordinator's exit bar for the PR).** Better: the in-game male, the girth-max Closet male, both
football bodies on skin (the jersey), three of five rivals. About equal: the Closet male. Worse: the Closet female (+2 %), the in-game
female and the in-game girth-max male — with phase 0's short shape and weights, so not the leg fit: the short is now one welded
mesh with UVs (it was cut into one cell a triangle at runtime) and the runtime fits (the waistband tuck, the edge flare) act on it
differently in the game scene. Two of the smoothed-tee rivals show more skin through the tee on screen (ace 882 → 937, grit
1,074 → 1,205) although both measured better headless: the headless count does not stand in for the screen there. Flicker is up
by tens of pixels on several bodies. Those are the next investigation (§5 phase 2).
Contact sheet: `kit-fit-before-after.jpg` in the lane's scratch folder (`…/scratchpad/kit-fit/rig2/`).

## 10. The split PR, kit-fit-a (2026-11-17): each piece measured alone

The coordinator split the clear wins into `lane/kit-fit-a` (from `lane/finish-release` at `ce955f4b`). The exit bar for each
subject a piece touches: skin through cloth AND flicker each at or below phase 0, measured on the steady browser rig (desktop,
`scripts/probes/kit-glitch/rig.mts`; before = phase 0's files through `OVERLAY`, after = the piece). A piece that fails is dropped.
**All three failed, so kit-fit-a ships no garment or runtime change**: it carries the rig, the probes, the GATE 0 pins and the docs.

### 10.1 How much the rig moves on its own (the control)

An unchanged subject was measured in the same hold as the pieces, and the before matrix was re-run up to three times:
- **rival-halo, unchanged:** skin 3,248 → 3,459 px between two runs, all of it in the shoes (+7 %) and shorts (+15 %) slots; its
  tops slot was identical (824 = 824).
- **pack-football, phase 0, four runs:** skin within 0.3 % on the player and 3 % on the female, but flicker 46–81 (player) and
  28–51 (female).

So the **tops slot and the totals of a big subject are repeatable; the lower-body slots and flicker are not** (the feet plant and
the mask lands on frames that vary). A one-run "≤ phase 0" on flicker is a coin toss. Below, flicker is judged on several runs.

### 10.1a The bar from now on (coordinator, 2026-11-17)

A kit-fit piece ships only if, on the steady browser rig, for every subject it touches:
- **runs:** at least **3 runs a side** (phase 0 and the piece), in one gate hold, plus an **unchanged control subject** measured in
  the same hold (its own 3 runs give the noise band);
- **skin, tops slot and big-subject totals:** at or below phase 0's runs (these repeat within a few %);
- **flicker and the lower-body slots (shoes, shorts):** judged against the control's band, never on one run — the piece's runs may
  not sit above phase 0's range by more than the control's spread.
A one-run comparison is a sighting, not a result.

### 10.2 Job 3 (`kit.shapeKeepsFit`, core/morphCarry.ts) — dropped: more skin under the short in games

| Subject (steady, desktop) | Skin px, phase 0 → job 3 | Shorts slot | Flicker |
|---|---|---|---|
| game-male-girth-max | 9,959 → 14,244 | 1,247 → **5,172** | 22 → 20 |
| game-female-default | 10,479 → 10,936 | 837 → 941 | 35 → 35 |
| closet-male-default | 16,086 → 16,440 | 2,460 → 2,911 | 47 → 42 |
| closet-male-girth-max | 19,080 → 19,814 | 5,739 → 6,591 | 56 → 58 |
| game-male-default | 15,721 → 15,491 | 1,118 → 635 | 19 → 23 |

This answers the full lane's open question: **the game shorts regression is job 3, not the UV unwrap.** Job 3 alone, on phase
0's files, raised the game girth-max short 1,247 → 5,172 px; the full lane (job 3 + UVs) measured 1,149 → 3,786. The headless
layer win (the waistband over the tee, 4,437 → 448) is real, but keeping the waistband fit under a Creator shape lets the thigh
through the short. assumption (not yet measured): the fit sinks the band toward the UN-shaped body, and the shape then grows the
body past it. Next on `lane/kit-fit`: fit against the shaped body, or carry only the lift, never the sink.

### 10.3 The football jersey refit (job 2) — dropped: more flicker

| pack-football | Skin px, phase 0 (4 runs) → refit (3 runs) | Flicker, phase 0 → refit |
|---|---|---|
| player | 36,210–36,483 → 30,763–30,819 (−16 %) | 46 / 70 / 74 / 81 → 79 / 87 / 88 |
| female | 30,038–30,896 → 27,651–28,024 (−8 %) | 28 / 37 / 47 / 51 → 53 / 64 / 68 |

The skin win is far outside the noise; so is the flicker loss (every female refit run is above every phase-0 run). The added
flips are skin ↔ jersey (`key>tops` ~65 → ~85) and jersey ↔ short (`tops>shorts` ~15 → ~25): the refit leaves the jersey 4 mm
off the skin (`pack.ts PACK_FIT.ease`), close enough to depth-fight. Next on `lane/kit-fit`: a larger ease, re-measured with the
same repeat runs.

### 10.4 The rivals' tee smoothing — dropped: more skin through the tee

On the tops slot (the repeatable one), smoothed vs phase 0, one run: blaze 865 → 1,034, dash 1,176 → 1,271, lux 1,133 → 1,245,
rook 1,517 → 1,674, tusk 1,104 → 1,123, volt 711 → 1,123, zeal 935 → 1,152; only nyx improved (1,211 → 908, flicker 0 → 3).
In the full lane, ace 882 → 937 and grit 1,074 → 1,205. The headless probe disagrees: tee skin-through vertices ace 903 → 842,
grit 842 → 837, volt 894 → 887, with tears down (50 → 20, 30 → 8). So **why ace and grit look worse**: the smoothing cuts
torn edges but lets more of the tee's surface fall behind the skin where the camera sees it. The vertex count (60 poses, every
vertex alike) does not weight what is on screen. The headless probe is not a proxy for the screen on tops; the browser rig is
the judge.

### 10.5 What kit-fit-a carries

- The steady browser rig (`rig-entry.ts`: no breathing, 30 settle frames; `pokeFront`; `OVERLAY`, `KNOBS`) and
  `scripts/probes/kit-fit/**`.
- `scripts/kit-fit-tests.ts` (GATE 0 rig pins of the 29 files a rebake may touch, and the phone files = the desktop files).
- The GLB tools the jersey steps use (`scripts/avatar/kit-fit/{glb,surface,pack}.ts`).
- `docs/JERSEY-BUILD-STEPS.md`, `docs/SHORTS-BUILD-STEPS.md` (job 1, the one-piece short), the owner's 2026-11-13 answers.

The contact sheet of the jersey cells, phase 0 vs refit, is in the PR report, not in the repository.

## 11. The two "Mac jobs", done headless (lane/kit-mac-jobs, 2026-11-18) — built, measured, NOT switched on

The owner (2026-11-18): "Do the 2 jobs on the Mac"; "The clothes are the biggest eye sore immediately"; "make the clothes
appear to be skin tight and not baggy, or more natural, right now it looks poofy." No Mac was connected, so both jobs ran on
Linux with Blender as a Python module (bpy 5.0.1) and MPFB 2.0.18 with the MakeHuman CC0 packs; see the "Done headless"
sections of `SHORTS-BUILD-STEPS.md` and `JERSEY-BUILD-STEPS.md`. The garments are `public/models/kits/sets/` (one-piece short;
basketball and football jerseys), put on the kit bodies at load behind `kit.onePieceShorts` and `kit.newJerseys`
(`lib/babylon/core/kitGarmentSet.ts`). Both knobs ship at **0**: the game is exactly as before.

**At rest they are what was asked:** fitted, one piece, no skin through (renders in the lane report). Off the skin, at rest,
median: short 20 mm → 7 mm (Blender) and, in the game with its own lift, 38.9 → 28.1 mm (`kitGarmentSet.test.ts`); tops 23 →
10–17 mm.

**In the game they fail the 10.1a bar.** The rig, steady, run 1 (one hold; the shared machine ran ~6 min a subject, so the hold
was narrowed to 4 poses × 3 cameras and the second run was cut short). Px are summed over those cells.

| Subject | Skin through cloth, before → after | Tops slot | Shorts slot | Stretched edges (tops / shorts) |
|---|---|---|---|---|
| game-male-default, desktop (2 before runs) | 4,400–5,985 → 10,313 | 3,654–3,913 → 7,864 | 133–1,766 → 2,024 | 0–1 / 55–73 → 64 / 226 |
| game-female-default, desktop | 3,676 → 9,638 | 2,943 → 7,369 | 389 → 1,814 | 0 / 93 → 37 / 436 |
| closet-male-default, desktop (2 before runs) | 5,895–7,232 → 8,092 | 3,520–4,476 → 3,969 | 811–3,031 → 3,437 | 5–6 / 64–68 → 5 / 274 |
| game-male-default, phone | 5,552 → 10,425 | 3,833 → 7,400 | 1,303 → 2,550 | 2 / 35 → 54 / 220 |
| pack-football-female, phone (Meshy pack → new jersey) | 14,433 → 16,069 | 11,831 → 13,313 | 1,267 → 2,154 | 2,567 / 30 → 101 / 316 |
| rival-halo, phone (control, unchanged) | 5,430 → 5,190 | 2,017 → 2,079 | 2,011 → 1,818 | 1 / 79 → 1 / 78 |

- **The basketball jersey** doubles the skin seen through the top in the game, although headless (`cpu-sets.ts`, 10 poses) it
  cut the skin through it by 39–74 %. The headless count again is not the screen (as §10.4 found).
- **The one-piece short** shows more skin in the shorts slot, and its stretched edges rise 3–5×. The cloth that joins the legs
  stretches in a stride (headless torn edges 228 → 1,052 over 10 poses, after two rounds of fixes from 1,718).
- **The football jersey** cuts the Meshy pack's torn edges 25× (2,567 → 101) and its flicker (19 → 6), but lets 11–13 % more
  skin through. It fails the bar on skin.
- assumption (not measured): the closer cloth leaves less room for the skin the mask keeps. The mask keeps a 5 cm band at a
  top's hem and armholes (`TOP_EDGE_MARGIN`) and 1 cm at a short's openings, and both new tops have larger openings. A tight
  garment needs the mask and the fit to be tuned together (the kit-tight lane's `kit.fitTightness`), not a closer file alone.

## 12. kit-tight, phase 1 (2026-11-18): pulling today's garments in fails the bar; the slider ships at 0

The owner (2026-11-18): "make the clothes appear to be skin tight and not baggy ... right now it looks poofy."

**Where the poof comes from** (`scripts/probes/kit-tight/gap.ts`, headless, default male kit at idle, outward cloth, median / 90th
percentile, cm). The garment files stand 2.0–2.5 cm off the skin. The runtime then adds 1–1.8 cm: the lift
(`GARMENT_INFLATE` 13 mm tops / 20 mm shorts) and the edge flare near the openings. (Correction, 2026-11-18: an earlier note here
said the flare took every seam of the tank for an opening and flared all of it. That was a fault in the probe — its file stage
wrote the tank's 408 loaded vertices back into the live mesh. Measured correctly, the flare moves 810 of the tank's 2,160 vertices,
the ones near its openings, and a "real openings only" flare moves 840 and changes no gap: there is no seam bug.)

| Region | File | Drawn today |
|---|---|---|
| chest / upper back (tank) | 2.5 / 4.2 | 3.9 / 5.7 |
| belly / lower back (tank) | 2.0 / 2.4 | 3.2 / 4.2 |
| shoulder (tank) | 2.2 / 3.6 | 3.7 / 5.1 |
| thigh (short) | 2.3 / 3.2 | 4.1 / 5.4 |

On girth-max Creator builds the body fills the cloth (≤ 0 cm): the poof is the default builds'.

**What was tried** (`lib/babylon/core/fitTight.ts`, `kit.fitTightness`). Each worn kit tee / tank / short vertex further than 8 mm
off the skin is pulled toward the skin by the slider's share of the excess, once, fading out within 7 cm of an open edge.
Headless at 1 the belly, shoulders, hem and thigh come to 0.1–1.1 cm. On the steady phone rig (one round each; all 8 kit
subjects), all three versions failed:
1. **Pull everywhere, at 0.6:** skin through cloth +10–35 %; the shorts slot doubled to quadrupled.
2. **Pull only over skin the mask hides, at 1:** the same; skin seen against the cloth's outside rose too (female default shorts
   1,065 → 4,586 px).
3. **As 2, with the mask always measuring the loose cloth, at 1:** the same (female default shorts 3,404 → 7,405; game female
   648 → 4,264). So it is not a re-mask un-hiding skin.

The cause: the kit's coarse short and tank ride their OWN skin weights, not the body's. In a stride the cloth slides over the skin
by centimetres, so skin from the drawn bands at the openings slides under cloth that now sits close, and comes through. Today's
3–4 cm gap is what absorbs that slide. Pulling the cloth in only works if it also rides the skin (the body's weights under it).
For these three-piece files that fails at the crotch (§3.1). **The slider ships at 0 (today), the code stays for phase 2.**

Phase 2 (the coordinator, 2026-11-18): the kit-mac-jobs garments (a one-piece short, the new jerseys, cut close in Blender with
weights from the body), with the runtime lift and flare reduced for those files only, and the mask tuned to their openings.

### 12.1 Phase 2 (2026-11-18): the kit-mac-jobs garments in the game, with their own lift (`kit.setLiftScale`)

The seam-flare "bug" from phase 1 does not exist (§12's correction). The garment sets (§11) were measured on the phone rig, one
round, against today, with `rival-halo` as the control:

| Subject | Skin through cloth: today → sets at today's lift → sets at 0.3 of it | Tops slot | Shorts slot |
|---|---|---|---|
| closet-male-default | 16,583 → 21,062 → 31,088 | 10,290 → 10,324 → 10,314 | 2,359 → 6,844 → 16,602 |
| closet-female-default | 13,750 → 14,414 → 23,101 | 8,489 → 8,498 → 8,485 | 3,655 → 3,929 → 12,443 |
| game-male-default | 17,667 → 24,831 → 40,878 | 11,687 → 17,522 → 26,115 | 3,419 → 4,711 → 11,998 |
| game-female-default | 11,494 → 21,821 → 35,343 | 8,167 → 17,259 → 21,904 | 1,535 → 3,070 → 11,408 |

Bringing them closer makes the count worse, as in phase 1. **But the count may not be judging what the eye judges here.**
- The rig counts a skin pixel as "through the cloth" when the skin lies within 4 cm of a garment and inside the garments-only
  silhouette (`rig-entry.ts` `POKE_NEAR`). The tops slot rose only on the game subjects, the ones that wear the new SLEEVELESS
  jersey; the Closet subjects keep the tee and did not move. A bare arm beside a sleeveless jersey sits within 4 cm of it, in
  front of its silhouette. The same goes for a bare thigh just below a tight hem: the closer the cloth, the more skin falls
  inside 4 cm.
- In the game male overhead close-up (`scratchpad/kit-tight/diag-overhead.jpg`) today's tee shows skin patches through its
  chest. The new jersey shows none.

assumption, not measured: much of the rise is this proximity effect, not skin poking through. A design that shows more arm or
thigh cannot pass a count that treats nearby bare skin as poke. The owner's eye, or a rig measure that tells skin in front of
cloth from skin that should be under it, is needed to judge it.

### 12.2 The owner's pick, and the waived count (2026-11-18)

The coordinator put a contact sheet to the owner (`scripts/probes/kit-tight/pick.sh`, `tile.sh`: each kit body standing and
mid-stride, plus the phone frames at game distance), with three versions: (1) today, (2) the new garments, (3) the new garments
at half the runtime lift. **The owner picked (3).** It ships: `kit.onePieceShorts` 1, `kit.newJerseys` 1, `kit.setLiftScale` 0.5.

**The 10.1a skin count is waived for this change, by the owner's eye.** It is a reasoned call, not a measured one. The count
calls any bare skin within 4 cm of a garment, inside its silhouette, "through the cloth". So it scores a sleeveless jersey (a bare
arm beside it) and a closer hem (a bare thigh just below it) as worse, and §12.1's game-only rise in the tops slot fits that. It
was not checked with a sharper measure. What it does not waive: flicker was not judged, and the one-piece short's hem frays at the
inner thigh in a stride (visible on the sheet; kit-mac-jobs measured its stretched edges 3–5×). That is the next job:
fix it in `scripts/avatar/mpfb/onepiece-shorts.py` and re-export, behind the same knobs, with before / after pictures.

### 12.3 The one-piece short's inner-thigh fray (2026-11-18): weights cannot fix it; the shape must

Headless (`scripts/probes/kit-mac-jobs/cpu-sets.ts`, male, 10 poses; torn = an edge past ×2 and past ×1.5 of the skin under it):
today's three-piece short tears 92 edges, the shipped one-piece short 300, up to ×6.8 in a kick. `TEAR_DUMP=1`
(`scripts/probes/kit-glitch/cpu.ts`) shows where: 298 of the 300 hang on both thighs, near the middle line, at and below the gusset.
The build rebuilt here (bpy 5.0.1 in a scratch venv; `scripts/avatar/kit-fit/build-sets.sh`'s steps) reproduces the shipped file
byte for byte, so these are fair variants:

| Variant | Torn edges (10 poses) |
|---|---|
| shipped (gusset 2.5 cm under the crotch) | 300 |
| each vertex on its own thigh only (no shared weights) | 314 (216 of them now the left-to-right seam, ×5–10) |
| the shared thigh share moved to the pelvis | 354 |
| own thigh, then fading into the pelvis from the gusset up, over 2 / 4 / 7 cm | 624 / 714 / 632 |
| the same fade without the gusset limit (the inner legs too) | 1,572–2,358 (the cloth left behind the leg, 17 cm) |
| gusset 4.5 / 6.5 cm under the crotch | 342 / 398 |
| hem ease 12 → 20 mm | 300 |
| curved hem, inner side cut 3 / 5 / 8 cm higher (`onepiece-shorts.py --hem-rise`; 0 rebuilds the shipped file byte for byte) | 304 / 360 / 350 (skin through it 130 → 112 / 109 / 75) |

The stretch is the cloth that joins the two legs: when the legs split it has to stretch, wherever its weights put it. Today's short
avoids it only because its leg tubes overlap instead of joining. The curved hem lowers the skin seen through the short but not the
tears, so the torn edges are the gusset's, not the hem's. With 22 bones and no cloth simulation (GATE 0), the cloth that joins two
legs that split apart must stretch somewhere. What is left: hide it (a darker inseam panel, so the stretched faces read as a seam),
or a short with a slit side (less cloth to stretch). Both are owner-look choices.

### 12.4 The inseam panel, and the /creator tap control (2026-11-18)

**The panel** (`lib/babylon/core/inseamShade.ts`, `kit.inseamShade` 0.55; 0 = none). This is the coordinator's option (a), taken
as the reversible default and flagged to the owner.
- A 128² texture made from the one-piece short's own UVs, positions and weights. It is dark on the inner side of each leg, from
  the gusset to the hem.
- It sits in the short's LIGHTMAP slot, read as a shadow map. The albedo slot is the Creator paint's, and a panel there never
  showed.
- The Closet tint's material clone shares it (`playerIdentity.cloneForTint`), because a deep copy of a texture made in memory is
  blank.
- No geometry, UV, bone or vertex-data change: the body merge sees the same parts (tested).
- It reads in a kick, where the inner thigh faces the camera. Standing, the inner thigh is mostly hidden between the legs.

**The /creator tap control** (every-screen `fast`; budget 200 ms; one gate hold; own database). Each side was built alone, scored
3 times, then deleted:

| Side | Tap times (ms) |
|---|---|
| release tip 28a9e732 | 224 / 160 / 168 |
| lane/kit-tight 193eb9f3 | 240 / 224 / 288 |

The ranges touch only at 224. The kit side's median is ~70 ms slower, and the release itself missed the budget once. What this lane
adds to the main thread when a body loads, measured headless:
- fetching, parsing and applying the two garment sets: 8–32 ms;
- the panel texture: 3–4 ms at 128² (14–17 ms at 256², the size the control did not include yet).

assumption: if the body's load overlaps the tap, the garment-set work is the likely difference. Not confirmed with a trace.
