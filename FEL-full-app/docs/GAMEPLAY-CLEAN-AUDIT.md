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


**Grades.** G / A / R per check:

| Check | Green | Amber | Red |
|---|---|---|---|
| Hard pops/min | ≤ 2 | ≤ 10 | > 10 |
| T-pose or rest pose | none | ≤ 30 frames held | more |
| Skate (slide ÷ root) | ≤ 0.3 | ≤ 0.6 | more |
| Hidden | ≤ 2 % hidden and ≥ 95 % in frame | ≤ 8 % hidden and ≥ 80 % in frame | more hidden, or less in frame |
| Snaps after the intro | ≤ 2/min | ≤ 6/min | more |
| HUD | ≤ 25 words, no text under 12 px, no overlap, ≤ 2 low-contrast texts | ≤ 45 words or ≤ 10 small texts | more |
| Phone CPU p95 | ≤ 33.4 ms | ≤ 50 ms | more |
| Draws | max ≤ 600, mean ≤ 400 | | over the budget |
| READY | ≤ 15 s | ≤ 30 s | more |
| Input | ≥ 60 % of taps answered, median ≤ 100 ms | ≥ 30 %, ≤ 200 ms | less, or slower |
| Stuck | still ≤ 4 s | ≤ 8 s | more, or no play at all |

## 2. Per mode (baseline: the code as `f7b6de6b`, before this lane's fixes)

<!-- AUDIT-TABLES:BEGIN (scripts/probes/gameplay-clean/report.mjs on the baseline run, 30 / 30 enabled modes) -->
**Play.** Each cell is the grade, then the value. Pop events count the bones that pop within 10 frames as one; "hard"
means a peak of ≥ 1500°/s. Skate gives the slide ÷ root ratio, with the number of contacts read in brackets. Skate is
n/a for ride modes, and "–" where the hero never ran.

