# Changelog

All notable changes to Final Evolution Lab. Dates are 2026.

## Unreleased — release candidate, 2026-09-04 (ship passes 3 and 4)

The tag is assigned by the orchestrator at integration (the previous candidate was `v0.9.0-rc.1`). Every number below is
the one the commit or the findings log recorded; a line with no number had no measurement in its commit.
Full logs: `docs/SHIP-PASS-3.md`, `docs/SHIP-PASS-4.md`; the gate table: `docs/RC-2026-09-04.md`.

### Session endings (2026-09-05, early; owner decisions, MEDIUM risk — game rules)
- Football (Breakaway): a session is THREE drives, each ending on a touchdown or a turnover on downs; before, a runner who
  kept gaining reset to first down forever and never posted. `drive` in the HUD; `DRIVES_DONE` / `TURNOVER_ON_DOWNS`.
- Soccer (Twelve Yards): sudden death caps at five rounds — still level, style decides; no style, the later save; no saves,
  nerve. Verified: 10–10 → "LEVEL AFTER 5 — YOURS ON NERVE", session posted, proof minted (before: level for 421 s).
- Golf (The Loop): triple-par pick-up — at three times par the hole is scored as triple par and the round moves on
  (`pickUps` on the card); before, an unholed hole never ended. Out-of-bounds strokes count toward the cap.
- Pass 5 phase 0 gate closed: all eight contest routes post a session end to end (football and three-point proven on the
  production bundle; the dev server's double-mount race, not the modes, had stalled them).
- Drivers: arrows are the d-pad in the input bus — the session probe's run/ride variants use the stick keys and a held
  trigger; the splash is clicked by text. Snowboard now posts (proof "0 GATES · 58S · 25 PTS").

### FEL Kitchens — spec + scaffold (2026-09-05, overnight; PM lane brief `docs/CLAUDE-KITCHENS-BRIEF.md`)
- `docs/SPEC-FEL-KITCHENS.md` folds the soft prep (MealRx schema, LOCKED hybrid fulfilment) onto this tree: the existing
  `/kitchens` marketplace hub stays; the Build store lives in the Vite twin, so Kitchens reads a small read-only snapshot
  from this tree's PRQ (0–100 ÷ 100) and movement screen.
- `lib/kitchens/`: types (LOCKED shapes), `snapshotFromTree`, pure `buildMealRx`, eight seed recipes, fulfilment adapter
  (list live; Instacart link null until the key + GO; Drive unavailable), `KitchenStore` (localStorage, keyed by scan date,
  history cap 14); 7 tests.
- Owner decisions (same night): load band grade-aligned to this tree's PRQ (< 60 easy · 60–79 train · 80+ hard); the
  movement screen is the leak source until a Mirror scan lands; Instacart wired behind `INSTACART_IDP_KEY` (payload builder +
  keyed route, button unlocks by itself; application still on HOLD); the two pad commits squashed into one.
- `/kitchens/fuel` (Fuel floor): leak chip, load band, day plan, grocery checklist with copy / share, locked paths shown,
  disclaimer; linked from the hub. Probe: renders logged in, 12 grocery rows, checklist persists, 0 console errors.

### Venice DualShock pad (2026-09-05, overnight; Gameplay acceptance `docs/SPEC-VENICE-DUALSHOCK-PAD.md`)
- Dunk: HOLD = RUN — the held charge drives the athlete to the rim (stick steers, launch at the gather line or on release);
  the left stick leans and drifts the hang before contact; a miss is one beat (1.4 s) then the next run-up, no card.
- Pad chrome: HOLD caption and ring fill on hold verbs; pressed highlight; X bound to PROP (no dead binds); the charge
  meter removed; the hint plate clears the pad on phones (12 px above CHARGE, measured). Notes: `docs/VENICE-PAD-LAND-2026-09-05.md`.

### Ship pass 5 — the nuggets pass (2026-09-04, evening)

Owner decisions taken up front: Gate 0's shipping spec is the 22-bone unprefixed FEL rig (the 65-bone Mixamo tests stay for
the import path); multiplayer is recovered and re-scoped to the async best-score challenge; the Creator Card economy opens
now; every mode carries a proof line. Full log: `docs/SHIP-PASS-5.md`.

**Phase 0 — close-out** (`4869bf6`, tag `v0.9.0-rc.4`)
- Lab credits folded into the wallet (`docs/LC-FOLD-2026-09-04.md`): `Wallet.lc` is the balance, `applyLc` the only mover,
  the profile column dead. Wallet tests 33/33, arena tests 13/13.
