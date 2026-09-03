# FEL — Handoff Context

Everything a new agent (GitHub Copilot, or a fresh session) needs to keep
building this without repeating work or re-learning the traps.
Written 2026-09-01.

---

## 1. What this is

**FEL (Final Evolution Lab)** — a browser-native sports/action platform.
Next.js 14 (App Router) + **Babylon.js 9.23**, Prisma/PostgreSQL, NextAuth
(Credentials + JWT), Stripe. ~20 playable 3D game modes sharing one engine
harness.

**Repo layout matters.** The app is `FEL-full-app/` inside the tracked repo
root. **Several governing documents live at the ROOT, one level above the app** —
`PHASE2_BENCHMARK_LOCKS.md`, `MASTER_MODE_LIST.md`, the `AUDIT_*.md` set. Missing
that cost this project three separate false starts (see §7).

```
finalevolutionus-automatic-carnival/     ← tracked repo root
├── PHASE2_BENCHMARK_LOCKS.md            ← THE benchmark authority
├── MASTER_MODE_LIST.md                  ← stale on status, useful for the roster
├── AUDIT_*.md, PHASE*_*.md              ← historical, unreliable for status
└── FEL-full-app/                        ← the application
    ├── app/                             ← routes (/play/<slug>, /dev/mode/<key>)
    ├── components/games/                ← host components (the React side)
    ├── lib/babylon/                     ← ALL gameplay
    │   ├── core/                        ← harness, camera, input, physics, guards
    │   ├── modes/                        ← one file (or shared file) per mode
    │   ├── anim/                         ← clip registry, authored clip suites
    │   ├── visual/, audio/, ui/          ← VenueKit, SoundKit, TouchOverlay
    │   └── nexus/venueSpecs.ts           ← declarative venue definitions
    ├── scripts/                          ← headless tests + playwright drivers
    └── docs/                             ← protocols, concept locks, sign-offs
```

## 2. How to run and verify

```bash
npm install                 # works without --legacy-peer-deps as of this pass
npx prisma generate
npm run dev                 # http://localhost:3000
npx vitest run              # 64 tests / 4 files — MUST stay green
npx tsc --noEmit            # must be clean
npm run build:check         # NEXT_DIST_DIR=.next-verify — never clobbers dev
```

**Never run a bare `npm run build` while the dev server is up** — it clobbers
`.next` and the running server dies. `build:check` exists for this.

### Two routes per mode
- `/dev/mode/<registryKey>` — dev harness. Dumps the raw HUD object as JSON,
  which is what the capture scripts parse.
- `/play/<routeSlug>` — the shipping route. Requires a login and renders the real
  bezel. **Phase 9 must use this one.**

**Route slug ≠ registry key.** `/play/baseball` → `derby`; `/play/soccer` →
`penalty`; `/play/snowboard` → `snowboard_slalom`. `/play/derby` does not exist.
A wrong key still returns HTTP 200 and reports `FEL-FRAME 0 / MISSING CLIP 0 /
errors 0` because **nothing loaded** — the dev page's first line says
`no registry mode "<key>"`. Read it.

## 3. The governing process

Two documents in `docs/` are the process, and they are not optional:

- **`10-PHASE-CONVERGENCE-PROTOCOL.md`** — every mode goes through ten phases,
  each ending in a runnable proof. Phase 1 is a **Concept Lock**
  (`docs/concept-lock/<mode>.md`), Phase 10 is the **§7 sign-off**
  (`docs/concept-lock/<mode>-signoff.md`).
- **`WORLD-POPULATION-PROTOCOL.md`** — L1–L5 for venues. *"Populate for
  legibility first, atmosphere second."*

### Rules that have repeatedly proved their worth
- **§7.3 — never invent a benchmark.** If a mode has none, stop and ask. Every
  benchmark is in `PHASE2_BENCHMARK_LOCKS.md`.
- **Assert against reality, not yourself.** Tests must check the real sport or
  the real benchmark, not our own constants. This caught an unreachable slalom
  gate and a spike that could not clear a net.