| mode | boot→READY s | hard pops/min (all pop events/min) | T/rest | skate (slide ÷ root at contact) | hero hidden % · in frame % | cam snaps (after intro) | HUD words · <12px · overlaps · low-contrast | phone CPU p50/p95 ms | draws mean/max | press→response ms (answered) | longest still s | pause | errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| aeroaces | A 26.11 | R 16.22 (16.22) | G 0/0 | n/a | A 6.61 · 88.89 | R 6 | R 55 · 24 · 0 · 4 | R 41.4/86.4 | G 99.73/125 | G 66.67 (11/15) | G 0.85 | G resumed | G 0 |
| baseball | A 21.53 | R 33.87 (45.82) | G 0/0 | – null (0) | G 0 · 100 | G 0 | A 24 · 6 · 0 · 2 | R 35.5/88.4 | G 138.59/196 | A 100 (11/20) | G 2.5 | G resumed | G 0 |
| bigair | A 16.64 | G 1.98 (9.89) | G 0/0 | n/a | G 0.22 · 100 | A 3 | R 31 · 26 · 1 · 5 | R 37.6/63.2 | G 117.42/266 | G 83.33 (14/21) | G 0.15 | G resumed | G 0 |
| brainbrawl | A 28.57 | G 0 (0) | G 0/0 | – null (0) | – null · null | G 0 | R 43 · 17 · 2 · 4 | A 18.5/35.1 | G 295.58/332 | – null (0/0) | G 2.45 | G resumed | G 0 |
| carnival | R 65.61 | G 0 (14.58) | G 0/0 | – null (0) | G 0 · 100 | A 2 | R 53 · 16 · 3 · 2 | G 9.2/17.2 | G 78.22/162 | R 366.67 (4/13) | G 1 | G resumed | G 0 |
| dance | R 35.23 | G 0 (62.94) | G 0/0 | – null (0) | G 0 · 100 | G 0 | R 102 · 13 · 0 · 2 | A 17.4/38.7 | G 220.06/227 | G 83.33 (8/9) | G 2.88 | G resumed | G 0 |
| derby | A 26.48 | R 50.35 (58.74) | G 0/0 | – null (0) | G 0 · 100 | R 4 | R 43 · 16 · 0 · 2 | G 18.8/33.1 | G 280.28/332 | A 133.33 (9/9) | G 1.5 | G resumed | G 0 |
| duel | A 27.58 | R 26.93 (88.86) | G 0/0 | A 0.32 (77) | R 10.15 · 100 | G 0 | R 33 · 19 · 0 · 3 | R 44.4/85 | G 131.45/195 | G 16.67 (15/15) | G 2.02 | G resumed | G 0 |
| dunk | A 29.02 | R 69.96 (78.03) | G 0/0 | G 0.23 (76) | G 0 · 100 | R 6 | R 65 · 40 · 0 · 7 | R 48.3/88.3 | G 135.11/237 | G 33.33 (14/15) | G 1.5 | G resumed | G 0 |
| dunkduel | R 44.43 | R 16.14 (53.81) | G 0/0 | R 0.84 (45) | R 16.12 · 100 | R 9 | R 41 · 20 · 0 · 3 | R 78/135.3 | G 162.61/238 | G 33.33 (12/15) | G 2.02 | G resumed | G 0 |
| football | R 38.17 | R 60.34 (97.69) | G 0/0 | R 0.8 (135) | G 0 · 100 | R 9 | R 54 · 30 · 0 · 3 | R 43.6/120.6 | G 233.46/320 | G 33.33 (14/14) | G 0.5 | G resumed | G 0 |
| freerun | A 23.1 | R 16.17 (80.84) | G 0/0 | A 0.36 (75) | R 8.98 · 100 | R 7 | R 41 · 20 · 0 · 2 | R 40/98.4 | G 111.81/181 | G 33.33 (15/15) | G 2 | G resumed | G 0 |
| golf | A 16.16 | G 0 (0) | G 0/0 | – null (0) | G 1.28 · 99.57 | A 3 | R 56 · 34 · 0 · 3 | G 20/29.3 | G 101/172 | R null (0/12) | G 2.12 | G resumed | G 0 |
| karate | A 21.5 | R 73.07 (96.76) | G 0/0 | G 0.2 (112) | R 51.1 · 100 | G 0 | R 32 · 21 · 0 · 3 | R 53.6/85.7 | G 393.91/466 | G 33.33 (21/21) | G 0.25 | G resumed | G 0 |
| karate_vs | A 26.48 | R 45.67 (112.84) | G 0/0 | G 0.19 (102) | R 51.64 · 93.73 | G 0 | R 35 · 21 · 0 · 3 | R 64.1/100.1 | G 121.11/150 | G 33.33 (15/15) | G 0.48 | G resumed | G 0 |
| mixedcombat | A 22.84 | R 43.05 (83.41) | G 0/0 | G 0.19 (117) | R 54.33 · 100 | G 0 | R 40 · 19 · 0 · 3 | R 55.5/84.8 | G 126.16/174 | G 33.33 (14/14) | G 1.88 | G resumed | G 0 |
| onevone | R 35.88 | R 43.02 (137.12) | G 0/0 | G 0.09 (6) | G 0 · 100 | A 1 | R 57 · 15 · 1 · 3 | R 52.7/85.8 | G 159.88/245 | G 50 (15/15) | G 1 | G resumed | G 0 |
| penalty | A 19.96 | R 16.14 (48.43) | G 0/0 | R 0.69 (94) | G 0 · 98.8 | R 14 | R 36 · 11 · 0 · 2 | R 43.6/68.7 | G 95.5/110 | G 33.33 (14/15) | G 1.32 | G resumed | G 0 |
| showdown | R 45.15 | R 43.18 (80.96) | G 0/0 | A 0.33 (81) | R 54.49 · 100 | R 4 | R 34 · 18 · 0 · 3 | A 29.8/49.6 | G 99.33/136 | G 33.33 (15/15) | G 0.78 | G resumed | G 0 |
| skateboard | A 29.74 | R 51.86 (79.15) | G 0/0 | n/a | G 0.61 · 100 | R 8 | R 72 · 24 · 6 · 3 | R 42.3/83 | G 149.66/352 | G 33.33 (14/14) | G 0.12 | G resumed | G 0 |
| snowboard_slalom | A 28.73 | A 5.36 (42.89) | G 0/0 | n/a | A 7.74 · 100 | A 2 | R 33 · 15 · 1 · 3 | R 70.8/114.4 | G 156.71/207 | G 66.67 (15/15) | G 0.15 | G resumed | G 0 |
| sprint | A 20.41 | G 0 (0) | G 0/0 | – null (0) | G 0 · 100 | G 0 | R 24 · 15 · 0 · 3 | R 30.5/65.6 | G 98.54/107 | R null (0/14) | G 0.6 | G resumed | G 0 |
| surf | A 22.11 | R 10.79 (40.45) | G 0/0 | n/a | A 4.49 · 100 | A 2 | R 37 · 14 · 3 · 3 | R 41.7/74.3 | G 104.61/153 | G 66.67 (15/15) | G 0.53 | G resumed | G 0 |
| tennis | A 23.24 | R 16.11 (29.53) | G 0/0 | A 0.32 (20) | G 0 · 100 | A 2 | R 44 · 22 · 0 · 2 | A 30.7/43.8 | G 101.2/129 | A 150 (14/15) | G 0.67 | G resumed | G 0 |
| threepoint | R 38.27 | R 24.3 (69.87) | G 0/0 | G 0.1 (7) | G 0 · 100 | G 0 | R 40 · 17 · 7 · 3 | G 16.2/32.6 | G 338.75/485 | G 83.33 (11/13) | G 1 | G resumed | G 0 |
| threevthree | R 49.86 | R 64.53 (126.36) | G 0/0 | – null (0) | G 0 · 100 | R 4 | R 59 · 18 · 2 · 3 | R 69.3/100.3 | G 312.08/368 | G 33.33 (14/14) | G 1.25 | G resumed | G 0 |
| tiebreak | R 33.84 | R 21.23 (27.3) | G 0/0 | A 0.32 (23) | G 0 · 100 | G 0 | A 24 · 0 · 2 · 1 | – null/null | G 90.09/126 | – null (0/0) | G 1.5 | G resumed | G 0 |
| velocitykart | A 22.55 | G 0 (18.86) | G 0/0 | n/a | G 0.3 · 100 | G 0 | R 43 · 20 · 0 · 4 | R 40.4/78 | G 127.46/192 | R 266.67 (10/15) | G 1 | G resumed | G 0 |
| volleyball | A 26.56 | A 8.11 (16.22) | G 0/0 | G 0.29 (29) | G 0 · 100 | A 2 | R 39 · 18 · 0 · 3 | R 54/80.4 | G 181.74/282 | R 383.33 (15/15) | G 0.58 | G resumed | G 0 |
| who_scene_it | A 26.38 | G 0 (0) | G 0/0 | – null (0) | – null · null | G 0 | A 43 · 6 · 0 · 1 | R 26.7/57 | G 111.76/200 | – null (0/0) | G 0.13 | G resumed | G 0 |