- Active driver on the eight contest routes: karate posts and mints a proof card (WAVE 3 · 19 KOS); threepoint, snowboard,
  gymnastics, golf, soccer, football and dunk do not reach their end calls under mashed input — each end condition logged.

**Phases 1–6** (`a49ac13`)
- One balance, one reader: `/api/profile` returns the wallet; header, hub, profile view, storefront and PRQ-erase read it.
  Probe: wallet 560 = arena config 560 = shop 560.
- Proof lines for every mode: `GameResult` carries `stats` + `outcome`, sixteen game components pass them, `lib/proofLine.ts`
  renders one line per mode (5 tests); SHARE PROOF on every results card; minted `/c` page renders the line.
- Mastery ladder surface at `/ladder`, linked from the hub.
- Multiplayer: `MP_SESSION_MODE` maps every challenge key to its session mode (twelve of fourteen keys had settled as ties
  because `GameSession.mode` never matched); six head-to-head modes join; the results card settles a `?mp=<code>` run.
  Proofs: dunk challenge hostScore 124 (was 0), settled host 124 vs guest 0; karate-versus run joins and renders FRIEND CHALLENGE.
- Gate 0 on loaded bodies: `loadedBodies.test.ts` loads hero, mobile hero, both kit bodies and the eight-athlete roster
  through Babylon and asserts 22 unprefixed joints with a conforming rig audit (13 tests).

**Phases 2, 7, 8** (`09b471e`)
- Creator Card economy proven on the dev DB: publish +50 coins (740 → 790), remix royalty +25 to the parent's owner (790 → 815).
- The alpine whiteout: the mood (sun 2.8, hemisphere 0.9, exposure 1.05, bloom from 0.78) on near-white snow. Retuned; both
  pistes paint cooler with groom lines and drifts. Slalom mean luminance at the same four moments 221/218/214/211 →
  198/196/194/193, piste band 236 → 213. Teal pines are the Kenney palette, not lighting (two experiments reverted).
- Court ocean texture at 1024² on the mobile tier: threepoint 80.0 → 64.1 MB, dunk duel 102.9 → 86.9 MB; desktop unchanged.

**Phases 9–10** — production bundle of `09b471e` built clean in the release lane; the twenty-route production play sweep
and the tag are recorded in `docs/SHIP-PASS-5.md` when they land.

### Ship pass 4 — stages, movement, menus, wiring (2026-09-04)

Owner decisions taken up front: procedural props and CC0 packs on every venue; a navmesh per venue from an offline recast
bake (the hand-typed clamps retire); a menu consistency pass with no redesign; anatomy and the physics lesson stay with pass 3.

**Phase 1 — the full picture** (`2ad6a7f`)
- `scripts/full-picture.mts` writes `docs/SHIP-PASS-4-MATRIX.md`: 24 registry modes × venue spec, kit builder, baked map,
  movement core, camera preset, typed clamps, phone bridge, gauntlet, play sweep, concept lock, tests, file size. 40 gaps
  at open; 26 after the phase 6–7 recount (the script now judges each mode by its own slice of a shared file).
- Measured at open: 3 of 18 enabled modes stood on a baked map although 13 maps were baked; 9 enabled modes carried 36 typed clamps.

**Phase 2 — stages** (`d1bcd62`, `79dd312`, `286231a`, `0289efe`)
- Venue SPECS become the primary path (ground with markings, props, crowd tiers, lighting, optional baked map), kit builders
  the fallback. Twelve of sixteen mode venues are on specs: dunk, ones, 3v3, carnival and dunk duel on the scanned Venice
  court (placed so the painted baseline hoop sits under the rim at world origin); karate VS, showdown and three-point on the
  dojo/court; golf (60×90), derby (70×90), penalty (50×70, goal line z 10.4) and football rush (44×52) as field specs.
  Golf and football keep their kit fields under the spec's sky, lights and props (the spec ground rendered pale mint under
  the venue grade, three environments tried). Skate, snowboard, surf, gymnastics, big air and mixed combat stay procedural.
- CC0 props: `scripts/venue/curate-props.mts` copies 68 models (1.1 MB with one atlas) from six owner-approved Kenney kits
  into `public/models/props/<kit>/` with a CC0 manifest; `visual/VenueProps.ts` loads each once per scene and instances it;
  `visual/venuePropSets.ts` holds ten placement tables. `venuePropSets.test.ts` pins every file present and every
  placement outside its play area (the gym gantry failed it at the origin and moved).
