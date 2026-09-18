# Friend-test pack — 2026-09-05 (production sweep at `1b6ff40`)

For the Assistant Manager. Every number below was measured on this machine on 2026-09-05 between 15:42 and 15:53 local,
from the commands named next to it; nothing is copied from an earlier doc. Docs + build only — no source file under
`lib/`, `app/` or `components/` was touched (see `docs/OWNERSHIP-MAP.md`). Studio HOLD respected: nothing was opened in a
browser pane, previewed, published or deployed.

| | |
|---|---|
| HEAD built | `1b6ff40bd13f259fe01e3d6e80504c8db85dd466` — "Ownership map and commit gate (owner decision)", the tip of `babylon9-aaa-rendering` |
| Worktree | `/Users/elijahbonds/Developer/FEL-swarm/final-evolution-lab-2026-05-12_23-15-57/.claude/worktrees/agent-a30a9d3332f3d2749`, branch `worktree-agent-a30a9d3332f3d2749` |
| App dir | `FEL-full-app/` inside that worktree |
| Evidence dir | `/tmp/fel-friend-test/` (sweep file, per-row logs, 20 frames, mobile frames, build log) — session scratch, not committed |

Setup notes, so the numbers can be reproduced: the isolated worktree was created at `ca0b265` (off `main`), which has no
`FEL-full-app/`; its fresh branch was moved onto `1b6ff40` with `git reset --hard` (no commits of its own were lost).
`node_modules` was hardlink-copied from the copilot worktree's `FEL-full-app/node_modules` (`rsync -a --link-dest`, no
install, no new dependency); `.env.local` was copied from the same place (Postgres `DATABASE_URL`, NextAuth,
`CHALLENGE_SIGN_SECRET`, two renderer flags — names only, values never printed). Ports 3000–3002 had other listeners
throughout; 3005/3006 were not touched; this run used 3007 only.

## 1. Production build

`zsh scripts/prod-serve.sh build` (`NEXT_DIST_DIR=.next-verify next build`, Next.js 14.2.35, `.env.local` loaded).

| Measure | Value |
|---|---|
| Exit code | 0 |
| Wall time | not measured (the `time` wrapper was not run; do not quote a build time from this pack) |
| Type check | "Checking validity of types" passed inside the build |
| Static pages | 82/82 generated |
| Routes | 212 `ƒ` (dynamic, server-rendered on demand): 128 `/api/*`, 35 `/play/*`; shared First Load JS 89.8 kB; middleware 26.5 kB |
| Notable First Load JS | `/play/*` Babylon routes 156–158 kB; `/play/carnival` 188 kB; `/play/map-preview` 361 kB; `/play/mirror` 2.02 MB; `/closet` 2.02 MB; `/` 184 kB |
| Warnings | 1 — `@mediapipe/tasks-vision/vision_bundle.mjs`: "Critical dependency: the request of a dependency is an expression" via `components/facescan/face-scan-capture.tsx` → `components/closet-view.tsx`. Same warning as the 2026-09-04 RC build (`docs/RC-2026-09-04.md` §1). |
| Experiments flagged | `outputFileTracingRoot` |
| BUILD_ID | `MS2WkeSO9X571CdHdGmLb` |

Log copy: `/tmp/fel-friend-test/build.log`.

## 2. Production server on :3007

`zsh scripts/prod-serve.sh start 3007` → `prod server pid 39887 → :3007`, answered on the first poll ("Ready in 140ms"
in `/tmp/fel-prod-3007.log`). `curl -s -o /dev/null -w '%{http_code}' http://localhost:3007/` → `200`.
Stopped after the captures with `zsh scripts/prod-serve.sh stop 3007` (`status` → not running; no listener on 3007).

## 3. Twenty-route production play sweep

`GAUNTLET_DIR=/tmp/fel-friend-test BASE=http://localhost:3007 zsh scripts/gauntlet-play.sh`, 15:42:50–15:50:13
(`capture-mode-play.mts`, logged in through the real form, `REPS=4`, `PUMP=1 STEER=1 HOLD=700 GAP=70 KEYS=j,k,l`).
Result file `/tmp/fel-friend-test/play-20260905-154250.txt`, verbatim:

