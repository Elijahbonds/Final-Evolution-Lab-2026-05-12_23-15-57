# Ship Pass 3 — A Real Body in a Real Place (opened 2026-09-03)

Owner directives (verbatim intent): human-like, anatomically sensible models
with real skin and cloth — the app will teach anatomy and physics, so the model
must be like the hardware you own IRL; upgrade boundaries, map, movement,
camera; improve the animations from the owner's motion capture and identify
the movements in it. Research, sources and licences: `HUMAN-MODEL-RESEARCH.md`.
Owner decisions (2026-09-03, `PHASE2_BENCHMARK_LOCKS.md`): fitted body by
default, AI generator only as a later premium option, face + full-body
proportions, on-device, free at runtime.

Plan page: https://claude.ai/code/artifact/88460d0b-8775-4206-a872-81951f4ddeb0

| Phase | Deliverable | Gate |
|---|---|---|
| 1 Body spike | One MPFB2 human → `fel-hero.glb` through the forge: FEL bones, material contract, head + proportion morphs, skins. | 21/21 green on the new hero; Closet round-trips. |
| 2 Skin | UV-mapped CC0 skins across the tone range; detail normals; SSS desktop / translucency mobile. | Per-tone captures; mobile ≥ 30 fps. |
| 3 Clothes | Kit library on the new mesh from fitted garments with PBR fabrics; Closet wearables map to them. | Every wearable renders; no poke-through in the clip suite. |
| 4 Mocap → clips | Inventory, segment, retarget, register the owner's captures under the modes' clip names. Hair, eyes, wider face set ride along. | Every sport with a capture plays it; rig suite proves each segment. |
| 5 Anatomy layer | Skeleton + muscles under the skin, rig-shared, labelled, lesson-toggled. | A Camp module walks one movement's anatomy. |
| 6 Body physics | de Leva segments on the rig drive acceleration, turning inertia, jump impulse, landing load. | Physics lesson reads live numbers; gauntlets green. |
| 7 Boundaries | Offline navmesh per venue; players and AI constrained; court clamps retire. | No out-of-bounds in a 21-mode sweep. |
| 8 Movement feel | Per-sport acceleration, turn radius, stop distance from the mass model. | Owner feel review; gauntlet green. |
| 9 Camera | Whiskers, occlusion fade/pull-in, asymmetric damping, per-mode context. | FEL-CAM fallbacks ≈ 0 across a sweep. |
| 10 Maps | Venue upgrade on the optimized maps: props, lighting per mood, navmesh-authored bounds. | Load budget met; every venue re-shot. |

## Findings log
- **3 Sep, opened.** Blender 5.1.2 is installed on this machine; MPFB2 is not.
  The spike starts with a headless install and an API probe.
