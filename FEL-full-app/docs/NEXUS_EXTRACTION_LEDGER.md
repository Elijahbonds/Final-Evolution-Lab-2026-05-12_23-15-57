# Nexus extraction ledger

Opened 2026-09-04 by the ledger lane of the orchestrated pass 4 run (`docs/CONTRACTS-PASS4-RUN.md`).

**The ship firewall.** FEL ships first. Nexus — the shared engine/venue layer — is extracted AFTER v1; Cell last.
Nothing in pass 3, pass 4 or this run builds engine/editor/orchestration abstractions. This file is where the
reusable patterns go instead: as notes, with the exact files they live in today, so the extraction is a read of
this ledger rather than an archaeology of the modes. Every entry below was verified in the code on `lane/ledger`
(HEAD `476cfc2`) before it was written; file paths are relative to `FEL-full-app/`.

Entry shape: **pattern** · files · why it generalises beyond FEL · what must be frozen as a contract to extract it.

---

## 1. Spec-first venue mount with kit fallback

- **Files**: `lib/babylon/core/NexusVenue.ts` (`mountVenue`, `venueBounds`, `ROUTE_TO_VENUE`, `VenueHandle`);
  `lib/babylon/nexus/venueSpecs.ts` (`VENUE_SPECS`, `VENUE_MAP_KEYS`, `specFor`); `lib/babylon/nexus/NexusWebScene.ts`
  (`buildNexusScene`). Callers: `lib/babylon/modes/OneVOneMode.ts:182`, `ThreeVThreeMode.ts:124`, `DunkMode.ts:147`,
  `KarateVSMode.ts:228`, `ShowdownMode.ts:275`, `precisionModes.ts:432/717/981`.