```
play/dunk       : FEL-FRAME 0 | MISSING CLIP 0 | errors 0        /play/dunk             n/a 
play/threepoint : FEL-FRAME 0 | MISSING CLIP 0 | errors 0        /play/threepoint       n/a 
play/threevthree: FEL-FRAME 0 | MISSING CLIP 0 | errors 0        /play/threevthree      n/a 
play/onevone    : FEL-FRAME 0 | MISSING CLIP 0 | errors 0        /play/onevone          n/a 
play/karate_vs  : FEL-FRAME 0 | MISSING CLIP 0 | errors 0        /play/karate-vs        n/a 
play/karate     : FEL-FRAME 0 | MISSING CLIP 0 | errors 0        /play/karate           n/a 
play/mixedcombat: FEL-FRAME 0 | MISSING CLIP 0 | errors 0        /play/mixedcombat      n/a 
play/skateboard : FEL-FRAME 0 | MISSING CLIP 0 | errors 0        /play/skateboard       n/a 
play/surf       : FEL-FRAME 0 | MISSING CLIP 0 | errors 0        /play/surf             n/a 
play/snowboard_slalom: FEL-FRAME 0 | MISSING CLIP 0 | errors 0        /play/snowboard        n/a 
play/bigair     : FEL-FRAME 0 | MISSING CLIP 0 | errors 0        /play/big-air          n/a 
play/gymnastics : FEL-FRAME 0 | MISSING CLIP 0 | errors 0        /play/gymnastics       n/a 
play/volleyball : FEL-FRAME 0 | MISSING CLIP 0 | errors 0        /play/volleyball       n/a 
play/tennis     : FEL-FRAME 0 | MISSING CLIP 0 | errors 0        /play/tennis           n/a 
play/golf       : FEL-FRAME 0 | MISSING CLIP 0 | errors 0        /play/golf             n/a 
play/derby      : FEL-FRAME 0 | MISSING CLIP 0 | errors 0        /play/baseball         n/a 
play/penalty    : FEL-FRAME 0 | MISSING CLIP 0 | errors 0        /play/soccer           n/a 
play/football   : FEL-FRAME 0 | MISSING CLIP 0 | errors 0        /play/football         n/a 
play/carnival   : FEL-FRAME 0 | MISSING CLIP 0 | errors 0        /play/carnival         n/a 
play/dance      : FEL-FRAME 0 | MISSING CLIP 0 | errors 0        /play/dance            n/a 
```

**20 of 20 rows clean. No regression rows.** `perf` is `n/a` on every row because the fps/draw readout is the dev
harness HUD, which the shipping page does not render (same as the RC sweep). Time-to-loaded / time-to-playing from the
per-row logs (`/tmp/fel-friend-test/logs/play-<key>.txt`):

| Row | loaded | playing | Row | loaded | playing |
|---|---|---|---|---|---|
| dunk | 2.0 s | 7.6 s | volleyball | 1.8 s | 7.4 s |
| threepoint | 1.6 s | 7.6 s | tennis | 1.9 s | 7.4 s |
| threevthree | 2.0 s | 7.4 s | golf | 1.6 s | 7.3 s |
| onevone | 1.8 s | 7.3 s | derby (`/play/baseball`) | 1.7 s | 7.4 s |
| karate_vs | n/a | n/a | penalty (`/play/soccer`) | 1.9 s | 7.4 s |
| karate | 2.2 s | 7.3 s | football | 1.8 s | 7.5 s |
| mixedcombat | 1.7 s | 7.3 s | carnival | n/a | n/a |
| skateboard | 1.7 s | 7.4 s | dance | 1.6 s | 7.4 s |
| surf | 1.7 s | 7.3 s | bigair (`/play/big-air`) | 1.7 s | 7.4 s |
| snowboard_slalom (`/play/snowboard`) | 1.6 s | 7.3 s | gymnastics | 1.7 s | 7.4 s |

