# Gameplay, clean: the audit and the pass (lane/gameplay-clean)

**Owner, 2026-10-28:** *"Gameplay needs to be really clean. All tools need to be accessible, easy to use."*
This lane covers how every mode plays, and the controls inside the games: pause, the controls sheet, the HUD, the touch
deck and the feel panel. Other lanes cover the training, coach and studio tools. Dunk, 1v1 and 3v3 have their own 10-phase
lanes, so their findings are routed to those lanes (§5) and their files are not edited here.

## 1. The instrument

`scripts/probes/gameplay-clean/` (no `next dev`, no `next build`, no dependency):

- `build.mjs` bundles **the real `/play/<route>` page** a player gets with esbuild: `app/play/layout.tsx` (the error
  boundary, caption region and FEEL tab) around the route's own loader (GameShell, the mode's host, its HUD, the READY card,
  the pause and the touch deck). Next's server pieces are stubbed (the accessibility rig's stubs). The server's answers are
  stubbed too: a signed-in player, a run marked as an agent run (so the harness publishes `__FEL_DEV__`), and the feel panel
  opened. Tailwind is compiled with its own CLI, and `public/` is symlinked in. The production build is ESM with split
  chunks, 17 MB of JS.
- `audit.mjs` drives each mode headless on a **sideways phone** (844×390, touch, mobile tier) with SwiftShader. It uses
  **scripted keyboard play on a virtual clock**: every rendered frame is 1/60 s of game time, and timers run on that clock
  too. The script runs about 22 s: forward, run right, a circle, the pause at 10 s (photographed, then resumed with a face
  button), then mixed play with the run held in bursts, with a face-button tap every 1.3 s. It uses the dunk lane's
  validated **FAST** mode: GPU draws are skipped but counted. Draws come back on only for the photographs, at READY, at 5 s
  and 14 s of play, and on the pause.
- **What it records, and the rule for each measure:**

  | Area | Measure |
  |---|---|
  | Pops | Each of the 22 bones' angular speed, flagged at ≥ 600°/s and ≥ 3.5× its ±6-frame median. Bones flagged within 10 frames of each other count as one event. A **hard** pop peaks at ≥ 1500°/s (25° in one frame). |
  | Pose | T-pose: arms level and spread, held for 6+ frames. Rest pose: ≥ 90 % of bones within 3° of the rest pose. |
  | Skate | At each foot's low point in a stride, the foot's slowest ground speed within ±4 frames, divided by the body's speed. A planted foot reads ~0; a sliding one reads ~1. |
  | Occlusion | Three rays (head, chest, hips) from the eye to the hero, stopping 1 m short of the body. A hit counts only on a visible, non-skinned mesh larger than a ball, and only on a face turned toward the camera. Hidden = 2 of 3 rays blocked. Also: the hero's chest projected inside the frame. |
  | Camera | A snap is a one-frame spike against its ±6-frame median: the eye moving > 0.6 m beyond the hero's own step, or the view turning > 15°. The first 3 s after play starts or restarts (the intro) are reported apart. |
  | HUD | On READY, at 5 s and 14 s of play, and on the pause: visible words (DOM and Babylon GUI), text under 12 px, overlapping text, WCAG contrast (over a mid-grey scene where the text is see-through), and tap targets under 44 px. |
  | Perf | CPU frame time with the GPU's draws skipped, for the whole run, plus a **phone tier** window of the last 2.5 s at a 4× CDP CPU throttle. Draws per frame against PerfMonitor's mobile budget of 600. Wall time to READY and to the first playing frame. Shader programs linked per phase. The harness's own `__FEL_HITCH__` report. |
  | Input | For each face-button tap, the frames until the hero visibly changes: a clip change, or a hand, foot or head ≥ 5 cm off its extrapolated path. |
  | Flow | The phase timeline. The longest stretch of play where the hero, the camera and the screen's words all stood still. Whether pause and resume work. Whether a tap on the touch deck's bottom face button reaches the InputBus. |
  | Errors | Page errors and console errors. The rig's static server answers 501 to `POST /api/analytics` and 404 to one optional file; both are left out. |
- `run-all.sh` runs one browser at a time inside the shared gate lock, in holds of up to about 15 minutes, and skips any
  mode whose JSON already exists. `report.mjs` produces the two tables below.

**Validated against controls before trusting.** Each rule above was corrected against raw data before any finding used it:

- **Camera.** Measured on the target point, the rule read aero's chase camera banking behind the plane as 523 "cuts".
- **Skate.** The low-point frame alone read about 1.0× in every on-foot mode.
- **Pops.** At 600°/s the rule flagged dance and carnival's fast motion; the hard pops are the snaps.
- **T-pose.** Football's and freerun's hits were 2-frame passes on jumps.
- **Occlusion.** The combat rings read 51–54 % "hidden" through single-sided walls that the player sees straight through.

Saved raw recordings (`*-raw.json.gz`) let every rule be re-run without a browser (`REANALYZE=1`).

**Limits, said plainly:**

- Frame times come from a shared 4-CPU box running at load 8–19, on software GL, with the GPU's draws skipped. Read them
  as a ranking between modes, not as a phone's numbers. The perf-lag lane's rig holds the device-like perf numbers.
- Load times are on local disk with no network.
- The script is one generic player. A mode whose controls it does not speak, such as golf's swing timing, reads
  "unanswered" on input.
- Runs on the loaded box were capped at a 230 s wall budget, so some modes recorded 14–25 s of play, not 22 s. Each row
  records its own length.

<!-- AUDIT-TABLES:BEGIN -->
<!-- AUDIT-TABLES:END -->