- **What it is**: one call, `mountVenue(ctx, venueId, { keepGameplayCamera })`, builds a typed venue spec (ground with
  painted markings, props, crowd tiers, lighting, optional baked map) under one root, hands the camera its bounds
  (`setBounds`, the ground box ∪ the map's measured walkabout AABB), loads the venue's props and navmesh async, and
  returns a handle whose `dispose()` is total. Returns `null` with a warning when no spec exists, and every caller has
  the same shape: `venue = mountVenue(...); if (!venue) VenueKit.buildX(...)` — losing scenery is a downgrade, losing
  the mode is an outage. Golf is the documented exception (spec for sky/props/bounds, kit for the ground).
- **Why it generalises**: any multi-mode 3D product has the "venue wired into nothing" failure and the three invisible
  omissions the file header names (camera bounds, placeholder bodies, incomplete disposal). The spec-as-TypeScript
  decision (no JSON boundary to drift; `tsc` is the validator) is a Nexus decision, not an FEL one.
- **Freeze to extract**: (a) the `NexusWebSpec` shape — `ground.size/offset`, `mapKey`, actors, props, environment;
  (b) the structural `VenueCtx` (scene, canvas, `camDirector.setBounds/invalidateBounds`) so the venue layer never
  imports the harness; (c) the `VenueHandle` surface (`nav`, `constrain`, `hidePlaceholders`, `dispose`);
  (d) the rule that `keepGameplayCamera` defaults OFF and venue cameras are scenery (M104); (e) `venueBounds` as the
  ONE derivation of the camera box, pinned by `scripts/venue-bounds-tests.ts` (two independent calculations of the
  same rectangle disagreed the moment a ground gained an offset).

## 2. Prop loader: one GLB per scene, per-venue placement tables, a placement test

- **Files**: `lib/babylon/visual/VenueProps.ts` (`loadModel`, `mountVenueProps`, `propSetFor`);
  `lib/babylon/visual/venuePropSets.ts` (`VENUE_PROP_SETS`, `ring`, `line`); `lib/babylon/visual/venuePropSets.test.ts`;
  `scripts/venue/curate-props.mts` (`VENUE_PROPS`, writes `public/models/props/manifest.json` with the licence).
  Direct callers outside the spec path: `lib/babylon/modes/SkateRunMode.ts:101`, `SurfBreakMode.ts:106`,
  `SnowboardSlalomMode.ts:110`, `AirSessionMode.ts:124`.
- **What it is**: a `WeakMap<Scene, Map<key, Promise<Mesh[]>>>` cache so each unique model is imported once per scene
  and the source stays disabled while `createInstance` copies repeat it under a holder node (position/yaw/uniform
  scale). Placement tables are data (metres in the venue frame) with two generators (`ring`, `line`). Unlit
  (`KHR_materials_unlit`) kit materials are switched to lit PBR so they sit in the IBL. A test pins every named model
  file to disk, every placement outside a per-venue play rectangle, and coverage of every venue key a mode mounts.
  A curation script copies only used models out of the tool kits and records CC0 in a manifest.
- **Why it generalises**: instance-per-scene caching, data placement, and a "props never enter the play area" test are
  engine-agnostic. The curate → manifest → runtime path is the general shape of a licensed-asset pipeline.
- **Freeze to extract**: `PropPlacement { kit, model, at, yaw?, scale? }`; the asset URL layout
  `public/models/props/<kit>/<model>.glb` plus `manifest.json`; the play-rectangle table in the test (today it is
  hand-typed in `venuePropSets.test.ts` — an extraction should derive it from the spec ground or the navmesh core);
  the `propsGone` race guard (a load that resolves after `dispose()` must dispose itself), which every caller repeats
  by hand and should be inside the loader.

## 3. Offline navmesh bake with a merged play core; dependency-free runtime

- **Files**: `scripts/venue/navmesh-gen.mts` (`PLAY_CORE`, the mounter-equivalent transform, Recast params, CCW
  orientation); `lib/babylon/core/NavBounds.ts` (`NavBounds.load/contains/constrain`, `inside`, `closestOnSegment`);
  `lib/babylon/core/NavBounds.test.ts`; `scripts/probes/_navmesh-holes.mts`; output `public/models/navmesh/<mapKey>.json`
  (ten files, 52 KB). Consumers: `OneVOneMode.ts:141/146`, `ThreeVThreeMode.ts:271/327/360`, `KarateVSMode.ts:90/308`,
  `ShowdownMode.ts:179/399/431`.
- **What it is**: `recast-navigation@0.43.1` is a DEV dependency; the bake applies the exact runtime transform
  (glTF x-mirror → `mapRotationY` → `scale` → `mapOffset` → `surfaceY` drop, mirroring `visual/VenueMaps.ts:67-71`)
  and writes convex CCW polygons in world x/z metres plus a grid cell size. A **regulation play core** rectangle per
  map is merged into the bake because Recast erodes the mesh under anything below head height (rim assembly, dojo
  pillars) — the mesh contributes the walkable area BEYOND the core. The runtime is ~60 lines: grid-indexed convex
  polygons, half-plane inside test, nearest-edge projection; no WASM in the browser. The mode pattern is
  `if (!venue?.constrain(pos)) boxClamp(pos)` (navmesh first, typed box when no map) — with karate VS as the
  measured exception (floor AND arena box, because the alcoves past ±4.5 m box the fight camera in).
- **Why it generalises**: any scanned/authored map needs bounds; "bake offline with the heavy library, ship polygon
  data, constrain with your own point test" is the general shape. The lesson recorded on the dojo core — size the
  core to the CLEAR floor the map actually has, then let the mesh add, never the other way round — is a Nexus rule.
- **Freeze to extract**: `NavMeshData { mapKey, cell, polys: {pts}[], bbox }` (CCW, convex, metres); the transform
  order shared by bake and mounter (today duplicated in two files — the extraction should make `VenueMaps` and the
  bake read ONE function); the `PLAY_CORE` table as spec data rather than a script constant; the hole probe's
  0.5 m sampling as the acceptance test (0 % uncovered over every gameplay rectangle).

## 4. Measured camera-framing table and probe

- **Files**: `lib/babylon/config/cameraFraming.json` (`modes.<registryKey>.{fraction,min,max,samples,viaHero,camDist?,note?}`,
  `medianAcrossModes`, `viewport`, `probe`); `scripts/probes/_cam-frame.mts`; the `window.__FEL_DEV__.hero` handle
  set in `lib/babylon/core/ModeHarness.ts`; read by `scripts/full-picture.mts` (camera column).
- **What it is**: the hero's on-screen height as a fraction of viewport height under the GAMEPLAY camera, six samples
  over three seconds at 1280×800, projecting the skinned meshes' world bounding boxes through the scene transform.
  Prefers the harness's hero handle, else the skinned character nearest the camera target. Also reports
  camera-to-hero distance, which turned "three-point frames too close" into "the camera box pins it at 4.04 m".
  The file's `_comment` records that `cameraPresets.json` describes retired venue cameras (pre-M104) — the survey
  found six "missing presets" were a stale artefact and two modes (tennis, volleyball) were rendering through the
  venue orbit camera.
- **Why it generalises**: "values are MEASURED, never typed" for framing is a reusable discipline; the probe needs
  only a scene, an active camera and a way to name the subject.
- **Freeze to extract**: the JSON schema above; the `__FEL_DEV__ { scene, modeId, hero }` dev handle as the probe's
  contract with the harness; the sample protocol (viewport, count, interval) so numbers are comparable across products.

## 5. Frame-time-normalised asymmetric follow lag and whiskers

- **Files**: `lib/babylon/core/CameraDirector.ts` — `followLag()` (~line 467), the orbit/height lerp that consumes it
  (~432-455), whiskers inside `resolveOcclusion()` (~495-501), `setBounds/invalidateBounds/clampToBounds` (261-294),
  `PRESETS` (78-154); `lib/babylon/core/CameraStandoff.ts` (`enforceStandoff`).
- **What it is**: presets store a 60 fps per-frame lag fraction; `followLag` converts it to `1 - (1-lag)^(dt*60)` with
  `dt` capped at 0.1 s, then biases ×1.6 when catching up (subject retreating or gap > 1.5 m) and ×0.8 when settling —
  what a broadcast operator does. Whiskers: two ±18° side probes; if one side is closing and the other open, lean 8°
  toward the open side before the hard ±50° swing is needed. Orbit the ground plane, lerp the height (skate's
  ramp lesson). Occlusion probe ignores collision flags because kit walls carry none (E26).
- **Why it generalises**: every third-person follow camera has the 30 fps-lags-twice bug when lag is per-frame; the
  asymmetry and whiskers are sport-agnostic.
- **Freeze to extract**: the preset record shape (`distance, height, minHeight, pitchFloorDeg, pitchCapDeg,
  targetHeight, lag, lookAhead, fitTwo?, shoulderOffset?`) with `lag` DEFINED as a 60 fps fraction; the
  `CamBounds { minX,maxX,minZ,maxZ,minY }` contract shared with `NexusVenue`; the standoff/occlusion order
  (`enforceStandoff(clampToBounds(resolveOcclusion(desired)))`).

## 6. Quality tier stored on scene metadata

- **Files**: `lib/babylon/scene/QualityTier.ts` (`resolveQualityTier` pure, `detectQualityTier` browser wrapper,
  `tierRigSettings`, `mountSsao`, `OUTDOOR_MOODS`); `lib/babylon/scene/QualityTier.test.ts`;
  `lib/babylon/core/ModeHarness.ts:115-117` (`scene.metadata.felTier = tier`); readers `lib/babylon/core/CharacterLibrary.ts:223`,
  `lib/babylon/scene/LightRig.ts:28`; the perf lane's `playerIdentity.ts` (skin maps) per the run contract.
- **What it is**: a two-value tier (`'desktop' | 'mobile'`) decided once per harness from touch+coarse pointer, a
  phone-sized short edge (< 700 css px), or the canvas fit having already cut the backing buffer for fill rate — the
  same signal `canvasFit` uses, so the two policies cannot disagree. `NEXT_PUBLIC_QUALITY_TIER` overrides. The
  resolver is pure and unit-tested without a GPU; the decision is stored on `scene.metadata` so any later system
  (spawn, textures, light rig) reads it without a dependency on the harness. It announces itself (`[FEL-TIER]`).
- **Why it generalises**: the "decide once, stash on the scene, readers stay decoupled" shape and the pure
  resolver/thin detector split apply to any Babylon (or any engine) product. The shared canvas-fit signal is the
  non-obvious part worth keeping.
- **Freeze to extract**: the metadata key and type (`scene.metadata.felTier: QualityTier`) — frozen already by
  `docs/CONTRACTS-PASS4-RUN.md` §1; the `TierInput` fields; `TierRigSettings`; the skin-map size convention
  (`<key>.jpg` 2048², `<key>-1024.jpg` mobile) from contract §2; the texture-budget schema from contract §3.

## 7. Pose-target clip format and bind-relative keys

- **Files**: `lib/babylon/anim/poseClip.ts` (`PoseKey`, `buildPoseClip`, `REF_HIPS_Y`, `REF_ARM_LEN`, `REF_LEG_LEN`);
  `lib/babylon/anim/bindFrame.ts` (`bindFrame`, `keyed`, `keyedQ`); `lib/babylon/anim/authored/baseClips.ts` (the
  nine base clips built at spawn as world-space deltas on the bind frame); solvers `HandIK.ts`, `TwoBoneIK.ts`,
  `FootPlanting.ts`; `restPose.ts` (`buildQuatClip`, `eulerQ`).
- **What it is**: an authored clip stores what the author MEANT — per key, torso euler degrees plus hand/foot targets
  in body-local metres authored against a reference hips height and limb lengths — and is fitted at build time on the
  LIVE skeleton with the node-space two-bone solver; the resulting local quaternions become the keys. Targets scale
  by hips height and, per limb, by the limb-length ratio about the joint root. `bindFrame` defines a degree key as a
  rotation about the parent's BIND axes from bind (rest matrices), so the same degrees are a no-op difference on the
  shipped hero (identity binds) and the same movement on a rig with 180° bind rotations. Four measured rules live in
  the file: solve in the rig's own frame (handedness mirror), refresh world matrices parent-first, targets on world
  axes from the root, bind from rest matrices not the current pose.
- **Why it generalises**: body-independent authoring is the whole point of a shared character layer; it is what let
  one body swap (forge → MPFB2 kit) keep ~40 clips and made mocap retarget "match hand and foot paths". Owner-signed
  (2026-09-03, option B).
- **Freeze to extract**: the `PoseKey` schema; the reference constants (`REF_HIPS_Y 0.96`, `REF_ARM_LEN 0.54`,
  `REF_LEG_LEN 0.82`) as a named reference body; the Gate 0 bone vocabulary (Mixamo names, prefix-stripped);
  the rule "root translation is never carried — movement is code-driven"; the rig-test protocol of proving every
  clip on BOTH bodies (`FEL_HERO_GLB=…`).

## 8. MPFB2 body pipeline (Blender headless → contract GLB)

- **Files**: `scripts/avatar/mpfb/dress-kit.py` (macro bake into the basis, `Kit_<slot>_<itemId>` garments,
  `Hair_<key>` meshes, seven face targets as shape keys); `scripts/avatar/mpfb/dress.py`, `README.md`;
  `scripts/avatar/import-mpfb.mts` (prefix strip, fold extra joints into kept parents with weights re-summed,
  `bakeMeshToRest` A-pose→T-pose from mixed-weight centroids, garments OPAQUE, material contract names, WebP/quantize);
  `scripts/avatar/check-bind.mts` (mesh-vs-bind joint check); `scripts/avatar/roster-from-kit.mts` (eight rivals
  derived offline); `scripts/avatar/skins/export-skins.mts` → `lib/babylon/core/skinLibrary.ts` (generated);
  runtime `lib/babylon/core/kit.ts` (`applyKit`), `hairStyles.ts`, `playerIdentity.ts` (`applySkinMap`, `felSkinUV` gate).
- **What it is**: a reproducible, offline, CC0 human pipeline whose output obeys the FEL material/bone contract.
  The gotchas it encodes are all measured: Blender drops shape keys when it applies modifiers (so nothing is applied
  at export and helper geometry is deleted by vertex after targets load); the macro mix must be baked into the basis
  or both sexes export the same body; the mesh exports undeformed in an A-pose under a T-pose rig, so the import
  rebuilds the A-pose skeleton from the mesh and skins into rest; garment maps carry low alpha and must be OPAQUE;
  bone-length retention cannot see a pose mismatch — the gate also needs `check-bind`.
- **Why it generalises**: any product that needs a fitted, dressed, skinned human from free sources will hit the same
  five walls. The "runtime shows one mesh per slot, hides the rest" convention for kit and hair is a cheap wardrobe
  system with no material swapping.
- **Freeze to extract**: the material name contract (`skin / jersey / shorts / shoes / hair`, contract §7) and the
  mesh name contracts (`Kit_<slot>_<itemId>`, `Hair_<key>`); the `felSkinUV: 'makehuman'` extras flag; the kept-bone
  list `FEL[]` in `import-mpfb.mts`; the gate sequence (rig audit → check-bind → rig tests on both bodies → gauntlet).
  The user-data path in `dress-kit.py` is a machine absolute path (`/Users/elijahbonds/...`) — must become a parameter.

## 9. Logged-in play-route probes

- **Files**: `scripts/probes/_session-e2e.mts`; `scripts/probes/_pause-overlay.mts`; `scripts/probes/_db-today.mts`;
  the `LOGIN=1` block in `scripts/capture-mode-play.mts`; `scripts/probes/_vram-diag.mts` (same launch shape, `TIER=mobile`).
- **What it is**: Playwright-core with the real Chrome for Testing binary on Metal/ANGLE; authenticates with the
  NextAuth credentials callback via a request context, copies cookies into the page context, opens `/play/<route>`
  (NOT `/dev/mode/<key>` — the dev harness renders no game component, so a first pause probe there proved nothing),
  drives the READY gate with `j`, and asserts on either network (`POST /api/sessions` 200, analytics) or DOM text
  (`PAUSED` appears then clears). One probe per proposition; each prints one line per route.
- **Why it generalises**: proving wiring "from a real run" rather than from a matrix is the phase 8 lesson; the
  login-then-drive shape is reusable for any Next.js + Babylon product with a session.
- **Freeze to extract**: the playtest user convention (`playtest@fel.local`, env-overridable); the input contract
  the probes rely on (`j` = A, `Escape` = START, READY gate + 3-2-1); the `__FEL_DEV__` handle; the Chrome launch
  args. The executable path is hard-coded to a `chromium-1234` cache dir in five scripts — one shared launcher module
  is the first extraction step.

## 10. Full-picture matrix generator

- **Files**: `scripts/full-picture.mts` → `docs/SHIP-PASS-4-MATRIX.md` (26 gaps at HEAD).
- **What it is**: derives one row per registry mode by pattern over SOURCE TEXT (no app imports, runs in a second):
  venue spec → map key → baked file present, kit builder, movement cores, measured camera framing, typed clamps (and
  whether the mode is navmesh-first), phone bridge, gauntlet membership, play sweep, concept lock, test scripts,
  line count. Judges a shared file by the mode's own `export const` slice (derby had been reading golf's mount).
  The gap list IS the backlog.