Every measured load is 1.6–2.2 s (under the 3 s warm budget); "playing" is the script's own start delay, not the load.
Two rows print `n/a` for both timers while still passing the frame / clip / error counts: `karate_vs` (its log otherwise
reads `start {"score":0,"foeScore":0}` → `end` the same — recorded, not explained here) and `carnival`.

`play/carnival` was expected to read `NO RESULT` (a lobby page with no canvas). It did not: the capture script's
START THE NIGHT loop pressed the hub button (`hub : started the night` in the log) and the client-side shuffle landed the
night on **Brain Brawl** — `shots/play_carnival.png` shows the Brain Brawl briefing (`0 SCORE · 2:00 CLOCK · 0% ACCURACY ·
PRQ 60 · READY · DIFF: EASY`, a SPIN THE WHEEL button and the category wheel), a DOM game with no Babylon scene. The
row's `FEL-FRAME 0 | MISSING CLIP 0 | errors 0` is therefore trivially zero (nothing Babylon ran; `ttl n/a` agrees) and
says only that the hub → first-game hand-off threw no page errors. Not a regression; also not evidence about a Babylon
carnival game. Which game a tester lands on first depends on the shuffle.

## 4. Phone touch rows (`scripts/capture-mobile-touch.mts`, 390×844, touch only via CDP, against :3007)