- **Report failures.** Two sign-offs were written at 6/8 and later fixed to 8/8.
  A sign-off that hides a failure is worse than none.

## 4. Mode status (13 through the checklist)

| Mode | Registry key | Benchmark | State |
|---|---|---|---|
| 3PT Shootout | `threepoint` | NBA 2K9 3PT Contest | ✅ 8/8 |
| Dunk Contest | `dunk` | NBA Live 08 | ✅ 8/8 |
| Basketball 3v3 | `threevthree` | NBA 2K | ✅ 8/8 |
| Streetball 1v1 | `onevone` | NBA 2K | ✅ 8/8 |
| Karate VS | `karate_vs` | Soul Calibur | ✅ 8/8 |
| Skate Run | `skateboard` | Skate 3 | ✅ 8/8 |
| Surf Break | `surf` | SSX | ✅ 8/8 |
| Snowboard Slalom | `snowboard_slalom` | SSX | ✅ 8/8 |
| Karate Endless | `karate` | Soul Calibur + COD Zombies | ✅ 8/8 |
| Volleyball | `volleyball` | Nintendo Switch Sports | ✅ 8/8 |
| Tennis | `tennis` | Mario Tennis Aces | ✅ 8/8 |
| Golf | `golf` | PGA Tour 2K | ✅ 8/8 |
| **Baseball (Derby)** | `derby` | MLB The Show (Hitting) | ⚠️ **in progress** |
| **Soccer (Penalty)** | `penalty` | PES Penalty Mode | ⚠️ locked, not signed |

Unsigned and untouched: `football`, `gymnastics`, `bigair`, `sprint`,
`carnival`, `mixedcombat`, `dunkduel`, `showdown`, `duel`, `dance`.

**Project-wide caveat: nothing has ever run on real hardware.** Every Phase 9 is
a desktop capture plus a 390×844 emulated touch pass.

## 5. Immediate next work

1. **Baseball (`derby`) — 4 frame warnings, and they are new for a good reason.**
   It reported 0 yesterday because it **soft-locked** on the first mistimed
   swing and nothing further happened. It now plays all ten pitches and the
   camera has real work to do. Diagnose with `scripts/pci-drive.mts`.
2. **Baseball Phase 6** — no World-Population pass on the ballpark.
3. **Soccer (`penalty`) Phases 6–10** — the mode itself is in good shape (feints
   are a real commitment trade); it needs the venue pass and a sign-off. Its
   named gaps are sudden death and a keeper with memory.
4. **Golf**: 18 holes is deliberately 3; putting exists but has no green read.
5. **Tennis**: Zone Speed and the trick-shot dash are deliberately absent — they
   need player *positioning*, which this core does not have.

## 6. Architecture you must know

### The harness
`lib/babylon/core/ModeHarness.ts` → `runMode(def, opts)`. A mode is a
`ModeDefinition`: `{ modeId, mood, camPreset, load, onInput, update, dispose }`.
The harness owns the engine, camera, lights, backdrop, `InputBus`,
`CameraDirector`, `FrameGuard`, and the phase machine
(`loading→ready→countdown→playing→paused→ended`).

### Camera — `CameraDirector`
- `snapTo(subject, objective)` at load, `update(subject, velocity, objective)`
  **every frame**. Both are Phase 3 exit criteria.
- **Use `follow` mode.** `setFixedBehind` exists but its handoff with `snapTo`
  caused golf's hardest bug. For a stationary subject, pass a **unit vector
  toward what you are aiming at** as `velocity` — the director uses it to decide
  which way "behind" is. Karate Endless and golf both do this.
- `suspended = true` for authored cinematics (a flyover, a replay). FrameGuard
  honours it.
- `pulse(strength, sec)` is a push-in for big moments.