- **Why it generalises**: a "what actually exists per mode" matrix that cannot lie because it reads the code is the
  right first phase of any convergence pass; the structure (registry × capability columns) transfers.
- **Freeze to extract**: the registry shape it parses (`key: ClassMode,` rows, `ENABLED_BABYLON_MODES`), the
  `ROUTE_TO_VENUE` / `VENUE_MAP_KEYS` tables, and the mode-file convention (one class per file, or `export const`
  slices). Known blind spot to record: it cannot see venues mounted by a shared base (board modes via `BoardRunMode`).

## 11. The gauntlet: regression-only sweep with a drift tripwire

- **Files**: `scripts/gauntlet.sh`; `scripts/capture-mode-play.mts` (`FEL-FRAME | MISSING CLIP | errors` line,
  `TIER=mobile`, `LOGIN=1`, `THROTTLE`); `scripts/capture-mobile-touch.mts`; `scripts/headless-checks.suite.test.ts`
  (each standalone `tsx` suite run as one vitest test, its "N checks green" count parsed).
- **What it is**: tsc + vitest + 21 dev-mode rows + 3 logged-in rows + 7 mobile-tier rows + 7 phone rows, one
  compact table, then a `diff` against `latest.txt` with perf numbers stripped so only status changes print. A
  tripwire prints a WARNING when `public/models/maps/baked` drifts during a sweep (the unidentified writer, see
  backlog). Word-splitting is `$(printf …)` so it runs under bash AND zsh (the `${=r}` form silently dropped seven
  rows under bash).