**Read with care.** The 51–54 % "hidden" on karate, karate VS, mixed combat and showdown was measured before the rig's
back-face rule (§1). Those rays met the rings' single-sided walls from behind, which the player sees straight through
(see the karate VS photograph). Aero's 6.6 % includes its pilot's trailing scarf.

**In-game controls.** Every mode: pad, keyboard and touch lists on READY (with a chooser) and on the pause. A way out in
play (Leave, in the bottom row on a sideways phone). The FEEL tab when the server opens it.

| mode | pause: pad / keys (START, ESC) | pause: touch button | controls on READY · on pause | way out in play | touch deck · a tap reaches the game | feel tab | HUD smallest px (play) | tap targets < 44 px (play) |
|---|---|---|---|---|---|---|---|---|
| aeroaces | G resumed | R none | G 7 rows · G | G | G deck · G FIRE | G | 7 | 9 |
| baseball | G resumed | R none | G 1 rows · G | G | G deck · G SWING | G | 8 | 8 |
| bigair | G resumed | R none | G 5 rows · G | G | G deck · G SPIN | G | 8 | 9 |
| brainbrawl | G resumed | R none | G 4 rows · G | G | G deck · R "not tried" | G | 8 | 8 |
| carnival | G resumed | R none | G 5 rows · G | G | G deck · G GO | G | 7 | 10 |
| dance | G resumed | R none | G 4 rows · G | G | G deck · R "not tried" | G | 10 | 9 |
| derby | G resumed | R none | G 3 rows · G | G | G deck · R "not tried" | G | 8 | 8 |
| duel | G resumed | R none | G 6 rows · G | G | G deck · G FISTS | G | 8 | 8 |
| dunk | G resumed | R none | G 6 rows · G | G | G deck · G SLAM | G | 7 | 10 |
| dunkduel | G resumed | R none | G 6 rows · G | G | G deck · G SLAM | G | 7 | 10 |
| football | G resumed | R none | G 6 rows · G | G | G deck · G HURDLE | G | 7 | 8 |
| freerun | G resumed | R none | G 5 rows · G | G | G deck · G JUMP | G | 8 | 8 |
| golf | G resumed | R none | G 4 rows · G | G | G deck · G button:X | G | 8 | 9 |
| karate | G resumed | R none | G 6 rows · G | G | G deck · G JAB | G | 8 | 8 |
| karate_vs | G resumed | R none | G 6 rows · G | G | G deck · G JAB | G | 8 | 8 |
| mixedcombat | G resumed | R none | G 6 rows · G | G | G deck · G STRIKE | G | 8 | 8 |
| onevone | G resumed | R none | G 5 rows · G | G | G deck · G CHARGE | G | 7 | 10 |
| penalty | G resumed | R none | G 3 rows · G | G | G deck · G STRIKE | G | 8 | 8 |
| showdown | G resumed | R none | G 6 rows · G | G | G deck · G JAB | G | 8 | 8 |
| skateboard | G resumed | R none | G 7 rows · G | G | G deck · G POP | G | 7 | 9 |
| snowboard_slalom | G resumed | R none | G 7 rows · G | G | G deck · G JUMP | G | 7 | 9 |
| sprint | G resumed | R none | G 2 rows · G | G | G deck · R "no deck" | G | 8 | 8 |
| surf | G resumed | R none | G 7 rows · G | G | G deck · G AIR | G | 7 | 9 |
| tennis | G resumed | R none | G 5 rows · G | G | G deck · G DRIVE | G | 8 | 8 |
| threepoint | G resumed | R none | G 3 rows · G | G | G deck · G SHOOT | G | 8 | 10 |
| threevthree | G resumed | R none | G 6 rows · G | G | G deck · G PASS | G | 7 | 10 |
| tiebreak | G resumed | R none | G 5 rows · G | G | A deck · R "no deck" | G | 14 | 4 |
| velocitykart | G resumed | R none | G 7 rows · G | G | G deck · G FIRE | G | 7 | 9 |
| volleyball | G resumed | R none | G 6 rows · G | G | G deck · G HIT | G | 8 | 8 |
| who_scene_it | G resumed | R none | G 4 rows · G | G | A deck · R "no deck" | G | 10 | 4 |

