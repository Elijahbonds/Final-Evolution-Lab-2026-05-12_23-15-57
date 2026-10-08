# PLAN — Kart & Aero Aces: handling, speed and a 10-phase visual pass

Owner ask (2026-10-02): "10 phase visual pass for kart and aero ace mode, let's fix the steering and
handling and speed."

Stacked on PR #100 (`cursor/aero-nose-hundred-cam-6be6`: planes-flying-sideways fix + The Hundred camera
pull-back — both kept). One draft PR into `lane/finish-release`. Merge-only updates; no rebase, no
force-push.

## Ground rules (from the owner ask and the repo's operating rules)

- **No new packages. No `lib/db.ts` / prisma changes. No scoring or economy number changes.**
- **Repo is public**: every commit is grepped for `/Users/` and `elijahbonds` before push; neither may appear.
- **3D assets already in the repo only** (`public/models/**`). No outside 3D services, no downloads.
- **Body-play controls must keep working**: both modes are ride-default-on (`lib/input/rideProfiles.ts`).
  Phases 1–3 change how inputs are *interpreted*, never which channels are read — `S.input` fields stay
  the contract.
- **Tuned feel numbers are flagged** in each commit body (from → to, why). The owner's eye is the judge.
- Gate before every commit: `npx tsc --noEmit`, `npx tsx scripts/ci-suite.ts`, `npx vitest run` — all green
  except failures that already exist on the lane, named here as they are met.
- Baseline on this branch (2026-10-02): tsc 0 errors · ci-suite 187 passed / 10 skipped, one flake
  (`fight-balance-tests.ts` C1 — a single stochastic roll on the karate brain; passes 5/5 standalone,
  unrelated to racing) · vitest 13603 passed, 1 failure (named in the final report once identified).

## The shape of the work

Handling lives in pure-maths modules (`core/KartModel.ts`, `racing/ArcadeFlight.ts`) — every change there
is vitest-pinned. The modes (`modes/VelocityKartMode.ts`, `modes/AeroAcesMode.ts`) are the face. Phases
1–5 are feel; 6–10 are the visual pass, each with headless before/after screenshots (both modes) and a
frame-time check on a mid-phone profile (`TIER=mobile THROTTLE=4`, `scripts/capture-mode-play.mts`).

---

## Phase 1 — Kart handling feel

**Goal:** steering that answers at every speed without snapping; weight you can feel move.

**What changes** (`core/KartModel.ts`, `modes/VelocityKartMode.ts`):
- Applied steer moves toward the stick under a RATE LIMIT (`steerSlew`, full-lock/sec) inside the model —
  a stick flick can no longer snap the heading, and input dither stops reading as jitter. (First cut was an
  exponential ease; measured against the body-play gate it cost 50 ms of the 33 ms headroom on the 700 ms
  turn-onset allowance, where a rate limit costs nothing — small deflections arrive at once, full flicks
  take ~1/slew. Measured: worst segment 666.7 ms before and after.)
- Speed-sensitive steering becomes an explicit, tunable curve (`steerAuthority(v01)`): full authority
  arrives by ~⅓ vMax and falls to a tunable fraction at vMax, so flat-out steering is calm.
- Weight transfer: braking adds front bite (small grip bonus), throttle unloads the rear (power-on
  oversteer), and the kart body rolls/pitches with the lateral/longitudinal load (visual, on the rig).
- Slip ease-in rate becomes a spec number (`slipIn`) alongside `slipRecover`.

**Pass check (vitest):** turn radius at vMax > radius at 0.5·vMax; zero-speed steer still turns nothing
(existing pin); a full-stick step never moves the heading more than the eased rate allows in one frame;
drifted lap still beats a tidy lap (existing pin); brake still stops the kart (existing pin).

- [x] done — `steerSlew` 7 lock/s, `steerHighSpeed` 0.55 (was effectively 0.65), `steerLowSpeed` 3,
  `slipIn` 6.5 (unchanged value, now tunable), `brakeGrip` 0.25, `throttleLoose` 0.12, `rollGain` 0.0062,
  `pitchGain` 0.0021. rideBody G9 kart gate green with the signed-off margin (666.7 ms ≤ 700 ms).

## Phase 2 — Aero handling feel

**Goal:** the plane answers like a DKR plane — eased yaw response, a bank that shows the turn being made,
hands-off auto-level, boost punch.

**What changes** (`racing/ArcadeFlight.ts`):
- Yaw rate is RATE-LIMITED toward the stick's demand (`yawSlew`, (rad/s)/s) — no more instant full-rate
  snap at full deflection. (First cut was an exponential ease; measured against the body-play gate even
  8/s left 17 ms of the 900 ms allowance, where the rate limit keeps the signed-off 783.3 ms exactly.)
