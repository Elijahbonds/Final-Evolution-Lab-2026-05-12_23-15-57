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
- Yaw rate eases toward the stick's demand (`yawEase`) — no more instant full-rate snap at full deflection.
- Bank follows the *actual* yaw rate (brake-turns bank harder), capped at `maxBank`.
- A small coordinated-turn pitch in a hard bank; pitch ease stays tunable.
- Auto-level stays (pinned). **No stall — that is a signed-off design decision** (ArcadeFlight header:
  "NO STALL … a kart that can climb"); the "stall or boost" ask is answered by the boost (+40%, shared
  BoostKit), whose ramp is already felt. Flagged, not changed.

**Pass check (vitest):** first-frame yaw after a stick snap < steady-state yaw (ease, not snap); brake-turn
banks harder than a normal turn; hands-off levels roll and pitch (existing pin); outside stunts the
displacement direction matches `forwardOf` (nose along velocity — complements PR #100's mesh pin).

- [ ] done

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

- [ ] done

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

- [ ] done

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

- [ ] done

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

- [ ] done

## Phase 7 — Materials and lighting

**Goal:** vehicles and road read as one lit world.

**What changes:** vehicle PBR consistency (environment intensity, shadow casting/receiving where the venue
has a shadow rig), road/terrain contrast against the verge, per-mood sun fill where a venue leaves the
vehicle flat. Venue-global lighting values are the owner's tuned numbers — touched only where measured
flat, and flagged.

**Pass check:** before/after screenshots; perf line flat; ci-suite green.

- [ ] done

## Phase 8 — Speed lines and particles

**Goal:** speed you can see — dust, trails, boost — at a phone's budget.

**What changes:**
- Speed-line streaks past ~80% of top speed (one cheap camera-facing particle system per mode).
- Kart: continuous dust from the rear wheels while drifting or off-road (an emitter, replacing random
  one-shot bursts), boost exhaust note.
- Aero: wingtip trails (TrailMesh, the BoostFx pattern) in hard turns and at high speed; boost trail exists.

**Pass check:** before/after screenshots; perf line flat on the mid-phone profile; ci-suite green.

- [ ] done

## Phase 9 — Vehicle detail and wheel/prop animation

**Goal:** the machines move like machines.

**What changes:**
- Kart: all four wheels spin at road speed, fronts steer with the *applied* steer, a suspension bob from
  the load, exhaust puffs on throttle. Rival karts get the same spin/steer.
- Aero: prop rate from the tune (already gas-scaled), plus a blur disc at high rpm; scarf stays.

**Pass check:** before/after screenshots (wheel/prop motion across frames); perf line flat; ci-suite green.

- [ ] done

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

- [ ] done

---

## Evidence plan

- Baseline screenshots (both modes, desktop + mid-phone profile) before Phase 6; after-shots per visual
  phase; frame-time lines captured at baseline and at the end. All attached to the PR.
- Final gate: tsc, ci-suite, vitest — counts reported against the baseline above; any failure that
  pre-exists on the lane is named, not silently absorbed.
- Commit hygiene: every commit grepped for `/Users/` and `elijahbonds` (case-insensitive) before push.
