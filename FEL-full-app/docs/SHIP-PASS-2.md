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