- **Why it generalises**: "report regressions only" is what makes a `/loop` sweep readable; the per-family sampling
  (one mode per family for the expensive rows) is the cost model.
- **Freeze to extract**: the result-line grammar the captures print; the `GAUNTLET_DIR/latest.txt` baseline
  convention; the family table.

## 12. Smaller patterns, noted for the extraction

- **Anime ink behind fitted cloth** — `lib/babylon/visual/AnimeInk.ts:54-55`: inverted hull with `zOffset -12 /
  zOffsetUnits -48` pushes every hull behind the surfaces it wraps so garments win and the contour stays at the
  silhouette. Contract: outline is a post-geometry pass; garments are OPAQUE.
- **Measured map placement** — `lib/map-data.ts` `MapConfig.surfaceY` (never guessed; `scripts/map/measure-surface.mts`)
  and `boundsMin/Max`; `visual/VenueMaps.ts` applies them. This is the transform the navmesh bake mirrors (entry 3).
- **Skin family by tone luminance** — `playerIdentity.ts` `skinFor/applySkinMap`: pick the map family by luminance,
  set albedo to tone ÷ map mean, clamp 0.35–1.25; gated on `felSkinUV`. Generalises to any photographed-skin library.
- **Base clips as spawn-time builds** — `anim/authored/baseClips.ts`: registry-name hits beat baked clips, so the
  runtime is the single source of truth for the nine gameplay clips on any Gate-0 body.
