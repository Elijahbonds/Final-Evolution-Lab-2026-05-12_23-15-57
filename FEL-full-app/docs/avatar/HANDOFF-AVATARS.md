# HANDOFF — Avatars, venue maps, and sky domes: the asset pipelines

This doc is the entry point for anyone continuing avatar or environment work.
Read it before touching `public/models/`, `public/backdrops/`, `scripts/avatar/`,
`scripts/map/`, `scripts/backdrop/`, `CharacterLibrary`, `VenueMaps`, or
`NexusWebScene`'s sky.

**State of the world (2026-05): the Meshy hero avatar is RETIRED. The T-pose
is RESOLVED at the root. All avatars and all venue environments now come from
pipelines we own.**

## 1. The T-pose: root cause and resolution

Two separate defects produced the same symptom (bind-pose characters):

1. **The Meshy `elijah-hero.glb` baked clips were scrambled.** A NullEngine
   probe (2026-05) measured its `run` clip with hands above the head — the
   clip data itself was garbage, not the runtime. An asset we cannot author
   is an asset we cannot fix, so the asset was retired, not patched.
2. **Babylon's glTF loader initializes every animated node's TRS from the
   FIRST FRAME OF THE FIRST ANIMATION in the file.** Whatever clip sits at
   index 0 defines the loaded rest state. Any GLB whose first clip is not an
   arms-down idle will load in that clip's first pose. This is why the forge
   ships `idle_stand` first and why the pose gate (below) checks load state,
   not just clip content.

The fix is the forge: a procedural avatar authored entirely in code, so every
future issue is debuggable source, not a black-box export.

## 2. The avatar pipeline (forge → gate → roster → runtime)

```
npx tsx scripts/avatar/forge.mts          # → scripts/avatar/out/fel-hero.glb
npx tsx scripts/avatar/validate-pose.mts  # pose gate — must pass before ship
npx tsx scripts/avatar/roster.mts         # → public/models/athletes/{atlas,blitz,nova,titan}.glb
```

**Forge** (`scripts/avatar/forge.mts`) builds `public/models/fel-hero.glb`
from nothing but code:

- 22 required bones from `docs/avatar/AvatarSkeletonSpec.md` (LOCKED),
  UNPREFIXED, identity rest rotations, translations only. A rotation about +X
  does the same thing on every bone — no per-rig sign tables, ever.
- Bind pose == node rest == skin bind (IBM = translate(−bindPos)). No
  divergence between node TRS and skin matrices — that divergence was the
  Meshy failure mode.