- The naked hero, twice explained and fixed: MakeHuman garment maps carry low alpha (jean shorts 0.49, boots 0.21), so
  garments are OPAQUE; the anime-ink inverted hull is pushed behind fitted garments with a negative depth offset (−12 / −48).
- Kit switch at spawn; garments as cutouts then opaque; Kenney nature models scaled 4.4–5.2× (trees), 3.4× (bushes).
- Known: `gridiron.glb` and `sand-court.glb` carry no textures, so football and volleyball keep procedural venues.
  Snowboard slalom captures as a whiteout (identical in the 2026-09-03 frame — pre-existing). Kenney vertex-coloured trees
  read teal under spec lighting. `public/models/maps/baked/*.glb` was rewritten twice by an unidentified writer during
  vitest runs (restored from HEAD; the gauntlet now prints a WARNING row on drift).

**Phase 3 — bounds** (`148576d`)
- `recast-navigation@0.43.1` as a DEV dependency only (owner decision). `scripts/venue/navmesh-gen.mts` bakes ten of
  twelve maps to `public/models/navmesh/<key>.json` (52 KB total; coastal-links and venice-blacktop fail Recast's
  heightfield, neither under a mode's play). `core/NavBounds.ts` is the runtime: grid-indexed convex polygons, `contains`
  and `constrain`, no dependency shipped, three tests.
- Measured before wiring (`scripts/probes/_navmesh-holes.mts`, 0.5 m samples): raw meshes left 2.7 % of the half court and
  21.6 % of the dojo mat uncovered (soccer 27 %, gym 33 %). Each map now merges a regulation play core sized to the clear
  floor the map actually has; after the cores every gameplay rectangle samples 0 % uncovered.
- Wired: `mountVenue` loads the nav for the spec's map key; 1v1 and 3v3 route `clampToHalfCourt` through it, showdown
  routes `ARENA_HALF` through it (its box was 24 m on a 14 m floor). Karate VS constrains to the floor AND its 4.5 m arena
  box after the 12:28 sweep put `FEL-FRAME 6` on it (the alcoves boxed the fight camera in) — back to 0 in the 13:00 sweep.
- `scripts/gauntlet.sh`: the zsh-only word split (`${=r}`) dropped the seven mobile rows under bash; fixed with `$(printf …)`.

**Phase 4 — mass model: OPEN.** Awaits the owner's physics sign-off (standing rule: no rig/physics change without it).
**Phase 5 — movement feel: OPEN.** Awaits the same sign-off.

**Phase 6 — camera** (`cd45a3e`, `c61bf44`)
- The matrix's camera column had read `cameraPresets.json`, a table of Nexus venue cameras nobody sees since M104; the
  "six missing presets" were an artefact. Measured instead: `scripts/probes/_cam-frame.mts` records hero height ÷ viewport
  height per mode in `lib/babylon/config/cameraFraming.json` (median 0.33; spread 0.05–0.70 at 1280×800).
- Tennis and volleyball had been rendering through the venue orbit camera (`keepGameplayCamera` missing on NetSportMode and
  DanceMode): tennis 0.055 → 0.36, volleyball 0.06 → 0.60, dance 0.69 on their own follow cameras, FEL-FRAME 0.
- Follow lag normalised to frame time and biased (catch-up ×1.6, settle ×0.8) so a 30 fps phone no longer lags twice as
  far; ±18° whiskers lean the shot 8° toward the open side before the hard ±50° swing.
- The camera box is now the spec ground ∪ the map's measured walkabout bounds (±13 for the Venice court): three-point
  0.66 at 4.04 m → 0.35 at 6.74 m, FEL-FRAME 0.
- `window.__FEL_DEV__.hero` for probes; volleyball, showdown, duel and sprint added to `MODE_INFO` so the Modes screen lists them.

**Phase 7 — menus** (`c61bf44`)
- Measured: 30 play routes, 26 through `GameShell`; all 16 Babylon game components report a result (`onEnd`), so a results
  screen exists on every mode. Air session, sprint and three-point froze on pause with no overlay; all sixteen now draw
  "PAUSED — TAP TO RESUME", verified on `/play/<route>` by `scripts/probes/_pause-overlay.mts` (the dev harness renders no
  game component, so a `/dev/mode` probe proved nothing).
- Every enabled mode shows ✓ for phone bridge, gauntlet, play sweep, concept lock and tests in the matrix.

**Phase 8 — wiring** (findings log; probes under `scripts/probes/`)
- `scripts/probes/_session-e2e.mts` plays a route to its natural end while watching the network. Karate versus: idle player
  defeated 0–2 in 78 s → `POST /api/sessions` 200 (xp 10, shards 1, credits 5, prqDelta 0), a `GameSession` row and
  `session_complete` in `AnalyticsEvent`, checked in the database; no `game_diag` fired on the clean run.

**Phase 9 — performance: IN THIS RUN** (perf and verify lanes; contract in `docs/CONTRACTS-PASS4-RUN.md`)
- Measured (`scripts/probes/_vram-diag.mts`): desktop dunk 199 MB, threes 71 MB, karate VS 75 MB; mobile tier dunk 168 MB,
  threes 40 MB — the tier drops the 2048² shadow map as designed but dunk keeps three 2048² skin maps at 21 MB each.
- The 1024² skin set is written (`export-skins.mts --size 1024 --suffix -1024`: six family maps + detail normal, 443 KB).
  The tier-aware `applySkinMap`, `textureBudget.json` and the budget test land through the perf and verify lanes.

**Phase 10 — release candidate: IN THIS RUN** (this lane)
- Production build, production sweep on :3006, this changelog, `scripts/rc-checklist.mts`; `scripts/prod-serve.sh` takes a port.

### Ship pass 3 — a real body in a real place (2026-09-03 → 04)

Owner decisions: fitted body by default, AI generator only as a later premium option, face + full-body proportions,
on-device, free at runtime; clips as pose targets (option B); the candidate replaces the hero only after clothes and hair land.

**Phase 1 — body spike** (`c773287`, `d13b87d`, `e44a61c`, `f520eac`, `02b30d2`, `3d55f58`, `1abd7a5`)
- MPFB2 v2.0.17 runs headless in Blender 5.1; `scripts/avatar/import-mpfb.mts` strips the mixamo prefix, folds fingers,
  toes and extras into their kept parents with weights re-summed, and names materials to the contract. First dressed
  candidate: 12.3 MB, 5 meshes, 6 textures, Phase 0 rig audit PASS (22 bones, T-pose).
- The Closet's seven morphs ride as shape keys; helper geometry deleted by vertex; MPFB's eight macro keys removed; the
  dressing script versioned with a README. Candidate under the 25k triangle budget (22,941), then 29,647 dressed with the
  morphs (accepted for desktop; the low-poly proxy body is the way down).
- Rig tests take `FEL_HERO_GLB`: 18 of 24 rig-measured clip tests failed on the candidate because every authored clip stored
  offsets solved on the old body. Owner sign-off: option B, pose-target clips, candidate behind a flag first.

**Phase 1b — pose-target clips** (`d906d13`, `d1e378b`, `422fdc1`, `70f49ed`, `5391d35`, `d09ff65`)
- `lib/babylon/anim/poseClip.ts`: torso keys in degrees, hands and feet in body-local metres scaled by limb length,
  fitted at build time with the node-space two-bone solver, which now solves in the rig's own frame (the glTF root's
  handedness mirror turned large reaches the wrong way). Golf first, proven on both bodies at 60 fps, 0 frame-guard hits.
