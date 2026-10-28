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
| Self-lob on the run (prop) | 7/7 | 7/7 (unchanged code) | 100 % | 0.7–3.0 m/s |
| Self-lob standing (Y, then run) | 5/5 | 5/5 | 59 % → **100 %** | 2.8–6.9 m/s |
| Bounce lob on the run (prop) | 6/6 | 6/6 (unchanged code) | 91 % | 3.5–6.2 m/s |
| Bounce-bounce standing (Y, run on RUN!) | 5/5 | 5/5 (unchanged code) | 100 % | 0.8–4.5 m/s |
| Alley-oop, passer, 4 attempts on one page | 4/4 from the DUNKER's hand from attempt 2 | 4/4 from the passer | 100 % | 4.5–4.7 m/s |
| Glass oop (passer) | 0/2 (WIDE OF / OVER THE GLASS) | **6/6** | 100 % | 8.5–8.7 m/s |
| Bounce oop (passer) | 0/6 (NEVER IN REACH) | **6/6** | 100 % | 3.4 m/s |

The before arrival speed for the oops was the shipped bullet's 11.8 m/s (Phase 3); every after arrival is under it.

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