**Per-check summary, all 30 modes:**

- **Pause and quit.** START and ESC paused and resumed every mode, 30/30. There was no touch pause in any mode, 0/30
  (fixed, §4). A way out was there in all 30.
- **Controls reference.** The CONTROLS panel was there on READY and on the pause in 30/30, from the same mode-verb data
  the deck draws. Lines still use pad letters on the touch and keyboard lists (item 17).
- **Consistent button meanings.** A is the main action in 26 of 30 modes; the hoops modes follow the 2K map (A pass or
  none, X shoot) on purpose. The STORM fighters' X is dash and guard; guard is on the sheet now. Combat block is on X
  everywhere (Duel BLOCK, Showdown GUARD, the STORM fighters HOLD X). The board and speed modes' held trigger is always
  Y-slot RT.
- **Touch, controller, keyboard.** The deck was on screen in every mode, and a tap reached the game wherever it was
  tried. The keyboard drove every mode (the rig plays on keys). The pad map comes from the same verbs, and the sheet
  holds 2–8 rows per device.
- **Reduced motion.** It follows the OS setting and the MOTION chip on READY in every mode, through shared gates
  (JuiceKit, Shaker, LightRig, CameraDirector; `reducedMotionGates.test.ts`). It is not on the pause (item 18).
- **Text size.** There is no setting. The HUD zooms with the screen's height (1× on a phone), and the smallest text in
  play is 7–8 px in 27 of 30 modes (item 4).
- **The feel panel.** The FEEL tab showed in 30/30 with the server's yes (28×58 px, left edge, mid-height). A player
  never sees it.
<!-- AUDIT-TABLES:END -->

## 3. The ranked top 20, across modes

Ranked by how much a player feels it, multiplied by how many modes it reaches. **FIXED** means fixed on this lane (§4).

1. **A phone could not pause.** START on a pad and ESC on the keys paused and resumed every mode (30/30 measured). No
   mode drew a pause on the screen, and the touch CONTROLS list had no PAUSE row, so the only way to stop a game on a
   phone was to leave it. **FIXED.**
2. **Snaps into poses.** These are hard pops: ≥ 1500°/s, a bone turning 25–170° in one frame and then holding. Per minute
   of play: karate 73, dunk 70, 3v3 65, football 60, skateboard 52, derby 50, karate VS 46, showdown 43, mixed combat 43, 1v1 43,
   baseball 34, duel 27, 3PT 24, tiebreak 21, tennis 16, freerun 16, dunk duel 16, penalty 16. The examples repeat
   exactly at each press. Karate's RightUpLeg goes 70° then 63° in two frames at 3.35, 4.27, 5.40 and 9.67 s. Baseball's
   RightArm moves 55° in one frame, with 13°/frame on each side, at every swing contact. Baseball's tree crossfades into
   the swing over 0.05 s and into the drive over 0.04 s. RIG-ADJACENT: a GATE 0 and owner call (§6).
3. **The first frame of play stalls.** These are CPU-only times, with the GPU's draws skipped: skateboard 7.65 s,
   penalty 7.53 s, derby 2.20 s, big air 1.77 s, tennis 1.12 s, velocity kart 0.61 s. Each is the frame straight after
   TAP TO START, measured on the box unthrottled; a phone is slower. Shader programs are still linked during play (surf 7,
   3PT 7, kart 9), and the harness's own probe counts compiles after the intro (dunk 22, 3PT 4). The phone pre-warm runs,
   so something built or prepared at START is still on the first frame. Not fixed here: it needs a CPU profile of that
   frame. **Next.**
4. **HUD text under 12 px in every mode.** The smallest text in play is 7–8 px in 27 of 30 modes, and 6–40 texts per
   play screen are under 12 px. The worst are dunk 40, golf 34, football 30 and big air 26. The shared HUD kit sets
   caption at 10 px and label at 11 px *on purpose* ("exactly today's size on a phone"), and the CONTROLS panel's text
   is 9–11 px. Owner call (§6).
5. **The capture ⋯ sat on every mode's first HUD chip** (top-left). The photographs show it over golf's HOLE 1/5,
   baseball's INN · OUTS, aero's PLACE and football's 1 & 10. **FIXED** (in play it joins the bottom row).
6. **Feet slide.** Measured at each stride's contact as slide ÷ body speed: dunk duel 0.84, football 0.80, penalty 0.69.
   Freerun, showdown, duel, tennis and tiebreak sit at 0.32–0.36. The control is 1v1 at 0.09 and 3PT at 0.10, the hoops
   lanes' foot-planting work, so the measure reads good feet as good. RIG-ADJACENT (§6).
7. **/play/tiebreak hung on "LOADING ARENA…".** The rig waited twice for 170 s with no harness at all. The FIRST SERVE
   card that starts the boot was under the boot splash. **FIXED.**