- Tennis, volleyball, soccer, baseball, basketball migrated: limb-ratio targets; bind from the skeleton's rest matrices;
  the torso yaw sign was backwards in every suite (+yaw turns the right shoulder forward), fixed and pinned by tests.
- Every authored clip portable: `bindFrame.ts` defines a degree key as a rotation about the parent's bind axes from bind,
  a measured no-op on the shipped hero. Seventeen new rig tests found the jump, dunk launch, tomahawk, eastbay and live
  mocap dunk never raised the hands (their arm keys were twists); re-authored. Shipped hero 36 suites / 238 tests;
  candidate 72 of 73; sweep 40 rows clean.
- Mocap takes play as pose targets from the take's forward kinematics; `--grip 0.1` holds a two-hand grip: the golf take's
  hands drifted 0.7–1.4 m apart and now stay within 0.24 m (D-M1 closed). The dunk is rebuilt from the owner's capture
  (`scripts/mocap/dunk-pose.mts`) and its flight seen frame by frame (`scripts/probes/_dunk-flight.mts`).
- Development only: `?hero=<glb>` on the dev harness and the Closet; the gauntlet passes `HERO=` to every family.

**Phase 2 — skin** (`ee6a068`, `8d97955`, `20fea58`)
- The nine base clips build at runtime on the bind frame (`authored/baseClips.ts`; identical on the shipped hero), so a body
  with no baked animations plays every mode; the jumpshot's release goes overhead (the baked keys crossed the arms low).
