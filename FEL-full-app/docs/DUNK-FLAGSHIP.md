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

_(filled from the rig runs below)_

## 3. Gaps, ranked against the lock and the owner's words

_(filled after the baseline)_

## 4. What this pass changed

| # | Change | Flag |
|---|---|---|
| e1 | **The first runway was shot through a taco stand.** The Venice dressing imports five GLBs and places nothing until all five land; an import enters the scene at the world origin, so the first files stood between the run-up camera (z 8) and the dunker (z −1.2). A ray from the camera to the hero hit `facade_taco`, `facade_tattoo` and the hero palm. Each file is hidden the moment it lands and shown when placed. After: the ray hits only the hero. | shared file: `lib/babylon/nexus/veniceBoardwalk.ts` (visual only) |
| a1 | The gather started inside the distance it can be fit at its fastest pace: 7.0 → 5.98 m/s in one frame. It starts no later than `gatherFitDist` + one frame's travel. | behaviour: the gather can start up to ~0.25 m earlier at a sprint |
| a2 | The take-off frame moved the body twice (the run's last step and the plant's first): 2.1 → 4.2 → 2.2 m/s. The plant's drift is counted from the first flight frame. | none (the plant still rolls PLANT_DRIFT_M) |
| a3 | The run-up's legs paced to the capture's own stride. | **TUNED** `RUNWAY_STRIDE_MPS`: 3.6 × 1.1 pin → 4.57 m/s; knob `dunk.runwayStrideMps` |
| b1 | The alley-oop is a lob thrown on the run (1.0 s in the air) instead of a 0.35 s pass after the take-off. | **(new)** `OOP_LOB_FLIGHT_SEC` 1.0 s; knob `dunk.oopLobFlightSec` |