- Clip poses are authored as WORLD-space rotation deltas per bone ("thigh
  forward 45°"), converted to bone-local quats against our own hierarchy.
- 10 authored clips; `idle_stand` is FIRST (see §1 — its first key is the
  loaded rest state). Loop flags and durations live in the emitted
  `fel-hero.json` manifest.
- Segmented, clothed humanoid geometry — no naked base mesh.

**Material name contract — do not rename:** `skin` / `jersey` / `shorts` /
`shoes` / `hair`. Character customization and the athlete roster key off
these names. Rename one and both break silently.

**Pose gate** (`scripts/avatar/validate-pose.mts`, mirrored by
`scripts/avatar-pose-tests.ts` in the vitest suite): loads the GLB in a
NullEngine and asserts clip poses are anatomically sane (joint angles within
human ranges), the bind is a T-pose, and the LOAD STATE is arms-down. A
frozen or scrambled asset fails the build.

**Structural gate** (`scripts/avatar-pipeline-tests.ts`, also in the suite):
spec bones, float32 skins, no required draco, meter-scale translation tracks,
manifest coverage — hero + all four athletes.

**Roster** (`scripts/avatar/roster.mts`): bakes the four named athletes as
forge variants (proportions × kit colorway). Runtime:
`lib/babylon/core/athleteRoster.ts` + `CharacterLibrary.spawn` — a spawn that
requests the hero URL AND passes a `tint` (the universal "not the player"
signal) is redirected to a deterministic roster pick; kit color is baked, so
runtime tint is skipped on a swap. Roster load failure falls back to the
requested URL — the roster can never brick a mode. `HERO_URLS` includes the
old `elijah-hero.glb` paths so stale call sites still route to the forge
hero.

**Identity pipe**: `lib/babylon/core/playerIdentity.ts` `applyIdentity` maps
a player's saved look (skin tone, jersey/shorts/shoes colors, jersey number)
onto the named materials of any GLB hero spawn. The same pipe runs in game
and in the Closet preview — a color that looks right in the Closet cannot
look different in a mode.

## 3. The Closet (character customization)

`components/closet/avatar-preview.tsx` is a live 3D preview: the forged hero
wearing the draft look, driven through `applyIdentity`. The full editor
(`app/closet/page.tsx` + `components/closet-view.tsx`) covers skin tone, face
shape, hair style/color, eye shape/color, headwear, tops, shorts, shoes,
accessory, and card skins. Verified live (2026-05): preview renders arms-down,
zero console errors.

Anyone can create a model in the Closet and it is usable in every mode,
because the preview and the game share one model, one skeleton, and one
identity pipe.

## 4. The map pipeline (Meshy venue GLBs → environments)

```
npx tsx scripts/map/pipeline.mts [map-key ...]   # → public/models/maps/baked/
```

The Meshy venue GLBs never rendered in EITHER stack: every one required
extensions Babylon does not ship (`EXT_texture_webp` on all,
`KHR_draco_mesh_compression` on most). The pipeline decodes draco on ingest
(draco3dgltf), transcodes WebP → PNG/JPEG (sharp), measures bounds/tris/
textures into `manifest.json`, and REJECTS maps with no textures (an
untextured Meshy map renders as grey soup). Output GLBs need no runtime
extensions at all.

**Bake results:** 12 of 15 maps baked. Rejected (no textures): gridiron,
neuro-arena, sand-court. If those venues want real maps, re-export from the
source with textures and re-run.

**Runtime:** `lib/babylon/visual/VenueMaps.ts` mounts a baked map per venue
(`VENUE_MAP_KEYS` in `lib/babylon/nexus/venueSpecs.ts`) and stands down the
procedural ground. `lib/map-data.ts` scale/offset/rotation/surfaceY fields
are authoritative for placement; `components/three/map-loader.tsx` applies
the same surfaceY shift so both stacks agree.

**`venice-blacktop` is baked but NOT mounted** (removed from VENUE_MAP_KEYS):
its painted court is off-centre and no offset put players on it (best attempt
left characters on a railing over water). onevone/dunk keep the verified
procedural court. Do not re-mount without a court-mesh relocation pass.

## 5. surfaceY calibration (how maps get aligned — never guess)

`floorY` is a gameplay invariant (0) consumed across the whole THREE stack.
Never change gameplay to fit a map — shift the MAP mesh:
`VenueMaps`/`map-loader` set `position.y = (mapOffset.y ?? 0) − (surfaceY ?? 0)`.

`surfaceY` values in `lib/map-data.ts` are MEASURED, not tuned by eye:

```
npx tsx scripts/map/measure-surface.mts [key ...]
```

The probe loads each baked map under the exact runtime transform and
brute-force raycasts world-space triangles (Möller–Trumbore, double-sided).
Three traps it exists to defeat:

- **Negative-determinant picking bug.** The glTF root carries scale
  (1,1,−1) (handedness flip). Rendering is fine, but Babylon's
  `scene.pickWithRay` misses EVERY triangle in both directions. All
  measurement must use manual world-space casts. Do not "simplify" the probe
  back to `pickWithRay`.
- **The roof trap.** Enclosed maps (dojo, shop, gymnastics) return the roof
  as the first down-cast hit. The probe collects ALL hits per cast,
  histograms into 0.25 m bands, and takes the densest band in the gameplay
  window [−4, +3]. Sub-case: when a building sits on terrain, the terrain
  band (0.0) beats the floor band — the dojo's tatami platform was the
  1.3–1.5 bands. Verify visually after setting.
- **Continuous slopes have no dense band.** mountain-slope's densest band
  was the −6 m valley floor, not the slope — it deliberately has NO surfaceY
  (its mode uses a custom scene builder anyway).

Re-run the probe after ANY change to a map's scale/offset/rotation. The probe
measures raw surface height; it does not subtract existing surfaceY.

**Mounted map keys** (`VENUE_MAP_KEYS`): basketball_3v3→venice-blue-court,
skateboarding→venice-skatepark, tennis→tennis-court, soccer→soccer-stadium,
baseball→baseball-park, golf→coastal-links, karate_h2h/karate_endless/
gymnastics→dojo, snowboarding→mountain-slope, surfing→surf-break,
market_browse→shop. Note: skateboard/snowboard/surf/golf/derby/gymnastics
modes use custom scene builders and currently ignore mapKey — extending real
maps to them is deferred (their scenes are mode-specific geometry, not venue
shells).

**M12.2 matte treatment** (ported THREE→Babylon in `VenueMaps` for
`matteFloor` maps): roughness 0.96, metallic 0, environmentIntensity 0.02,
emissiveTexture ← albedoTexture at intensity 0.3. Known cosmetic residual:
blue-court foreground still reads somewhat glossy-dark — acceptable, not
blocking.

## 6. The backdrop pipeline (Meshy environment art → sky domes)

```
npx tsx scripts/backdrop/pipeline.mts   # → public/backdrops/baked/
```

The venues' hand-painted sky gradients read as *diagrams* of the Meshy
reference art (`public/backdrops/*.jpg`), not as the art. The pipeline
re-projects each source image onto the sky-dome contract — 1024×512
equirect-ish wrap, horizon at v=0.6 (row ≈307), seam-mirrored right edge,
fade to venue ground tone below the horizon — with a gentle grade so it
survives emissive rendering. Output: `baked/<kind>.jpg` + `manifest.json`
(8 kinds: beach, city, dojo, links, mountains, neon, ocean, stadium).

Runtime: `NexusWebScene` prefers the baked dome when the manifest lists the
venue's backdrop kind; the procedural `paintBackdrop` stays as fallback. The
old double-mount bug (`bk_dome` fully occluded by `nexus_sky`) stays fixed:
`mountBackdrop` stands down when `nexus_sky` is present.

## 7. Retired assets and orphaned clips

- `elijah-hero.glb` — RETIRED (scrambled clips). Not referenced by any
  shipped spawn; the roster's HERO_URLS entry exists only to catch stale
  call sites. Do not resurrect it; forge instead.
- 3 map GLBs rejected by the bake (§4); venice-blacktop baked but unmounted
  (§4).
- 13 clip GLBs remain orphaned (football_*, skate/snow/surf tricks,
  tennis_serve, volleyball_spike, npc_*). Candidates for retarget-on-rig via
  `scripts/avatar/pipeline.mts` if those sports want baked trick clips — but
  vet clip content with the pose gate first; baked external clips are what
  burned us.

## 8. Verification status (2026-05, this pass)

- `npx tsc --noEmit` clean; `npx vitest run` 83/83 green (includes
  avatar-pipeline + avatar-pose gates).
- Closet verified live on :3002: 3D preview renders arms-down, full option
  set, zero console errors.
- Venue sweep verified live on :3002 (`?agent=1` + screenshots): threevthree
  planted on matte blue court with aligned painted hoop; tennis correct;
  karate standing on the dojo tatami (surfaceY 1.4); onevone on the verified
  procedural court.

## 9. Playwright / tooling traps (this codebase, learned the hard way)

- esbuild `keepNames` injects `__name` into serialized functions — pass
  `page.evaluate` code as STRINGS, never arrow functions with TS annotations.
- Template literals eat regex backslashes; `\n` in page strings breaks — use
  `String.fromCharCode(10)`.
- `p.evaluate` accepts ONE arg (wrap in an object).
- NEVER call `getX().getBuffer()` chains unguarded inside GL draw hooks — an
  exception there kills the render loop and you will "measure" a frozen scene.
- Chrome binary: `~/Library/Caches/ms-playwright/chromium-1234/...` with
  `--use-gl=angle --use-angle=metal --enable-webgl --ignore-gpu-blocklist`.
  Import `playwright-core` (the only installed package), not `playwright`.
- Login: playtest@fel.local / playtest-local-only; agent state via
  `?agent=1` → `window.__NEXUS_AGENT__.host.scene`.
- tsx in this repo: static named imports from `.ts` files can fail
  ("does not provide an export") — use `await import('../../lib/foo.ts')`.
  `.mts` + top-level await forbids `__dirname`; use `process.cwd()`.
  Babylon NullEngine `ImportMeshAsync` needs a
  `data:model/gltf-binary;base64,...` URL (no file IO).
- Dev servers: :3002 = GLB path, :3001 = procedural, NEVER touch :3000
  (another session). ChunkLoadError = stale chunks: kill by PID, restart.