### Guards that will fail your build
- **`FrameGuard`** — logs `[FEL-FRAME] hero off-screen` with **which side of the
  lens** the subject is on (measured by dot product), the projected pixel, view
  size, clip planes, camera forward, director mode and suspend state. Trust the
  forward vector over your reading of the code.
- **`scripts/verb-key-alignment-tests.ts`** — every mode in
  `ENABLED_BABYLON_MODES` must have a `MODE_VERBS` entry, and every face button
  a mode *reads* must be offered on the overlay. Scoped per-mode inside shared
  files.
- **`scripts/headless-checks.suite.test.ts`** — runs every `scripts/*-tests.ts`
  under vitest. Add new suites here.

### Input
`InputBus` → `FelInput`: `stick | button | trigger | dpad`. Keyboard: WASD =
left stick, `j`=A `k`=B `l`=X `i`=Y, **space = analog R-trigger** (ramps over
1.1s; its release also fires A). Touch goes through `TouchOverlay` +
`MODE_VERBS` (four face slots, no more). Phones join via **Controller Link**
(`lib/controller-link/schemas/registry.ts`) — a mode with no entry there is a
phone that silently never joins.

## 7. Traps that have each cost hours

1. **Read the right file.** `lib/babylon/modes/GolfMode.ts` is dead and
   tsconfig-excluded (its mechanic is `Math.random() < 0.7`); the live golf is in
   `precisionModes.ts`. That file *also* holds a dead `TennisMode` which is **not**
   excluded, so it type-checks and looks alive. Both now carry banners.
2. **The benchmark file is at the repo ROOT.** Searching only inside
   `FEL-full-app` "proved" three modes had no benchmark. All three did.
3. **Root `AUDIT_*`/`MASTER_*`/`SESSION_STATUS_*` docs are unreliable for
   status** — and for benchmarks too (one claimed Wii Sports Resort for
   volleyball; that game has no volleyball mode).
4. **A mode publishing HUD state does not mean anyone renders it.** Four separate
   modes computed `combo`, `pot`, `goals`, `flow`, `gates`, `boost`, `energy`,
   `rackets`, `coins`, `perks` and the host bezel dropped them.
5. **How you drive a mode decides what it looks like.** A bot that never pumps,
   never aims, or swings on a cadence will report a broken mode. Build a real
   driver first (see §8).
6. **`side === 0` is the hero** in `awardPoint(ctx, side, why)`.
7. **Babylon wraps behind-camera points to `z > 1`** — that is *not* "beyond the
   far plane".
8. **`const URL = process.env.URL`** shadows the global `URL` constructor in the
   `.mts` scripts.
9. **`.mts` scripts are ESM; imported `.ts` is transpiled CJS** — use
   `await import()` for project modules, not a static named import.

## 8. The verification toolkit (`scripts/`)

The in-app browser pane **cannot** drive these modes — Chrome suspends rAF when
the pane is occluded. Use playwright-core:

| Script | Use |
|---|---|
| `capture-mode-audit.mts` | phase-by-phase screenshots + error counts |
| `capture-mode-play.mts` | the workhorse. `URL, KEYS, REPS, HOLD, GAP, PUMP, STEER, APPROACH, LOG_CHARS` |
| `capture-mobile-touch.mts` | 390×844, **real touch via CDP**, logs in. `HOLD_VERB`/`TAP_VERB` |
| `rally-drive.mts` | tennis/volleyball — reads the shot meter and swings on it |
| `slalom-drive.mts` | snowboard — reads hero position, steers at gates |
| `pci-drive.mts` | baseball — moves the PCI onto the pitch. `COVER=0` is the control |

**Synthetic events do not work** for touch (`TouchOverlay` binds React pointer
events); use `Input.dispatchTouchEvent` via CDP. **Pass `page.evaluate` bodies as
strings** — tsx injects a `__name` helper that does not exist in the page.

**For exact in-world numbers**, append `?agent=1` to a `/dev/mode/` URL and read
`window.__NEXUS_AGENT__.state().hero`.

## 9. Conventions