8. **Busy play screens.** The most words on screen in play: dance 102, skateboard 72, dunk 65, 1v1 57, golf 56, aero 55,
   football 54, carnival 53. On READY: aero 147, kart 147, 1v1 141, karate 138, snowboard 132. Overlapping texts in play:
   3PT 7, skateboard 6, carnival 3, surf 3. Owner call on a word budget (§6).
9. **The phone-tier CPU frame is over budget.** p95 at a 4× throttle with the GPU's draws skipped, against a 33 ms
   budget: dunk duel 135 ms, football 121, snowboard 114, karate VS 100, freerun 98, baseball 88, dunk 88. This is a
   ranking on a loaded box; the perf-lag lane holds the device numbers. Draws are inside the 600 budget everywhere
   (max: 3PT 485).
10. **Camera snaps after the intro**, in about 22 s of play: penalty 14, dunk duel 9, football 9, skateboard 8,
    freerun 7, aero 6, dunk 6. Golf's 2 are its ball-flight cuts, which are meant.
11. **Slow first screen.** Wall time to READY on the rig: carnival 66 s, showdown 45, dunk duel 44, 3PT 38, football 38,
    1v1 36, dance 35. These are local, on a loaded box: a ranking, not a phone's numbers.
12. **Presses that answer slowly or not at all.** Median time to the hero's first visible change: volleyball 383 ms,
    carnival 367 (only 4 of 13 taps answered), kart 267, tennis 150, derby 133.