- **Dead-twin discipline** — `docs/SHIP-PASS-4.md` phase 2: the registry serves `SkateRunMode` / `SnowboardSlalomMode`
  / `SurfBreakMode` / `precisionModes`; `BoardRunMode.ts`, `GolfMode.ts`, `BaseballMode.ts`, `SoccerMode.ts`
  are twins nobody mounts. Rule for extraction: the registry is the only truth; delete or mark twins before lifting.
- **Pause overlay convention** — `ModeHarness.ts:277-278` (START pauses, any button resumes) with each of the 16
  game components drawing "PAUSED — TAP TO RESUME"; the shell (`GameShell`) owns title/venue/controls. An extraction
  moves the overlay into the shell once so components stop repeating it.

---

## Run log (what the other lanes add)

Appended every ~10 minutes while the run is live; see also `docs/BACKLOG.md` for what a lane reports it did NOT do.

- **15:03** — lanes `verify`, `perf`, `rc` all at `476cfc2` (the contract freeze); no lane commits yet.
- **15:07** — still no lane commits; working trees read (uncommitted, so provisional). Every file touched is inside its
  lane's owned set. Reusable already:
  - **verify** — `scripts/perf-budget-tests.ts`: the gate computes the median FROM THE ROWS and requires the recorded
    `median` to agree within 0.1 MB, so a stale field cannot hide a heavy mode; `measuredAt` must be a date ("an
    unmeasured table is not a pass"); the mobile column must list at least as many modes as desktop. Pattern for any
    budget table: **re-derive the summary, never trust it.** `lib/babylon/core/playerIdentity.test.ts` is a pure-function
    contract test (`skinMapUrl(url, tier)`) written BEFORE the perf lane exports the function — the test fails to compile
    until the implementation lands. Pattern: **the test is the contract, the compile error is the hand-off.**
  - **perf** — `scripts/probes/_vram-diag.mts` grows a sweep mode (`MODES=all TIERS=desktop,mobile OUT=…`) that writes the
    frozen `textureBudget.json` schema, reads the enabled-mode list off `registry.ts` SOURCE so the sweep cannot drift from
    `ENABLED_BABYLON_MODES`, warns when the page reports a different tier than requested, and preserves fields other
    steps wrote to the same file (`existingExtras`). Pattern: **probe → frozen-schema table → test**, with the schema
    frozen in the contract doc first. Also reads `scene.metadata.felTier` directly (contract §1 honoured).
  - **rc** — `scripts/rc-checklist.mts`: a read-only gate table (tsc, vitest, texture budget, latest gauntlet run's
    non-clean rows, git HEAD + rc tag) where "every number printed is measured here and now — nothing is read from a
    doc"; `scripts/prod-serve.sh` takes a port argument with LOG/PID following the port (contract §6 ports). Pattern:
    **the RC gate is a script, not a checklist page.** `docs/CHANGELOG.md` is being rewritten per phase with commit shas
    and measured numbers, and states which phases are OPEN (4, 5) — the changelog as a ledger of measurements.
- **15:09** — `lane/verify` `bd3284e` "failing tests first — texture budget gate and skinMapUrl": exactly the two files
  read at 15:07 (`scripts/perf-budget-tests.ts` +118, `lib/babylon/core/playerIdentity.test.ts` +55); both inside the
  lane's owned set; `docs/GATE0-REPORT-2026-09-04.md` not yet written. Commit records the count as the rules require:
  budget test 2 FAILED of 4 on today's stub (`measuredAt` null, no modes); full suite 39 files / 253 tests intact plus
  the 6 new `skinMapUrl` cases red until `lane/perf` exports the function. Reusable: **red-first hand-off** — a lane
  commits a failing test against a frozen contract and names in the message which other lane turns it green.
- **15:12** — `lane/verify` `62e9777` "Gate 0 report for 2026-09-04": one file, `docs/GATE0-REPORT-2026-09-04.md`
  (+156), owned. Verdict PASS on contract 5 as `scripts/gate0-rig-tests.ts` enforces it (58 checks on the procedural
  default rig), with every number next to the command that printed it. Reusable:
  - **A gate report is a command table** — `| # | command | exit | printed result |`, ten rows, nothing estimated; the
    rig-test inventory is found by `grep -rl 'mixamorig'`, not remembered. Pattern for any Nexus gate report.
  - **Measure the gate's blind spots, not just its verdict** — the report shows `Gate0Validator.validateSkeleton` is
    never run against a GLB skeleton anywhere in the suite (every shipped body is 22 joints, 0 prefixed), and that
    `hasTPose` is a root-XZ check while the pose gate measures bind vs load state. A contract can PASS on the rig the
    test builds and say nothing about the rigs the app renders — the extraction should make the Gate 0 validator run
    on the LOADED skeleton (the `gateContainerRig` path) so the two Gate 0s become one.
  - **A ratio gate needs a minimum row count** — with two rows the 2×-median rule cannot flag the 168 MB mode
    (median 104, ceiling 208); a third row near 40 MB drops the median to 40 and trips it. Freeze a minimum mode count
    into `perf-budget-tests.ts` (or the contract) before the table is trusted.
- **15:18** — ten-minute check. Branches: verify 2 commits (above); perf and rc none yet. Working trees (uncommitted,
  provisional), all inside owned sets: perf `CharacterLibrary.ts`, `PerfMonitor.ts`, `playerIdentity.ts`,
  `scripts/avatar/import-mpfb.mts`, `_vram-diag.mts`, new `public/models/fel-hero.mobile.glb`; rc `CHANGELOG.md`,
  `prod-serve.sh`, new `docs/RC-2026-09-04.md`, `scripts/rc-checklist.mts`. `textureBudget.json` is still the null
  stub on `lane/perf`. Reusable from the perf lane's diff:
  - **Count GPU memory from the engine's cache, not `scene.textures`** — `PerfMonitor.textureMb()` now walks
    `engine._internalTexturesCache`, skipping render-target sources (5, 6, 12, 14: shadow maps and post-process
    targets belong to the tier, not the mode). Measured reason: an `AssetContainer`'s maps are uploaded at load but
    never appear in `scene.textures` (the hero GLB's 96 MB read as 0 in every mode), and `Material.clone()` pushes a
    Texture sharing one GPU texture (a logged-in dunk read the hero twice). Falls back to `scene.textures` on
    NullEngine. Contract to freeze: the vram number's definition — the probe and the HUD must count the same list.
  - **Tier variant of the default body with a never-brick fallback** — `heroUrlForTier()` swaps ONLY the default hero
    URL for `/models/fel-hero.mobile.glb` on the mobile tier (a `?hero=` override or an explicit body loads as asked);
    `loadHero()` falls back to the requested file if the variant fails ("a texture variant can never brick a spawn —
    the roster's rule"). The variant is made by `import-mpfb.mts <in> <out> --textures-only` (skin 1024², every other
    map 512²): same nodes, joints, weights, morphs, clips. Contract: variant files are textures-only derivatives;
    the `.mobile.glb` suffix; the tier read from `scene.metadata.felTier` (contract §1).
  - `skinMapUrl(url, tier)` exported exactly as the verify lane's red test specified (idempotent on `-1024.jpg`,
    non-`.jpg` passes through) — the red-first hand-off closing from the other side.
