# Gap Report — Workstream 2: Graphics / Animation / Human-Model Fidelity

Audit only. No fidelity implementation was written. Audited 2026-09-02 at commit
`5322d8a`. Every claim below was verified in code or measured on the running
app; nothing is inferred from documentation.

## 0. Preconditions

- **Gate 0 — verified closed, with evidence.** `gate0-rig-tests` 58 green,
  `avatar-pose-tests` 10 green, `avatar-pipeline-tests` 46 green;
  `npx vitest run` 83/83; `tsc` clean. The T-pose root cause (Babylon
  initialises node TRS from the first frame of the first clip) is resolved in
  the forge by shipping `idle_stand` first, and the pose gate asserts load
  state, not just clip content.
- **Firewall respected.** Nothing under CELL × NEXUS Studio was read for reuse
  or proposed for change.
- **One mode at a time** — this report ranks, it does not start.

> **Status 2026-09-03:** of the ranking in §4, items 0–4 and 6–7 have landed
> (character path, tiers with SSAO + cascades, secondary motion, skin
> subsurface + generated pore normals, two-foot planting, SSAO, PBR venue kit /
> ride worlds / ocean court), item 5 in part (pore normals; no authored
> roughness maps), item 11 in part (seven head morphs, hair-style geometry).
> Still open: cloth/hair spring motion (10), LOD/streaming (12), real HDR IBL
> (9), the venue scene's duplicate shadow pass. See `docs/SHIP-PASS-PLAN.md`.

## 1. THE FINDING THAT REORDERS EVERYTHING

> **Status 2026-09-02 (later the same day):** owner chose the forge GLB. `PROCEDURAL_CHARACTERS` now defaults off; every mode and the mobile trio re-verified green on the GLB path (see `docs/SHIP-PASS-PLAN.md`).

**The modes do not render the forge avatar. They render the procedural capsule
body.** Measured live on `/dev/mode/onevone?agent=1`: every skinned mesh is
`*_procAthlete_*` with a `StandardMaterial` (`jersey_procAthlete_p1`,
`skin_procAthlete_p1`, `hair_procAthlete_p2` …), 65-bone skeletons, zero PBR.

Why: `PROCEDURAL_CHARACTERS` (`lib/babylon/characters/CharacterProvider.ts`)
**defaults to `true`** when `NEXT_PUBLIC_PROCEDURAL_CHARACTERS` is unset, and
it is unset in both worktrees' `.env.local` and in both running dev servers'
environments (`:3000` and `:3002`). `CharacterLibrary.spawn` short-circuits to
`spawnProceduralAthlete` before any GLB is touched. The forge hero
(`fel-hero.glb`: PBR `baseColorFactor` + one 128×128 fabric-noise
`baseColorTexture`, roughness 0.85, metallic 0, five named materials, ten clips)
is reached by the **Closet preview only**, which loads it directly.

**Every item in sections A and B is therefore two audits.** The procedural
path is what ships; the forge path is what the avatar handoff describes. Any
skin-shading, texture, IK or secondary-motion work done on the forge GLB will
be invisible in gameplay until the flag is flipped and every mode is re-verified
on the GLB path — and that flip is a Gate-0-class event (different meshes,
different material names, the roster swap, the identity pipe), not a polish
step. **Recommendation: decide the shipped character path first. Everything
below is ranked assuming the answer is "the forge GLB."**

## 2. Per-section audit (what exists vs the directive's target)

### A. Human character model fidelity

| Target | Procedural path (shipping) | Forge GLB path (Closet only) | Gap |
|---|---|---|---|
| **Skin shading — PBR + SSS approximation** | `StandardMaterial`, diffuse + 15% self-emissive + a `FresnelParameters` *rim* (a cel-shade edge light, not a skin model). No PBR. | glTF PBR metallic-roughness, flat `baseColorFactor`. No subsurface, no fresnel-skin. | **Open on both.** Babylon 9 `PBRMaterial.subSurface` (translucency + scattering) is the cheap, correct lever — but only on the GLB path. |
| **Texture detail — normal + detail + roughness, KTX2 sanity** | No textures at all (solid colours). | One 128×128 detail texture; no normal, no roughness map. | **Open.** `public/` contains **0** `.ktx2`, **0** normal maps, **0** roughness maps (measured). The "KTX2 flattening" concern is moot — there is no KTX2. |
| **Facial rig — morph targets** | None. | None. `playerIdentity.ts` says so in its own comment: "the model has no blendshapes today". | **Open.** Faces are rigid on both paths. |
| **Secondary motion — cloth / hair** | None (rigid capsules). | None (the only "cloth" in the codebase is a static flag prop). No spring-bone, no Havok cloth. | **Open.** |
| **Rig fidelity — IK for feet and hands** | `BoneIKController` exists in `basketballTree.ts` for a **single foot lock**. No hand IK (ball grip), no two-foot planting, nothing in other trees. | Same tree drives both paths. | **Partial.** One foot, one mode family. |