- Comments explain **why**, especially why something is *not* done a simpler way.
- Commit messages carry the reasoning and name what is still broken.
- Fix the root cause; if a fix is wrong, revert it and **record that it was
  wrong** (see golf's sign-off — four wrong turns are kept in the document).
- Never delete a failing criterion from a lock to make a sign-off pass.

## 2026-09-03 — ship pass state (read this before anything else)

The owner's twelve decisions (2026-09-02) and four more (2026-09-03) are
recorded in the repo-root `PHASE2_BENCHMARK_LOCKS.md` under "ship pass". The
plan and its running findings log are `docs/SHIP-PASS-PLAN.md`. Where things
stand:

- **Characters:** the forge GLB (`public/models/fel-hero.glb`, eight roster
  athletes under `public/models/athletes/`) is the DEFAULT in every mode;
  `PROCEDURAL_CHARACTERS` is opt-in. Rebuild the hero with
  `npx tsx scripts/avatar/forge.mts --out public/models/fel-hero.glb`, then
  `npx tsx scripts/avatar/roster.mts`, then `npx tsx scripts/avatar/validate-pose.mts`.
  The forge now has a face (eyes/iris/brows/lips/nose materials), seven head
  morph targets, seven hair-style nodes (`Hair_<key>`, one shown at runtime),
  and measured strike clips. Clip authoring: `chain(a, b)` applies `b` first; a
  rotation about a limb's own bind axis is an invisible twist — use `aimBone`.
- **Rendering:** the light rig's pipeline runs everywhere; quality tiers in
  `lib/babylon/scene/QualityTier.ts` (desktop: SSAO on its own geometry buffer
  + 3-cascade shadows outdoors; mobile: cheaper). Probe with
  `scripts/_tier-probe.mts`.
- **Character layers on every GLB spawn:** `skinShading` (subsurface, pore
  normals, sheen), `SecondaryMotion` (breath, weight shift, head look-at —
  modes call `spawn.secondary?.setLookTarget`), `FootPlanting` (two-foot IK).
  The ink pass skips materials flagged `felShaded`.
- **Authored sport suites** (`lib/babylon/anim/authored/basketball.ts`,
  `baseball.ts`) are proven by rig-measured tests; solve new arm keys with
  `scripts/avatar/_arm-solve.mts` (target hand position → offsets, with a
  torso pose), never by eye. Reset bones to bind between samples in tests.
- **Camp Blueprint:** models in `prisma/schema.prisma` (Camp section), the
  curriculum in `lib/curriculum/blueprint.ts` (owner review pending), API under
  `app/api/v1/camp/*`, screens at `/camp`. Walk it with
  `scripts/camp-walk.mts` (API) and `scripts/camp-ui-walk.mts` (screens);
  both log in as real accounts (`scripts/ensure-playtest-user.ts`, and
  `PLAYTEST_EMAIL=mentee@fel.local` for the mentee). After `prisma generate`
  the dev server MUST be restarted or every new route 500s with an empty body.
- **Gauntlet:** `GAUNTLET_DIR=<dir> zsh scripts/gauntlet.sh` sweeps all 21
  modes + the mobile trio and diffs against the previous run; per-mode logs
  under `<dir>/logs`. Green as of this note. Known flake: the mobile skateboard
  capture shows a start-of-run frame-guard hit about one run in two.
- **Open, in order:** owner review of the curriculum text; karate endless
  benchmark pass (Streets of Rage 4 lock); a keeper round in penalty; the
  free-approach dunk flight; 3v3 alley-oops and switching; PBR venues; a bat
  prop in the derby; Phase 9 hardening (`npm run build:check`, mobile on
  hardware).
- **Later 2026-09-03:** karate endless is the horde brawler (owner lock; arc
  strikes, launcher, hit counter, tier-capped hordes, crowd camera); penalty
  has the keeper round (`KeeperCore`); dunk judges the approach
  (`DunkApproach`); 3v3 has the alley-oop (`BallHandling` lob) and, staged,
  defensive switching (`Matchups`) and the ball in the AI driver's hand;
  three-point has a tie playoff; football shows a blitz pre-snap; venue kit
  props are PBR. Every staged batch is a `scripts`-free Python patch in the
  session scratchpad — if you find `MISMATCH` output, the anchor text moved;
  re-read the file rather than forcing it.
- **Later 2026-09-03, the Closet "explosion" and what it taught:** the body
  never exploded; the SKIN material never compiled. Tinting clones materials,
  `Material.clone` deep-clones textures, and `DynamicTexture.clone()` is a blank
  canvas — the pore map's copy never became ready, so the skin (the only mesh
  carrying it) rendered nothing. `cloneForTint` (playerIdentity.ts) shares the
  map; a test pins it. Rules that fell out of it: (1) a never-ready material
  throws nothing and logs nothing — `applyIdentity` now names such meshes with
  `[FEL-IDENT]` 3 s after landing; (2) the gauntlet plays onevone / skateboard
  / karate LOGGED IN (`LOGIN=1` in capture-mode-play.mts) because only a
  session runs the identity pass; (3) foot planting is mounted at intensity 0 —
  `BoneIKController` leaves non-uniform scale on this rig's leg bones; the
  node-space replacement is `lib/babylon/anim/TwoBoneIK.ts` (pure, tested),
  not yet wired into `mountFootPlanting`. Never edit code the dev server
  imports while a gauntlet sweep runs — HMR mid-capture perturbs the results.