| Route | Verbs (`HOLD_VERB` / `TAP_VERB`) | Exit | `errors:` line | HUD after the touches (first 240 chars, abridged) |
|---|---|---|---|---|
| `/play/dunk` | `CHARGE` / `SLAM` (as specified) | 1 | none — the script died before the errors line: `locator.boundingBox: Timeout 30000ms exceeded … waiting for locator('text=/^CHARGE$/').first()` at `tapVerb` (`capture-mobile-touch.mts:105`) | — |
| `/play/dunk` | `RUN` / `SLAM` (the pad's actual verbs at this HEAD) | 0 | `errors: 0` | `FLIGHT NIGHT \| Venice Beach Court \| PRQ 60 · READY \| 37 vs 0 \| RD 1/2 \| DUNK 1/2 \| NO PROP \| POWER \| HYPE \| SILK 7 \| DOC 7 \| MAC 8 \| REIGN 7 \| TOTAL 29 \| Reign: I have seen that dunk before, done harder.` |
| `/play/skateboard` | `PUMP` / `POP` | 0 | `errors: 0` | `VENICE LINES \| Venice Skatepark \| PRQ 60 · READY \| 82s \| GOALS 0/4 \| … \| MOVE \| HOLD \| PUMP \| GRAB \| FLIP \| POP` |
| `/play/tennis` | `DRIVE` / `DRIVE` | 0 | `errors: 0` | `MATCH POINT \| Nexus Tennis Court \| PRQ 60 · READY \| — \| 0 PTS \| ENERGY \| RACKETS 3/3 · THEM 3/3 \| THEIR POINT \| NO SWING — THEIR POINT \| … \| LOB \| DROP \| SLICE \| DRIVE \| LOOK` |

Reading the dunk pair: the `CHARGE` failure is a stale verb name, not a broken touch path. At this HEAD dunk's deck is
`SLAM · STYLE · PROP · RUN (hold)` (`lib/babylon/ui/modeVerbs.ts:40–47`, the 2026-09-05 "Venice DualShock pad, no dead
binds" change); `CHARGE` is now only Court Carnival's hold verb (`modeVerbs.ts:134`). With `RUN` the touch hold + slam
taps went through TouchOverlay → InputBus and the judges scored the dunk (TOTAL 29). Two consequences for the pack:
`docs/PHONE-CHECKLIST.md` row 3 still says "CHARGE hold, SLAM" — testers should read **RUN (hold), SLAM**; and any
automation that hard-codes `HOLD_VERB=CHARGE` for dunk needs `RUN`. Tennis: the touch-only `DRIVE` hold-then-taps ended
the captured point as `NO SWING — THEIR POINT`; recorded as seen, not diagnosed here (the sweep's keyboard rally on the
same route is clean).

Frames: `/tmp/fel-friend-test/mobile/{01-mobile-approach,02-mobile-charged,03-mobile-judging}.png` (skateboard —
the specified shared `OUT_DIR` means the skateboard run overwrote the dunk `CHARGE` run's partial frame), plus
`/tmp/fel-friend-test/mobile/tennis/` and `/tmp/fel-friend-test/mobile/dunk-run/`. Raw outputs
`/tmp/fel-friend-test/mobile-{dunk,dunk-run,skateboard,tennis}.txt`.

## 5. Known issues for testers (do not file these again)

From `docs/AUDIT-CONTROLS-AND-LOOK-2026-09-05.md` and `docs/SHIP-PASS-5.md` "Two writers, one tree":

Controls
- **Ones (1v1):** BOX OUT (B) and STEAL (X) are lit on the pad and do nothing — dead binds. Only BLOCK (A) and the SHOOT
  hold (trigger) act.
- **Threes (3v3):** PASS (B) and STEAL (X) are dead binds; same A + trigger only.
- **Tennis:** DRIVE / SLICE / DROP / LOB are shown; only one swing (A) is handled — three of four shot verbs are dead. The
  shot type on the HUD comes from elsewhere.
- **Volleyball:** two blank X/Y slots on a court sport that has SET and DIG.
- Two-verb modes (gymnastics, big air, derby, golf, soccer penalty) show bare letters in the unbound slots; they are not
  controls. Golf's three-press A meter is not explained on screen; ones' block timing and threes' pass have no hint.
- Dunk: the pad reads RUN (hold) · PROP · STYLE · SLAM at this HEAD — see §4 for the checklist wording.

Look
- **One outfit for every sport:** leopard tank (`top_lab`), torn-print shorts (`shorts_court`), tall glossy red boots
  (`shoes_flight`) — the karate fighter has no gi and the tennis player plays in rain boots. The flight shoe covers the calf
  and reads as a boot; the shorts print reads torn / stained under the venue grade. Per-sport kits are asset work in the
  owner's pipeline; the wiring exists.
- **Venice:** a tan wireframe cage around the player under the Venice location; the surround's hide rule for `head*` /
  `body*` can catch athlete parts; the golden-haze sky and Venice palms are the second writer's look pass and are now
  guarded so they step aside under a non-Venice location. The red hoop banner remains on the basketball courts (the dark
  crowd tier and canopy mural are gone).
- **Scanned court not yet under locations:** the rebuilt `venice-blue-court.glb` renders no court on its own; the scanned
  court under a location is documented in `docs/SPEC-COURT-LOCATIONS.md` as attempted and non-rendering. What testers see
  is the spec court.
- **Athletes:** the second writer's rebuilt hero and new rival rendered headless / T-posing and were reverted by the owner
  (15:10); the dunk modes spawn the rival from the hero body, so hero and rival share a body.

Routing
- `/play/dunkduel` is PROVE IT, the real-footage head-to-head — no canvas, no Babylon mode (by owner re-lock 2026-09-01).
- `/dev/*` pages (mode harness, rig, anim) hard-404 in production; the shipping routes are `/play/*`.

## 6. Phone checklist

Real-hardware pass: `docs/PHONE-CHECKLIST.md` (twelve rows, ten minutes, one phone). Row 3's "CHARGE hold" is RUN at this
HEAD (§4). Numbers from the phone become the mobile row of `lib/babylon/config/textureBudget.json`.

## 7. Not measured in this pack

fps on shipping routes (no HUD there); the `TIER=mobile` quality tier (dev harness only); real-device thermals, GPU and
touch latency (emulation cannot answer them — the checklist above does); build wall time (§1); `npx tsc --noEmit` /
`npx vitest run` were not re-run here because this commit changes no source or test file (the build's own type check
passed; the last recorded suite at HEAD is the owner-decision commit's).