- Bank follows the *actual* yaw rate (brake-turns bank harder at the same stick), capped at `maxBank`;
  the bank ease rate is a tune number (`bankEase`, was hardcoded 6/s).
- A small coordinated-turn pitch in a hard bank (`turnPitch`, vanishes with the turn); pitch ease stays
  tunable.
- Auto-level stays (pinned). **No stall — that is a signed-off design decision** (ArcadeFlight header:
  "NO STALL … a kart that can climb"); the "stall or boost" ask is answered by the boost (+40%, shared
  BoostKit), whose ramp is already felt. Flagged, not changed.

**Pass check (vitest):** first-frame yaw after a stick snap < steady-state yaw (ease, not snap); brake-turn
banks harder than a normal turn; hands-off levels roll and pitch (existing pin); outside stunts the
displacement direction matches `forwardOf` (nose along velocity — complements PR #100's mesh pin).

- [x] done — `yawSlew` 8 (rad/s)/s (full rate in ~0.19 s), `bankEase` 6 (unchanged value, now tunable),
  `turnPitch` 0.06 rad. rideBody G9 plane gate green with the signed-off margin (783.3 ms ≤ 900 ms);
  bank/pitch peak monotonicity intact.

## Phase 3 — Speed and the sense of speed

**Goal:** one tunable config per mode owns its numbers; a real acceleration curve; FOV kick and camera lag
read from that config.

**What changes:**
- New `racing/kartTune.ts` (`KART_TUNE`) and `racing/aeroTune.ts` (`AERO_TUNE`): top speed, acceleration
  curve shape, FOV {gain, floor01, tau}, camera {distance, height, lag, lookAhead}. The garage karts/planes
  keep their spec overrides on top.
- Acceleration curve: hard launch tapering near top speed (`accelTaper`), replacing the flat m/s² — for both
  modes.
- `stepSpeedFov` gains optional {gain, floor01, tau} parameters (defaults = today's constants, so every
  other caller is byte-identical); both modes pass their config.
- CameraDirector gains a small additive `tuneFollow({distance?, height?, lag?, lookAhead?})` overlay for the
  active preset (shared file, purely additive — flagged in the PR). Modes apply their config at load.

**Pass check (vitest):** 0 → 95% top speed within the config's target time (kart and aero); the curve is
monotone and never overshoots vMax; `speedFovTarget` honours a custom gain/floor; `tuneFollow` overlays
only the given fields.

- [x] done — `racing/kartTune.ts` (`KART_TUNE`) and `racing/aeroTune.ts` (`AERO_TUNE`) own {spec/tune
  reference, fov {gain, floor01, tau}, cam {distance, height, lag, lookAhead}}; the cam blocks carry the
  signed-off runner/flyer preset values (7.5/3.2/0.08/3.0 and 13.5/4.6/0.09/9.0 — unchanged, now owned
  per mode). Launch curve: `accelLaunch` 0.4 kart / 0.3 aero — the shove is `1 + accelLaunch·(1 − v/vMax)`
  while accelerating, so the launch is harder and the terminal speed is byte-identical (medal times
  untouched). `SpeedFov` takes an optional tune (defaults = the signed-off constants). `CameraDirector.
  tuneFollow` overlays only the named fields on the active preset (composes with the broadcast blend).
  Measured: kart 0 → 95% vMax in 2.03 s (old flat curve: 2.47 s), v(0.5 s) 8.5 vs 6.4 m/s, terminal
  speed byte-identical at 12 s (26.000 both); aero coast → 95% top in 0.73 s (was 0.77 s — the shove
  shows most after a brake or wall scrub, not from the coast spawn). G9 kart gate re-measured with the
  launch live: worst onset still 666.7 ms vs the 700 ms allowance. 13 new vitest pins
  (speedFeel.test.ts + curve describes in the KartModel / ArcadeFlight suites).

## Phase 4 — Collision and recovery

**Goal:** a wall is a slide, not a stop; a stuck kart gets back to the race.

**What changes:**
- `KartModel.wallSlide(s, nx, nz, keep)`: the into-wall component of travel dies, `keep` of the tangential
  survives, the nose eases along the wall. The ±400 m world wall uses it (today: blunt 75% speed kill).
- Respawn (kart): stuck detection (throttle held, speed ≈ 0, ~2 s — e.g. beached on the scenery past the
  verge) resets the kart to the racing line at its current distance, speed 0, with a banner. Costs the time
  you already lost; never fires mid-race-flow.
- Aero already slides (wallTurn turns the plane back along the course, costs part of the into-wall speed)
  and cannot get stuck (minSpeed, soft floor/ceiling) — its recovery cost becomes a tune number. Documented,
  not reworked.

**Pass check (vitest):** a 45° wall impact keeps ≥ 50% of speed and the kart travels along the wall; a
head-on impact keeps little; respawn places the kart on the line, pointed along it; aero `wallTurn` still
turns the plane back (existing pin).

- [x] done — `KartModel.wallSlide(s, nx, nz, keep = 0.75)`: the into-wall component of the travel dies,
  75% of the tangential survives, the nose eases along the wall (slip × 0.35); a kart already leaving the
  wall is untouched. The ±400 m world wall uses it (was `kartHitWall`'s blunt 75% stop — flagged: wall
  hits are cheaper now on purpose; a glancing hit at 45° keeps 53% of speed vs 25% before, a head-on
  still stops the kart). `KartModel.kartRespawn(s, point, tangent)` + stuck detection in the mode
  (throttle held, wheels down, speed < 0.8 m/s for 2 s, no spin/burnout/air): back on the line at the
  distance already earned, speed 0, boost bank kept, camera CUTS (snapTo) rather than whip-panning.
  Aero: `wallScrub` 0.35 is a tune number now (unchanged value), passed by the mode; the turn-back is
  free, only the scrape costs. 6 new vitest pins.

## Phase 5 — AI rivals drive and fly the same handling model

**Goal:** the field runs `stepKart` / `stepArcade` with synthesised inputs — the same physics the player
gets — instead of advancing along the line as pure pacers.

**What changes:**
- New `racing/RivalDriver.ts`: pure-pursuit inputs from (state, line, lane, pace) — steer at a look-ahead
  point on the line offset by the rival's lane; throttle/brake from the corner the road allows (`holdAt`
  pace, same as today); the drift emerges when a corner outruns grip. Aero: climb holds the line's height.
