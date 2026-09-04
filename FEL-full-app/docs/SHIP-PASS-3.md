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
- **4 Sep, rung 4 hair on the kit bodies.** Six CC0 MakeHuman hair assets ride each kit body as `Hair_<key>` meshes (cap, afro, buzz, bun, ponytail, braids) under `hair.<key>` cutout materials, so the existing hair-style switch and hair tint work unchanged; no hijab asset exists in the packs (residual: a custom mesh). Both bodies import at 3.9 / 4.3 MB with 13 meshes, pass the bind check, and show the equipped style and kit in the Closet with no errors. Sweep on the shipped hero after the kit runtime landed: 40 rows clean.
- **4 Sep, rung 3 first cut: the garment library on two bodies.** `dress-kit.py` builds a male and a female MPFB2 body (gender 0.9 / 0.1; the first candidate was the androgynous 0.5 default) carrying every Closet wearable for tops, shorts and shoes as its own fitted garment (`Kit_<slot>_<itemId>`, material `<slot>.<itemId>`); `kit.ts` shows the equipped one per slot. Both import at ~2 MB, pass the bind check, and the male passes every rig suite; in the Closet the equipped garment shows and the others hide. Residuals: the CC0 packs hold no basketball-length shorts (both shorts slots wear the jean shorts, told apart by tint) and no sporting headwear or accessories, so those two slots stay procedural; the female heroine boot rendered on one leg and was swapped for the ankle boot. Tri count with one garment per slot drawn ≈ 20k body+kit against the 25k advisory.
- **4 Sep, owner decisions (rig / shared Profile).** (1) The candidate replaces the shipped hero only after rung 3's clothes and rung 4's hair land; until then it stays behind the dev flag. (2) The female MPFB2 body is built now, so the eight-body roster and the skin library carry both sexes. Candidate sweep on the rebuilt file: all 21 dev-mode rows clean, logged-in trio clean, mobile tier and phone rows clean (those last two families still ran on the shipped hero; the gauntlet now passes the flag to them as well).
- **4 Sep, the candidate's mesh and bind agreed only on paper.** In the Closet the candidate rendered a T-pose while every bone read animated, with one engine, a live context, intact weights and animated skin matrices. The file was the cause: Blender wrote the mesh undeformed (the morphs need `export_apply=False`), which for the MakeHuman basemesh is an A-pose, while the mixamo rig rests in a T-pose with the legs together and the joint nodes sit at rest, so the inverse bind matrices described a pose the mesh was not in (wrist vertices at (0.43, 1.06) m against a bind wrist at (0.66, 1.39)). The import now builds the A-pose skeleton from the mesh itself (elbows, wrists, knees, ankles are the centroids of mixed-weight vertices), rotates each limb bone onto it, and skins every vertex and morph delta into the rest pose; afterwards the wrist, elbow and ankles sit within 2 cm of the bind joints, the rig tests pass, and the Closet shows the arms hanging. Lesson for Phase 1's gate: bone-length retention cannot see this; the gate now also needs the mesh-vs-bind joint check. Candidate sweep on the rebuilt file: 21 of 21 dev-mode rows clean plus the logged-in trio.
- **4 Sep, candidate in the modes; rung 2 first cut.** A candidate sweep through `?hero=` failed every mode on the same cause: the nine base clips exist only inside `fel-hero.glb`, and the rival tinted red head to toe because the clothing-only tint judges skin by colour and a photographed skin is white with the colour in the map. Both fixed: `authored/baseClips.ts` builds the forge's nine as world-space deltas on the bind frame (identical on the shipped hero; rig tests on both bodies, and the jumpshot's release turned out to cross the arms low, now overhead), and the tint skips skin/hair/eyes by name. Rung 2 first cut: six CC0 MakeHuman skins exported as web maps with a shared detail normal; `applySkinMap` picks the family by tone luminance and sets the albedo to tone ÷ map mean, gated on the import's `felSkinUV` flag so the forge hero keeps its tint. Per-tone Closet captures on both bodies, no errors. The candidate file is 2.2 MB after WebP textures (was 13 MB). Sex-specific skins wait for the body roster (rung 3).
- **4 Sep, candidate load inside budget.** Warm, on the harness through `?hero=`: candidate 1.9 s to loaded (three runs: 2.5, 1.9, 1.9) against the shipped hero's 1.6 s, both under the 3 s warm budget; the 8 s seen earlier was a cold first fetch of a new file. The triangle budget note stands (29,647 vs 25k advisory).
- **4 Sep, mocap on pose targets; dunk seen.** The retarget now runs the take's forward kinematics and writes wrists and ankles as hips-relative targets (plus torso lean and hips yaw), and the runtime prefers those over raw local rotations, so a DeepMotion take plays on any body. `--grip 0.1` pulls a two-hand grip together: the golf take's hands drifted 0.7–1.4 m apart in the capture and now stay within 0.24 m (D-M1 closed). The dunk's flight was captured frame by frame on the harness: both hands overhead on the ball at the peak, a hang, a landing (`scripts/probes/_dunk-flight.mts`). Sweep after the portable-clip batch: 40 rows clean.
- **4 Sep, rung 1 closed: all authored suites portable, dunk from the capture.** Owner decisions (3 Sep): ship the corrected swings now; save the Pathway Map worksheet to the plan; make the remaining Euler suites portable through the builder. `bindFrame.ts` now defines a degree key as a rotation about the parent's bind axes from bind, used by both builders; a measured no-op on the shipped hero (every bind identity), the same movement on the candidate (bind rotations to 180°). New rig tests for locomotion, karate, board, dunk and football (17) found the jump, the dunk launch, the tomahawk, the eastbay and the live mocap dunk never raised the hands: their arm keys rotated about X, the arm's own axis. Those suites are re-authored as pose targets and the dunk is regenerated from `public/mocap/dunk.json` (wrists and ankles as hips-relative targets, baseline facing 107° removed). Shipped hero 36 suites / 238 tests; candidate 72 of 73 animation tests (mocap golf grip left). Sweep before the change: 40 rows clean, no regressions. Still to see with eyes: the dunk flight on the harness (the frame probe did not trigger the jump).
- **3 Sep, rung 1: six authored suites on pose targets, both bodies.** Golf, tennis, volleyball, soccer, baseball and basketball are re-authored as pose targets and pass on the shipped hero and the MPFB2 candidate. Four things had to be true of the builder first, each measured, none guessed: (1) the two-bone solver solves in the rig's own frame, because the glTF root's handedness mirror turned large reaches the wrong way; (2) hand and foot targets scale about the shoulder or hip by limb length, because the candidate's arm is 10% shorter while its hips sit 5% lower; (3) a degree key rotates the bone about its parent's bind axes from bind, because the candidate's bones carry bind orientations and the same thigh degrees swung its kicking leg forward; (4) bind comes from the skeleton's rest matrices, because a clip built while the rig was still posed baked that pose in as zero. Also found: the torso yaw sign was backwards in every suite (+yaw turns the right shoulder forward), so backswings turned the chest toward the ball; fixed and pinned by tests. Left on the candidate: the mocap grip (D-M1), and the un-migrated locomotion, combat, board and dunk suites, which have no rig tests yet.
- **3 Sep, rung 1 landed.** The two-bone solver was turning large reaches the wrong way under the glTF root's handedness mirror; it now solves in the rig's own frame. Pose-target clips author on world axes from the root; golf passes on both bodies (shipped and MPFB2 candidate). The candidate plays golf on the dev harness through `?hero=` with no frame-guard hits, no missing clips, no errors at 60 fps; its cold first load was 8.0 s against the shipped hero's 2.1 s and is the next number to bring inside the 3 s warm budget. Remaining candidate-body failures: 12, all in suites not yet migrated (baseball, basketball, tennis, one mocap grip). Also landed today, outside this pass: the owner's Camp Blueprint curriculum into `/camp`.
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