- **3 Sep, rung 4 first measure.** Five takes segmented by motion energy
  (golf 5.4 s, tennis serve 3.5 s, baseball pitch 2.6 s, volleyball spike
  3.3 s, football catch 8.2 s; each take is one movement after a static
  lead-in). `buildMocapClip` plays a take on the hero from the JSON. Golf on
  the rig: hand rises 0.98→1.62 m and crosses 1.0 m — a swing — but the hands
  open to 0.71 m at extension (**D-M1**: the owner's limb lengths vs the
  hero's). Fix planned: grip IK to a shared club target. Gate 0 held: the hero
  is the 22-bone unprefixed rig; the takes' Mixamo names map 1:1 after the
  prefix strip, toes dropped, root motion dropped.
- **3 Sep, rung 1 spike: the pipeline runs end to end, offline.** MPFB2 v2.0.17
  installed into Blender 5.1 headless (clone at `~/Developer/FEL-swarm/tools/
  mpfb2`, extension zip built from source); CC0 packs unpacked into its user
  data: system assets (eyes, teeth, proxies), skins 01–02, shirts 01, pants 01,
  shoes 01, hair 01, clothes and hair materials (~955 MB, owner-approved).
  `scratchpad/mpfb-spike/dress.py` creates the human at metres, adds the
  **mixamo** rig (52 bones; covers the FEL 22 exactly), a CC0 skin
  (`middleage_caucasian_male`), a t-shirt, jean shorts, hero boots and
  low-poly eyes, and exports a GLB with textures. `scripts/avatar/import-mpfb.mts`
  strips the prefix, folds fingers/toes/extras into their kept parents with
  weights re-summed, and names the materials to the contract (skin, jersey,
  shorts, shoes, eyes). Result `public/models/candidates/fel-hero-mpfb.glb`
  (12.3 MB, 5 meshes, 6 textures): **Phase 0 rig audit PASS** (22 bones,
  T-pose), rest solve finds four arm bones, authored idle and golf clips build.
  Open before it can replace the hero: 25,678 tris vs the 25k budget (decimate
  the boots/eyes or drop helper faces); authored clip offsets were solved on the
  old body's rest and land elsewhere on this T-posed body (re-solve per clip,
  the rig tests will flag each); no face morphs yet (the Closet's seven must be
  authored as MPFB targets → shape keys); texture size/KTX2 for the load budget.
- **3 Sep, rung 1 spike, second cut.** The Closet's seven morphs (faceLong,
  faceRound, faceSquare, faceHeart, faceDiamond, jawOpen, browRaise) are MPFB
  targets loaded as shape keys under the FEL names and survive export: Blender's
  glTF exporter drops all shape keys when it applies modifiers, so the clothes'
  decimation is baked, the body's helper geometry is deleted by vertex after the
  targets load (indices stay valid), MPFB's eight macro keys are removed, and
  the export applies nothing. `fel-hero-mpfb.glb` carries exactly the seven, in
  the Closet's order. Cost: the body alone is 26,756 tris (13,380 verts), so the
  dressed candidate is 29,647 against the 25k advisory budget — accepted for
  the desktop tier for now; the way down is MPFB's low-poly **proxy** body
  (system assets `proxymeshes/`) as the render mesh, rung 2's decision.
- **3 Sep, rung 1 measurement: 18 of 24 rig-measured clip tests fail on the
  candidate body** (`FEL_HERO_GLB=public/models/candidates/fel-hero-mpfb.glb
  npx vitest run …`). Every authored clip stores upper-arm/forearm offsets
  solved on the OLD body's bone axes and proportions (`withOffset(rest, 0, y,
  z)` via `_arm-solve.mts`), so a new body invalidates them wholesale — and the
  same coupling is why the mocap golf swing opens the hands (D-M1). Two ways
  forward, put to the owner (RIG-ADJACENT):
  **A.** re-solve every clip's offsets on the new body with the existing tool
  (mechanical, ~40 clips; body-specific, so any future body or a proportion
  slider repeats it);
  **B.** author clips as world-space END-EFFECTOR targets (hand/foot positions
  per key, plus torso keys) fitted at build time with the two-bone solver we
  already ship (`TwoBoneIK`, `HandIK`, `plantLeg`) — body-independent, the
  Closet's proportion sliders stop breaking poses, and the mocap retarget
  becomes "match the owner's hand and foot paths", which closes D-M1.
  Recommendation: B.
- **3 Sep, owner sign-off (RIG-ADJACENT): option B.** Clips become pose
  targets (`lib/babylon/anim/poseClip.ts`): torso keys in degrees, hands and
  feet in body-local metres scaled by Hips height, fitted at build time with
  the node-space two-bone solver. The new body enters **behind a flag on the
  dev harness first**; the shipped hero stays until the 21-mode gauntlet is
  green on the candidate. Migration order: golf first (smallest), then tennis,
  volleyball, soccer, baseball, basketball, locomotion, combat, board, dunk —
  each proven by its rig test on BOTH bodies (`FEL_HERO_GLB=…`).
