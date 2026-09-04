# Ship Pass 2 — Launch Readiness (2026-09-03)

The first ship pass (`SHIP-PASS-PLAN.md`) took every mode to its benchmark on
the forge hero, closed the avatar builder and the Camp, and left the owner two
items (curriculum review, a session on real hardware). Sixteen gauntlet rounds
are green. This pass asks a different question: **will the product survive
contact with real players on the shipping routes, in a production build, on
weak hardware, when something fails?** Analysis of the tree on 2026-09-03:

- The gauntlet plays the DEV harness (`/dev/mode/<key>`); the shipping host
  (`/play/<route>`, auth-gated, different loader component) is captured for
  three modes only, and the route keys differ from the registry keys
  (`karate-vs`, `soccer`, `baseball`, `snowboard`, `big-air`).
- Every measurement is against `next dev`. Nothing has run a sweep against a
  production build (`next start`).
- 45 MB of baked venue maps at 2–4 MB each, uncompressed glTF; no load-time
  budget exists, and the mobile tier is measured for frame time only.
- Failure handling exists (error boundary with reload, asset retry + fallback,
  WebGL detection, `/api/telemetry/crash`) but nothing PROVES it: no capture
  ever blocked a GLB or lost a WebGL context.
- The game's own diagnostics (`FEL-FRAME`, `FEL-IDENT`, `MISSING CLIP`,
  `FEL-CAM`, fps floor) stay in the browser console; in production nobody sees
  them.
- No CI. The stale twin app at the repo root still confuses greps and builds.

## The ladder

| Phase | Deliverable | Gate |
|---|---|---|
| **1 Shipping-route gauntlet** | `scripts/gauntlet-play.sh`: all 21 modes on `/play/<route>` logged in through the real form; route↔registry map recorded; divergences from the dev harness fixed. | 21/21 0/0/0 on `/play`. |
| **2 Production-mode gauntlet** | Build once, `next start` on :3004, the full sweep against it. Prod-only failures (minification, headers, env, SSR) fixed. | Prod sweep 0/0/0; headers present; no dev hooks leak. |
| **3 Load-time budget** | Time-to-playing measured per mode (cold/warm) and recorded; baked maps put through `gltf-transform` (dedup/prune/quantize, meshopt if the decoder is cheap); a budget set and met. | Every mode inside budget on desktop; the mobile-tier seven inside the mobile budget. |
| **4 Failure UX proven** | Fault-injection captures: GLB 404, slow asset, WebGL context loss, offline API. Each shows a recoverable state, never a white screen. Fixes where it does not. | Four fault captures per family show the fallback UI and log a crash report. |
| **5 Game telemetry** | Client beacon for `FEL-FRAME` / `FEL-IDENT` / `MISSING CLIP` / `FEL-CAM` / fps-floor / context-lost → `/api/telemetry/game`, sampled + rate-limited, stored; an owner read endpoint. | Events from a capture land in the store; the dashboard endpoint lists them. |
| **6 Weak-hardware proxy** | CPU throttle (4×) + mobile tier for the seven modes; the 30 fps floor enforced; tier settings tuned where it fails. | Seven modes ≥ 30 fps at 4× throttle. |
| **7 Input parity** | Every mode's touch controls audited against its keyboard/gamepad verbs; missing touch verbs added; the mobile capture extended to one mode per family. | Seven mobile-touch captures 0 errors; parity table in the concept locks. |
| **8 Repo hygiene + CI** | Stale twin quarantined under `_archive/`; probe scripts pruned; GitHub Actions: tsc + vitest + build:check on push. | CI green on the branch. |
| **9 Content close-out** | Controller Link schema for tennis (its one accepted gap); concept-lock tables reconciled; handoff current; owner's curriculum decision folded in when it lands. | Docs current; no ❌ without a recorded acceptance. |
| **10 Release candidate** | Version tag, CHANGELOG, `SHIP-READINESS.md` sign-off, final prod-mode gauntlet green. | Tagged RC; sign-off signed. |

Standing rules carry over: no Nexus/Cell work (SHIP firewall), material name
contract untouched, never edit imported code while a sweep runs, `build:check`
never bare `build` with the dev server up, sweeps at phase boundaries.

Plan page: https://claude.ai/code/artifact/06ac4116-487a-472f-9378-07e2834ccebb

## Findings log
- **Phase 1 groundwork (3 Sep).** `scripts/gauntlet-play.sh` carries the
  route↔registry map (`karate_vs→karate-vs`, `penalty→soccer`,
  `derby→baseball`, `snowboard_slalom→snowboard`, `bigair→big-air`). Every
  shipping loader mounts the Babylon game: twenty through `isBabylon()` flags
  (all set), volleyball and dance unconditionally through `timing-babylon`.
- **Phase 3 probe (3 Sep).** Lossless-ish gltf-transform passes (dedup, prune,
  weld, quantize 14/10/12) shrink the baked maps ~27% (venice-skatepark 4.30→3.12
  MB, dojo 3.30→2.37 MB) with no runtime decoder. Meshopt would go further but
  needs the decoder wired into Babylon's loader; decide after the load-time
  measurement says whether 27% is enough.