- Six CC0 MakeHuman skins across the tone range (`public/models/skins`, `scripts/avatar/skins/export-skins.mts`); a body
  flagged `felSkinUV: makehuman` wears the family nearest the chosen tone with the map's mean pulled onto the swatch and a
  photographed detail normal. Clothing-only tint skips skin, hair and eyes by name. Candidate textures as WebP: 13 → 2.2 MB.
- The candidate's mesh and bind agreed only on paper (A-pose mesh, T-pose rig; wrist at (0.43, 1.06) m against a bind wrist
  at (0.66, 1.39)). The import builds the A-pose skeleton from the mesh and skins everything into the rest pose; wrist,
  elbow and ankles sit within 2 cm of the bind joints. The avatar gate gains the mesh-versus-bind joint check.
- Warm load on the harness: candidate 1.9 s (2.5, 1.9, 1.9) against the shipped hero's 1.6 s, both under the 3 s budget.

**Phase 3 — clothes** (`bd3bcaa`, `b4ac79d`, `1263654`, `0b49a6d`, `23f7cfb`)
- Two kit bodies (male 0.9, female 0.1) carry every Closet wearable for tops, shorts and shoes as a fitted CC0 garment
  (`Kit_<slot>_<itemId>`); `lib/babylon/core/kit.ts` shows the equipped one per slot. ≈ 20k triangles body + one garment
  per slot against the 25k advisory.
- Both bodies had exported the same androgynous geometry (macro keys dropped before export); `dress-kit.py` now bakes the
  macro mix into the basis: female 1.61 m, male 1.67 m, hair above the eyes, bind check passes on both.
- Residuals: no basketball-length shorts, sporting headwear or accessories in the CC0 packs (procedural for those slots);
  the female heroine boot rendered on one leg and was swapped for the ankle boot.

**Phase 4 — hair, roster, the swap** (`44280b8`, `b2cbca2`, `013decc`, `a827d23`, `08455db`, `8b6a497`)
- Six CC0 hair styles per body as `Hair_<key>` cutout meshes (cap, afro, buzz, bun, ponytail, braids); both bodies import
  at 3.9 / 4.3 MB with 13 meshes; no hijab asset exists in the packs (residual).
- Hero files ship quantized (KHR_mesh_quantization; male 3.7 MB); `check-bind` compares world-frame positions at the source.
- Eight rivals derived offline from the kit bodies (`scripts/avatar/roster-from-kit.mts`, 0.8–1.2 MB each).
- The swap: `public/models/fel-hero.glb` is the male kit body, `public/models/athletes/` the kit roster, the forge hero and
  roster under `public/models/_forge/`. Sweep on the male kit body before the swap: 40 of 40 gauntlet rows clean.
- Closet pose probe gains yaw and tone options; development only: `?tone=<hex>` previews a skin tone.

**Mocap groundwork** (`04db861`, `ee2d985`, `f261b76`)
- Five takes segmented by motion energy (golf 5.4 s, tennis serve 3.5 s, baseball pitch 2.6 s, volleyball spike 3.3 s,
  football catch 8.2 s). Golf on the rig: hand rises 0.98 → 1.62 m; hands opened to 0.71 m at extension (D-M1, closed above).

**Pass 3 phases moved or open:** 5 anatomy layer and 6 body physics stay with pass 3 (owner decision); 7 boundaries, 9 camera
and 10 maps were delivered as pass 4 phases 3, 6 and 2.

### Camp (outside the passes, 2026-09-03 → 04)
- The owner's Camp Blueprint (eight-week facilitator curriculum) is filed at `docs/CAMP-BLUEPRINT.md` and mirrored as
  `lib/camp/curriculum.ts`; `/camp` gains a Curriculum tab and the Session tab shows the arc week, output, script and Bridge prompt.
- The Pathway Map worksheet saves to the mentee's plan (`GoalPlan.pathwayMap`), per plan, by facilitator or mentee (`cbc1129`).