13. **Props between the camera and the hero.** Dunk duel 16 % hidden (`dd_tower_frame`), duel 10 % (the cage rails),
    freerun 9 % (`fr_wall`), snowboard 8 % (pines), surf 4 % (the wave's own lip, which is meant). **FIXED** for every
    mode but the hoops lanes': a generic occluder fade. The combat rings' 51–54 % were the rig counting single-sided walls
    the player sees through; that measure is corrected.
14. **On the pause, the HUD showed through the CONTROLS list.** Golf had 4 overlapping texts. **FIXED.**
15. **The STORM fighters' guard had no button on the sheet.** In karate, karate VS and mixed combat, X does two things
    (tap = dash, hold = guard), but the sheet named only the dash. **FIXED.**
16. **A dead MOVE stick on the deck.** Baseball, sprint, brain brawl and who-scene-it read no left stick. **FIXED.**
17. **Pad letters on the touch and keyboard lists.** Lines like "STRINGS: A A A · A A B" and "L-STICK turns the ARROW"
    show under TOUCH, where the buttons are named JAB, KICK and AIM. **Open** (a translation of the lines needs care:
    "A" is also a word).
18. **No in-game text-size or motion control on the pause.** MOTION sits on the READY card only, and there is no text
    size at all; the HUD scales with the screen's height only. Owner call (§6).
19. **Tap targets under 44 px in play**, 8–10 per screen. The corner buttons are 36 px and the d-pad arrows 20 px. They
    pass the AA 24 px floor, except the d-pad.
20. **A body dunk in the duel was launched by an idle pad.** This was routed from dunk-flagship P5. **FIXED.**

Not found, which matters too:

- **Stuck and broken.** No held T-pose or rest pose in any mode. No console or page errors beyond the rig's own two.
  Every mode paused and resumed. No mode stood still for more than 3 s of play.
- **Draws.** Every mode is inside the mobile draw budget.
- **Touch.** A tap on the deck reached the game in every mode where the rig tried it.

## 4. Fixes on this lane, before → after

| # | Fix | Files | Before → after (how measured) |
|---|---|---|---|
| 1 | A pause button (❚❚ / ▶): in the sideways corner beside Leave, and in the portrait header, shown only while playing or paused. It sends ESC, which the InputBus reads as START, so it uses the harness's one pause path. The touch CONTROLS list now names it. | `components/games/pause-button.tsx` (new), `game-shell.tsx` (+3), `lib/ui/controlsScreen.ts` | Touch pause: 0 / 30 modes → every harness mode. Unit test: START down and up through a real InputBus; the touch sheet names ❚❚. Rig after-run: §4b |
| 2 | In play, the capture ⋯ moves to the bottom row, left of the shell's buttons. READY and the end card are unchanged. | `app/game-surface.css` (+13, CSS only) | Top-left HUD chip covered: golf, baseball, aero and football photographs → after-run photographs §4b |
| 3 | The occluder fade: while playing, a prop on the camera-to-hero line fades to 0.25 alpha, or an instance hides; it is restored when clear, or when play stops. It never fades a skinned body, the world or floor, a ball-sized thing, the hero's own gear within 1 m, a culled back face, or a see-through or opt-out mesh. Off for dunk, 1v1 and 3v3. | `lib/babylon/core/OccluderFade.ts` (+ 7 tests), `ModeHarness.ts` (+7 wiring) | Hidden %: dunk duel 16.1, duel 10.2, freerun 9.0, snowboard 7.7 → after-run §4b. Unit tests: fades the blocker only; restores; instances; back faces; hoops off |
| 4 | The pause's CONTROLS panel is backed at black/85, up from /60. | `paused-layer.tsx` | The HUD's banners and meters showed through the list (golf: 4 overlapping texts) → photograph §4b |
| 5 | A HOLD X = GUARD row for karate, karate VS and mixed combat. | `lib/creator/cardSlot.ts` | Guard on the sheet: 0 / 3 → 3 / 3 (pad HOLD X, keys HOLD L, touch HOLD DASH) |
| 6 | An inert stick ring where the left stick does nothing. | `TouchOverlay.tsx` (+1), test | A live MOVE stick that answered nothing: baseball, sprint, brain brawl, who-scene-it → the dashed ring |
| 7 | Tiebreak's FIRST SERVE card is drawn above the boot splash (z-10 → z-50). | `tiebreak-game.tsx` | LOADING ARENA… for 170 s, twice → **still black on a sideways phone**: the host's box has no height there (§4b, Phase 2) |
| 8 | The duel's RUN is the deeper of the hand's pull and the body's (routed from dunk P5). | `DunkDuelMode.ts`, `dunkDuelRules.ts` (+ test) | A replayed body jog with an idle pad: launched one event after the first pull → no launch until the body lets go |

<!-- AFTER:BEGIN -->
### 4b. Measured after

One hold on the gate lock, after the baseline. The after-build is this lane's fixes on release 82e88b7c, run through the
same rig and script.

| Mode | Before | After |
|---|---|---|
| dunk duel | Hero hidden 16.1 % (`dd_tower_frame`). No touch pause. The ⋯ was at the top-left by the scoreboard. | Hidden **3.6 %** (tower frame ×7 samples, not ×48). The photograph shows ❚❚ and ⋯ in the bottom row. Pause and resume work. |
| freerun | Hidden 9.0 % (`fr_wall` ×23, `fr_ledge` ×11) | Hidden **2.1 %**: the wall fades; the ledge is still met (×11). Phone CPU p95 98 → 43 ms. That is not a claim for this lane: the box's load differed. |
| tiebreak | LOADING ARENA… for 170 s, twice, with no harness phase | **Not fixed by the z-index alone: a new finding.** On a sideways phone the host's game box (`aspect-[16/10]` inside the console stage) has **no height**. Before the first press the screen is black, apart from the shell's buttons. In play only its two SWING buttons show, with no court at all (photographs `tiebreak-after-0prestart`, `-2play5`). The card is above the splash now, but its box is not on screen. Phase 2. |

The unit tests for the other fixes are listed in §4 (pause through a real InputBus, the touch sheet's row, the guard rows,
the dead stick, the duel's RUN fold, and the fade's 7 cases).
<!-- AFTER:END -->

## 4c. Phase 2 (lane/gameplay-clean-2), before → after

Same rig and script. "Before" is the baseline (`f7b6de6b`) or the phase-1 after-run, as named; "after" is the p2 build
(`1901222b`) or the p3 build (`50ed5e6d`, the occluder's box path). Two rig additions came with it: the hero's clips are named
per frame (animation groups that target the hero's bones), and `FEEL=` runs the page with feel-panel overrides (the A/B below).

| # | Item | Change | Before → after (how measured) |
|---|---|---|---|
| T | **Tiebreak on a sideways phone** | The game box is the `aspect-[16/10]` root itself (the canvas and both SWING buttons inside it). `game-surface.css` sets an `aspect-[16/10]` box to `height:100%` of its parent, and the old wrapper had no height. | Play photograph: black, SWING buttons only → **the court, both players and the SWING buttons** (`tiebreak-p2-2play5`). Words in play 10–16. |
| 3 | **START stall** | **None. It was mostly a rig artifact.** | The 7.5–7.7 s first-play frames come only from FAST runs that photograph READY. The photograph switches drawing on for one frame, the shader compiles it starts land on the first play frame, and the link counter sees 0 ms (it times `linkProgram`, not the status wait). The same build with no photograph: 268 ms (skateboard), 337 ms (penalty). With real drawing under the CDP profiler: 254 / 210 ms, with 3–4 programs linked after START. The phone tier already prewarms at load (`shaderPrewarm.ts`). The stall is intermittent in photographed runs (penalty 395 ms in one run, 6.2 s in the next; football 7.6 s), so the rig's start metric needs a photograph-free run to be trusted. |
| 9 | **Top CPU offender: this lane's own occluder fade** | The profile's top self time in penalty was `_intersectTriangles` under `OccluderFade` (1.05 s of a 4.4 s window). A mesh over 12k vertices is no longer triangle-tested. A dense **prop** (radius ≤ 4 m: a Meshy hoop) is tested by its world bounding box and still fades; a dense stand or shell is skipped. The candidate list is cached (rebuilt every 20 checks). | Penalty phone CPU p50/p95: 43.6/68.7 → **23.7/44.4 ms**. The first cut skipped dense props and let the duel's hoop back in the way (hidden 3.6 → 6.1 %); with the box path, **3.9 %** (baseline 16.1). Penalty hidden 0 % (7.7 % with the first cut). |
| 10 | **Camera snaps** | `CameraDirector.aim`'s look-ahead now eases (0.2 s) and grows with ground speed up to 1 m/s. Both are new feel knobs. Steady running keeps the old lead. Off for dunk, 1v1 and 3v3. `snapTo` cuts (golf's ball flight, resets) are untouched. | Skateboard cuts after the intro: **8 → 0**. Football 9 → 7: the rest are its 14 m reset cuts between downs, which are intended. Penalty 14 → 14 and dunk duel 9 → 9: their snaps are not the lead. Penalty's are the breakaway's `snapTo` plus a 1.2–1.8 m-per-frame eye move over 4 frames (a camera fly). The duel's 31° at 2.4 s is a framing change. Both are in §6. |
| 6 | **Foot skate** (rate only, GATE 0) | Penalty: the striker's `run` is paced by StrideMatch against LocoBus's calibrated 4.8, and he stands under 0.4 m/s (was: running on the spot). Football: the carry loop is paced against its measured 2.1 m/s up to 1.4× (knob). Dunk duel: **reverted**, see the next column. | Stance pace (the feet's speed under the body while down, ÷ the root's): **penalty run 0.65 → 0.99** at 7+ m/s (0.92 → 1.07 at 5–7), **football carry 0.27 → 0.90** (1.16 at 5–7). The audit's contact metric did not move (penalty 0.69 → 0.67, football 0.80 → 0.79). Its frame is the toe's lowest point, which on these authored loops falls on the swing, and its along-travel part stays at 0.67–0.79. That is clip shape. Dunk duel: the run was already near matched (0.85); pacing gave 1.11 and the contact metric worsened (0.84 → 1.04 / 1.21), so it is reverted (`8f4c13ab`). The duel's real skate is 42 frames of the idle → run crossfade at 5.9 m/s on the charge, plus the rim hang drifting at 1.7 m/s. |
| 2 | **Hard pops** | AF-1's `anim.inertial` is wired (default **off**: no change) on the hero of karate, karate VS, showdown, mixed combat, football, skateboard and derby, so it can be A/B'd from the feel panel. No crossfade time was changed. | The clip-attributed split in the next table shows why: much of the count is inside the clips. **The A/B with the knob on was not measured.** The rig's `FEEL=` override never went active (the feel tab read inactive in every snapshot), so the owner's panel is the way to try it. |
| 8 | **Busy screens** | Skate's play screen names the next 3 open goals and "+N MORE" (it listed all 9, done and open). | Skateboard words in play **60 → 34 / 23** (corrected counter). Penalty 20, football 35, derby 18, karate 8–23, tiebreak 10–16: already under 40. READY over 80: karate 126, showdown 108, football 103, skate 82, karate VS 81. Their READY is the owner-signed CONTROLS panel (`panelLines.ts`) plus venue and style pickers; §6. |

**Where the hard pops are** (14 s anim-only runs; an event is any frame with a bone ≥ 1500°/s, clustered within 10 frames;
"blend" means a crossfade is running or the clip set changes within ±2 frames, "in-clip" means one clip, steady):

| Mode | Events/min | Blend | In-clip | The biggest |
|---|---|---|---|---|
| karate | 88.9 | 15 | 6 | strike onsets: run → `karate_mc_jab` ×4, jab+run → run ×3; in-clip `karate_mc_hit_react` legs 50–71°/frame, `karate_floor_hold`, the get-up |
| karate VS | 51.1 | 11 | 1 | shuffle ↔ guard ↔ run switches, strike onsets |
| football | 38.4 | 4 | 5 | carry ↔ `jump_up` (the hurdle); in-clip `football_carry_run`'s **off arm**, 26–31° a frame (an IK pole whip in the authored loop) |
| skateboard | 34.1 | 5 | 3 | idle → `skate_ollie`; in-clip `board_push` |
| showdown | 34.1 | 8 | 0 | guard ↔ `karate_guard_step` |
| derby | 34.1 | 2 | 6 | in-clip `baseball_stance` ×3 and `baseball_swing` ×3 |
| penalty | 17.0 | 2 | 2 | keeper dive / rise; in-clip `run` |

The in-clip pops are clip content (GATE 0: not changed). A blend pop is usually a mocap clip's own fast first frames landing
inside a 0.04–0.06 s fade. Lengthening those fades would soften the strikes the owner tuned fast. **The ≥ 70 % target is not
reachable through transition timing alone**; the inertial blend (`anim.inertial`, now wired on these heroes) is the transition lever left, and it is the owner's to try.

Trade-off, flagged: pacing the football carry up to 1.4× makes its authored off-arm whip cross the pop threshold more often
(in-clip carry pops 3 → 14 in a 22 s run; football 60 → 67/min). The feet are right and the arm is the clip's. Knob
`football.carryStrideMax` = 1 restores the old cadence.

**Routed from phase 2** (not this lane's to change; GATE 0 or another lane's file):
- Animation (clip content): `football_carry_run`'s off arm whips 26–31° a frame (an IK pole flip in the authored loop). The
  karate family's mocap `karate_mc_hit_react` swings its legs at 50–71° a frame. `karate_floor_hold` → get-up.
  `baseball_stance` and `baseball_swing` have in-clip pops (derby). On the authored run loops the toe's lowest point falls on
  the swing (the audit's contact metric reads 0.67–0.79 along the travel even where the stance pace matches).
- Dunk duel (this lane, not changed, it needs your eye): the charge starts the hold-run at the run-up's peak speed while the
  run clip is still fading in from idle (42 frames of idle + run at 5.9 m/s), and the rim hang drifts at 1.7 m/s.
- Penalty camera: the breakaway's `snapTo` plus a 1.2–1.8 m-per-frame eye move over 4 frames right after (a camera fly), and the
  dunk duel's 31° framing change at 2.4 s. Both are deliberate framing changes, so they get no damping without your call.

## 5. For the dunk and hoops lanes (routed, not changed here)

Measured by the same rig on `/play/dunk`, `/play/onevone` and `/play/threevthree`. The occluder fade is off for these
three modes until their lanes take it (`OCCLUDER_FADE_OFF`).

- **Dunk** (dunk-flagship):
  - Hard pops 70/min. The peaks are LeftArm and LeftForeArm at 10,426°/s at 16.75 s; at 1.63, 8.72 and 19.43 s the arm
    and leg bones move together at 6,000–7,200°/s.
  - Camera cuts after the intro: 6. Eye jumps of 5–11 m with 70–124° turns at 6.0, 8.0, 16.1 and 18.0 s. These may be the
    replay or showcase cuts; the lane can confirm.
  - 22 shader programs compiled after the intro (`__FEL_HITCH__`).
  - 65 words and 40 sub-12 px texts in play.
  - Phone CPU p95: 88 ms.
- **1v1** (hoops lanes): hard pops 43/min (arms at 10,439°/s at 6.85 s, then 7,530 and 7,052). Skate 0.09, the best of
  any mode. 57 words in play; 141 on READY.
- **3v3**: hard pops 64/min. The arms peak at 7,858–8,191°/s at 7.35, 8.27, 10.23 and 11.8 s. 49.9 s to READY, the
  slowest hoops mode. 176 words on READY and 59 in play, with 2 overlaps. Phone CPU p95: 100 ms. Draws: 312 mean, 368
  max.
- **3PT and Carnival** (hoops-motion's): 3PT has 7 overlapping texts in play, 485 draws at peak (the highest), and 24
  hard pops/min. Carnival takes 66 s to READY (the slowest), and only 4 of 13 taps were answered (median 367 ms).

## 6. Owner calls (a recommendation first)

1. **The HUD's 12 px floor on phones.** *Recommend:* raise the HUD kit's `caption` from 10 to 12 px and `label` from 11
   to 12 px on phones, and the CONTROLS panel's 9–11 px to 12 px. In return, cut the words: each mode's HUD keeps its
   corner chips and loses its descriptive lines (item 8). The kit's own rule today is "exactly today's size on a phone,
   so a phone layout covers no more of the play area". That is a trade between reading and clutter, and only you can
   make it.
2. **The snaps (item 2) and the skate (item 6) are animation work: RIG-ADJACENT.** *Recommend:* start with the shared
   swing (derby and baseball: the 0.05 s and 0.04 s crossfades in `baseballTree.ts`), the karate family's strike entries,
   and football's run, each behind a GATE 0 and your eye on a strip.
3. **The START stall (item 3).** *Recommend:* one profiled run of skateboard and penalty to name what the first play
   frame builds, then move it behind READY. No change was made without the profile. **Phase 2: profiled, and it was mostly a rig
   artifact (§4c #3). Nothing to move.**
4. **Motion on the pause (item 18).** *Recommend:* put the MOTION chip on the pause card too. The pause is one
   full-screen button today (pausedLayer.scan.test holds that), so the chip would sit beside it, not inside it.
5. **A word budget for play screens (item 8).** *Recommend:* 25 words in play, with the CONTROLS sheet carrying the rest.
6. **(Phase 2) Inertial transitions on the fighters, football, skate and derby.** *Recommend:* turn `anim.inertial` on in
   the feel panel for one playtest of karate and football. It is wired on their heroes (default off) and is the only lever left
   on the strike-onset pops short of slower strikes. If it reads better, flip its default; that knob belongs to the AF-1 lane.
7. **(Phase 2) READY over 80 words** (karate 126, showdown 108, football 103). *Recommend:* cut showdown's second venue
   picker (it shows both ARENA and PLACE, with the shrine in each) and karate's last two string lines (COUNTER and TAKEDOWN,
   which the moves list teaches). Both are owner-signed panel text (`panelLines.ts`), so they were not cut here.
8. **(Phase 2) The football carry's cadence** (`football.carryStrideMax` 1.4). *Recommend:* keep 1.4. The feet now keep up
   (0.27 → 0.90), but the clip's off-arm whip shows more often at the higher rate. 1.0 restores the old cadence.
