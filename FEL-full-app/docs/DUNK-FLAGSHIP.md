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