- **Phase 4 groundwork (3 Sep).** `scripts/capture-fault.mts`: glb404 / slow /
  offline / contextloss on any mode page; reports canvas, body text, a recovery
  cue, crash posts, and whether the screen went white.
- **Phase 8 groundwork (3 Sep).** `.github/workflows/ci.yml` at the repo root:
  tsc, vitest, production build on every push (the browser gauntlet stays
  local — it needs a GPU).
- **Phase 7 read (3 Sep).** `lib/babylon/ui/modeVerbs.ts` carries a verb set
  for every one of the 21 modes (plus the retired three); the touch overlay is
  the uniform console rig with per-mode labels. Parity is therefore a WIRING
  audit — does each labelled button reach a real action in its mode — not a
  gap fill.
- **Phase 9 read (3 Sep).** Tennis already has its Controller Link entry
  (`schemas/registry.ts`), so the concept lock's ❌ D4 is stale. Four modes have
  no entry and are silent to a phone: onevone, karate, karate_vs, carnival.
- **Phase 8, quarantine done (3 Sep).** The repo-root twin (855 tracked files:
  `app/`, `lib/`, `components/`, `public/`, configs; older than ThreePoint,
  Sprint and Air Session; no deploy configuration ever pointed at it) moved
  unchanged to `_archive/root-twin/` with a README. Root `scripts/` and `docs/`
  stay: other sessions write there. CI workflow at `.github/workflows/ci.yml`.
- **Phase 3, all maps measured (3 Sep).** Twelve baked maps, no glTF extensions,
  one to four textures each: 36 MB → 26 MB under dedup/prune/weld/quantize
  (17–37% per map). Quantize adds `KHR_mesh_quantization`, which the writer
  must have registered or the file omits the declaration — fixed in the probe.
- **Phase 7, static audit done (3 Sep).** Every labelled touch button reaches a
  handler: A/B/X/Y by name in the combat, board and net modes; B→pass, X→steal,
  L1→box out through `PlayerSlot` intents in the basketball modes; the CHARGE
  and CARVE holds stream the right trigger (dunk, dunkduel, surf read
  `e.t === 'trigger' && side === 'R'`); football accepts any of the four for
  the juke read; volleyball's BLOCK is `humanBlock`. No gap to fill — the gate
  is now the phone captures, one per family.
- **Phase 1, shipping-route baseline (3 Sep).** 13/21 clean on the first
  pass; the rest resolved to three causes and one design fact:
  1. *Container cache keyed by URL alone.* The shipping hosts mount twice under
     React's dev double-mount, and the second harness took an `AssetContainer`
     from the first, disposed scene: threepoint's load crashed on a disposed
     root (`getChildMeshes` of undefined, retried five times) and the same rig
     produced the "char_120" skinning stall in threepoint, football and
     carnival. Any player who leaves a mode and returns hits the same path, so
     this is a ship bug, not a dev artifact. Cache is now `WeakMap<Scene,
     Map<url,…>>`. Threepoint, football: 0/0/0 after.
  2. *Identity watchdog judged on a clock.* A material compiles when its mesh
     is first drawn; the shell holds a scene behind a profile load, and the
     penalty kicker's shoes sit below the frame — both read "never ready" at
     3 s. Now: sixty rendered frames after identity, anything not ready is
     asked to compile and only a FAILED compile is reported. Bigair,
     gymnastics: "ready, 10 compiled on demand".
  3. *Dev double-mount.* Every shipping host still starts two harnesses on one
     canvas in development (guards vary: token, none); the dev runner has a
     latch. Production mounts once, so Phase 2's production sweep decides
     whether this is worth unifying; the black bigair frame is the leaked
     first engine.
  4. *`/play/dunkduel` is PROVE IT by owner re-lock (2026-09-01):* the
     real-footage head-to-head contest, camera-tracked, no canvas. The Babylon
     DunkDuelMode stays registry-only at `/dev/mode/dunkduel`. The
     shipping-route gauntlet covers the twenty Babylon routes.
- **Phase 2, production-mode gauntlet: gate met (3 Sep).** `.next-verify`
  built, served on :3004 by `scripts/prod-serve.sh`, the shipping-route
  gauntlet and the phone trio run against it: 20/20 routes 0/0/0, trio 0
  errors, security headers present, `/dev/mode/*` 404. The dev-only double
  mount does not exist in production, so the black bigair frame and the two
  engines per canvas are dev artifacts — recorded, not unified.
- **Phase 3, maps swapped (3 Sep).** The twelve optimized baked maps replaced
  the originals (36 → 26 MB; originals kept beside the scratchpad); golf and
  karate re-captured with identical draw and mesh counts and clean frames.
  Time-to-playing is now a capture metric (`ttp`), so the budget is measurable
  in the next sweep.
- **Phase 4, failure UX proven (3 Sep).** Fault captures on `/play/onevone`:
  a missing hero model → the error state with RETRY (already there); the API
  unreachable → used to be an empty, silent shell, now "Can't reach the
  server. Check your connection, then try again. RETRY"; a lost WebGL context
  → used to be a black canvas with the HUD still streaming, now "Graphics were
  reset by the device. Reload to keep playing." Every path also reports a
  diagnostic (Phase 5) — the load failure path was added.