### B. Animation quality

| Target | State | Gap |
|---|---|---|
| **Blend trees / no hard cuts** | `CharacterAnimator.crossFade` with per-clip `fadeSec`; per-mode trees (`basketballTree`, `footballTree`, `tennisTree`, `boardTree`). Some transitions use 0.08–0.1 s fades that read as cuts (tennis `split_step`, football `snap`). | **Mostly closed; audit the sub-0.1 s fades per mode.** |
| **Mocap fidelity — DeepMotion/SayMotion re-runs** | There is **no DeepMotion/SayMotion pipeline in the repo**. Clips are code-authored (the forge's ten, `boardSuite`, `dunk_*` suites) plus one captured clip (`mocapDunk.ts`). Thirteen external clip GLBs are orphaned and were retired because their content was scrambled. | **Not applicable as written.** There is nothing to "re-run at higher settings." The real gap is *authored clip count and quality* on hero moves. |
| **Procedural secondary — breathing, weight shift, look-at** | `idle_stand` is a static-ish loop. No breathing layer, no weight shift, no head look-at / `BoneLookController` anywhere. | **Open.** Cheapest item in this report (a look-at controller + an additive breathing offset), highest "alive" return. |
| **Root motion** | `importSanitizer` deliberately **strips position tracks** from imported clips; movement is code-driven (`CourtMovement`, `BoardMovement`, `PlayerSlot`) with animation layered on top. That is the "animation sliding under a moving root" pattern the directive warns about. | **Open, and structural.** Root motion would change the movement model of every mode. Not a fidelity tweak. Recommend foot-IK planting (A5) as the mitigation instead of a root-motion rewrite. |

### C. Environment & lighting

| Target | State | Gap |
|---|---|---|
| **PBR environment materials** | Mixed. `VenueKit`, `CourtSurface`, `Backdrops`, `Onlookers`, `ParkGoals` → `StandardMaterial`. `NexusWebScene` (venue-spec venues) → `PBRMaterial`. Baked Meshy maps via `VenueMaps` → glTF PBR. | **Partial.** The procedural ride worlds and the skatepark are Standard. |
| **Image-based lighting — HDR per venue** | `EnvironmentIBL` builds a **procedural float cube from the venue mood palette** (no HDR files: **0** `.hdr`/`.env` in `public/`). Reflections agree with direct light. | **Partial, deliberately.** Real captured HDRs would be a step up; the procedural cube is a defensible v1 and costs no assets. |
| **Post-processing — SSAO, bloom, tone mapping** | **CORRECTION (2026-09-02, after the first draft):** `LightRig.mountLightRig` — which `ModeHarness` runs for every mode — already mounts a `DefaultRenderingPipeline`: ACES tone mapping, per-mood exposure/contrast, bloom (per-mood threshold/weight/scale), FXAA, sharpen, mood vignette, and a `flashBeat`. `lib/babylon/visual/RenderPipeline.ts` is an unused **v2 duplicate** whose only delta is color-curve saturation. SSAO: none anywhere. | **Mostly closed.** The open items are SSAO (desktop tier only), the saturation curve if wanted, and a quality tier so mobile can drop passes. Delete or merge the duplicate. |
| **Dynamic shadows — cascaded** | **CORRECTION:** `mountLightRig` creates a `ShadowGenerator(1024, sun)` with blur-exponential soft shadows in **every** mode and auto-classifies casters/receivers by mesh name, so shadows are present everywhere, not only in venue-spec venues. `IblShadowsRenderPipeline` stays opt-in. No `CascadedShadowGenerator`. | **Partial.** 1024 single-cascade everywhere; cascaded + higher resolution on the desktop tier for the large outdoor worlds is the remaining gap. |

### D. Performance guardrails

| Target | State |
|---|---|
| **LOD** | None (`addLODLevel` unused anywhere). |
| **Texture streaming** | None — and with zero texture assets today, nothing to stream yet. |
| **Frame-budget target per mode** | `PerfMonitor` overlay exists (fps / avg ms / draws / meshes) and is now captured by every sweep. Budgets below are **measured**, not targets. |

## 3. Frame budgets — measured on the shipping (procedural) path

Captured by `scripts/gauntlet.sh` on the dev route, 1280×800, Chromium/ANGLE
Metal. These are the baseline any fidelity change is measured against.

<!-- GAUNTLET-TABLE -->
| Mode | fps | avg frame | draws | meshes |
|---|---|---|---|---|
| `dunk` | 60 | 16.7 ms | 26 | 26 |
| `threepoint` | 60 | 16.7 ms | 46 | 46 |
| `threevthree` | 60 | 16.7 ms | 54 | 54 |
| `onevone` | 60 | 16.7 ms | 29 | 29 |
| `karate_vs` | 60 | 16.7 ms | 19 | 19 |
| `karate` | 60 | 16.7 ms | 31 | 31 |
| `skateboard` | 60 | 16.7 ms | 69 | 69 |
| `surf` | 60 | 16.7 ms | 23 | 23 |
| `snowboard_slalom` | 60 | 16.7 ms | 45 | 45 |
| `volleyball` | 61 | 16.4 ms | 46 | 46 |
| `tennis` | 59 | 17.0 ms | 46 | 46 |
| `golf` | 60 | 16.7 ms | 18 | 18 |
| `derby` | 60 | 16.7 ms | 21 | 21 |
| `penalty` | 60 | 16.6 ms | 53 | 53 |
<!-- /GAUNTLET-TABLE -->

Baseline run 2026-09-02 22:29. Every mode sits at 59–61 fps / ~16.7 ms with 18–69 draws
(draws == meshes everywhere: nothing is instanced or merged, which is itself a D-section note).
There is substantial headroom, **but it is headroom on a `StandardMaterial`
capsule body**. The budget must be re-measured the moment the GLB path is
enabled, before any material work.

## 4. Ranking — (visual impact) ÷ (implementation cost)

| Rank | Item | Impact | Cost | Note |
|---|---|---|---|---|
| **0** | **Decide and enable the character path** (flip `PROCEDURAL_CHARACTERS`, re-verify every signed-off mode on the GLB — frame guard, clips, mobile) | Prerequisite | Medium, and a Gate-0-class verification | Nothing in A/B lands in gameplay without this |
| 1 | **Quality tiers on the existing light-rig pipeline** (desktop: + SSAO, cascaded shadows; mobile: bloom + tone-map only) and retire the duplicate `RenderPipeline.ts` | High on mobile budget, medium on desktop look | Low | Corrected: the pipeline is already mounted |
| 2 | **Procedural secondary animation** — head look-at (`BoneLookController`), additive breathing, idle weight shift | High ("alive") | Low | Path-independent |
| 3 | **Skin: PBR + subsurface** on the forge `skin` material | High ("looks human") | Low–medium | GLB path only |
| 4 | **Foot-IK planting for both feet + hand IK for ball grip** (extend the existing `BoneIKController` use) | High on basketball | Medium | Also the honest mitigation for the root-motion gap |
| 5 | **Material set for the forge hero** — normal + roughness maps (authored in the forge, since it is code) | Medium | Medium | Depends on 0 |
| 6 | **SSAO** via `SSAO2RenderingPipeline`, gated per mode by budget | Medium | Low code, real fps cost | Measure before keeping |
| 7 | **Environment PBR conversion** for `VenueKit` / ride worlds / `CourtSurface` | Medium | Medium | The venue-spec venues are already PBR |
| 8 | **Cascaded shadows** on outdoor modes | Medium | Medium, fps cost | |
| 9 | **Real HDR IBL per venue** | Medium | Asset work | Procedural cube is an acceptable v1 |
| 10 | **Cloth / hair secondary motion** (spring-bone approximation) | Medium | Medium–high | |
| 11 | **Morph-target faces** (brow, mouth, blink) | Medium at close range, low at gameplay distance | High (forge geometry + rig work) | |
| 12 | **LOD + texture streaming** | Guardrail | Medium | Only needed once 5/9 exist |
| — | **Root motion** | — | Structural rewrite of movement | **Recommend against**; #4 instead |
| — | **DeepMotion/SayMotion re-runs** | — | — | No pipeline exists; reframe as "author more hero clips" |

## 5. Scope note — the directive's mode list is stale

The directive says "do not touch DOM-mockup modes (Tennis, Golf, Soccer,
Baseball, Football, Gymnastics, Dance Rhythm, Court Carnival, Who Scene It) —
they need the real-3D swap first." **That list is out of date.** Tennis, golf,
soccer (`penalty`), baseball (`derby`), football, gymnastics, dance and carnival
are all Babylon modes on the real pipeline and have signed-off convergence
passes in `docs/concept-lock/`. This audit scoped to the eight modes the
directive names as shipped (Dunk, 1v1, 3v3, Karate VS, Skate, Surf, Snowboard,
Volleyball), but the fidelity findings above apply uniformly — the character
path, the unmounted post-pipeline and the missing secondary animation are
shared code, so closing them lifts every mode at once.

## 6. Decisions needed before implementation

1. **Which character path ships?** (§1) This gates everything in A and B.
2. **Accept the procedural IBL as v1**, or budget HDR capture per venue?
3. **Root motion: confirm the recommendation against it** in favour of IK
   planting. The alternative is a movement-model rewrite across every mode.
4. **Frame-budget floor per device class** — the measured baseline is 60 fps on
   a desktop GPU; no mobile GPU number exists (no mode has run on hardware).
   The guardrail in D needs a target before #6/#8 can be judged.
