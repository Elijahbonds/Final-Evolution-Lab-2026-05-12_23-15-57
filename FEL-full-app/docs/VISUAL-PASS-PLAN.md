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
- Still not built: broadcast kit (A9.12), TV HUD styling (A9.13), procedural sky (A9.11), material detail (A9.14),
  clustered lights (A9.5 part 2), SSR/mirror floors (A9.7 part 2), FSR for 4K.