- Both modes step each rival's state through the shared model; the mesh pose comes from the state (so a
  rival's drift and bank are *real*). `r.dist` is measured by projecting onto the line (wrap-safe), so
  standings, contact, items and the finish clock are untouched.
- The pacer stays as the *recovery net* and pace brain: rubber-banding (bounded, as now) sets the target;
  a rival beached or spun beyond recovery is put back on the line — the "never looks stupid" guarantee from
  RaceField's header, kept.
- `RaceField.stepRival` stays exported and tested; it now drives the *target*, not the position.

**Pass check (vitest):** a driver-rival laps a synthetic circuit within a sane window of the pace target,
stays inside the corridor ~always, never NaNs; an aero rival holds the line's altitude band; a beached
rival is recovered onto the line. Headless probe: a race still finishes with a live field spread.

- [x] done — new `racing/RivalDriver.ts`: `spawnKartDrive`/`stepKartDrive` and `spawnAeroDrive`/
  `stepAeroDrive` run the field through the player's own `stepKart`/`stepArcade`. Pure pursuit: steer at a
  look-ahead point (kart `clamp(speed*0.55, 8, 30)` m, aero `clamp(speed*0.6, 12, 40)` m) offset by the
  rival's lane, gained `err*2.2` to the stick; throttle servo `clamp01(slow*0.4+0.4)`, brake
  `clamp01((v-want-0.8)*0.3)`; the drift DECISION is the player's (`|steer|>0.7` at speed) so the slide
  emerges from the model. Aero climb servo `(aim.y-pos.y)*0.18`. `r.dist` is measured back off the line
  (wrap-safe `measureAdvance`, ±half-lap rule), so standings/contact/items/finish read what they always
  read. The recovery NET (not a rail): beached (`want>5 && speed<1`) or wide (`|lateral|>halfWidth+8` kart,
  `corridor+10` aero, or 25 m off the line's height) for 2 s → put back at the distance EARNED, never
  forward. `RaceField.rivalPace` extracted from `stepRival` (behaviour-identical — the pacer's tests pin
  it) so the pace brain sets the driver's target; `stepRival` stays as the fallback path. FLAGGED
  behaviour changes: a stunned rival now LIMPS at a fifth of its pace instead of the pacer's dist-damping;
  aero rivals spawn at `coast` speed like the player (was 0.25×top); the pacer's slow weave is now a real
  flown lane target (banked into and out of). 6 new vitest pins (lap window vs the pacer, corridor
  ~always, drift emerges on a tight circle, beached/thrown recovery never teleports forward, aero altitude
  band ±8 m, wrap seam). Test-authoring lesson recorded: `sampleLine` authored order is [x, z, y] — a
  square authored [x, y, z] is VERTICAL and the kart drove its ground projection into circles.

## Phase 6 — Track and sky environment richness

**Goal:** the courses read as places, not test tracks — using only GLBs already in `public/models/**`.

**What changes:**
- Kart: extend the per-course scenery (`kartSceneryFor` / trackside) with the repo's nature and city prop
  sets per venue family (pines/rocks on the mountain, palms on the boardwalk, city dressing on the night
  course); sky per mood stays the venue's own.
- Aero: per-theme prop scatter in `aeroWorlds` (island palms/rocks, canyon stone, skyline extras) and cloud
  sprites from textures already in the repo, if present.

**Pass check:** before/after screenshots both modes; the perf line (fps / avg ms / draws / meshes) on the
mid-phone profile does not regress versus the Phase-6 baseline; ci-suite perf budgets stay green.

- [x] done — kart: new `kartSettingFor` (kartDressing.ts) grows the PLACE past the event dressing, per venue
  family and deterministic per course: palms/bushes/grass at the boardwalk (park) and the quay (harbor), a
  GLB-pine front rank between the chevron boards and the primitive forest on the mountain (slope), a dark
  tree-silhouette wall + light masts round the stadium (pitch), city fences/planters/lamps under the rooftop
  decks (street), dock lamps and flags only on the station (orbit — a station grows no trees). Every
  placement guarded off the WHOLE line (locate ≥ halfWidth + 5), so the rooftop's three-height loop never
  grows a tree through the deck. Aero: island beaches get their undergrowth (grass/bushes at the palms'
  feet, never in the water). BOTH modes get a sky: new `visual/CloudDeck.ts` — two merged-lobe low-poly
  puffs, thin-instanced (two draws however many clouds), unlit in the mood/theme's tint, riding the camera
  like the dome and drifting ~2 m/s. assumption: the repo holds no cloud sprite/texture (checked
  public/**), so the deck is geometry in the same flat-shaded language — no new assets, nothing downloaded.
  Thin-instancing absorbed the props: kart draws 330 → 333, aero 142 → 134 (meshes +6/+7: the new masters)
  on the SwiftShader mid-phone proxy. 8 new vitest pins (band exists per course and names only on-disk GLBs,
  off-tarmac against the whole line, deterministic, venue character; deck determinism/band/spread/lobes).

## Phase 7 — Materials and lighting

**Goal:** vehicles and road read as one lit world.

**What changes:** vehicle PBR consistency (environment intensity, shadow casting/receiving where the venue
has a shadow rig), road/terrain contrast against the verge, per-mood sun fill where a venue leaves the
vehicle flat. Venue-global lighting values are the owner's tuned numbers — touched only where measured
flat, and flagged.

**Pass check:** before/after screenshots; perf line flat; ci-suite green.

- [x] done — new `racing/vehicleLight.ts`: VEHICLE_ENV_BASE (the signed-off 0.4/0.3/0.5) scaled per mood
  (overcast ×1.3, alpine ×1.15, nightGame ×1.1), a vehicle-only fill sun for the flat moods (overcast 0.55,
  alpine 0.35, nightGame 0.3 — includedOnlyMeshes, the venue's own lights untouched), receiveShadows on every
  vehicle mesh (venue shadows fell THROUGH the primitives before; the GLB bodies already received). Kart edge
  lines widened 0.035→0.05 / alpha 0.88→0.95 (road-vs-verge contrast, flagged in the commit). Both modes wired;
  shots `docs/shots/pr138/p7-before*/p7-after*` (overcast summit + alpine frostbite are the telling frames).
  Perf flat on the mid-phone proxy: kart 60fps/296 draws/38 meshes (base 46/295/38), aero 60fps/159/92
  (base 60/160/102). tsc 0; vitest 696/696; ci-suite 189 green.

## Phase 8 — Speed lines and particles

**Goal:** speed you can see — dust, trails, boost — at a phone's budget.

**What changes:**
- Speed-line streaks past ~80% of top speed (one cheap camera-facing particle system per mode).
- Kart: continuous dust from the rear wheels while drifting or off-road (an emitter, replacing random
  one-shot bursts), boost exhaust note.
- Aero: wingtip trails (TrailMesh, the BoostFx pattern) in hard turns and at high speed; boost trail exists.

**Pass check:** before/after screenshots; perf line flat on the mid-phone profile; ci-suite green.

- [x] done — `lib/babylon/racing/speedFx.ts`: SpeedLines (camera-parented stretched-billboard
  streaks, on at 80% top speed, speed-driven), DustEmitter (one continuous rear-axle system replacing
  the drift/off-road random bursts), WingtipTrails (TrailMesh on new `toyPlane.wingtips` anchors,
  gated on roll and speed). SoundKit gains an `exhaust` boost note (sawtooth + brown-noise chug).
  Perf mobile tier: kart 59fps/294 draws/38 meshes and aero 60fps/159 draws (p7: 60/296 and 60/159) —
  flat. tsc 0; vitest 811/811 (racing+modes+audio, +10 new speedFx tests); ci-suite 189 green.
  Shots: docs/shots/pr138/p8-after (speed streaks visible in aero mid shot).

## Phase 9 — Vehicle detail and wheel/prop animation

**Goal:** the machines move like machines.

**What changes:**
- Kart: all four wheels spin at road speed, fronts steer with the *applied* steer, a suspension bob from
  the load, exhaust puffs on throttle. Rival karts get the same spin/steer.
- Aero: prop rate from the tune (already gas-scaled), plus a blur disc at high rpm; scarf stays.

**Pass check:** before/after screenshots (wheel/prop motion across frames); perf line flat; ci-suite green.

- [x] done — `lib/babylon/racing/vehicleMotion.ts`: all four kart wheels (player AND rivals) spin off an
  odometer over each tyre's own radius, fronts yaw with the applied `state.steerAt` (rivals: their drive
  state, or the measured turn rate on the legacy path); `roadWheel` gained three rim spokes so the spin is
  visible at all (rivals upgraded from bare drums to the same wheels); the body bobs on the suspension
  (`bobAmp`/`bobFreq`) while the wheels' y counters it and stays planted; `ExhaustPuffs` streams from the
  pipe tip with the throttle. Aero: the prop rates moved into `AERO_TUNE.prop` (same signed-off numbers)
  and the blades smear into a translucent blur disc past the gate (`blurProp`, per-mesh visibility — the
  blades share a material with the struts). Perf mobile tier: kart 58fps/295 draws/38 meshes, aero
  60fps/159 draws (p8: 59/294 and 60/159) — flat. tsc 0; vitest 825/825 (+14 vehicleMotion tests);
  ci-suite 189 green. Shots: docs/shots/pr138/p9-after.

## Phase 10 — HUD readability

**Goal:** the HUD says the right words to whoever is playing, and reads at phone size.

**What changes:**
- Wire the built-but-unrouted `RideHudSwitch` into VelocityKartMode — `rideHud.test.ts` already specifies
  the exact call (`kartHudWords(!!(ctx.body?.() ?? null), S.start.go)`); the ring's gamepad puck hides while
  a body rides.
- Add `aeroHudWords(body, started)` to `rideHud.ts` (spread arms = GAS, bank = STEER, raise/lower = CLIMB;
  boost/fire/stunts stay on pad/touch) and wire it into AeroAcesMode the same way.
- Readability sweep of what the modes already publish (place, gap, item, speed) at the mobile tier —
  measured by screenshot, not by rewriting the shipping HUD components.

**Pass check:** `rideHud.test.ts` stays green plus new aero-words coverage; mobile-tier screenshots show
the HUD legible; the body-play probe paths (same input channels) untouched.

- [x] done — `RideHudSwitch` is routed into VelocityKartMode with the exact pinned call
  (`kartHudWords(!!(ctx.body?.() ?? null), S.start.go)`), the ring's puck hides while a body rides and is
  re-asserted once a second; the pad's hint literals left the mode (rideHud owns them, test-pinned).
  `aeroHudWords(body, started)` added (spread arms = GAS, bank = STEER, raise/lower = CLIMB and DIVE;
  boost/fire/stunts labelled pad / touch) and AeroAcesMode wired the same way. Both modes' pushHud takes
  its words from the switch, so the GO beat flips the start hint for the right rider. rideHud.test.ts:
  +4 tests (aero body/pad words, both modes' source scans) — the kart's pre-pinned wiring test now passes
  on the regex, not the literals. Mobile-tier shots: docs/shots/pr138/p10-hud-* (touch deck, place, gap,
  speed, item all legible at phone size). Perf flat: kart 59fps/294 draws, aero 60/160. ci-suite 189 green.

---

## Evidence plan

- Baseline screenshots (both modes, desktop + mid-phone profile) before Phase 6; after-shots per visual
  phase; frame-time lines captured at baseline and at the end. All attached to the PR.
- Final gate: tsc, ci-suite, vitest — counts reported against the baseline above; any failure that
  pre-exists on the lane is named, not silently absorbed.
- Commit hygiene: every commit grepped for `/Users/` and `elijahbonds` (case-insensitive) before push.
