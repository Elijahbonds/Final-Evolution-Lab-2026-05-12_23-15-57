# Dunk, the flagship — baseline, gaps and the pass (lane/dunk-flagship)

**Owner playtest, 2026-10-27:** *"Dunk game mode is the flagship — needs to be improved still."* Asked what first, the owner
picked all four areas: feel and timing, more dunks and animation, presentation, modes and progression. In their own words:
**"Smoother movement, better lobs."**

The bar is the concept lock (`docs/concept-lock/dunk.md`, 14 of 14), its sign-off (`dunk-signoff.md`), the motion decode
(`SPEC-DUNK-MOTION-DECODE.md`) and the modern Flight Night (`DUNK-NEXT.md`, phases 1–8 built). This pass does not re-litigate
any of them. It measures the mode as a player gets it and fixes, in the owner's order of felt impact:
(a) movement and the approach, (b) lobs, (c) take-off, hang and the rim, (d) more dunks, (e) presentation, (f) modes.

## 1. The instrument

`scripts/probes/_dunk-flagship-probe.mts`, on the esbuild + Playwright rig (no `next dev`, no `next build`). It mounts the real
ModeHarness from a static bundle (lane scratchpad `round9/dunk-flagship/rig`), drives a fake pad on the **virtual clock**
(`_vclock-page.js`: every rendered frame is exactly 1/60 s of game time, so a number is a function of frames, not of a loaded
machine), and records every rendered frame: the root, eight joints (hips, feet, toes, hands, head), all 22 bone rotations,
the ball, the camera eye and target, the hero's playing clips with weights, and the scene's time scale. It reads the
mode's own log lines and the harness's QA trace (`?agent=1`: hit-stop, shake, slow-mo, flash, impact, sounds). Scenarios:
`approach`, `press` (A on the run), `release` (RT let go), `selflob`, `runlob`, `oop` / `oopglass` / `oopbounce`, `tricks`
(all 16 air tricks) and `show` (one make through the replay and the card). Measures:

| Area | Measure |
|---|---|
| Approach | root speed, acceleration and jerk; the hips' one-frame acceleration and pops (a spike ≥ 3.5× its neighbourhood); each foot's travel while planted (skate); clip changes and hard cuts (a clip entering at ≥ 0.6 weight in one frame); bone pops (≥ 600°/s and ≥ 3.5× the neighbourhood, the motion probe's rule) |
| Take-off | press → the launch line → hips up → feet off, in ms |
| Hang | feet off → feet on; the hips' apex over their runway height; time within 10 cm of the apex |
| Lob | the ball's free flight (apex, length), the hand's nearest approach, CAUGHT / LOST, the catch's clip time |
| Slam | what the player perceived (QA trace) and when the iron was met |
| Camera | cuts (a one-frame jump of the eye > 0.6 m or the target > 0.8 m) |
| Tricks | each trick's body-local hand / foot / head path (24 samples over the flight) and its nearest neighbour (RMS m) |

### Two findings about the rig itself (verified against a control before trusting it)

1. **The bundle must not be built with esbuild `--keep-names`.** Babylon builds its Draco decoder worker from a stringified
   function; `--keep-names` puts `__name(...)` calls into that function, the worker dies on its first line, and the three
   Draco GLBs (hoop, ball, palm LOD0) never finish importing. Babylon does not start the scene's animation clock while an
   import is pending, so **every clip in the scene was frozen on its first frame** — the dunker glided down the runway with
   his legs still. Measured: the run clip's frame stayed at 0 for 2.5 s at speed 1.13, `scene._animationTime` 0, three
   pending import tokens. Without `--keep-names`: no pending import, the clock runs. Production (Next/SWC) never adds
   `__name`, so this is a rig artifact; the first baseline taken through it was thrown away.
2. Numbers that come from the controller (root position, the take-off timing) do not depend on animation and were checked
   to be identical on both builds.

## 2. Baseline (36593d3a, origin/lane/finish-release)

Plain one-foot attempt: stand, stick walk, RT run to the line, take-off, slam on the beat (`slamBeat` 'beat'). Phone tier
(`tier=mobile`), 320×180, the virtual clock, seeded. Everything below is the first rep (r0); later reps are in §5.

| Measure | Baseline |
|---|---|
| Root speed into push 1-2 | 7.0 → **5.98** m/s in one frame (`gather stride at 1.11 m … x2.00`: the fit's rate clamped) |
| Take-off frame | 2.42 → 2.11 → **4.18** → 2.24 m/s (two steps in one frame) |
| Largest one-frame speed change before the plant | **2.08 m/s** (3 frames over 0.6) |
| Root jerk, RMS / max | 528 / 3715 m/s³ |
| Foot skate, carrying foot at ≥ 2.5 m/s | **1.11 m/s** (run 0.89, sprint 1.66, the start from standing 2.81) |
| Hips one-frame pops · bone pops (≥ 600°/s, ≥ 3.5× neighbours) | 12 · 31 (arms 21) |
| Launch → feet off · hang (feet off → on) · the hips' rise · within 10 cm of the top | 100 ms · 2150 ms · 1.94 m · 467 ms |
| Slam (QA trace) | hit-stop 1 (70 ms), shake 2, slow-mo 2 (the hang's and the iron's), flash 1, impact 1, cheer 1; iron at +1517 ms |
| Camera through the flight | 1 cut (the rim cut, +917 ms) |
| Alley-oop | thrown after the take-off: 0.35 s from 3.5 m (~10 m/s; its top 0.20 m over the catch) |
| First runway of the night | the Venice storefronts between the camera and the dunker (see e1) |

## 3. Gaps, ranked against the lock and the owner's words

1. **The run-up is not smooth** (owner: "smoother movement"): two one-frame speed breaks (into push 1-2 and on the take-off
   frame), and the run-up's feet cycle faster than the ground. → Phase 1.
2. **The alley-oop is a bullet, and no lob says where it is going** (owner: "better lobs"). → Phases 3–4.
3. **Every slam hits the iron the same** (the owner's impact kit: "shake by size"). → Phase 5.
4. Take-off and landing: a 3 cm root drop at the take-off (the runway stands the root at 0.03); the start from standing skates
   (2.81 m/s in the walk band) while the idle blends into the run. → Phase 2.
5. Distinctness of the 16 air tricks: not yet measured on the fixed rig. → Phase 6.
6. Presentation is broad already (four replay angles, the poster, the five-judge reveal, phone flashes, the MC); its quality is
   judged on screen. → Phase 8.
7. Progression: unlocks come from won nights and challenges only; the verified vertical is not read. → Phase 9.

## 4. What this pass changed

| # | Change | Flag |
|---|---|---|
| e1 | **The first runway was shot through a taco stand.** The Venice dressing imports five GLBs and places nothing until all five land; an import enters the scene at the world origin, so the first files stood between the run-up camera (z 8) and the dunker (z −1.2). A ray from the camera to the hero hit `facade_taco`, `facade_tattoo` and the hero palm. Each file is hidden the moment it lands and shown when placed. After: the ray hits only the hero. | shared file: `lib/babylon/nexus/veniceBoardwalk.ts` (visual only) |
| a1 | The gather started inside the distance it can be fit at its fastest pace: 7.0 → 5.98 m/s in one frame. It starts no later than `gatherFitDist` + one frame's travel. | behaviour: the gather can start up to ~0.25 m earlier at a sprint |
| a2 | The take-off frame moved the body twice (the run's last step and the plant's first): 2.1 → 4.2 → 2.2 m/s. The plant's drift now starts on the first flight frame, makes up the rest of that frame's step at its own speed, and stops exactly where the carry starts (two intermediate versions were measured and fixed: a half step, 2.35 → 1.13, then a double step at the plant's end, 2.24 → 3.9 → 1.7). | none (the plant still rolls PLANT_DRIFT_M; the carry lands on the same rim point) |
| a3 | The run-up's leg pace: re-paced to 4.57 then 3.95 m/s and measured. 3.95 skated less at a sprint and more at 2.5–5 m/s, with no overall gain, so the **shipped pace stays**, now behind a knob. | **(new knob, default unchanged)** `dunk.runwayStrideScale` 1 |
| b1 | The alley-oop is a lob thrown on the run (1.0 s in the air) instead of a 0.35 s pass after the take-off. | **(new)** `OOP_LOB_FLIGHT_SEC` 1.0 s; knob `dunk.oopLobFlightSec` |

## 5. Phase 1 — smooth run-up: results

Plain one-foot attempt, phone tier, 320×180 (the strip run at 480×270), virtual clock. Before = `36593d3a`, two attempts (r0, r1).
After = the phase's final code, attempt r9 (recorded with the strip). The attempts r1–r3 in between carried intermediate builds:
they found the half step and then the double step at the plant's end that the final code fixes (a2). Speed traces:
`round9/dunk-flagship/shots/phase1-speed-before-after.jpg`; the contact sheet: `shots/phase1-before-after.jpg`.

| Gate | Before (r0 / r1) | After (r9, final) | |
|---|---|---|---|
| Largest one-frame root-speed change, walk → the plant's end | 2.08 / 2.06 m/s (3 frames > 0.6) | **0.53** (0 frames > 0.6) | met |
| Speed into push 1-2 | 7.0 → 5.98 in one frame | continuous (gather 1.24 m out, x1.94) | met |
| The take-off frame and the plant | 2.1 → **4.2** → 2.2 m/s | 2.32 → 2.24 → 2.24 … 2.24 → 1.71 (the carry, as before) | met |
| Root jerk, RMS | 528 / 407 m/s³ | **113** | |
| Bone pops before the take-off | 31 / 32 | 28 | met (not above) |
| Foot skate, carrying foot ≥ 2.5 m/s | 1.11 / 1.03 m/s | 1.25 (the pace is unchanged; within the reps' noise) | **not met** — the re-pace was tried and withdrawn (a3) |
| Hang · hips' rise | 2150 ms · 1.94 m | 2167 ms · 1.93 m | unchanged |
| Peak run speed on a matched run (r1 vs r1, same walk) | 7.0 m/s | 6.9 m/s (the gather starts ~0.15 m earlier) | behaviour change, flagged |

Gate run (code `f45a8252` + the scan fix `b7cc7132`): tsc 0 errors · lint 0 warnings · mode-list-check 32 modes · ci-suite 208
passed, 1 failed (`controller-link-tests` E10: a 260 ms wall-clock window at load average 31 — re-run alone 42 / 42), 11 DB suites
skipped · vitest on `lib/babylon/{modes,core,nexus,visual}`, `lib/feel-panel`, `tests/probes`: 499 files, 5,771 tests, 1 failed
(`reducedMotionGates` — the scan this lane's slam sizing broke; fixed as a test change, re-run green with the lane's new tests,
27 / 27).

## 6. Phase 2 — take-off and landing flow: results (lane/dunk-flagship-p2)

Before = `36593d3a`; after = the phase's final code (`abc1571b`). One attempt per piece, phone tier, virtual clock. Contact sheet:
`round9/dunk-flagship/shots/phase2-before-after.jpg`.

| Gate | Before | After | |
|---|---|---|---|
| Press → feet off, A on the run | 67 ms (press → launch 17 ms) | 67 ms (17 ms) | met (≤ 150) |
| Press → feet off, RT let go | — | 67 ms (17 ms) | met (≤ 150) |
| Root height step on the take-off frame | 2.8 cm (hips 1.8) | **0.2 cm** (hips 0.8) | met (≤ 2) |
| Hard cuts on landing (touchdown −12 … +48 frames) | 0 | 0 | met |
| Hip pops on landing | 2 | 1 | not above |
| Foot skate, carrying foot ≥ 2.5 m/s (carried from Phase 1) | 1.03–1.11 m/s | default stride 1.03; **stride knob 1.10: 0.86** (one attempt) | not met at the default; the knob is promising |

What changed:
- **The take-off step.** The night's first run stands the root at 0.028 m. That height is set at spawn; YTRAP found no writer during
  the attempt, and a reset stands the root at 0 from the second dunk on. The take-off frame then set it to the arc's 0, a 2.8 cm
  one-frame drop. It is now eased out over the plant. **Open question:** which of 0.028 and 0 is this body's true floor (the
  landing ends at 0).
- **The landing lead, tried and shipped off.** The absorb faded in over the fall's last 0.10 s, but the hips arrived faster
  (−6.2 vs −5.2 m/s) into the same shallow crouch, and landing hip pops went 2 → 4. Knob `dunk.landLeadSec`, default 0 (as
  shipped).
- **The landing's real gap (for Phase 6/7, RIG-ADJACENT).** The hips fall about 5 m/s and stop within a frame at touchdown. The
  authored `dunk_land_absorb` sinks only about 0.12 m over 0.25 s, about 0.5 m/s. A deeper and faster absorb (the knees taking
  ~0.25 m in ~0.12 s) is an authored-clip change: GATE 0, the rig and the owner's sign-off.

Gate run on `abc1571b` (all through the shared CPU slots):
- tsc 0 errors · lint 0 warnings · mode-list-check 32 modes.
- vitest on the dunk mode and core suites, `reducedMotionGates`, `LobMarker`, `veniceBoardwalk`, `lib/feel-panel` and
  `tests/probes`: 59 files, 724 tests, all green.
- The dunk-related headless suites (`capture-dunk`, `controller-link`, `dunk-animation`, `dunk-balance`, `dunk-depth`,
  `dunk-feel`, `dunk-system`, `dunkduel-depth`, `feel`, `hoops-to-75`, `juice-parity`, `verb-key-alignment`): 12 / 12 green.
- The full ci-suite and the full vitest are left to the PR's CI: the machine's CPU slots are shared.

## 7. Phase 3 — the alley-oop lob and the catch ring: results (lane/dunk-flagship-p3)

Before = `36593d3a` (the shipped oop: a pass thrown after the take-off). After = this phase's code. Phone tier, 320×180 (the
strips at 480×270), virtual clock, one attempt per piece. Contact sheet: `round9/dunk-flagship/shots/phase3-lobs.jpg`
(the ball-height chart, the on-time lob's frames, the early take-off's frames).

| Run | Flight (game s) | Top over the catch | Caught | Ring / shadow on screen | Ball speed at the hand |
|---|---|---|---|---|---|
| before · oop r0, r1 | 0.55 | −0.34 m (still rising) | yes | no ring | 11.8 m/s |
| oop r0 / r1 / r3 / r9 (on the run) | 1.13 / 1.13 / 1.15 / 1.15 | 0.55 / 0.54 / 0.58 / 0.58 m | yes (4 / 4) | 0.99 of the lob, both | 4.7 m/s |
| oop from standing (RT) | 1.17 | 0.57 m | yes | 0.99 | 4.7 m/s |
| A early (first cut: the old fallback) | 0.57 | −0.13 m | yes | 0.97 | 13.3 m/s |
| RT let go early (first cut) | 0.57 | −0.16 m | yes | 0.97 | 14.0 m/s |
| A early (fixed: the take-off throw) | 0.98 | −0.04 m (meets the hand at its crest) | yes | 0.98 | 4.9 m/s |
| RT let go early (fixed) | 0.98 | −0.04 m | yes | 0.98 | 4.9 m/s |
| A early, knob `dunk.oopLateCatchClipT` 0.95 | 1.13 | 0.08 m | yes | 0.99 | 4.1 m/s |
| A early just after the throw (r9 jitter, first cut: the 0.62 re-aim) | 0.88 | 0.09 m | yes | 0.98 | 6.0 m/s |
| A early just after the throw (fixed: the re-aim keeps the throw's timing) | 1.07 | 0.47 m | yes | 0.98 | 4.8 m/s |
| oop on the run after the re-aim change (regression, r0) | 1.13 | 0.55 m | yes | 0.99 | 4.7 m/s (identical to before the change) |

("Ring / shadow" is the share of the lob's frames where the catch ring and the ball's floor shadow are both drawn; the
missing 1–3 % is the release frame. The ring is gone by the frame after the catch: 0 lingering frames on every run. The
slam after every catch, early or late beat, was CLEAN at 0.85–0.93 with the same impact as before.)

What changed:
- **The passer winds up.** The run-time throw left on the toss clip's first frame, from his hip. The toss (`jumpshot`, arms
  overhead at 0.5 s) now starts `OOP_WINDUP_SEC` (0.5 s, new) before the release, and the ball rides his hand up.
- **The throw is heard and read.** A whoosh at the release and the banner "ALLEY-OOP — GO GET IT".
- **An early take-off still gets a lob.** The varied runs found it: leaving the floor before the passer's throw was due
  (A early, RT let go early) fell back to the old 0.35 s bullet thrown at 0.9 × the rise. The passer now lets go on the
  take-off frame, aimed at the hang beat (clip 0.8, the off-glass lob's measured catch beat). Knob `dunk.oopLateCatchClipT`
  (new, default 0.8). Nothing thrown after the take-off can fly the on-time lob's arc: only ~0.8 s of clip remains before
  the slam window.
  A take-off before the throw is due measures 0.98 s with the ball meeting the hand at its crest (−0.04 m): the passer has
  had no time to wind up, so it leaves from his hip (0.95 m), and a 0.5 m drop from there needs ~1.1 s, inside the slam
  window. The knob at 0.95 gives 1.13 s and 0.08 m with the slam still CLEAN (one attempt); the default stays at 0.8, the
  beat measured across the off-glass runs. That is the owner's feel-check.
- **The launch re-aim keeps the throw's own timing.** A take-off 6 frames after the passer let go (the jittered A-early run)
  re-aimed a 0.99 s lob onto the 0.62 beat: a second, flatter throw (0.88 s, top 0.09 m). The lob now records its planned
  flight, and the re-aim takes whichever catch beat is nearer the flight the throw still had left. The on-time run arrives
  with 0.62 s left, so it is unchanged (re-measured, identical numbers); the early one catches on the hang beat.
- **The on-time lob** (thrown on the run, Phase 1's early piece `b1`): the launch re-aims it onto the exact catch beat
  (2.3 m from the catch with 0.59 s left), a velocity kink of ~0.2 m/s.

Gate run on the phase's head (all through the shared CPU slots): tsc 0 errors · eslint 0 warnings on the changed files ·
mode-list-check 32 modes · vitest (dunk mode and core, `reducedMotionGates`, `LobMarker`, `veniceBoardwalk`,
`lib/feel-panel`, `tests/probes`) 59 files, 726 tests, all green · the 12 dunk-related headless suites 12 / 12 green.

Still open, carried: foot skate on the run-up (Phase 1 gate, not met at the default stride; re-checked in Phase 4). Not
started: the landing-absorb re-author (an owner card, waiting for approval).

## 8. Phase 4 — self-lob, off the glass, the bounce: results (lane/dunk-flagship-p4)

### The instrument: a sweep rig fast enough for catch rates
The browser rig ran one attempt every 5–8 minutes, too slow for a ≥95 % catch rate per lob type. `FAST=1` swaps the engine's two
draw calls for the NullEngine's own no-ops: every update, animation, skinning matrix, camera and the recorder still run, only
pixels are not drawn. **Validated against a drawn run of the same seed and build** (the Phase 3 oop r0): 54 of 54 game events
identical and in order, the lob metrics identical, the root within 0.1 mm, the ball within 7 mm, the camera within 4.4 cm. An
attempt now takes ~50–80 s including the page boot. `SWEEP=1` varies the run by rep (the walk before the run 0–0.9 s, the stick's
depth); standing throws run on their cue (the RUN! flash, the glass's "armed", the self-lob's release) after a 0–0.4 s reaction.
Each frame records whether the ball's centre is inside the camera's view (projected). Every lock hold stays under 14 minutes.

### Catch rate per lob type (before = 3e3e7a37, the Phase 3 head; after = this phase)

| Lob | Before | After | Ball in frame, worst run | Ball speed at the hand (after) |
|---|---|---|---|---|
| Off the glass on the run (prop) | 0/8 (the original build 0/4 too: OVER THE GLASS) | **14/14** | 75 % → 100 % | 6.1–6.9 m/s |
| Off the glass standing (Y) | 0/5 (LOST, 4 of them silent) | **5/5** (armed: goes up on the run) | 39 % → 100 % | 6.1–6.2 m/s |
| Self-lob on the run (prop) | 7/7 | 11/11 | 100 % | 0.7–3.1 m/s |
| Self-lob standing (Y, then run) | 5/5 | 5/5 | 59 % → **100 %** | 2.8–6.9 m/s |
| Bounce lob on the run (prop) | 6/6 | 7/7 | 91 % → **100 %** | 3.5–6.5 m/s |
| Bounce-bounce standing (Y, run on RUN!) | 5/5 | 5/5 | 100 % | 0.5–5.4 m/s |
| Alley-oop, passer, 4 attempts on one page | 4/4 from the DUNKER's hand from attempt 2 | 4/4 from the passer | 100 % | 4.5–4.7 m/s |
| Glass oop (passer) | 0/2 (WIDE OF / OVER THE GLASS) | **6/6** | 100 % | 8.5–8.7 m/s |
| Bounce oop (passer) | 0/6 (NEVER IN REACH) | **6/6** | 100 % | 3.4 m/s |

After = the phase's head build except the passer's glass and bounce oops and the alley-oop (one build earlier: nothing after it
touches them). **63 of 63 caught.** The before arrival speed for the oops was the shipped bullet's 11.8 m/s (Phase 3); every after
arrival is under it. No LOST in any after run; the reason line was seen on the way (NEVER IN REACH, nearest 2.01 m; WIDE before
the reach threshold existed). Two drawn runs (the glass, the standing self-lob, for the contact sheet) matched their FAST twins.

### What was wrong, and what changed
- **The off-glass lob on the run went over the board, every time (0 of 8; the original build too).** The planner's own log said
  OFF THE BOARD. Its catch was the hang beat and it threw from a fixed 3.8 m: the run left plus 0.8 s of clip is a flight that has
  to hang, so it met the glass over the board's top (4.03 m) from anywhere past ~1 m out (the mode's solver, swept). On the run it
  now catches on the rise beat (`GLASS_RUN_CATCH_CLIP_T` 0.62) and the prop throws when its predicted throw meets the board low
  enough (`glassThrowDue`, ≤ 0.75 m over the rim), or at the last release that clears the iron (`GLASS_RELEASE_MIN_M` 0.6).
  `AUTO_GLASS_AHEAD_M` is gone (its note no longer matched the flight's timing).
- **Its window is narrow, and the dribble made it late.** At a sprint the board can be met from only ~0.5 m of the run. A runway
  beat waits for the dribbled ball to come back to the palm: mid-bounce the throw left up to 0.43 s late, at the line, under the
  iron (CLANK). A glass throw on the way is now carried, not dribbled: the bounce stops at the next palm moment.
- **The glass and bounce lobs re-aim at the take-off** when their own clock is off by more than two frames, as the plain lob has
  since 2026-09-18 (through the glass solver before the board, the bounce solver before the bounces, a plain arc after).
- **The standing off-glass throw could not be caught (0 of 5).** A mid-board hit is a ~0.8 s flight; the run in from the top of
  the runway is ~1.4 s before the catch beat even starts. Y + up (or Y on the glass prop) now **arms** the throw: it goes up on the
  run when due, and the HUD says so ("OFF THE GLASS — IT GOES UP ON THE RUN").
- **The passer's glass oop** was thrown during the dunker's rise on the standing solve (a 1.16 s flight with ~0.55 s of rise left),
  and from his wing spot the mirror point of his throw lies off the board (WIDE OF THE GLASS). He now stands at the elbow
  (`OOP_GLASS_PASSER_X` −1.6, `OOP_GLASS_PASSER_FROM_RIM_M` 5.5) and throws on the run, wound up, like the plain oop (Phase 3).
- **The passer's bounce oop** was a standing bounce-bounce thrown in the rise (3.1 s of flight). It is a single bounce thrown on the
  run now (`OOP_BOUNCE_FLIGHT_SEC` 1.1). An early take-off gets the glass / the bounce if it still fits, else a plain lob, said on
  the banner ("NO TIME FOR THE GLASS — ALLEY-OOP").
- **From a night's second attempt the dunker kept the oop ball** (a Phase 3 regression). `setupProp` hands the passer the ball
  only in the approach, and on a reset it ran before the phase was set; the old after-take-off throw hid it by snapping the ball
  to the passer at the launch (a 3.4 m pop). The ball goes to the passer as each attempt starts.
- **The lob stays in the picture.** The standing self-lob tops out ~6.4 m up and the runway camera (aimed ~2.4 m up, the rim as
  its objective) lost it for up to 41 % of its flight. While a lob is in the air on the runway the camera's objective rises with
  the ball (`LOB_FRAME_LIFT` 1, eased over `LOB_FRAME_TAU` 0.2 s); the shared camera is untouched.
- **A whiff always says why.** "LOST THE SELF-LOB — MISSED" named the lob, not the reason. The flight keeps the ball's nearest
  pass by the hand and the loss names it: TOO HIGH, TOO LOW, OUT AHEAD, BEHIND YOU, WIDE, or NEVER IN REACH (over 1.5 m).
  OFF THE IRON and OVER THE GLASS already said theirs. No silent LOST in any sweep run after the change.

### Foot skate (carried from Phase 1), re-checked with more reps
Plain approach, 6 reps at the default stride, 5 at the knob's 1.1 (the sixth was cut by a container restart), FAST rig:

| `dunk.runwayStrideScale` | Weighted foot skate, all | Run band (2.5–5 m/s) | Sprint band (5+ m/s) |
|---|---|---|---|
| 1.0 (shipped) | 1.22 m/s (1.01–1.46) | 0.98 | 1.72 |
| 1.1 | **0.97 m/s** (0.85–1.11) | 0.71 | 1.51 |

Rep for rep, 1.1 skates less on all five matched pairs (1.17 → 0.97 mean, −17 %). The Phase 1 gate is still not met at either
value. The default stays 1.0: it is a tuned feel number and the owner's call. **Recommendation:** feel 1.1 on the panel.

Gate run on the phase's head (merged with `origin/lane/finish-release`; all through the shared CPU slots): tsc 0 errors · eslint 0
warnings on the changed files · mode-list-check 32 modes · vitest (dunk mode and core, `reducedMotionGates`, `LobMarker`,
`veniceBoardwalk`, `lib/feel-panel`, `tests/probes`) 59 files, 731 tests, all green · the 12 dunk-related headless suites 12 / 12.
Contact sheet: `round9/dunk-flagship/shots/phase4-lobs.jpg`.

## 9. Phase 5 — dunk feel: the iron, your real jump: results (lane/dunk-flagship-p5)

Rig: the FAST sweep rig (Phase 4), checked again against drawn runs (Orbit, the body dunk strip: the same events). Contact sheet:
`round9/dunk-flagship/shots/phase5-feel.jpg`.

### Gate 1 — the slam beat scales with the slam
| The slam press | Accuracy | Hit-stop | Shake |
|---|---|---|---|
| 110 ms late | 0.35–0.44 | **70 ms** | **0.120** for 140 ms (the shipped beat) |
| 93 ms late | 0.44–0.52 | 70–76 ms | 0.120–0.132 |
| 60 ms late | 0.64–0.69 | 83–86 ms | 0.146–0.152 |
| body dunks (the body's own slam) | 0.82–0.92 | 94–100 ms | 0.168–0.179 |
| on the beat | 0.93–0.95 | **100 ms** | **0.180** for 180 ms |

**Fixed:** SLAM is still held at contact after any tap (contact lands ~33 ms after the press), so `slamImpact`'s rim-hang bonus
(+0.15) applied to every make and an ordinary one came out at 75 ms / 0.129. The hang now adds only on an above-ordinary slam
(accuracy > 0.5); the knobs and their defaults are unchanged. Found by the coordinator's read before the rig confirmed it.

### Gate 2 — the rim, the net and the glass react on every make
Every make punched the hoop (the rim spring, the net squash, a flash on 1 hoop material) and shook the glass (2 meshes):
Venice 116 of 116 (every Phase 4 sweep make), Blossom 2/2, Canopy 2/2, Rooftop 2/2, Orbit 1/1. Orbit has to be measured drawn:
its sky is near-black, so with FAST's empty frames the render watchdog reads a black display and stops the arena (a FAST
artefact). Not reached by any venue, and not fixed: HoopJuice only looks for `meshy_hoop_*`, so the procedural fallback hoop
(if the GLB failed to load) would flash and shake nothing.

### Gate 3 — the real jump maps to the flight, monotonic
A synthetic body (lib/pose's own streams: a jog, then a jump of 30 / 50 / 70 cm) published packet by packet into the rig's
real bus, so the harness, BodySession and the mode's `onBody` run it:

| Jump | Fixed mapping: power → apex | Personal (a verified 50 cm jump, knob on): power → apex |
|---|---|---|
| 30 cm (read 0.28 m) | 0.40 → 1.40 m | 0.55 → 1.50 m |
| 50 cm (read 0.49 m) | 0.69 → 1.55 m | 0.97 → 1.71 m |
| 70 cm (read 0.73 m) | 1.00 → 1.71 m | 1.00 → 1.71 m |

**Fixed, a real bug:** before this phase every body dunk launched at the top of the runway (charge 0.05, run 0). The body's RUN
reaches the mode from `onBody`, past the bus's arbiter, and a seated pad re-sends its own trigger every frame: an idle pad's RT 0,
one frame after the jog started the run, read as RUN let go. RUN is now the deeper of the hand's and the body's pull (as the
arbiter folds them); pad-only it is the pad's value exactly (the pad regression measured identical: apex 1.77, 100 ms). The
launch log names its cause now. **Not fixed, flagged:** `DunkDuelMode` binds the same `DunkBodyBinder` the same way.

### Gate 4 — only verified adult jumps personalise it
`GET /api/dunk/verified-jump` (new, read-only) answers the caller's best countermovement jump (hands on hips) that
`lib/jump/seam.ts` calls verified, from their saved Quick Screens, and only when the account is verified 18+ and opted in **now**
(`canSaveScanNumbers`, read from the database at request time): a row saved under an older rule, a teen, or an adult who opted
out reads `{ verified: false, heightCm: null }`. The device-only vertical of lane vertical-easy (#480) is not read. The mode reads
it only with the knob `dunk.realJumpPersonal` on (OFF by default; lib/feel-panel refuses knobs in ranked, staked and paid play);
`lib/move/dunkBody` is untouched (movement-play's). Tests: the real assessment POST, then this GET (adult, unverified jumps, a teen,
opted out, no session, a failing database).

## 10. Phase 6 — 16 air tricks you can tell apart: results (lane/dunk-flagship-p6)

Rig: the esbuild rig on build `82e88b7c` (the release merged in), the dunker filmed from the side (`SIDECAM=1`: the camera
beside the hips each frame, after the mode's own camera). Contact sheet: `round9/dunk-flagship/shots/phase6-tricks.jpg`
(6 side frames of every trick from the frame it fires, then the distance chart).

### Gate 0, first
The hero's rig as loaded (`GATE0=1`): `Human.rig_c57`, the 22 FEL-spec bones, none prefixed (rigNormalize's gate), the hips
0.986 m over the floor at rest, the root at y 0.028. The pose targets below play on any body that passes it.

### Gate 1 — all 16 air tricks fire on the rig
16 of 16 log `[DUNK-TRICK] air <id>`, each on a fresh page (one attempt per page, so nothing left over from the last attempt):
14 fire at 0.34 of the flight (in the window) and the two armed ones (scorpion, double clutch) at 0.71. The windmill and the
cradle never fired at first: the probe threw them 0.1 s after an automatic launch, inside TakeoffEcho's late-jump window
(`LATE_JUMP_MS` 250), which reads an A there as the jump the player was about to make. A probe artefact, not a game bug: the
probe now presses the trick `AIR_AFTER_MS` (300) after the launch.

### Gate 2 — distinct body paths
The measure: for each trick, its own window (from the fire, 0.75 s, 18 samples), the hands, the feet and the head relative to
the hips and turned into the body's facing, and the RMS distance in metres to every other trick's. The plan's wording — every
trick's nearest neighbour at least the median — cannot hold for any set (half of any list sits below its median), so this
phase used its other clause: **the closest pairs fixed and re-measured** (`assumption:` the owner meant that one).

| | Nearest-neighbour median | All-pairs median | Closest pair |
|---|---|---|---|
| Before | 0.332 m | 0.507 m | fake eastbay / double eastbay 0.225 m |
| After the cradle change | 0.332 m | 0.509 m | the same (by design, below) |

- **Fixed: the cradle and the behind-the-back** (0.246 m, the closest real pair). They flew the same leg program, drive →
  kick back → spread → long, so from the side two different hand paths rode on one pair of legs. The cradle's legs now swing
  FORWARD while the ball rocks back past the hip (the counterweight; `AIR.kickOut` on the rock's two keys instead of
  `AIR.kickBack`). Re-measured on the rig: the cradle 0.246 → **0.324 m** (nearest now the fake behind-the-back), the
  behind-the-back 0.246 → **0.319 m** (nearest now the between-the-legs). The hands, the key times, the take-off and the flush
  are unchanged; `coreClips.test.ts` (the named dunks move, finish long, legs asymmetric) passes unchanged. **RIG-ADJACENT,
  an authored shape: the owner's eye signs it off** (the sheet shows the cradle before and after).
- **Not changed, by design: the fakes.** Fake eastbay / double eastbay 0.225 m and fake behind-the-back / fake eastbay 0.259 m
  sit lowest because the fakes are authored to copy the real move for their first third ("the lie", in `dunkTricks.ts`).
  Pulling them apart would break what they are.
- **Not changed: the 360 and the lost & found** (0.311 m). Both are turned by the mode's spin layer and the clip owns only the
  arms, so their bodies share the turn by construction.
- A whole-flight version of the measure (launch to +1.3 s, the shared carry-up and slam included) reads lower everywhere
  (nearest-neighbour median 0.263 m) — the same rank order, which is why the gate is measured on the trick's own window.

### Gate 3 — the side strips
All 16 from the side, 6 frames each from the fire, on the sheet. The probe draws only the strip's frames (and the 3 before
each) under FAST: filming every frame took ~14 min a trick under the shared CPU load. Checked against a fully drawn control
of the same seed (the windmill): the same frames, per-frame RMSE 0.4–1.0 %.

Probe changes (`scripts/probes/_dunk-flagship-probe.mts`): `AIR_AFTER_MS`, `TRICKS=` (a subset), `STRIP_ALL=1` (a strip of
every attempt), `SIDECAM=1`, `GATE0=1`, FAST + STRIP draws only the strip frames, and the status line is restored after
each photo (hidden, it made the page's next attempt read "no approach"). Found on the way: from the second attempt on a page
an obstacle prop (an orange car, by the look of it) stands between the side camera and the dunker, so the strips and the numbers above are one trick per page
(`PER_PAGE=1`).

## 11. Phase 7 — item 1: the prop in the side camera's line (lane/dunk-flagship-p7)

Phase 6 found that from a page's second attempt an orange prop stood between the side camera and the dunker. Rig, build
`a1b38f52` + P6. Sheet: `round9/dunk-flagship/shots/phase7-occlusion.jpg`.

**What it is.** The hoopbus (`dunk_hoopbus`), and it neither moves nor respawns. FIRST-DUNK-BUDGET loads the contest set
after dunk 1 — the rival's body first, then the venue's dressing and the corner props (`parkCornerProps`) — and the bus
parks once on the right corner: bounding centre (5.58, 1.48, −7.68), radius 5.4. From the next attempt it stands where
the probe's side camera was put (the hips + 6.2 m in x): the camera was inside it. The game's own cameras never were.

**Measured** (camera → hips and head rays, every 2nd frame; `OCCL=1`), 5 attempts on ONE page (night 1's four, GO AGAIN,
night 2's first, `?continuous=1` as /try runs it):

| Camera | Attempt 1 | Attempts 2–5 |
|---|---|---|
| Side camera forced to the right (the Phase 6 placement; the control) | 0 of 155 blocked | **107 of 155** each, by `dunk_hoopbus` |
| Side camera on the clear side (the fix) | 0 of 155 | **0 of 155** each |
| The game's follow and rim cameras | 0 of 153 | 0 of 153 each |
| The replay and the card (`show`, 3 attempts) | ~4 % of frames: the hoop and the ball in front of the hand at the slam (the subject, not an occluder); the bus 0 | |

**Fixed (probe only).** SIDECAM checks its line to the hips every 15 frames and stands on the clear side (`SIDECAM_SIDE=1/-1`
forces one, the control). No DunkMode change: the bus never stood between a game camera and the dunker, so an occluder
fade there would have nothing to fade (gameplay-clean's `OccluderFade` leaves dunk out; it is not needed for this).
Also in the probe: `NEWMESH=1` (what appeared or moved near the court before each attempt), GO AGAIN on a continuous
night's card, so 5+ attempts run on one page.

## 12. Phase 7 — the slam variants: REVERSE and TWO-HAND POWER (knob, off)

All sixteen direction + button slots in the air are the named tricks, and A inside the slam window is the slam, so the two
finishes the bodies carry and the contest never used are called WITH the slam: the **left stick held at the live A press inside
the slam window** — back = REVERSE (`dunk_finish_reverse`; the hero plays its mocap `dunk_mc_reverse`), up = TWO-HAND POWER
(`dunk_finish_two_hand`). Behind `dunk.slamVariants` (OFF; never in ranked, staked or paid play). Named on the banner, the
replay's call and the card's AIR line; +0.6 / +0.3 difficulty (NEW numbers). A called air trick keeps its own flush; a buffered
press (made before the window) never reads the stick; the rival's turn never does. `core/DunkSlamVariant.ts`.
Sheet: `round9/dunk-flagship/shots/phase7-slam-variants.jpg`.

| Gate | TWO-HAND POWER | REVERSE |
|---|---|---|
| GATE 0 | the same hero as Phase 6 (`Human.rig_c57`, 22 FEL bones); both clips play on it on the rig | same |
| Fires from its input on the rig | 9 of 9 (3 runs) | 9 of 9 |
| On the iron at contact (ball centre to ring centre) | 3 of 3 makes, 0.22–0.24 m | **2 of 3** — 0.17, 0.19 m; **1 SHORT OF THE IRON** (0.215 m off) |
| Its own name on the card | TWO-HAND POWER! | REVERSE! |
| Distinct from its nearest neighbour (Phase 6 metric over the finish: the press + 0.5 s) | 0.36 m (tomahawk) | 0.43 m (double clutch) |

The finish-window median is 0.052 m: every called trick flushes on the same one-hand flush. **The ≤ 0.2 m gate as written is
not met by the shipped flush either** — the plain one-hand flush measured 0.20–0.34 m in the same runs, because the contact is
geometric at the iron and the ring's radius is 0.23 m; the power sits inside that spread.

**The REVERSE does not pass yet**, and the knob should stay off until it does. With the back to the iron the ball arm reaches up
and BACK over the head: the reach IK off, 0 of 3 (the mocap reverse flushes in front); on, 1 of 3 (the jam's carry-in, sized
for a ball in front, parked the hips under the ring); no carry-in on the reverse and its jam 0.2 m higher
(`REVERSE_JAM_LIFT`), 2 of 3. The misses start the jam with the ball lower and nearer than the makes. What would fix it is the
turn starting before the window (a reverse is turned on the way up, not at the iron) — a flight change, the owner's call.

**The sixteen tricks are untouched**, knob on or off: `DunkSlamVariant.test.ts` replays all 16 inputs through the real
recognizer with the stick neutral, back and up, knob on and off — identical; a scan pins the one read site. On the rig, all
16 with the stick held BACK the whole flight, knob on vs off: the same trick on the same beat, the same clips, the same press
frame, all made (16 of 16); the knob-on run logs the reverse it did not take ("the called trick keeps its flush"). One
difference: the tap's knob-on contact came 17 ms after the press, inside the 60 ms A hold, so it hung on the rim — two pages
of the rig differ by a frame like this anyway (they differ by 1–3 cm on the standing frame, before any input).

Also in Phase 7: the probe's `finishes` scenario, the slam stick, `STICK_FLIGHT`, and the side camera aimed at the chest.

### 12b. Phase 7b — the REVERSE turned on the way up; the contact gate made horizontal (lane/dunk-flagship-p7b)

The coordinator's decisions: the contact gate is now **the ball's horizontal distance from the ring centre at contact ≤ the
ring's inner radius** (DunkMode `RIM_RADIUS` 0.225 m; the `[HANDS] iron contact` line ends with it, "flat"), and the REVERSE
is turned on the way up. From the hang (`REVERSE_TURN_FROM` 0.7) until the slam window opens, the stick held back for
`REVERSE_COMMIT_SEC` 0.1 s with no air trick called or armed starts the turn away from the iron (NEW numbers, behind the same
knob, off). The A press still decides the finish; a trick thrown after the turn began stops it. Sheet:
`round9/dunk-flagship/shots/phase7b-reverse.jpg`.

Rig, knob on, 5 of each on one page:

| | Made | Horizontal at contact ≤ 0.225 m | flat (m) |
|---|---|---|---|
| plain (the shipped flush) | 5/5 | **2/5** | 0.178, 0.339, 0.253, 0.152, 0.273 |
| REVERSE (back held from the take-off) | **5/5** (was 2/3) | **4/5** | 0.140, 0.103, 0.218, 0.196, 0.323 |
| TWO-HAND POWER | 5/5 | **1/5** | 0.245, 0.278, 0.152, 0.323, 0.290 |

- **The REVERSE makes 5 of 5** — the target. On the horizontal gate it is the best of the three (4/5).
- **The horizontal gate fails for the shipped flush too (2 of 5), and for the power (1 of 5).** A 'flat' over 0.225 m is a
  ball that met the FRONT iron from outside the ring; the flush (startFlush) then carries it in, so every one of them is a
  make. Making the jam carry the ball over the ring before the contact counts would change every dunk in the game (a tuned
  flush) — the owner's call; nothing changed here. **The knob stays off** (decision 3): the power does not pass this gate.
- **The sixteen tricks, re-run on the new code** (the stick held BACK the whole flight, knob on vs off): the same trick on the
  same beat, the same clips, the same press frame, all made, 16 of 16; the turn never started on a called or armed trick.
  The beats differ on 2: the tap hung on the rim (its contact came inside the 60 ms A hold — the page jitter seen before) and
  the tomahawk's contact line differs only in a number. `DunkSlamVariant.test.ts`: the second read site pinned (test changed).

## 13. Phase 8 — the show: replay, judges, crowd, sound, camera (lane/dunk-flagship-p8)

Rig, the game's own cameras (no side camera), three makes on one page (`show`, filmed 18 s from the run through the replay and
the judges to the next runway). The probe now records, every frame, whether the hips, the head and the rim's centre project
inside the frame (`sin`), and the HUD's replay cut. Sheet: `round9/dunk-flagship/shots/phase8-show.jpg`.

| Gate | Before | After |
|---|---|---|
| The dunker and the iron in frame on every replay frame | the iron 188/188; the dunker **187/188** on 2 of 3 makes | **188/188** on all 3 |
| No camera cut outside the authored cuts | every jump matched (rim cut, 4 replay cuts, the cut's end, the judges, the next runway) — but the cut's end was **two** cuts in two frames | one cut at the end |
| Sound and crowd within one frame of the iron | the slam thud and the crowd cheer on the contact frame (0 frames) | same |
| The reveal-to-next-dunk dead time ≤ baseline | judging → the next dunk 5.55 s | 5.55 s (untouched) |

**Fixed — one frame of the poster's camera at the end of every ordinary make.** The triple cut's clock ran past its last cut on
its final frame; with no poster to hold (an ordinary make, `freezeSec` 0) the "frozen" branch still cut to the poster's camera —
low under the rim — and `finish()` in the same frame put the live root back on the floor, so that frame drew the rim with the
dunker out of it, before the judges' camera took over a frame later. A cut with no freeze now just ends
(`scene/DunkReplayCam.ts`). Test: `DunkReplayCam.test.ts` "one cut, one camera" — checked against the old code first (it fails
there: two jumps, 11.3 m and 3.4 m) and passes on the fix.

Not changed: the replay's angles (three plus the orbit), the reveal's beats and its timing, the crowd and the sound — they
already met their gates.

## 14. Phase 9 — modes and progression (lane/dunk-flagship-p9)

**The verified vertical on the ladder.** The two jumping feats on the unlock ladder — OVER FIVE IN A ROW and THE DUBBLE UP OVER
6 TO 10 — also open with the player's verified adult jump: 50 cm and 60 cm (`VERIFIED_JUMP_ROW5_CM`, `VERIFIED_JUMP_DUBBLE_CM`,
NEW numbers: a strong and an elite hands-on-hips countermovement jump). The won nights still open them exactly as before (3 and 4
nights); the jump is a second road, never a gate, and nothing that was open is locked. A locked rung says both roads ("LOCKED — OVER
FIVE IN A ROW · WIN 3 MORE NIGHTS OR A VERIFIED 50 CM JUMP"), except on a staked run.

**Who.** The server answers for the signed-in account (GET /api/dunk/verified-jump, Phase 5): a number only for a verified 18+
athlete who opted in, with a verified jump saved. That answer is the adult gate — without it the phone's jump history
(`lib/jump/historyStore`, read only) is never read, so a teen's, a kid's, a guest's session on a shared phone never sees an adult's
jumps (the history itself only ever holds adults' jumps: `keepJump` refuses anything but `adult: true`). With it, the best of the
saved jump and the phone's verified hands-on-hips jumps; hand-picked frames and the arm-swing vertical never count (another
series). The visit's jump is never stored, and a staked, ladder or challenge run never counts it (props carry card bonuses: a real
rep never sells an advantage in ranked, staked or paid play). Read after dunk 1, from the contest set behind the flight gate.
`assumption:` an adult with jumps on the phone but none saved on the server is not read (the server's answer is the only adult
signal the mode has); a looser gate would need an account-age read on the client — the owner's call.

**The friends battle.** A Flight Night challenge link is `/play/dunk?c=<code>` (`challengePlayHref('dunkContest', …)`), and
`?c=` is a staked run: the classic night — one rival, four judged dunks (`DUNK_CONTEST_ATTEMPTS`), no field, no cut — so the card
is the integrity cap's card, unchanged. No knob reaches it: the feel gate blocks a challenge link even with `?playtest=1`.

Tests: `core/DunkUnlocks.verifiedJump.test.ts` (11). Rig: the mode boots and plays a night with the new read (a rig has no server:
"none read", nothing changes).
