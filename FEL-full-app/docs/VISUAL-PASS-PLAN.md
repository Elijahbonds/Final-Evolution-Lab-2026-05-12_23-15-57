# Visual pass plan — the shared look foundation, then every mode

Owner, after playing on a TV (2026-10-06): "all modes are going to need dense visual passes to make it feel more like a
Polished AAA Title."

This plan is the read-only visual audit of 2026-10-06, committed so the per-mode passes have one map. **Part A** is the
shared rendering foundation every mode inherits through `ModeHarness.mountMode`; **Part B** is the per-mode list. The
`visual-foundation` lane (docs/LANES.md) builds A9 items 1–7 in that order; the per-mode lanes take Part B afterwards and
build on what A9 leaves behind (tiers, grade owner, mood resolver, kicker light, glow include list).

Line numbers were read on 2026-10-06 and drift; search for the named symbol rather than trusting a line. Claims marked
"likely" were read off the code, not seen on screen — the visual-foundation lane verified the grade-ownership one
before fixing it (see its commit).

## Part A: the shared rendering foundation

All paths are relative to `FEL-full-app/`. Sizes: **S** is a day or less, **M** is 2–5 days, **L** is a week or more. **[CODE]** means code only, or reuses assets already in `public/`. **[ART]** needs new authored art, which can't be made in the cloud (no Blender here).

### A0. How every mode reaches the look stack
Every registered mode is a `ModeDefinition` (`lib/babylon/modes/registry.ts:34-96`). It mounts through `mountMode` in `lib/babylon/core/ModeHarness.ts:265-301`, always in this order:

1. `createEngine` (`core/createEngine.ts:30-52`). WebGL2 is the default. WebGPU is opt-in through `NEXT_PUBLIC_WEBGPU`, because `avatar/TintMaterialPlugin.ts` emits GLSL only.
2. `applyCanvasFit` (`ModeHarness.ts:270`).
3. `detectQualityTier`. The result is stored on `scene.metadata.felTier` (`:273-275`).
4. `mountLightRig(scene, def.mood, tier)` (`:283`).
5. SSAO, desktop only (`:286`).
6. `mountBackdrop` (`:290`), then `autoInk` (`:292`) and `CameraDirector` (`:294`).
7. `PerfMonitor(budgetForTier)` (`:301`). It is dev-only.
8. `def.load()`, which usually calls `mountVenue` (`core/NexusVenue.ts:163`) or VenueKit, then `liftBlackMaterials` and the opt-in IBL shadows (`:548-559`).
9. The render loop writes the impact and speed grade into `lights.pipeline.imageProcessing` (`:838-845`).

A mode only chooses five things: `mood` (a literal or a getter), `backdrop`, `camPreset`, what `load()` builds, and its VFX calls.

### A1. Engine, quality tiers and canvasFit