- **Later 2026-09-03, Phase 2 closed:** planting is node-space
  (`TwoBoneIK.ts` → `FootPlanting.ts`, and the 1v1's plant-and-cut helper in
  `basketballTree.ts`); nothing uses `BoneIKController` any more — it leaves
  non-uniform scale on this rig. The ball leaves the hand: `ballCarry.ts`
  (`Dribble.ts` cycle + `HandIK.ts`) is wired into the 1v1 and 3v3. Two
  measured rules: (1) Babylon's `a.multiply(b)` applies b FIRST; (2) the
  harness runs `def.update` BEFORE `scene.render()`, so a bone rotation
  written from a mode's update is overwritten when the clips evaluate — any
  IK or procedural bone write belongs in `scene.onAfterAnimationsObservable`.
  The gauntlet plays onevone/skateboard/karate logged in and `[FEL-IDENT]`
  names any material that never compiles. Carnival occasionally logs five
  "camera boxed in" warnings in a shuffled venue (re-runs clean) — Phase 9.
- **Later 2026-09-03, Phase 3 closed; two more measured rules.** Eleven sport
  clips (golf, tennis, volleyball, soccer) are authored and registered.
  (1) `installSafePlay` now admits any clip the animator has registered — the
  static alias table is no longer a gate, so new authored clips need no alias
  entry. (2) `solveArmsDown` measures in the ROOT's frame: it used world x, so
  any rig spawned off-centre or facing +z lost every rest-based clip while the
  alias fallback quietly played karate. If a clip "plays" but looks wrong,
  check the registration line (`[FEL-ANIM] authored clips registered`) for
  that rig before anything else. Authoring rule: solve hands UNDER the clip's
  torso keys (`_arm-solve.mts … torso:hipsX,hipsY,hipsZ,spineX,spineY,spineZ`),
  key `Hips` in every clip, and test builders from bind.
- **Later 2026-09-03, the dev server between sweeps.** The preview-managed
  `fel-dev` server (:3000) has died twice while the session idled between
  loop wakes (gone from `preview_list`, no logs). A sweep whose every line is
  NO RESULT with `ERR_CONNECTION_REFUSED` is that, not the code. Each wake now
  does `preview_start fel-dev` (reuses a live server), warms `/dev/mode/dunk`,
  `/dev/mode/onevone` and `/play/skateboard`, then runs the gauntlet — the
  warm-up avoids the cold-compile first-frame "hero off-screen" line.