### Tooling (pass 2 tail, 2026-09-03)
- Capture: time-to-loaded beside time-to-playing (`fc9b767`); the load-time budget is set from time-to-loaded (`eac88ac`).

## 0.9.0-rc.1 — 2026-09-03 · release candidate

### Ship pass 2 — launch readiness
- Shipping-route gauntlet (`scripts/gauntlet-play.sh`): all twenty Babylon `/play` routes, logged in.
- Production-mode gauntlet (`scripts/prod-serve.sh`): the built bundle served on :3004 and swept.
- Character containers cached per scene; a disposed scene's container no longer reaches the next spawn.
- Identity watchdog judges compilability after sixty rendered frames; force-compiles before reporting.
- Game shell: an unreachable-server state with Retry. Harness: WebGL context loss becomes a named error state.
- Game diagnostics leave the browser as `game_diag` analytics events; owners read `/api/admin/diag`.
- Session carries the user's role (every `/api/admin/*` had answered 401). Analytics route logs rejected batches and failures.
- Baked venue maps optimized 36 → 26 MB (dedup, prune, weld, quantize).
- Controller Link entries for ones, karate, karate versus, carnival.
- Capture tooling: mobile quality tier, CPU throttle, time-to-playing, fault injection (missing model, slow asset, offline, context loss).
- Security headers; dev harness routes 404 outside development; CI workflow (type-check, tests, production build).
- Repo: the stale root twin archived under `_archive/root-twin/`; probes under `scripts/probes/`.

### Ship pass 1 — every mode to its benchmark (2026-09-02 → 03)
- Import the fel-app-handoff state: avatar/map/backdrop pipelines and nine more sign-offs
- Gap reports for both directive workstreams, before any implementation
- Gauntlet baseline: fill the frame-budget table, fix the mobile sweep
- Ship-pass plan, owner decisions, and a correction to the fidelity report
- Ship pass, phases 0–3: forge hero by default, quality tiers, alive layer, face
- Ship pass, phases 3–4: hair styles, eight-body roster, real strikes, basketball packages
- Basketball packages: the left arm's forward swing is mirrored
- Phases 4–6: 3v3 heads on the ball, a rival that sidesteps, signed spins, net touch
- Phase 6 baseball packages, the air modes' final banner beat, a stable rival read
- Round-two owner decisions: karate endless lock, keeper round, free-approach dunk, Camp starts
- Phase 7: Camp Blueprint data model and the curriculum draft
- Phase 7: the Camp Blueprint API, walked end to end
- Phase 8: the Camp screens — certify, intake, session, templates
- Locks: karate endless already had a benchmark; owner to confirm the SoR4 answer
- Round two: the keeper round, the free-approach dunk, the alley-oop, a bat
- Locks: karate endless is the horde brawler (Matrix Revolutions / Pirate Warriors)
- Karate endless lock: the horde grammar, measured against the code
- Round three: the horde pass, a playoff, a shown blitz, PBR props, the session runner
- Phase 9: retired routes verified dark when logged in; the scram-switch assigner
- Fidelity report: status of the ranking as of 2026-09-03
- Camp: the delta helpers as a pure module with tests
- Probes: the Closet hair-and-slider round trip; the mobile start sampler
- Round four: switching, the ball in hand, PBR worlds, the skate snap, the Closet fix
- Closet: tinted skin never rendered — tint clones now share the pore map
- Gauntlet: logged-in captures and a material-readiness watchdog
- Pure node-space two-bone IK (tested) and the handoff's Closet lesson
- Foot planting returns on the node-space solver
- Dribble cycle and arm reach: pure modules for hand IK on the ball
- ballCarry: the live dribble helper (ball off the palm, arm reaches), tested on a linked-node rig
- ballCarry applies after animations (the harness updates modes before render)
- ballCarry: hand the ball back only when it is still ours (steals, releases)
- The ball leaves the hand: live dribble with hand IK in 1v1 and 3v3
- Phase 9: gate /dev/anim and /dev/rig outside development; auth and route review recorded
- Authored clips for golf, tennis, volleyball and soccer, proven on the forge rig
- Register the sport clips; safe-play accepts registered clips; camera fallback tagged; security headers
- Rest solve is root-relative: rigs off-centre or facing +z lost every rest-based clip
- Capture: TIER=mobile runs a mode in a phone-shaped touch context (mobile quality tier)
- Gauntlet: seven modes on the mobile quality tier; rounds seven and eight recorded
- FrameGuard: log from the second consecutive miss, as it already acts