**What exists**
- There are only two tiers, `'desktop' | 'mobile'` (`scene/QualityTier.ts:22`). There is no low/mid/high tier, no runtime AdaptiveQuality (it is mentioned in `canvasFit.ts:81` but doesn't exist), and no user-facing graphics setting. The only override is the build-time env `NEXT_PUBLIC_QUALITY_TIER` (`QualityTier.ts:63`).
- Tier rule (`QualityTier.ts:46-52`): mobile if touch plus a coarse pointer, OR the short edge is under 700 px, OR `limitedBy === 'pixel-budget'`.
- canvasFit (`core/canvasFit.ts:26,36,63-91`): DPR is capped at 2 and backing pixels at 2.1M (about 1080p). It never goes below 1:1.
- **Bug that hits TVs and big screens directly.** The pixel-budget branch demotes any large or high-DPI screen to the *mobile* tier:
  - A 4K TV browser (CSS 1920×1080 at DPR 2), a 1440p monitor at full screen, or a retina laptop (1440×900 at DPR 2) all exceed 2.1M, so `limitedBy='pixel-budget'` and the tier becomes mobile.
  - `canvasFit.ts:83` then clamps back to 1:1, so a 3840×2160 CSS canvas still renders at full size, but with mobile effects.
  - The unit test only covers `limitedBy: null` for 1440×900 (`scene/QualityTier.test.ts:4`).
  - A phone mirrored or cast to a TV is the mobile tier upscaled.
  - So "played on a TV" very likely showed the mobile look.

**What each tier turns on** (`tierRigSettings`, `QualityTier.ts:84-94`, plus spawn-time checks)

| | mobile | desktop |
|---|---|---|
| Shadow map | 512, blur-ESM kernel 12 (`LightRig.ts:86-89`) | 4096; 4-cascade CSM with PCF (medium) on `OUTDOOR_MOODS` (goldenHour/daylight/alpine/nightGame; overcast is missing, `QualityTier.ts:73`), else blur-ESM kernel 24 |
| SSAO2 | off | on: ratio 0.5, 16 samples, radius 0.9, `forceGeometryBuffer` (`QualityTier.ts:104-117`) |
| Sharpen | off | on, edge 0.25 |
| Bloom scale | ×0.7 | ×1 |
| Hero GLB | `elijah-meshy.mobile.glb` (54k verts, 1K textures; `core/CharacterLibrary.ts:179-182`) | `elijah-meshy.glb` |
| Skin | no pore normal map, translucency 0.35 (`core/skinShading.ts:97-112`) | pore normal map, translucency 0.55 |
| Hair anisotropy | off | on (`skinShading.ts:134`) |
| Secondary motion / foot planting | 0.6 intensity | 1.0 (`CharacterLibrary.ts:373-380`) |
| Perf budget | 600 draws / 400 meshes / 256 MB (`core/PerfMonitor.ts:37-55`) | 1600 / 900 / 512 MB (`:56-58`) |

Both tiers get ACES, bloom, FXAA, vignette, the procedural IBL, ink outlines and the painted backdrop. A handful of modes read the tier for VFX density: precision, net, snow, karate and football (`ctx.lights.tier`, or `touchOnly` in snow).

### A2. Post-processing
There is one `DefaultRenderingPipeline('fel_pipeline', hdr=true)` per mode (`scene/LightRig.ts:131-148`). It runs:
- ACES tone mapping;
- exposure and contrast per mood;
- bloom (threshold, weight and scale per mood);
- FXAA, plus sharpen on desktop;
- a mood-tinted vignette.

Runtime writers:
- `flashBeat()` raises exposure ×1.35 and decays (`:155-170`). Its callers are the momentum tier sting (`ModeHarness.ts:440-447`) and ThreePoint.
- `ImpactFrame` dips exposure and closes the vignette on every `ctx.feel.impact` (`core/ImpactFrame.ts:42-46`, `ModeHarness.ts:429,838-845`).
- The speed vignette (`ImpactFrame.ts:55-65`) is only reported by the racing modes.

**Missing anywhere in `lib/`, `components/` or `app/`** (checked by grep):
- GlowLayer / HighlightLayer
- depth of field
- chromatic aberration (deliberately refused in `ImpactFrame.ts:22-26` because a runtime toggle causes a shader compile)
- grain, motion blur, SSR, TAA, LUT or `colorCurves`
- LensFlare, VolumetricLightScattering, MirrorTexture, ReflectionProbe
- MSAA on the pipeline: `pipeline.samples` is never set. Once the HDR pipeline is active, the scene renders into an off-screen target, so `antialias:true` in `createEngine.ts:19` does nothing. FXAA is the only anti-aliasing.

Babylon 9.23 ships all of these (checked in `node_modules/@babylonjs/core`): `TAARenderingPipeline`, `SSRRenderingPipeline`, `fsr1RenderingPipeline`, `GlowLayer`, `ColorGradingTexture`, `Lights/Clustered`, `areaLight`, `VolumetricLightScatteringPostProcess` and `MotionBlurPostProcess`.

IBL shadows (`scene/IblShadows.ts:30,63-66`) are opt-in through `NEXT_PUBLIC_IBL_SHADOWS`, off by default, and refuse to run on WebGPU.

**Grade ownership conflict (likely bug; read off the code, not seen on screen):**
- `buildNexusScene` writes `scene.imageProcessingConfiguration` (`nexus/NexusWebScene.ts:1234-1242`): exposure 1.15, contrast 1.35, vignette ×4, vignette colour = fog colour (from `dusk()`, `nexus/venueSpecs.ts:23`). That is the same configuration object the pipeline's image processing reads by default.
- ModeHarness captures `restGrade` from the *mood* before `load()` runs (`ModeHarness.ts:416-419`).
- So every spec-venue mode shows the venue's grade until the first impact. After that, exposure and vignette snap back to the mood's values while contrast stays on the venue's.

### A3. Lighting

**Rig**
- One hemispheric light and one directional sun per mood (`LightRig.ts:48-62`).
- Six moods in `scene/moods.ts:26-42`: goldenHour, daylight, dojoWarm, nightGame, overcast, alpine.
- Each mood sets sky and ground colour, sun colour, intensity and direction, exposure, contrast, bloom, vignette and `skyWash`.
- `MODE_MOODS` (`moods.ts:45`) is stale and only re-exported.
- Spec venues build their own hemi and sun plus a 1024 ESM shadow generator (`NexusWebScene.ts:1164-1180`). These are dropped when the mode already has `fel_sun` (`NexusVenue.ts:176-190`), so the LightRig always wins.

**IBL**
- `scene/EnvironmentIBL.ts` builds a procedural 64 px float cube per mood: a sky/ground gradient plus a sun lobe (`:26,106-107`), at intensity 0.85 (`:134`).
- No `.env`, `.hdr` or `.dds` file exists in `public/`.
- Reflections are a gradient, so floors, balls, cars and glass never reflect the actual venue.

**Shadows**
- Casters and receivers are classified automatically by name (`LightRig.ts:37,98-129`). Foliage, domes, scans and anything with a bounding radius over 25 m don't cast.
- Every caster is drawn once per cascade. A measured 1v1 frame had 1136 draws, almost all of them shadow passes (`:99-103`).
- There is no contact-hardening (PCSS), no static shadow caching (`refreshRate`) and no thin instancing in VenueProps (the noted fix, `:108-116`).
- The fake contact shadow is a vertex-alpha disc under each body (`visual/contactShadow.ts:28`).

**Missing**
- Fog: the rig forces `FOGMODE_NONE` (`LightRig.ts:46`), but spec venues turn EXP2 back on (`NexusWebScene.ts:1094-1098`). Spec modes get haze; procedural worlds (boards, racing, sprint, freerun) get none.
- No emissive glow layer. Lamps are emissive spheres with no light (`NexusWebScene.ts:719-728`). Floodlights are emissive planes (`visual/VenueKit.ts:347-350`).
- No point or spot lights except the vehicle fill (`racing/vehicleLight.ts`).
- No volumetrics or god rays, no light probes, and no character rim or kicker light.

**Mood mismatches (the rig ignores the chosen place)**
- Combat arenas each carry `look.mood` (`combat/arenas.ts:36`), e.g. the night Neon Cage. But the combat modes hard-code `mood: 'dojoWarm'` or `'goldenHour'` (`KarateVSMode.ts:720`, `KarateEndlessMode.ts:1617`, `MixedCombatMode.ts:764`, `DuelMode.ts:457`, `ShowdownMode.ts:469`).
- Net sports are fixed at goldenHour (`NetSportMode.ts:858`), even for the Night Beach, Gym and Lawn place looks (`nexus/placeLooks.ts:61-72`).
- Football is fixed at nightGame (`FootballRushMode.ts:613`) even on Beach Bowl.
- **Golf runs the `alpine` mood** (exposure 0.92, cold sun; `precisionModes.ts:583`).
- Only board, sprint, freerun and racing use mood getters.

### A4. Materials

**Venues**
- VenueKit is PBR with matte defaults and a 6% emissive floor rule (`VenueKit.ts:16-22`).
- `liftBlackMaterials` runs after load (`LightRig.ts:181-212`).
- Grounds are `DynamicTexture` paintings at 1024² (`VenueKit.ts:29-60`), with a 512² tiling detail map (`visual/groundTextures.ts:20,120,159`).
- No authored normal or roughness maps on grounds.
- Kenney CC0 props have their metal flattened to dielectric (`visual/VenueProps.ts:18-23`).
- Meshy scans: hoop, balls, boards, stadium, ballpark, dojo (`visual/meshyProps.ts:14`). Baked venue maps exist for 11 venues (`nexus/venueSpecs.ts` map keys ~575-603; gridiron, neuro-arena and sand-court are untextured and unused).

**Characters**
- Skin is PBR with subsurface translucency and a generated pore map (`core/skinShading.ts:81-139`).
- Cloth gets sheen plus a generated weave normal (`core/fabric.ts:47-63,143-149`). Hair gets anisotropy.
- **Style clash:** `autoInk` puts anime inverted-hull outlines (`#1a1230`, a fixed 0.015 world-unit width) on every skinned mesh (`visual/AnimeInk.ts:18-19,46-68`). Untuned materials are flattened to roughness 0.95. That sits on photoreal Meshy scans next to painted 1024×512 photo domes. The outline also roughly doubles character draws.

**Signature surfaces**
- Ocean: a Gerstner `MaterialPluginBase` on PBR (`visual/OceanSurface.ts:9-17`), used by surf, aero and the kart harbour.
- Venice court water: `visual/CourtSurface.ts:168`. Street court paint: `:287,429`.
- Snow: `visual/snowParkTextures.ts`.
- Turf, crowd and graffiti painters: `visual/PlacePack.ts:47,95,154`.

**Missing:** floor reflections (hardwood or gloss), wet-surface response to WeatherFx rain, decals (scuffs, tyre marks, footprints), and detail normal maps on grounds.

**Texture budget:** `lib/babylon/config/textureBudget.json` sets the tier medians at 132 MB desktop and 61 MB mobile, with the rule "mobile: no mode above 2× median". Karate mobile is already at 117 MB.

### A5. Characters on screen
- **Hero:** a Meshy scan (`core/athleteRoster.ts:132`, 8.3 MB). The mobile variant is decimated.
- **Roster:** `public/models/athletes/*.glb`.
- **LODs:** none on characters. The only LOD in the game is the Venice palms (`nexus/veniceBoardwalk.ts:467-508`).
- **Crowds:**
  - `visual/Onlookers.ts:19,32-47` spawns at most **8 full skinned hero bodies** per bank, through `CharacterLibrary.spawn`, each with an outline, secondary motion and foot planting.
  - Painted crowd textures sit on stepped stands (`NexusWebScene.ts:649-670`, `PlacePack.ts:227`).
  - The dunk alone has baked crowd *cards* (`veniceBoardwalk.ts:477,524-530`).
  - `public/models/crowd/*.glb` (5 bodies) is referenced only in credits; it's unused.
  - The owner removed crowd tiers from basketball courts (`venueSpecs.ts:93-95`).
- **Animation:**
  - CharacterAnimator crossfade is 0.15 s (`anim/CharacterAnimator.ts:115`).
  - Two-bone IK foot planting and HandIK; additive SecondaryMotion (breathing, weight shift, head look); posture layers.
  - Clips are mostly code-authored (`anim/authored/*`) plus some mocap (`public/models/clips`, `mocapDunk`).

### A6. VFX and camera

**EffectsKit** (`visual/EffectsKit.ts`)
- One procedural dot texture with **STANDARD blend** (`:11,51-54`).
- `burst` creates a **new ParticleSystem per call** (`:188`). The kinds are dust, sparks, net, confetti and glitch.
- `ambient`: petals, snow, gulls, moths (`:102-157`). `ballTrail` with trail levels (`:73,159`).
- No additive or stretched sparks, no flipbooks, no soft particles, no GPU particles.

**Specialised VFX**
- `HoopJuice` (rim spring, net squash, flash; `visual/HoopJuice.ts`)
- `PhoneFlashes` (dunk only)
- `BoostFx` / `speedFx` (racing and boards)
- `SnowSpray`, `SurfSpray`, `WeatherFx` (fog, rain, lightning; `premium/WeatherFx.ts`)
- `ScuffFx`, `CloudDeck`

**JuiceKit** (`premium/JuiceKit.ts:116-189`) covers shake, tint, slowMo, a DOM-overlay flash, scorePop and callout. `gameFeel` handles hit-stop. All of it is gated by `motionPolicy()`.

**Camera**
- `CameraDirector` presets (`core/CameraDirector.ts:93,197`).
- Replay exists only in dunk: `scene/DunkReplayCam.ts`, transforms replayed at 0.5× from two angles (`DunkMode.ts:1116`). `DunkCuts` is dunk-only too.
- There are no establishing or intro fly-ins, broadcast cameras, letterboxing or DOF anywhere.

### A7. UI and HUD
- There are 21 hand-built HUD hosts (`components/games/*-babylon.tsx`). They share only `game-shell`, `boot-splash`, `hud-format` and `TouchOverlay`. There is no shared scorebug, banner or meter component.
- Text is very small for a TV: 127 uses of `text-[9px]`, `[10px]` or `[11px]` against 7 uses of 4xl or larger. `font-display` is used 0 times. Each host has its own hex palette (up to 15 colours).
- Transitions: `framer-motion` appears in 1 host.
- The STYLE_GUIDE fonts are DM Sans, Plus Jakarta and JetBrains Mono (`app/layout.tsx`, local fonts).

### A8. Budgets a visual pass must respect
- Frame time: desktop 60 fps / mobile 30 fps targets (`QualityTier.ts` header). PerfMonitor uses 16.7 ms on both tiers, with 1.35× headroom before a frame counts as long (`PerfMonitor.ts:91`).
- Draws, meshes and texture memory: 600 / 400 / 256 MB on mobile, 1600 / 900 / 512 MB on desktop (`PerfMonitor.ts:37-58`). Measured: threepoint 833 draws desktop and 277 mobile; 1v1 1136.
- Pixels: 2.1M backing pixels and DPR ≤ 2 (`canvasFit.ts:26,36`). Texture rule as in A4.
- Rules written in the code comments:
  - don't toggle post passes at runtime (shader-compile hitch; `ImpactFrame.ts:22-26`);
  - any new shader or plugin must be GLSL (WebGPU is blocked);
  - G-buffer passes need `forceGeometryBuffer`, because the ink, decal and plugin shaders don't write every MRT output (`QualityTier.ts:106-111`);
  - honour `motionPolicy().flash` and reduced motion.

### A9. Foundation upgrades, in priority order (visual gain per cost, phone-safe)

1. **Fix the tier policy and add a TV/high tier plus a runtime Graphics setting.** [CODE] S–M. Risk: low.
   - Change `resolveQualityTier`: `pixel-budget` should mean "cap the resolution", not "mobile", when the pointer is fine or the screen is large (`QualityTier.ts:46-52`).
   - Add a `'tv'|'high'` tier and a `?tier=` / localStorage override read in `detectQualityTier`, plus a menu toggle in `components/games/game-shell.tsx`.
   - Optionally render at the 2.1M budget and upscale with `fsr1RenderingPipeline` on 4K.
   - Files: `scene/QualityTier.ts`, `core/canvasFit.ts`, `core/ModeHarness.ts:270-286`, `QualityTier.test.ts`.
2. **Real anti-aliasing.** [CODE] S. Risk: medium (fill rate).
   - Set `pipeline.samples = 4` on desktop/tv in `LightRig.ts:131`. Keep FXAA on mobile.
   - TAA is an option for static shots only; fast sports will ghost.
3. **One owner for the grade, plus per-mood colour grading.** [CODE] S. Risk: low.
   - Stop `buildNexusScene` writing `imageProcessingConfiguration` when the harness rig exists (`NexusWebScene.ts:1234-1242`), or feed the venue grade into `restGrade` (`ModeHarness.ts:416`).
   - Add `colorCurves` (shadows, midtones and highlights hue/saturation) to `MoodDef` (`moods.ts:5-24`) and enable them in `LightRig.ts:132-148`. That's a code-only LUT-quality grade.
4. **Mood follows the place everywhere.** [CODE] S. Risk: low.
   - Turn mood into a getter from `readCombatArena(..).look.mood` in the 5 combat modes, and from the place-look sky in net, football, golf, derby and penalty.
   - Fix golf's `'alpine'` (`precisionModes.ts:583`).
   - Add `'overcast'` to `OUTDOOR_MOODS` (`QualityTier.ts:73`).
   - Add 1–2 moods: `dusk/blueHour` and an `indoorArena` with an overhead key.
5. **Lights that emit.** [CODE] M. Risk: medium (draws).
   - Add a `GlowLayer` (or `pipeline.glowLayerEnabled`) restricted to lamp heads, LED walls, rims, boost and neon through an include list. Desktop/tv only; mobile keeps bloom.
   - Use `ClusteredLightContainer` point and spot lights for floodlights, lamps and stage cans so that light falls on the players.
   - Files: `scene/LightRig.ts`, `nexus/NexusWebScene.ts:719-728` (lamp), `VenueKit.ts:347` (flood), `combat/arenaBuild.ts`.
6. **Character key/rim (kicker) light plus outline decision.** [CODE] S–M. Risk: low.
   - Add a second directional light with `includedOnlyMeshes` for players, the same pattern as `racing/vehicleLight.ts`, tinted per mood. This is the biggest "reads on a TV" win for people.
   - Decide the ink style: keep it for the anime party modes, and for sports drop it or scale its width with distance (`visual/AnimeInk.ts`, `ModeHarness.ts:292`).
7. **Reflections from the real venue.** [CODE] M–L. Risk: medium.
   - After `load()`, take a one-shot `ReflectionProbe` capture of the venue (256 px, filtered) and use it in place of or blended with the 64 px gradient cube (`scene/EnvironmentIBL.ts`).
   - Add SSR (desktop/tv, `forceGeometryBuffer`) or `MirrorTexture` on named glossy floors: dance stage, gym, BrainBrawl stage, wet courts in rain.
8. **Particles 2.0.** [CODE] M. Risk: low.
   - Pool systems per kind (`EffectsKit.ts:177-205`).
   - Additive, stretched-billboard sparks and glints.
   - Procedural canvas flipbooks: smoke/dust puff, spark streak, confetti quads with spin.
   - Ground decals: scuffs, footprints, tyre marks.
   - Tier caps on counts.
9. **Crowd tech.** [CODE] L. Risk: medium.
   - Use baked vertex animation (`VertexAnimationBaker` + `BakedVertexAnimationManager`) on the unused `public/models/crowd/*.glb`, thin-instanced to 100–400 cheering fans in a few draws.
   - Use card impostors for far rows (the dunk's crowd-card pattern).
   - Swap `Onlookers` (`visual/Onlookers.ts`) to this, and add crowd reactions through `MomentumBus`.
   - New crowd variety beyond the 5 bodies would be [ART].
10. **Shadows quality per cost.** [CODE] M. Risk: medium.
    - Split static scenery into its own shadow generator with `refreshRate = RENDER_ONCE`.
    - Keep dynamic characters in a tight near cascade, with PCSS (contact hardening) on tv/desktop.
    - Use thin instances in VenueProps (the noted real fix, `LightRig.ts:108-116`).
    - Trial `NEXT_PUBLIC_IBL_SHADOWS` on the tv tier.
11. **Sky and atmosphere.** M.
    - [CODE] A procedural analytic sky shader (GLSL) with sun disc and cloud layer, generalising `premium/AlpineSky.ts`'s 4096 recompose.
    - [CODE] Unified distance fog / aerial perspective for the procedural worlds.
    - [CODE] `VolumetricLightScatteringPostProcess` sun shafts for goldenHour on tv.
    - [ART] Higher-resolution photographic domes to replace the 1024×512 files in `public/backdrops/baked/*.jpg`.
12. **Broadcast/presentation kit.** [CODE] M–L.
    - Generalise `scene/DunkReplayCam.ts` into a shared `ReplayDirector`: record transforms and play back highlights from 2–3 cameras.
    - Add an establishing fly-in and a player walk-in camera in `CameraDirector`.
    - Letterbox bars during cinematics.
    - DOF enabled *at mount* at zero strength and animated (to avoid a compile hitch), replays only.
13. **TV-grade HUD system.** [CODE] M.
    - A shared scorebug, banner, meter and end card in `components/games/`, at 10-foot sizes (24 px minimum at 1080p) with 5% safe margins.
    - `font-display` for numbers, one palette token set, and framer-motion transitions.
    - Migrate the 21 hosts.
14. **Material detail.** [CODE] M.
    - Procedural detail normal and roughness maps for grounds (`visual/groundTextures.ts`).
    - A wet-surface response tied to `WeatherFx` rain: roughness down, darken, puddle mask.
    - Sweat sheen on skin (roughness driven by stamina), in `core/skinShading.ts`.

## Part B: per-mode visual pass list

Tags: **[CODE]** means code only (procedural, or reuses assets already in `public/`). **[ART]** needs new authored models or textures.

### dunk
**Current look:** Venice dunk spec (`DunkMode.ts:1126,1153`) under goldenHour, on the venice-blue-court scan. Boardwalk, LOD palms, baked crowd cards and a FLIGHT NIGHT sign (`nexus/veniceBoardwalk.ts:466-532`). Ocean court paint, HoopJuice, PhoneFlashes, gulls and a ball trail (`DunkMode.ts:1226-1229`). It is the only mode with a replay (0.5×, two angles; `:1116`) and broadcast cuts.

Upgrades:
- Turn the replay into a broadcast package: a third orbiting angle, DOF on the dunker, letterbox and a "REPLAY" bug, with pad skip. [CODE] M
- A "Flight Night" lighting option: a nightGame/dusk mood with clustered floodlights around the court, GlowLayer on lamp heads and the rim flash. [CODE] M
- Crowd cards reacting (bob and phone-flash sync), plus baked-vertex-animation fans along the boardwalk rail in place of the 8 Onlookers. [CODE] M
- A court gloss pass: a reflection probe or SSR on the painted court, dusk sky reflected in the lines, and sweat sheen on the dunker. [CODE] M
- Signature make moment: additive spark ring at the rim, net cloth vertex wobble (extend HoopJuice), confetti flipbook. [CODE] S
- A judges' table with 3D score cards flipping. [CODE] M (better judge-table models would be [ART])
- Take the character outline off the photoreal hero in this mode, or scale its width with distance. [CODE] S
- Sun shafts (volumetric scattering) through the palms on the tv tier. [CODE] S

### dunkduel
**Current look:** the same Venice dunk venue (`DunkDuelMode.ts:600,612-650`), goldenHour, with ambient gulls, ball trail and HoopJuice. No replay, no crowd beyond the boardwalk rail.

Upgrades:
- Share dunk's replay director for each player's best dunk, with a side-by-side end card. [CODE] M
- A player-turn transition: whip-pan plus a name-card lower third in the P1/P2 colour. [CODE] S
- Per-player light accents: a rim-light tint and a coloured contact-shadow ring. [CODE] S
- Crowd react tiers keyed to the score gap (instanced fans and phone flashes). [CODE] M
- A 3D score tower/jumbotron that counts up beside the court. [CODE] M
- Same court gloss, kicker light and sun-shaft items as dunk. [CODE] M

### onevone
**Current look:** basketball_h2h spec half court on the Venice scan (`OneVOneMode.ts:818,826,851`), goldenHour. Beach palms and lamps, the lawn boardwalk with an 8-body onlooker rail, ocean court paint, HoopJuice, ScuffFx, 16 bursts. No stands (removed by owner call), no replay.

Upgrades:
- Highlight replays (ankle-breaker, block, game point) through the shared replay director. [CODE] M
- Broadcast presentation: tip-off establishing fly-in, a scorebug HUD and a "GAME POINT" lower third. [CODE] M
- Instanced crowd along the fence and boardwalk (vertex-animated crowd GLBs), cheering on `crowd.erupt` events already sent to `ModeMic`. [CODE] M
- Court material: sealed-court specular, a reflection probe, and procedural scuff decals where cuts are planted. [CODE] M
- A character kicker light plus sweat sheen growing with stamina. [CODE] S
- A real net mesh with cloth-like vertex sway on swishes, replacing the wireframe juice cylinder. [CODE] M
- Dusk-to-night progression across a game: the mood lerps and the lamps light up via GlowLayer. [CODE] M
- Heat shimmer over the asphalt on daylight looks (a refraction post). [CODE] S

### threevthree
**Current look:** basketball_3v3 spec "Streetball Arena" with purple dusk on the Venice scan (`ThreeVThreeMode.ts:668,676,778`), goldenHour. Two lamps, the onlooker rail, 18 bursts, HoopJuice. No crowd stands, no replay.

Upgrades:
- Streetball arena dressing: chain-link cage, graffiti walls (`PlacePack.paintGraffitiWall`), boombox and benches from the Kenney kits. [CODE] M (bespoke streetball props would be [ART])
- Night-court lighting: clustered pole lights with real falloff, glow on fixtures, moths (EffectsKit gridiron reuse). [CODE] M
- Instanced crowd ringing the cage, reacting to team runs. [CODE] M
- Team colour language: jersey-matched contact rings and kicker-light tints for allies vs foes. [CODE] S
- Replays of the possession-ending play, plus a broadcast scorebug with the 90 s clock. [CODE] M
- Court reflections and footprint/scuff decals. [CODE] M
- A camera "team" preset polish: a slow drift crane in dead balls. [CODE] S

### threepoint
**Current look:** basketball_h2h venue (`ThreePointMode.ts:919,948`), goldenHour, ocean court. Money-ball gold material swap, ball trail, HoopJuice, the one `flashBeat` user. No rack scenery beyond the gameplay, no crowd stands.

Upgrades:
- Contest-set dressing: 5 lit ball racks with LED trim (GlowLayer), a sponsor-style apron, a 3D shot clock and scoreboard. [CODE] M (branded rack models would be [ART])
- Money-ball signature: an emissive glow layer, a gold additive trail, and a sparkle burst on make. [CODE] S
- "On fire" streak: rim flame flipbook, heat distortion, net glow after 3 straight makes. [CODE] M
- Crowd count-up chant: instanced crowd and phone flashes (reuse `PhoneFlashes`). [CODE] M
- A final-rack replay of the last shot plus a podium end scene for the field. [CODE] M
- A broadcast camera: a slow side dolly during the rack, a cut to the rim on release. [CODE] S

### carnival
**Current look:** court_carnival spec hub (purple court, banners, lamps, podium; `venueSpecs.ts:140-159`), goldenHour (`CourtCarnivalMode.ts:157,362`). Events rebuild VenueKit floors (`carnivalEvents.ts`). Flashes, a few bursts.

Upgrades:
- Carnival set pieces: string lights over the court (thin-instanced bulbs plus GlowLayer), tents, a ferris wheel and carousel silhouette on the horizon. [CODE] M (detailed rides would be [ART])
- A night mood with fireworks between events (additive flipbook particles plus `flashBeat`). [CODE] M
- Event transition wipes: a confetti cannon and a camera swoop between hub and event. [CODE] S
- A 3D scoreboard marquee with chaser lights for the between-event standings. [CODE] M
- Party-goer crowd: instanced fans with props (balloons as cheap meshes). [CODE] M
- Per-event colour grades through mood colorCurves, so each burst reads distinct. [CODE] S

### volleyball
**Current look:** "Beach Pro" spec plus place looks such as Night Beach and Gym (`placeLooks.ts:71-72`). Mood fixed goldenHour (`NetSportMode.ts:858`). Readable net, Meshy-style ball, ball trail, two Onlooker banks, WeatherFx (`NetSportMode.ts` load ~862-950).

Upgrades:
- Mood getter from the place (Night Beach really at night, the Gym indoor). [CODE] S
- Sand: footprint and dive decals, sand-kick particles on digs and landings, a sand detail normal. [CODE] M
- Ocean behind the court with `mountOcean` (exists) and sun glint, plus beach flags waving. [CODE] S
- Gym look: hardwood with a reflection probe or SSR, overhead clustered lights, banners. [CODE] M (gym props would be [ART])
- Spike signature: slow-mo hang, impact ring on the sand, ball compression squash. [CODE] S
- Instanced beach crowd on towels and bleachers. [CODE] M
- A replay of the rally-winning spike. [CODE] M

### tennis
**Current look:** Center Court spec with 2 painted crowd tiers (`venueSpecs.ts:272-280`), plus the glass cage (parkour tennis), 2 Onlooker banks and WeatherFx. Mood goldenHour fixed even on Clay or Lawn (`placeLooks.ts:61-62`).

Upgrades:
- Mood follows surface: a Clay desert sun, an overcast Lawn. [CODE] S
- Court surfaces: clay slide-dust and ball marks (decals), worn grass at the baseline, a hard-court gloss. [CODE] M
- Stadium dressing: umpire chair, net posts, ball-kid figures (reuse roster bodies), sponsor boards (`signTexture`). [CODE] M
- Hawk-Eye style replay on close calls (shared replay director plus a ball-mark overlay). [CODE] M
- A racquet swoosh trail (TrailMesh on the racquet tip) and a net-cord shake. [CODE] S
- Glass cage: reflections and refraction plus a glow edge on wall-run returns. [CODE] M
- An instanced crowd on the painted tiers (head-turn on rallies). [CODE] M

### tiebreak
**Current look:** the tennis venue (`TiebreakMode.ts:118,122`) with two bodies, a sphere ball, a torus hit-window ring, and flash only. No crowd and no trail.

Upgrades:
- Inherit the tennis venue items (mood, surfaces, crowd). [CODE] S once tennis is done
- Tension grade on break or match point: the crowd darkens, a spotlight-style vignette, a heartbeat exposure pulse. [CODE] S
- A Meshy tennis ball (`dressBall`) plus a ball trail and an impact flash on contact. [CODE] S
- The hit-window ring as an emissive glow decal on the court instead of a floating torus. [CODE] S
- A final-point replay and trophy end scene. [CODE] M

### golf
**Current look:** golf_loop spec (Coastal Links) plus VenueKit golf field (`precisionModes.ts:583-613`) under the **alpine** mood. 10 Onlookers, WeatherFx, park ambient. No ball tracer.

Upgrades:
- Fix the mood: daylight or goldenHour, or follow the place look (`placeLooks.ts:81-82`). [CODE] S
- Shot tracer (the signature AAA golf read): an emissive ribbon with apex and carry readout. [CODE] S
- Grass: mow stripes on the fairway, a fringe and green shader, instanced grass blades near the camera on tv. [CODE] M
- A flag-cloth wave, a cup with a lip, and a putting grid/slope overlay on the green. [CODE] S
- Water hazards with `mountOcean`-style water plus reflections, and sand bunkers with a rake texture. [CODE] M
- Ball-cam and a landing cut. [CODE] M
- A gallery: instanced crowd behind ropes along the fairway. [CODE] M
- Clubhouse, tee box markers, yardage signs. [CODE] S (bespoke clubhouse would be [ART])

### derby
**Current look:** derby spec with the Meshy ballpark staged at scale 150 and 3 crowd tiers (`venueSpecs.ts:463-470`), goldenHour (`precisionModes.ts:1118-1131`). Onlookers, WeatherFx. No homer FX beyond sound.

Upgrades:
- Home-run moment: fireworks over the wall, a tracer with distance and exit velocity, a camera follow to the stands. [CODE] M
- A jumbotron with replay and Statcast numbers (DynamicTexture). [CODE] M
- Stadium floodlight towers (clustered lights plus glow), night-game mood option. [CODE] M
- A bat swing trail and a ball spin blur. [CODE] S
- Diamond detail: chalk lines, a mound, a dirt normal/roughness texture, cleat scuffs. [CODE] M
- Instanced crowd in the tiers, plus a glove-reach crowd at the wall on robbed homers. [CODE] M

### penalty
**Current look:** penalty spec on the soccer-stadium scan plus the Meshy stadium staged at scale 66 (`venueSpecs.ts:477-485`), nightGame fixed (`precisionModes.ts:1746-1785`). 14 Onlookers behind the goal, WeatherFx, Breakaway rainbow arc.

Upgrades:
- Net bulge on goals: vertex-displaced net mesh plus a ripple. [CODE] M
- Floodlights: towers, glow, 4-way player shadows. [CODE] M
- A behind-the-goal crowd with instanced flags and scarves, plus a flare smoke flipbook. [CODE] M
- The keeper as the star: a dive slow-mo, a glove-contact spark ring, a save replay. [CODE] M
- Pitch: mow stripes and a penalty-spot scuff; rain makes the turf glossy. [CODE] S
- A broadcast walk-up camera and lower third ("PENALTY 3 of 5"). [CODE] S

### skateboard
**Current look:** procedural `buildSkatepark` per picked venue (Venice Park, City Plaza, Warehouse; `nexus/boardVenues.ts:134-149`, `SkateRunMode.ts:605,617-724`). The mood getter is per venue. VenueProps, BoostFx, 8 Onlookers, mini-skate Kenney kit.

Upgrades:
- Warehouse look: sodium-vapour clustered lights, a dust haze with light shafts, glowing fixtures. [CODE] M
- Graffiti and decals: `paintGraffitiWall` on walls, wheel marks and wax on ledges, grind sparks as additive stretched sparks. [CODE] S
- A Skate-3 filmer cam: fisheye lens and a replay of the best combo with a follow-cam operator. [CODE] M
- Ground: a concrete detail normal, a cracks and stains roughness map, and puddle reflections at the Warehouse. [CODE] M
- Crowd and life: instanced skaters sitting on ledges, phone filming. [CODE] M
- City Plaza set pieces: skyline silhouettes, planters, banners, moving traffic in the distance. [CODE] M (landmark buildings would be [ART])

### snowboard_slalom
**Current look:** `buildSlopeRun` plus AlpineSky recompose at 4096 (`premium/AlpineSky.ts`, `SnowboardSlalomMode.ts:392-530`). Thin-instanced pines, gates and finish arch, SnowSpray edge spray and carve tracks, 8 Onlookers, snowfall. Moods alpine, nightGame or overcast.

Upgrades:
- A snow sparkle shader (glint noise in roughness and specular) and a blue shadow tint. [CODE] S
- Powder clouds on hard carves and landings (flipbook smoke, additive in sun). [CODE] S
- Night Park: clustered floodlights down the course, glow on the gate tops. [CODE] M
- A moving chairlift with chairs (thin instances) plus flags waving at gates. [CODE] M
- Gate-pass FX: a flag-snap animation and a gate flash; a finish-line confetti and banner cut. [CODE] S
- A broadcast drone-follow replay of the run's best section. [CODE] M
- Distance haze (aerial perspective) down the valley. [CODE] S

### surf
**Current look:** `buildSurfBreak` with a Gerstner ocean to the horizon (`visual/OceanSurface.ts`, `modes/rideWorlds.ts:1057,1279`), plus SurfSpray, BoostFx, 8 Onlookers. Venues are The Break, Sunset Point and The Reef (`boardVenues.ts:186-202`).

Upgrades:
- Wave lip translucency: green light through the crest via an ocean-plugin backlight term, plus lip spray curtains. [CODE] M
- A barrel/tube read: a darker inner face, a spit-out spray burst on exit. [CODE] M
- Foam trails behind the board (decal ribbon on the ocean plus particles). [CODE] S
- A sun glint path and caustics in the shallows; reef shadows under the water at The Reef. [CODE] M
- A wet sheen on the board and body after duck-dives. [CODE] S
- Shore set pieces: a pier (`props/venice/pier_far.glb`), lifeguard tower, crowd on sand. [CODE] M (lifeguard tower model would be [ART])
- A water-level camera replay of the best wave. [CODE] M

### bigair
**Current look:** AirSessionMode with `VenueKit.buildBigAirSlope` (`AirSessionMode.ts:252,364,524-525`), mood fixed alpine, `dressBoard`, Onlookers, BoostFx.

Upgrades:
- An X-Games-style kicker structure: scaffold tower, banner wraps, a start gate with LEDs. [CODE] M (branded scaffold would be [ART])
- Night session with floodlights and fireworks on a landed double. [CODE] M
- A trick orbit replay with slow-mo and DOF. [CODE] M
- Spin trails: a board-tip ribbon plus snow dust off the lip. [CODE] S
- A judges' booth and 3D score reveal. [CODE] M
- A snow sparkle shader and AlpineSky reuse (it's only in slalom today). [CODE] S

### freerun
**Current look:** coloured PBR boxes (graybox) on a Havok course (`FreeRunMode.ts:119-170`), mood from place look (`:521-522`), with tracks named Neon Rooftop, Hydro Dam, Freight Terminal and Sunken Temple (`nexus/freeRunTracks.ts:28-43`). No crowd, no props, no ambient FX.

Upgrades:
- Theme the course pieces. [ART] for bespoke pieces, [CODE] L to kit-bash from existing kits:
  - Rooftop: AC units, billboards (`signTexture`), neon (GlowLayer).
  - Dam: pipes and overgrowth from the nature kit.
  - Terminal: containers.
  - Temple: columns and statue from mini-arena.
- A Mirror's Edge colour language: interactables in a runner red with emissive edges, everything else desaturated (colorCurves). [CODE] S
- Speed read: speed lines and wind particles above 80% speed (reuse `speedFx`), a camera roll on wall-runs. [CODE] S
- City backdrop and distance haze for the rooftop. [CODE] M
- Landing and roll dust, slam shockwave ring, grind sparks. [CODE] S
- A finish replay of the best combo. [CODE] M

### sprint
**Current look:** `VenueKit.buildTrack`, a tartan straight with painted bleachers on box walls (`VenueKit.ts:360-375`), lane ticks and a finish box (`SprintMode.ts:142-157`). Two runners, mood from place look (Night Meet promises "THE STANDS FULL"). No VFX, no crowd.

Upgrades:
- A stadium: racing-kit `grandStand*.glb` (exists) as stands, an instanced crowd, floodlight towers for Night Meet. [CODE] M
- Starting blocks, gun smoke flipbook, a starter figure. [CODE] S (starting block model would be [ART])
- A rail-cam tracking shot alongside the runners, plus a photo-finish slit-scan end image. [CODE] M
- Lane numbers, distance boards, a finish gantry with an LED timer. [CODE] S
- Tartan material: a rubber granule normal and roughness map. [CODE] S
- Motion blur on the tv tier at top speed, and footfall dust. [CODE] S

### football
**Current look:** football_rush spec with painted crowdTier stands plus `VenueKit.buildGridiron` (emissive flood planes; `FootballRushMode.ts:613-690`, `VenueKit.ts:280-350`). nightGame fixed, 16 sideline Onlookers, moths, WeatherFx (rain, snow).

Upgrades:
- Stadium bowl: the Meshy `stadium.glb` (exists, used by penalty) plus instanced crowd. [CODE] M
- Real floodlight towers: clustered lights, glow, 4-way soft player shadows. [CODE] M
- Turf: mow stripes, painted end zones and logo, divot and scuff decals, rain gloss. [CODE] M
- A broadcast first-down line (yellow overlay decal) and a skycam pre-snap establishing shot. [CODE] S
- A TD moment: pyro jets (additive flipbook), confetti, a slow-mo replay of the breakaway. [CODE] M
- Pylons, chains crew and benches. [CODE] S (detailed sideline props would be [ART])
- Tackle/truck impact: a turf-chunk spray plus a dust ring. [CODE] S

### aeroaces
**Current look:** themed `aeroWorlds` terrain per circuit with ocean, cloud deck, arches and horizon ring (`racing/aeroWorlds.ts`). Toy planes dressed with Meshy bodies (`AeroAcesMode.ts:217,363`), speedFx, BoostFx, vehicle fill light. Mood getter per course.

Upgrades:
- Sun shafts and lens flare on the goldenHour and alpine circuits. [CODE] S
- Cloud fly-through: volume puffs with soft fade near the camera, plus fog-density pulses. [CODE] M
- Contrails and wingtip vortices on hard turns. Partly exists in speedFx; make it additive and longer. [CODE] S
- Water skim spray, and lava glow with heat distortion at Ember Caldera. [CODE] M
- Ring gates with glow layer and a pass shockwave. [CODE] S
- Motion blur on boost (tv/desktop only, mounted at load). [CODE] S
- A podium finish cinematic plus a fly-by replay. [CODE] M

### velocitykart
**Current look:** course venue plus trackside, kartDressing, cloud deck and racing kit stands (`VelocityKartMode.ts:917,945-991`). Meshy kart bodies, speedFx, BoostFx, Onlookers, speed vignette.

Upgrades:
- Tyre marks (decal ribbons) and coloured drift sparks as stretched additive billboards. [CODE] S
- A start-light gantry with glow and a light-sequence camera. [CODE] S
- Road material: an asphalt normal map, painted kerbs with relief, wet track gloss in rain. [CODE] M
- Instanced crowd in the existing grandStand models with waving flags. [CODE] M
- Night courses (Orbit Station, Rooftop): track-edge light strips through GlowLayer plus clustered lights. [CODE] M
- Motion blur and a chase-camera roll on drifts. [CODE] S
- A finish-line confetti burst and podium scene. [CODE] M

### karate
**Current look:** karate_endless spec plus the arena pick (`buildArena`; `KarateEndlessMode.ts:1617,1637-1652`), mood fixed dojoWarm, Onlookers, dojo petals. Heavy hit-stop and shake, 16 bursts, horde waves of identical agents.

Upgrades:
- Mood getter from the arena (Night Dojo, Neon Cage, Foundry). [CODE] S
- Hit sparks: additive impact stars with a directional streak, plus anime impact-frame flashes (a whiteout silhouette frame, motion-gated). [CODE] M
- Agent-wave arrival FX: glitch materialise with a GlowLayer edge (extend the 'glitch' burst). [CODE] S
- Foundry: fire-pit flames (flipbook), embers, heat haze, warm clustered lights. [CODE] M
- Lanterns that emit (point lights plus glow) in dojo arenas, and petals caught in light shafts. [CODE] M
- A finisher camera: a slow-mo orbit on the 100th KO. [CODE] M
- Gravel and mat footprint decals. [CODE] S

### karate_vs
**Current look:** the karate_vs arena pick (`KarateVSMode.ts:720-784`), mood fixed dojoWarm, Onlookers, ambient petals. slowMo, flash and tint juice.

Upgrades:
- Mood getter from the arena. [CODE] S
- A fighting-game presentation: an intro walk-in with name plates, "ROUND 1 / FIGHT" slam text, a KO slow-mo replay. [CODE] M
- Hit-spark library by strength (light, heavy, parry) with additive streaks and a parry ring. [CODE] S
- Chi aura on full meter: a GlowLayer rim on the fighter plus rising particles. [CODE] S
- A Dragon (HEAVY) super cinematic: a camera cut plus a colour-grade shift. [CODE] M
- Arena hazards (fire, shock) lit and glowing. [CODE] S
- Dynamic crowd at the arena edge (instanced). [CODE] M

### showdown
**Current look:** arena pick (`ShowdownMode.ts:469-545`), mood fixed dojoWarm, with Naruto-Storm partner assist and an ULTIMATE camera cut already. Bursts, tint and flash.

Upgrades:
- Anime ultimate presentation: speed-line overlay, a coloured background wash (colorCurves swap), impact frames. [CODE] M
- Partner blink-in VFX: smoke-puff flipbook plus an afterimage trail (cloned ghost meshes fading). [CODE] S
- Chakra aura (glow plus particles) scaling with the meter. [CODE] S
- Mood follows the arena. [CODE] S
- Ground cracks as decals on heavy slams, with debris chunks. [CODE] M
- A victory pose camera with DOF. [CODE] S

### duel
**Current look:** disc arena pick, side-on camera (`DuelMode.ts:457-536`), dojoWarm. Fists, staff or blade movesets. Bursts, tint and flash only.

Upgrades:
- Weapon trails (TrailMesh on the staff and blade tips) coloured by player. [CODE] S
- Clash sparks plus a parry flash ring and a brief hit-stop zoom. [CODE] S
- Weapon models: currently movesets only. [ART] for real staff and blade meshes, or a [CODE] S stopgap with primitive capsules plus metal PBR.
- Mood getter from the arena, with a moonlit Cliffside Shrine. [CODE] S
- Ring-out fall: a slow-mo plus a camera drop, and water splash at the cliff. [CODE] M
- Soul-Calibur style intro: weapon flourish poses and a name card. [CODE] M

### mixedcombat
**Current look:** arena pick with the raised Pit octagon (`MixedCombatMode.ts:764-827`), goldenHour fixed, Onlookers, slowMo, flash.

Upgrades:
- Mood getter from the arena (the Pit is dusk/stadium). [CODE] S
- Octagon presentation: canvas mat logo, fence or ropes, overhead clustered lights with a dark surround. [CODE] M
- Ring-out cinematic: a slow-mo plus a dust plume at the fall. [CODE] S
- Loadout-specific hit sparks and weapon trails. [CODE] S
- Crowd ringing the octagon (instanced) reacting to ring-outs. [CODE] M
- A walk-out intro with spotlight follow. [CODE] M

### dance
**Current look:** The Cypher neon spec (`venueSpecs.ts:508-535`), nightGame. Lamps, banner and podium emissive-pulsed by the beat bus (`DanceMode.ts:582-612`). A 16-spot Onlookers ring capped at 8 bodies (`:1072`). Stage camera.

Upgrades:
- A real LED wall: an animated procedural DynamicTexture (beat-synced patterns, the player's name) replacing the banner stand-in. [CODE] M
- Moving-head spotlights: cone meshes with glow plus clustered spot lights sweeping on the beat, and haze with light shafts. [CODE] M
- A glossy reflective stage floor (MirrorTexture or SSR) catching the lights. [CODE] M
- A CO2 jet and confetti burst on combo milestones. [CODE] S
- An instanced club crowd (bigger than 8) bouncing to the BPM. [CODE] M
- Beat-cut camera: cuts on downbeats at high combo, with DOF on solos. [CODE] M
- Outfit glow trims (emissive on garments, through GlowLayer). [CODE] S

### who_scene_it
**Current look:** the Scene Vault spec (amber), goldenHour; each question mounts its venue behind the card with a sweep camera (`WhoSceneItMode.ts:256-264`). Flash only.

Upgrades:
- Cinematic venue transitions: whip-pan or dissolve, with a brief bloom flare. [CODE] S
- Vault set: a game-show frame, a podium with glow, a host body (reuse BrainBrawl's host pattern). [CODE] M
- DOF on the venue during the question so the card reads, then a racked focus on reveal. [CODE] S
- Per-venue correct grade: each mounted venue runs its own mood (needs a runtime mood swap in the rig). [CODE] M
- Answer reveal: confetti or buzzer light-up with glow, a camera push-in. [CODE] S

### brainbrawl
**Current look:** the Neuro Arena with BrainBrawlStage (LED wall, wheel, podiums, galleries; `BrainBrawlMode.ts:628-700`), nightGame, Onlookers, host body.

Upgrades:
- TV game-show lighting: moving heads and gobos (clustered spots), a haze layer. [CODE] M
- A glossy stage floor reflecting the LED wall. [CODE] M
- The wheel: chaser bulbs (thin instances plus GlowLayer), motion blur on spin, a landing spark burst. [CODE] S
- Podium lectern lights glowing per state (armed, right, wrong). [CODE] S
- Camera cuts per contestant on lock-in (game-show coverage). [CODE] M
- An instanced studio audience with clap animation. [CODE] M

## Cross-mode notes
- **Biggest single TV win:** fix the tier demotion (A9.1) and add MSAA (A9.2). Both are low-risk and change every mode's frame without touching a mode file.
- **Code-only work that reuses existing assets:** crowd GLBs (`public/models/crowd`), the racing `grandStand*.glb`, the Meshy `stadium.glb` and `ballpark.glb`, `pier_far.glb`, and the Kenney mini-arena, mini-skate and nature kits.
- **What genuinely needs new art:**
  - higher-resolution sky domes (all 1024×512 today);
  - weapon meshes for duel and mixedcombat;
  - themed FreeRun course modules;
  - sport-specific set pieces: rack, judge table, umpire chair, scaffold, starting blocks;
  - more crowd body variety.

## Foundation status after phase 2 (visual-foundation, 2026-10-06)

What the per-mode passes can now build on, beyond A9.1–A9.7:

- **A9.10 static shadow cache** (`scene/ShadowCache.ts`, phones' single 512 map). Static casters are drawn into the
  shadow map once; only moving casters are drawn per frame. Measured on the phone tier: velocitykart 234 → 24 shadow
  draws a render, dunk 73 → 27, karate 104 → 51. `?shadowcache=0` is the A/B. `scene.metadata.felShadowCache` has
  `stats()` and `movingByName()` — the list of casters still drawn every frame, which is a mode's own shopping list.
  Desktop/high are unchanged (4096 map; the cascades follow the camera — caching the far cascades is the fuller version).
- **Phone post chain** (`QualityTier.tierRigSettings('mobile')`): 6 → 5 passes, post fill 4.43 → 2.88 Mpx a frame at
  780×1688 (bloom target ×0.5 with its kernel in step; FXAA only below DPR 1.5). `?mobilepost=0` is the A/B.
- **A9.8 particles** (`visual/ParticleBudget.ts`, `EffectsKit.BURST_LOOK`): one live-particle budget per tier for every
  burst, a governor lever (`setParticleBudgetScale`), additive stretched sparks, puffing dust, tumbling confetti strips.
- **A9.9 crowd at distance** (`visual/CrowdLod.ts`): onlookers past 14 m drop their ink hull and cast shadow; phones'
  crowds never cast into the map.
- HUD-in-the-world meshes and light sprites no longer cast shadows (phone flashes, shot meter, player ring and tag, gulls).

Notes for the per-mode passes, from the shadow cache's per-frame lists:
- **karate**: `threat_arrow`, `threat_cue`, `ke_pick_health`, `mook_bar_*` are HUD meshes still casting shadows every frame —
  name them into LightRig's never-cast pattern (or set them as non-casters in the mode) when the karate pass runs.
- **dunk / velocitykart**: after settling, what is drawn per frame is the bodies, their kit and the ball — nothing left to
  take at the foundation level.
- **Every mode with bursts**: look at a grind (sparks), a planted cut (dust) and a win (confetti) on screen — the new looks
  were tested headless, not judged by eye.
- Still not built after phase 2: TV HUD styling (A9.13), FSR for 4K. The rest is wave 1 below.

## Foundation status after wave 1 (vis-foundation-2, 2026-10-13)

Every system below mounts from the rig (`LightRig.captureVenue`, after `load()`) or the harness, so a mode gets it without
a mode file; `scene/lookPolicy.ts` HOLDS the hoops modes out of all of them this wave (owner: hoops off-limits; lifted 2026-10-14, "Go on hoops", mode lane by mode lane: onevone, threevthree and carnival are no longer held — see "Wave 2 status — the hoops courts" below). `?lookoff=`
(fixtures, sky, air, mirror) switches one off for a one-build A/B.

- **A9.12 broadcast kit.** `CameraDirector.establish('walkIn' | 'establish')`: a crane over the venue, a cut to a low shot
  on the player, then the play camera — which keeps running underneath, so the hand-over frame is exactly the follow's; the
  first input skips it. A mode opts in with `intro: 'walkIn'` on its definition. `visual/Letterbox.ts`: DOM bars (no post
  pass) for the intro and the replays. `scene/ReplayDirector.ts`: the shared replay (bodies recorded as drawn, played from
  `broadcastShots`' angles at half speed); a mode opts in with `replay: true` and calls `ctx.highlight({ lastSeconds })` at
  its moment — the harness holds `update()` while it plays. Its depth of field is switched on at mount at a no-blur lens and
  only eased during a replay (no mid-game compile; the depth pass refreshes only during a replay). Proving mode: Football Rush.
- **A9.5 second half — fixture lights.** `scene/FixtureLights.ts`: lamp heads, floods, lanterns and bulbs get clustered
  point / spot lights (one ClusteredLightContainer), sized by the illuminance they land; desktop/high. Patches a Babylon 9.23
  clustered-sheen shader bug (every cloth material vanished under a clustered light). Proving mode: volleyball Night Beach.
- **A9.11 sky & air.** `scene/SkyDome.ts`: a GLSL plugin on the photo domes — the open sky de-blocked, drifting clouds, the
  mood's sun glow, a horizon haze band; desktop/high. `scene/Atmosphere.ts`: a gentle EXP2 haze in a horizon colour over the
  procedural worlds nobody else fogs (every tier). Not built: VLS sun shafts (the sun is rarely in a play frame; the pass
  re-renders the occluders) — and higher-resolution domes stay [ART].
- **A9.14 material detail.** The floor grain's detail map carries relief (normal + roughness), puddles grow on WeatherFx's
  wet grounds in the rain (`visual/WetSurface.ts`), and the hero's skin shines with effort (`skinShading.mountSweat`). A
  shared ground-decal pool (`visual/GroundDecals.ts`, `scene.metadata.felDecals.stamp('scuff' | 'foot', …)`): no mode stamps
  yet — the mode lanes wire their pivots and cuts in wave 2.
- **Glow occlusion.** The skinned bodies are drawn black into the glow target, so a fixture's halo no longer paints over a
  body standing in front of it. A skinned glow include for chi rims (vis-combat's ask) is wave 2.
- **A9.7 second half — glossy floors.** `scene/GlossyFloor.ts`: a planar MirrorTexture on the dance and Brain Brawl stages and
  any wooden-court place (the Gym); desktop/high.


## Wave 2 status — the board sports and runs (vis-board, 2026-10-13)

Part B for skateboard, snowboard_slalom, surf, bigair and freerun, built on the wave-1 systems above. `?lookoff=` takes four
more names on these modes for a one-build A/B: `sparkle` (the snow's glint), `dress` (the warehouse lamps, the plaza's city,
freerun's world), `event` (big air's gate, towers and booth), `palette` (freerun's red).

- **Replays.** Every one of the five modes opts in (`replay: true`) and reaches `ctx.highlight` only through
  `modes/boardMoments.ReplayGate`: the run's BEST moment so far (it must beat every one already shown and clear the mode's own
  floor), at most three a run, 18 live seconds apart, never in the last stretch of a timed run (a replay plays at half speed, so
  the gate wants twice its window plus 14 s) and never for the event that ends the run (the finish line, the last attempt).
  The moments: skate — a HUGE banked combo, from a filmer's fisheye (a new `filmer` angle in `scene/broadcastShots`, ankle-high,
  1.9 m off the line, 1.5 rad lens; not in the default cut) then a profile and a low angle; snow — a banked line, from a
  drone-follow's follow / side / high; surf — the barrel and banked lines, from the water's level; big air — a stuck or clean
  landing worth 5.5+ on the judges' read plus the line, attempts 1 to N−1; freerun — a banked line, when the finish is not near.
  The deck's own flip and bank are replayed too: `ReplayDirector.track(node)` (opt-in, `ctx.trackReplay(node)` from a mode's
  load()) records a node's local pose with every frame and hands it back as the mode wrote it (Euler, the quaternion nulled again).
  The filmer is kept over the floor (`resolveAngle`, with `bounds` in the play options) and has its own near plane (the play
  cameras clip at 1 m, which cut the floor out from under an ankle-high lens).
- **Intros.** `walkIn` on skateboard (no clock until the first push), surf (the board trims itself in), bigair (no clock in the
  run-up) and freerun (opted in from `begin()`: the 4 s start grace is longer than the 3.7 s intro). Not snowboard_slalom: the
  rider is already sliding when play starts, and an intro would cost the first gates.
- **Ground decals.** `GroundDecals` gets a `carve` kind (a pair of grooves, tinted at the stamp: `CARVE_TINT.concrete` /
  `.snow`), a `pitch` option for a slope and `peek()`. `modes/boardMarks` plans the marks (a clean landing rolls out, a sketchy one
  drags, a bail slides and leaves two prints; a hard carve lays a mark every 0.8 m) and `visual/boardStamp` lays them. Skate: the
  flat slab only (a flat quad on a bank is half buried); snow: landings and wipeouts tipped onto the piste (the carve line is
  `SnowSpray`'s own); big air: the landing; freerun: every landing.
- **Skateboard.** The Warehouse's sodium lamps (named `lhead_*`: the glow layer and a clustered light each), light shafts
  (additive, fresnel-soft cones), a dust haze and a steel gantry (`visual/warehouseDressing`); City Plaza's skyline of lit towers
  and twelve cars on a road round the fence (`visual/plazaCity`); grind sparks (there were none); wheel marks.
- **Snowboard.** `visual/SnowSparkle`: a GLSL plugin on the piste and off-piste PBR (a crystal per 4 cm cell, lit when its own
  normal mirrors the sun into the eye; the shade pulled toward the sky's blue; desktop/high). The Night Park is a night (a
  starred sky over the recomposed mountains; `AlpineSky` `night`) with a pole of lamps every fourth gate (`visual/slopeLamps`).
  `visual/GateFlash`: a wall of light in the gate as it is crossed (green; red for a miss) and the pole on the rider's side snaps.
  Confetti off the arch's towers at the finish.
- **Surf.** The sun on the water (`OceanSurface` `light`, opt-in; racing's harbor mounts it unchanged): a glitter path on the
  chop and the green-gold light through the thin crest of the rideable face. A foam wake behind the board (`SurfSpray`; a fifth
  as thick on a phone: the surf row of `mobileBudget.json`).
- **Big air.** Its sky was the harness's mirrored 1024 px mountains (upside-down treeline over the run); it takes the slalom's
  `AlpineSky` now, and the snow's glint. `visual/bigAirDressing`: a start gate with an LED panel (`bigair_gate_led`), two scaffold
  towers with banner wraps at the kicker, a judges' booth by the landing whose three cards flip to the judges' scores after
  each landing, fireworks over it for a landed double. `visual/SpinTrail`: two ribbons off the board's tips through a trick;
  snow thrown off the lip at take-off and powder at the landing.
- **Freerun.** The runner's colour language (`visual/runnerPalette`): what the verbs act on (vault, bar, spring, rail, anchor,
  ledge) is runner red with an emissive floor, the slab and walls keep 42 % of their colour, and the verbs' surfaces get red outline
  edges (desktop/high); the tracks' authored hues are not changed, only toned. A world beside the slab per track,
  standing on a yard deck 5 m below it (there is nothing past the 20 m slab but the far-off world, so props at its height hung in
  the air; the deck has no collider) (`visual/freeRunDressing`: AC units, neon billboards, antenna bulbs; pipes, valves, overgrowth; containers, gantry cranes;
  columns, a statue), the camera's `SpeedLines` above 80 % of top speed, grind sparks, a ring off a slam or a big landing
  (`visual/ShockRing`).
- **Findings worth the next lane's time.** (1) `core/ModeHarness` mounts the replay depth of field (`mountReplayDof`) on every
  `replay: true` mode, and on desktop it flattens the whole frame (a snow piste's contrast measured 221.9 vs 6.4 with it off); the
  five modes here set `replayDof: false` (new optional `ModeDefinition` field) and the replay itself is unchanged; Football Rush
  and any other replay mode likely have it too: routed. (2) A StandardMaterial ADDS its `emissiveColor` to its emissive
  texture, it does not scale it: a sign written as `emissive (0.9, 0.95, 1)` plus a dark painted texture is a pale wash
  (measured: 15/255 at 0.1, 200/255 at 0.9 over the same dark pixel). `visual/unlit.settleEmissive` takes the colour to black
  when a texture is present. `DynamicTexture.update(false)` skips the Y flip: painted text comes out upside down.
  (3) `liftBlackMaterials` lifts any texture-less material under 0.04 to grey, which an unlit black diffuse is: `unlitDiffuse()`.
- **Deferred to wave 3 / needs art:** a moving chairlift with chairs and flags waving; a pier and a lifeguard tower for the surf
  breaks (`venuePropSets` is shared, and the tower is [ART]); a wet sheen after a duck-dive (`mountSweat` owns the skin level);
  puddle reflections and a concrete detail map at the Warehouse (`GlossyFloor` is a named-floor list); a night session with
  floodlights for big air; landmark buildings and bespoke course modules are [ART].


## Wave 2 status — the hoops: dunk, dunkduel, threepoint (vis-hoops-dunk, 2026-10-14)

Owner, 2026-10-14: "Go on hoops." Part B for dunk, dunkduel and threepoint, on the wave-1 systems. The other three hoops modes
(onevone, threevthree, carnival) are vis-hoops-court's and stay held in `scene/lookPolicy.ts`; the hoops HUD hosts are hud-hoops'.
Everything new is in `lib/babylon/hoops/` (presentation only; `hoopsWiring.test.ts` holds each file there to importing nothing that
scores, judges, times or tunes) and the three modes carry one-line, read-only hooks. No tuned feel number changed: no input, move,
dribble, shot timing, meter, release window, difficulty, score, judging, pay or play-camera value.

- **The hold is lifted for these three modes** (`lookPolicy`: dunk, dunkduel, threepoint and the dunk venue spec's id leave the held
  list). Per system, on the rig (desktop tier, 1080p, same camera and moment before and after; sheets in the lane report):
  fixture lights mount (2 lamp lights from the 2 lamps the Venice dressing has; at goldenHour's 0.35 gain they barely register: kept,
  harmless); the live sky mounts on the photo domes (threepoint's pink sunset gets the drifting clouds; the dunk's painted Venice
  sunset is already the sky the owner tuned and takes the cloud layer faintly); the glossy floor mounts on the Venice court's
  PBR plane (see below); ground decals are stamped by all three; sweat rides the hero (the harness mounts it for any look mode);
  wet surfaces need rain, which none of these modes has. Nothing looked wrong enough to keep a system held. The phone tier gets
  none of fixtures / sky / mirror (as everywhere) and keeps the set pieces.
- **The make lights the rim** (`RimFx`, all three). A ring of light leaves the iron at rim height (ShockRing fired flat), tinted
  sparks (EffectsKit, budgeted), and the net's glow; four tiers (soft, sweet, big, money) from the dunk's slam accuracy or the shot's
  grade. In threepoint the rim burns on a streak: embers one make short of `FIRE_STREAK`, flames and a lit net at it (half the
  particles on a phone), out when the streak breaks. Reduced motion drops the ring and the net's flare and keeps a steady glow.
- **dunk.** The judges' table (`JudgesTable`): five cards swing up from edge-on as the panel reveals each judge, in the judge's
  score, and come down with the next run-up. The triple cut (`DunkReplayCam`, kept as it is: three angles and the poster freeze) asks
  the foundation's letterbox for its bars. Plant and landing scuffs on the sealed court (the shared decal pool, laid above the paint).
- **dunkduel.** The 3D score tower (both totals, the colour of whoever has the floor), the judges' table, the same bars on the cut,
  the rim light's tint following the duellist (the foundation's kicker, a 38 % pull toward P1 cyan / P2 pink), the stands' phones by
  the make and the gap between the duellists, and the broadcast intro (`walkIn`: the first hand-off card has no clock; the first
  press skips it).
- **threepoint.** The racks stand on legs with an LED strip (gold on the money rack) and a printed apron, and on desktop a pool of
  light on the floor; a 3D scoreboard high behind the hoop (score, rack pips, clock, ON FIRE), named `*_led` so the glow layer
  haloes it; a soft gold halo on the money ball (hand and flight); the shooter's set feet and the jog's stop on the court; and a
  replay of a money ball dropped on a hot streak (`replay: true`, the board lane's `ReplayGate`: never the run's last ball, the
  buzzer's, the practice rack, or inside the gate's tail guard; skippable; the clock is held while it plays). The #220 corner camera
  and the tree fade are untouched and their tests green.
- **The Venice court's gloss.** `GlossyFloor.GLOSSY_FLOOR_MESH` names a mode's own floor plane: the street court is a PBR plane
  (`vb_court_paint`) laid over `venue_ground`, so the mirror goes on that. A sealed court's reflection is a dielectric's (soft
  shapes of the palms, the bus and the bodies at a grazing angle), not a looking-glass: subtle by physics. `?lookoff=mirror` is the A/B.
- **Budgets** (rig: 1080p desktop; 390x844 phone tier, DPR 2, same camera and moment before and after; draws are the engine's per
  frame, with the shadow pass). Desktop idle draws: dunk 481 -> 567 (the mirror's list, the table, the boards), dunkduel 483 -> 580,
  threepoint 628 -> 810; all far under 1600, active meshes 135 -> 143, 142 -> 152, 123 -> 140. Phone, content alone (shadows off):
  dunk +7 draws and meshes, dunkduel +9, threepoint +7, texture memory +1 MB at most (dunk 254 -> 255 of 256); `mobileBudget.json`
  is not raised. FINDING (RESOLVED by lane/tp-shadow-fix): threepoint on a phone showed +48 draws that were NOT content (120 -> 168
  with the shadow pass on, the venue's palms, tent, pier and lamp posts drawn into the shadow map every frame). It was not the lift: it
  was a load race in `scene/ShadowCache.ts` (VenueProps re-parks its kit masters once every model has loaded; when that landed after
  the cache armed, the one-time placement was judged motion), present on finish-release too, measured 2 of 3 runs there. Fixed at the
  ledger: a caster is judged only while shown, its show reads a fresh matrix, a late caster's thin buffer counts as motion while it
  settles. Phone rig after the fix: threepoint 127 (120 + the set's 7), every run and with the race forced; dunk 100 with the race
  forced (was 134); the `mobileBudget.json` row stands.
- **Deferred to wave 3 / needs art or an owner call.** A "Flight Night" lighting option (a night mood with floodlights: the dunk's
  goldenHour is the owner's tuned look, so a mood change is theirs); sun shafts (the foundation did not build them); instanced
  and vertex-animated crowds and a crowd chant (the dunk's crowd is one baked strip, 3-Point's venue has no crowd, and phone flashes
  over an empty beach would float); the dunk replay's fourth orbiting angle and depth of field (the contest's cut is tuned and
  already three angles and a poster); a player-turn whip-pan and name-card lower third in the duel (a camera move and a HUD
  piece: routed to hud-hoops); 3-Point's slow side dolly (the play camera is TUNED). 3-Point's broadcast intro was added after
  the owner's call (lane/tp-shadow-fix: `walkIn`, the 60 s clock waits for it, a press skips it, none under reduced motion); branded rack models, a bespoke
  scoreboard and judge-table models are [ART].
## Wave 2 status — the hoops courts (vis-hoops-court, 2026-10-14)

Part B for onevone, threevthree and carnival, after the owner's "Go on hoops". The three modes left `scene/lookPolicy.ts`'s hold
(the dunk lane lifts its own), so fixture lights, the sky and air, the glossy floor, decals, the wet surface and the sweat reach them.
Checked on the rig (1080p desktop, same seed): the sky is de-blocked (cloud wisps where the photograph's paint blotches were), the court
grain carries its detail map, the lamps light (goldenHour's fixture gain is 0.35, so quietly); nothing looked wrong, so no system is held
per mode. The glossy floor does not mount on onevone / threevthree / carnival: their ground is a painted street court, not a wooden one
(`GlossyFloor` takes a named stage mode or a `court` place ground), which is right for an outdoor concrete court.

- **Where the work lives.** OneVOneMode and ThreeVThreeMode carry only one-line hooks (the owner's right-stick PR #240 edits both):
  `intro` / `replay` / `replayCast` on the definition, one `mountHoopsCourt` in `load()`, `hoopsFx?.holdIntro(...)` after `micTick`, the
  dead-ball hook at the head of each possession reset (1v1: `resetPositions`, `startDefense`; 3v3: `resetPossession`,
  `opponentPossession` unless it is a swing's catch), one dispose. Everything else is `court/hoops*`, `court/mount/*`,
  `court/streetballDressing`, `court/carnival*`.
- **The intro.** `walkIn` on onevone and threevthree, `establish` on carnival. A court game plays underneath the intro (the harness
  keeps the mode running), and a defender who checks the ball while the player watches a crane is a steal they could not see coming, so
  `holdIntro` steps the camera director (it drives the intro) and returns from the mode's update until the first press hands the frame
  over. Carnival's hub never stepped the director (its shot is a `snapTo`), so `carnivalFx.stepIntro` does, on the pick screen and the
  first card only; `endIntro()` runs BEFORE an event builds (an intro ended after would restore the hub's pose over the event's).
- **Replays: noted, then played at the dead ball.** `MomentumBus.onReport` (new, read-only) lets the broadcast hear every posterize,
  ankle-break, block and dunk as it is reported (3v3 reports its drift ankle-break as a `clean_hit` of weight 14). They are NOTED, not
  played: a replay in a live possession stops the game under the player's thumbs. At the next dead ball the best moment of the
  possession plays once, from 1.2 s before it to now (`ctx.highlight({ lastSeconds, endAt, objective: rim })`), and the mode's own reset
  runs AFTER it (a replay puts the bodies back where the frame left them, so a reset made during it would be undone). Never the final
  moment (`final: ended` / `ended || buzzer`), never in reduced motion, one every two possessions, four a run
  (`court/hoopsMoments`). Carnival has no replay: each event spawns its own bodies and the recorder's cast is read once.
  `replayDof` stays on: measured on onevone, 1080p, the same frame with the depth of field switched off at runtime, the court's
  luma mean is 113.8 vs 113.7 and its std 32.1 vs 32.4 (the snow piste's 221.9 vs 6.4 did not repeat).
- **Scuffs.** `court/hoopsScuffs` reads the bodies' ground paths (a run that stops, a heading turned 66 degrees inside 0.22 s at speed,
  a landing after 0.22 s in the air) and stamps `felDecals` 'scuff' on the court (y 0.02). It does not ask the modes when they planted.
- **Dusk.** `court/mount/hoopsDusk`: the sun's strength and colour and the hemisphere move 65 % of the way toward the dusk mood as the
  game runs down (the better of the score and, in 3v3, the clock), eased over 4 s, and the lamps' lights and the glow come up 2.2× / 1.3×.
  Not moved: the sun's DIRECTION (the shadow cache drew the static scenery's shadows once from it), the exposure and the grade (one
  owner), the photographic backdrop. Still under reduced motion.
- **3v3 — the Streetball Arena** (`court/streetballDressing`). A chain-link cage (real bars) down both sidelines and behind the basket (the near end
  is open: the 'team' camera stands 18 m back and as far as 29 m), four lamp poles at its corners whose heads are `lhead_stb_*`
  (glow halo + a clustered light each on desktop), two graffiti walls outside the cage (never behind the rim: what stands behind the thing
  you aim at is kept quiet), two benches with a boombox and a duffel, and a flat team ring under every body but the hero's (cyan under
  his two mates, magenta under the three they face). A phone gets the frame, the poles, the benches, the props and the rings: eight meshes.
- **Carnival — the fair** (`court/carnivalSet`, `carnivalMarquee`, `mount/carnivalFx`). String lights on poles round the plaza (a bulb
  mesh a strand, `bb_bulb_carn_*`: a halo each and one clustered light per strand), four game booths with striped awnings and signs, two
  big tops, a carousel and a ferris wheel turning on the horizon (`bb_wheel_marquee_carn`), balloons (one thin-instanced draw), and a
  marquee over the back of the plaza with chaser bulbs that says GAME NIGHT, the event on its card and the standings between events (the
  mode hands it the night's own board rows; it paints, it never adds). A confetti volley from both sides when a card turns and when
  the player takes an event; fireworks over the horizon when the sky is dark, and always at the champion's finale. The fair is shown
  with the hub and hidden while an event runs (an event paints its own floor; the dojo is a room).
- **Findings worth the next lane's time.** (1) A BLENDED panel is an opaque wall to the SSAO's geometry buffer (it renders depth and
  normals with its own shader, which knows alpha tests and not blends): the cage's back panel, alpha 0.4 over a lit lawn, darkened
  everything seen through it to near black, and a lattice made an ALPHA-TESTED panel (`transparencyMode` ALPHATEST on a `RawTexture`,
  every check in the page right: tested, cut-off set, texture ready) still drew as a solid wall on the rig. The chain-link is REAL BARS
  now (`latticeSegments`: one thin-instanced draw a panel, 160 bars each), which has neither problem. A painted canvas lattice is its
  own trap: a canvas stores premultiplied RGBA, so a transparent texel's RGB is lost (black) and every mip of the lattice goes dark. (2) `DynamicTexture.clone()` makes a BLANK canvas: the copy is never painted and never ready.
  (3) Babylon multiplies the lit colour, emissive included, by the diffuse texture's RGB, so a texture's transparent texels (black) darken
  an emissive material: keep the colour in the material and the shape in the alpha. (4) The harness's 20 s load watchdog, on a machine at
  load 20, retries into a DOUBLED scene (two heroes, two foes, 22 skinned bodies): a capture with `Load timed out` in its log is not a
  measurement. (5) `FOLLOW_PRESETS.team` puts the camera 18 m behind a player at z 6 and up to 29 m behind one at z 15: nothing
  may stand at the near end of the 3v3 half court.
- **Deferred.** Instanced crowds ringing the cage and the plaza (A9.9's baked-vertex crowd is not built), a cloth net with sway (HoopJuice
  is shared with the dunk lane, whose Part B names it), the heat shimmer (a refraction post), moths round the poles, per-event colour
  grades for carnival (the mood is read once at mount; the grade has one owner), a camera swoop between hub and event and a slow drift
  crane in 3v3's dead balls (both touch the play camera), VLS sun shafts. A scorebug, a "GAME POINT" lower third and 3v3's clock bug are
  HUD: routed to lane/hud-hoops. [ART]: bespoke streetball props, detailed carnival rides, more crowd body variety.

## Wave 3 status — atmosphere and surfaces (w3-atmos, 2026-10-14)

The deferred atmosphere and surface items from waves 1 and 2. Everything below is presentation only: no tuned number moved. `scene/**` and
`visual/**` edits are this lane's this round (flagged `shared file:` in each commit). `?lookoff=heat|sunshafts|fixtures` are the one-build A/Bs;
`?lookon=sunshafts` shows a pass a mode has not earned.

- **flashBeat vs the harness repaint.** While a mode reported a speed vignette (or an impact pulse ran), `ModeHarness` repainted the rest
  exposure every frame over `LightRig.flashBeat()`'s own write, so a momentum sting, a made three or a storm's lightning never reached the
  screen on a racing mode. The rig now keeps the flash LEVEL (`flash01`, 1.35x exposure, 0.85 of the remainder a frame: unchanged); the harness
  paints it in the one grade write with the impact and the speed vignette (`ImpactFrame.stepFrameGrade`, pure). The decay is stepped by dt now
  (the same wall-clock length at 144 Hz as at 60). `core/flashCompose.test.ts` drives the real rig the way the harness does: the bug measured
  on the old path, then the fix; flash alone, flash with an impact, reduced motion.
- **Dome mismatches.** The `neon` bake (`public/backdrops/baked/neon.jpg`) is mis-named: it is the Venice skatepark at golden hour (its manifest
  source is `skateboarding.jpg`). A venue loaded it over its painted sky, so `?place=neon-block`, the Neon Cage, the football Dome, dance's
  Neon Club and Brain Brawl's Arcade Night stood under a sunset with palms at night. `paintedSky` on a place look / arena look opts out of the
  photograph and the venue's painted night horizon is the sky (a starred sky, the neon pylons, SkyDome's clouds on top). Daytime and home looks
  are untouched (a test holds that). A real photographic night dome stays [ART].
- **Chi rims.** A lit edge on a charged fighter's contour (`visual/ChiRim.ts`), and on a Hundred agent as it materialises. It is the ink hull
  (the outline renderer, skinned like the body) recoloured in an HDR chi colour and a little wider, so it costs no draw, no shader and no
  compile and follows every bone; the bloom makes the halo. Not a GlowLayer include (that draws the body filled, not its edge) and not a
  fresnel plugin (the fighters share their materials: a clone and a compile mid-match). The aura's call drives it for all five combat modes.
- **Heat haze.** `scene/HeatHaze.ts`: one full-screen distortion pass, mounted once after load, that early-outs outside a heat source's column;
  a ripple of 4 px at 1080p. The Foundry's two fire pits and Ember Caldera's lava register sources. Desktop/high, not under reduced motion.
  It distorts whatever is in the column on the screen, near or far (there is no depth in the pass): a pillar in front of a pit wobbles a
  little too. Measured A/B on one frame (`?lookoff=heat`).
- **Sun shafts: measured, not mounted.** `scene/SunShafts.ts` is the VLS mount and its gate; the gate is a measurement. Rig, 1080p, 40 samples
  across the first ~8 s of each goldenHour mode, the rig's sun projected through the live view-projection: the sun was in the frame in none
  (dunk, dunkduel, onevone, threevthree, threepoint, carnival, skateboard, surf, volleyball, tennis, aeroaces on two circuits, velocitykart).
  The moods put the sun 50-60 degrees up and a play camera frames a 46 degree field at a horizon. The pass is a second render of the
  occluders plus a blur on every frame and may never be toggled, so it mounts for no mode today (`SUN_SHAFT_MODES` is empty; a mode earns it
  at 25 % in frame); `?lookon=sunshafts&tier=high` shows it for one load.
- **Kart.** `racing/roadSurface.ts`: the asphalt grain (relief and roughness) over the road's paint (desktop/high: a phone's texture row is
  frozen over the ceiling); rumble ribs on the kerbs (a normal map);
  the road named into the weather's wet pass with a wet reflection level (environment and specular lift to 1.0 as it soaks, and come back).
  The kart has no weather chip, so it honours `?weather=rain|storm|fog` from the URL only (never the saved pick of the other modes) for its
  looks, and reads none of the weather's gameplay modifiers. The night courses' edge strip is a fixture now (`FixtureLights` strips): a pool
  of 8 clustered lights that follows the kart along the strip, each pinned to one of the nearest lamps.
- **Aero.** `racing/aeroAtmos.ts`: cloud banks to fly through (soft upright sprites at the line's height that fade out as the camera enters
  while the fog thickens to 4x and takes the cloud's colour); skim spray off the plane's track over water (sparks over lava); the caldera's
  lava glow (the world's underlight 0.8 to ~1.7, a glow on the lava, the haze) and a ring of light round the plane at every checkpoint.
  A phone keeps only the ring and the lava glow (`mobileBudget.json` holds aeroaces at 0 live particles: no sprites, no spray).
- **Findings worth the next lane's time.** (1) An upright or camera-facing sprite that dips into a depth plane (the sea, the ground) is cut
  flat across the whole cloud: keep its body above the plane. (2) Babylon's `BILLBOARDMODE_ALL` tilts a big quad to a high camera, which is
  what put the island's clouds into the sea. (3) `camera._postProcesses` carries `null` holes after the pipeline rebuilds, and a pass attached
  before a rebuild ends up in FRONT of the pipeline: attach after load and keep it last (`HeatHaze.keepLast`). (4) `Observable.remove` inside a notification
  unregisters on the next tick, not at once (a test that counts observers needs a tick).
- **Deferred.** A "Rain" chip for the kart's start screen (HUD: w3-present or an owner call; the URL works today). Sun shafts for any mode that
  looks at the sun (a replay that cranes to it, a finish flown into it) - add its measured share to `SUN_SHAFT_MEASURED`. A photographic night
  dome ([ART]). Heat haze with depth (a refraction of what is BEHIND the pit only) needs the depth pass. Tyre spray behind a kart on the wet road.
- **Budgets, measured** (rig: 240x135 desktop-tier and 48x105 phone-tier probes, same camera and moment, base = `origin/lane/finish-release` vs this lane; draws from the engine's per-frame count, `?tier=` forced). Desktop ceilings 1600 draws / 900 active / 512 MB, phone 600 / 400 / 256 MB; every row is far inside both.
  Foundry (combat, heat haze + chi rims): desktop 342 -> 343 draws, 54 active, particles 95 -> 95, 165 MB both; phone 76 -> 77 draws, 159 MB both.
  Coconut Cove (aero, clouds + spray + ring): desktop 204 -> 206 draws, 65 active, particles 52 -> 232 (spray, cap 360), 183 MB both; phone 74 -> 75 draws, particles 54 -> 54 (no sprites, no spray), 183 MB both.
  Knight arena (combat, chi rims): desktop 585 -> 586 draws, 100 active, texture 267 -> 271 MB (the rim glow's soft texture), phone 124 -> 124, 267 MB both.
  Neon block (kart night, strip lights; `mobileBudget.json` row untouched): desktop 351 -> 351 draws, 55 active, texture 132 -> 129 MB, phone 64 -> 65 draws, 132 -> 129 MB.
  Sun shafts: not mounted by any mode (measured share 0), so no row moves; with `?lookon=sunshafts` the pass adds one full occluder pass at half resolution.
