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
  | Pops | Each of the 22 bones' angular speed, flagged at ≥ 600°/s and ≥ 3.5× its ±6-frame median. Bones flagged within 10 frames of each other count as one event. A **hard** pop peaks at ≥ 1500°/s (25° in one frame). **Since clean-5 (§4g):** a frame where the hero's root moves more than 1 m, and the frame after it, is a scene cut and is not counted. Every pop number in §2–§4e was counted the old way. |
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

> **Pop counts in this section use the OLD counter (reset frames counted as pops).** They are not comparable with §4g's numbers.
> Modes that reposition the hero (football after a touchdown or tackle) read too high here.

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
| 10 | **Camera snaps** | `CameraDirector.aim`'s look-ahead now eases (0.2 s) and grows with ground speed up to 1 m/s. Both are new feel knobs. Steady running keeps the old lead. Off for dunk, 1v1 and 3v3. `snapTo` cuts (golf's ball flight, resets) are untouched. | Skateboard cuts after the intro: **8 → 0**. Freerun 7 → 5 (its 19.6° turn at 3.7 s, with the eye still, is not the lead; hidden 9.0 → 2.4 %). Football 9 → 7: the rest are its 14 m reset cuts between downs, which are intended. Penalty 14 → 14 and dunk duel 9 → 9: their snaps are not the lead. Penalty's are the breakaway's `snapTo` plus a 1.2–1.8 m-per-frame eye move over 4 frames (a camera fly). The duel's 31° at 2.4 s is a framing change. Both are in §6. |
| 6 | **Foot skate** (rate only, GATE 0) | Penalty: the striker's `run` is paced by StrideMatch against LocoBus's calibrated 4.8, and he stands under 0.4 m/s (was: running on the spot). Football: the carry loop is paced against its measured 2.1 m/s up to 1.4× (knob). Dunk duel: **reverted**, see the next column. | Stance pace (the feet's speed under the body while down, ÷ the root's): **penalty run 0.65 → 0.99** at 7+ m/s (0.92 → 1.07 at 5–7), **football carry 0.27 → 0.90** (1.16 at 5–7). The audit's contact metric did not move (penalty 0.69 → 0.67, football 0.80 → 0.79). Its frame is the toe's lowest point, which on these authored loops falls on the swing, and its along-travel part stays at 0.67–0.79. That is clip shape. Dunk duel: the run was already near matched (0.85); pacing gave 1.11 and the contact metric worsened (0.84 → 1.04 / 1.21), so it is reverted (`8f4c13ab`). The duel's real skate is 42 frames of the idle → run crossfade at 5.9 m/s on the charge, plus the rim hang drifting at 1.7 m/s. |
| 2 | **Hard pops** | AF-1's `anim.inertial` is wired (default **off**: no change) on the hero of karate, karate VS, showdown, mixed combat, football, skateboard and derby, so it can be A/B'd from the feel panel. No crossfade time was changed. | The clip-attributed split in the next table shows why: much of the count is inside the clips. **The A/B with the knob on was not measured.** The rig's `FEEL=` override never went active (the feel tab read inactive in every snapshot), so the owner's panel is the way to try it. |
| 8 | **Busy screens** | Skate's play screen names the next 3 open goals and "+N MORE" (it listed all 9, done and open). | Skateboard words in play **60 → 34 / 23** (corrected counter). Penalty 20, football 35, derby 18, karate 8–23, tiebreak 10–16: already under 40. READY over 80: karate 126, showdown 108, football 103, skate 82, karate VS 81. Their READY is the owner-signed CONTROLS panel (`panelLines.ts`) plus venue and style pickers; §6. |

**Where the hard pops are** — OLD counter (reset frames counted; not comparable with §4g) — (14 s anim-only runs; an event is any frame with a bone ≥ 1500°/s, clustered within 10 frames;
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

## 4d. Clip-smooth (lane/clip-smooth), the snaps inside clips

Owner, 2026-11-03: "Yes, smooth them." Feel knob `anim.clipSmooth` (default **on**; 0 builds every clip exactly as before).

**Where the in-clip snaps are, measured on the clips alone.** Every gameplay clip (authored, the opponents' captures and the
23 style captures) played on the hero and sampled at 60 fps, counted with §1's pop rule (`clipDesnap.test`). Twelve carry a
hard snap in their own keys, all captures retargeted to pose keys: `karate_mc_hit_react` (right thigh 52° in a frame),
`karate_mc_knockdown` ×2, `karate_mc_get_up`, `karate_mc_high_kick`, `karate_mc_roundhouse`, `karate_mc_typhoon` ×2,
`pk_backflip` (karate's wall flip), `pk_dive_roll`, `trick_backflip`, `cap_au_kick` ×2, `brk_windmill`, `brk_helicopter` ×2.
`clipDesnap.ts` spreads a snapping key step over the keys either side when the clip is built (the poses before and after
kept, a hold never moved, no key time moved). **In-clip hard snaps on the clips: 16 → 0**; no other gameplay clip has one.

**In play** — OLD counter (reset frames counted; not comparable with §4g) — (anim-only runs, 14 s, the same script; in-clip as §4c; runs differ by the AI's choices):

| Mode | In-clip hard pops before → after | Hard pops in the run |
|---|---|---|
| karate | 5 → **0** (floor hold ×2, get-up, wall flip, guard) | 17 → 11 |
| karate VS | 1 → **0** | 11 → 12 |
| showdown | 1 → **0** (`karate_mc_hit_react`) | 9 → 7 |
| football | 2 → 2 | 9 → 10 |
| derby | 10 → 10 | 11 → 11 |

**What is not in the clips.** Derby's `baseball_stance` / `baseball_swing`, football's `football_carry_run` (knees at speed),
`football_spin_move` (the hips 178° in a frame) and `football_td_spike`, and karate's `karate_floor_hold` and `guard` pops are
**not in those clips' keys**: each clip measures no hard snap alone, on the hero, the male kit and the scan (max per-frame
turn: stance 0°, swing 19°, carry 8°, floor hold 3°). In play the derby batter, standing still in a static stance, takes a
fixed 25.4° right-thigh (10.6° left) jump in ONE frame and then holds the new pose: a runtime layer switching the legs, not
a clip. FootPlanting alone, mounted on the same clip and body headless, does not reproduce it. These are runtime-layer work
(the posture, foot-plant and carry layers), routed in the lane report: re-keying clips cannot reach them, so the mode-level
≥ 70 % target holds for the karate family (7 → 0) and not for derby and football.

## 4e. The runtime pops (lane/gameplay-clean-3), named by A/B and fixed

The pops §4d left (derby, football) are not in any clip. To name the layer, the rig ran each mode with one layer off. It used a dev
build with `?noplant=1` (new: no foot planting), `?noposture=1` and `?nomotion=1`, 14 s anim-only, same script as §4c/§4d.

OLD counter in this table (reset frames counted; not comparable with §4g). Derby never resets its batter, so its columns stand; football's do not.

| Run | Derby: max thigh turn in a frame | Derby: in-clip hard pops | Football: max hips turn in a frame | Football: in-clip hard pops |
|---|---|---|---|---|
| layers on (before) | 62.0° | 5 (stance 3, swing 2) | **178.3°** (`football_spin_move`) | 4 |
| foot planting off | **2.1°** | **0** | 178.3° | 3 |
| posture off | 61.8° | 6 | **17.6°** | 4 (no spin) |
| **after** (two runs) | **19.8° / 19.6°** | **0 / 0** | **18.1° / 18.1°** | 3 / 2 (no spin) |

Hard-pop events in the run (any cause; two runs each side): derby **7 and 8 → 2 and 1** (in-clip 5 and 7 → 0 and 0), football 10 and 13 → 9 and 11 (in-clip 4 and 3 → 3 and 2).

**Derby: the foot planter** (`anim/FootPlanting.ts`). The layer solves a planted leg with its knee thrown toward the root's forward,
whatever the target weight. So the first frame it solved, the leg swung from the clip's knee direction to the forward in one frame,
with the foot unmoved; the batter's stance has its knees open toward the plate. When the pin came within 2 mm of the clip, it swung
back. **Fix:** the knee pole eases over `anim.plantEngageSec` (0.1 s), from the clip's own knee direction (a solve that changes
nothing) to the forward, and back when the solve stops. The pin is still solved at full weight, so a plant holds as hard as before
(S30's tests are unchanged and green). Knob 0 gives back the old layer bit for bit (`rigLayers.equivalence.test`).

**Football: the posture layer's hip strip** (`anim/PostureLayer.ts`). The `spin` window keeps half the clip's hip yaw by stripping
half of the WRAPPED yaw. At the spin's half-turn, wrap jumps +180° → −180°, so the strip flipped and the hips turned 178° in a frame.
**Fix:** the strip reads the yaw folded past 90° (`anim.hipYawFold`, on). It is exact up to ±90°, which covers every tuned hip swing,
and comes back to 0 at ±180°, so it is continuous.

**Left in derby and football:**
- Derby's bat-flip vault plays `baseball_swing` at 1.7×, so its arms move 25–39° a frame. That is a tuned rate on a clip, not a layer.
- Football's hurdle onsets (carry → `jump_up`) are blend pops from the clip's own fast first frames, as in §4c.
- Football's carry **off-arm whips 26–31° a frame** in all four rig runs, with posture or the planter on or off, and at both 1× and
  1.4× carry rate. It is the authored loop on this body (baked hand IK), routed to clip-smooth.
- Football's thighs still reach 48–70° a frame at hurdle transitions. With the planter off they reach 29°, so the planter plays a part
  at a jump. That is the release side at take-off, not the stance case fixed here; it is noted for the next pass.

## 4f. The planter's release (lane/gameplay-clean-4)

**What the 48–70° football thighs were.** Read frame by frame, the football thigh spikes counted in §4e almost all fall on a frame where
the hero is RESET: after a touchdown or a tackle, the toe moves 6–15 m in one frame. A reset frame is a cut, not a pop. With those
frames (the root moving more than 1 m in a frame, and the frame after) left out, football's thighs peak at **26.2–26.5°** in every run,
planter on or off. That is the clip's own carry → `jump_up` blend at the hurdle. What the planter still added was at the **knees**,
on the take-off release.

**Fix:** `anim/FootPlanting.ts` now lets a leg go in rotation. The hip and knee it wrote on the frame before are held and slerped
onto the clip's over `anim.plantReleaseSec`. That is 0.1 s, the old release fade's own time, so no tuned time moved. 0 restores the
old target fade exactly. The old fade solved the leg each frame toward a target that the jumped body no longer reached.

Same rig, 14 s anim-only, reset frames left out (the max-turn columns are comparable with §4g; the 1v1 hard-pop count is the OLD counter):

| Run | Football max knee turn / frame | Football max thigh | Derby max thigh | 1v1 max thigh (hoops check) | 1v1 hard-pop events |
|---|---|---|---|---|---|
| before (clean-3 planter; 3 football runs, 1 1v1) | 31.8 / 29.6 / 31.0° | 26.5 / 26.2 / 26.2° | 19.8 / 19.6° | 71.4° | 17 |
| after (2 runs each) | **23.7 / 12.5°** | 26.2 / 26.2° | 14.1° | 66.2 / 64.2° | 15 / 13 |

No regression in derby or 1v1. 1v1's 64–71° thighs come from the hoops lane's plant-and-cut lock: it claims the leg, and a claim
hand-over keeps the old fade. They predate this pass and are theirs. The audit's pop counter did not skip reset frames at this point; the
analysis script did (`legmax.mjs`, which lived only in the lane scratchpad and was lost with it). Clean-5 put the rule in the counter itself (§4g).

## 4g. Clean-5: a reset-aware counter, every mode swept, four pops fixed (lane/gameplay-clean-5)

> **NEW COUNTER from here on.** A frame where the hero's root moves more than 1 m (a reset after a touchdown, a tackle, a drive
> restart) and the frame after it are scene cuts and are not counted (`popCount.mjs`; its control in `gameplay-clean-pops-tests.ts`:
> the same 40° thigh step on an ordinary frame, and two frames after a reset, still counts). Every pop number in §2–§4e, and §4f's 1v1
> count, used the OLD counter. **The two are not comparable.** On this sweep the reset skip changed five modes only: football 6 → 4
> hard pops, penalty 3 → 1, tennis 2 → 0, freerun 2 → 1, dunk duel 3 → 2. Every other mode counted the same.

**The rig, all in the repo** (`scripts/probes/gameplay-clean/`; the lost scratch helper `legmax.mjs` is replaced):
`popCount.mjs` (the counter), `poprank.mjs` (per mode: hard pops, blend or in-clip, the clips and bones, the largest turn a frame
per bone group off reset frames; `--vs` gives a before → after table), `popdetail.mjs` (each hard pop frame by frame; `--win`
dumps frames; `--ab` puts the layer-off runs beside it), `serve.mjs` (one port, a before-build and an after-build by host name),
`run-jobs.sh` (mixed jobs in one gate hold). Three rig bugs were found and fixed on the way:
- the recorder read a clip's blend weight off the group (always −1), so every playing clip read weight 1; it now reads the
  animatables' weight, the one the crossfade sets (recordings say `cwv: 2`);
- `FEEL=` knob overrides were written before the page loaded and wiped by the page's own storage clear (why §4c's A/B "never went
  active"); `&playtest=1&feel=<knob>:<value>` now writes them after;
- closing a page took ~110 s a mode; capped at 5 s (holds now fit 12 modes, not 6).

**Method.** 14 s anim-only runs (no pause, no perf window, no photographs), the same scripted player, a dev build (the layer-off
flags `?noplant=1`, `?noposture=1`, `?nomotion=1` work only there). "Before" = release `a5bb51e9` + clean-4; "after" = this lane's
head. Runs of the same build differ by the AI's choices, so a single run is a sample, not a measurement of a rate.

### What was found and fixed (each behind its own knob; 0 or the old value gives the old behaviour exactly)

| # | Pop | Cause | Fix | Measured |
|---|---|---|---|---|
| 1 | Showdown hit react → guard: every bone on one frame (arms 21–30°, thighs 22–25°), the same numbers at 3.30, 4.75, 9.32 s. Karate jab → run: right forearm 31–39°. Baseball swing → stance: right arm 54.9° (2.55 and 8.55 s). | A one-shot cut a few frames before its end runs out INSIDE its own fade-out. Babylon stops it, the weight it still had (0.4–0.8) is gone in one frame, and the gap is filled with a pose captured frames earlier. | `CharacterAnimator` holds such a clip on its last frame until the fade ends (the freeze's own mechanism). Knob `anim.fadeHoldEnded` (1). | Headless, the hero: hit react → guard 33.4° → **16.4°** (the fade around it 19.0°); jab → run 23.1° → **8.4°**; over 7 one-shots × 7 cut points, identical wherever the clip does not end inside the fade, never above 23.5°. |
| 2 | Football: LeftArm 31°, RightArm 23°, RightForeArm 15° a frame at EVERY hurdle (2.78, 4.08, 6.72 s), the landing. | The hurdle's clip runs out before the landing and the tree settled on the carry over the carry's 0.1 s: arms from the jump's reach to the tuck in 6 frames. Not the carry loop (§4e): its arms turn under 7° a frame. | The hurdle → carry blend gets its own time. **TUNED (new): `football.hurdleExitFadeSec` 0.2 s** (0.1 = the old blend). The way in (`football.hurdleFadeSec`, #546) is untouched. | Headless, the real tree on the hero, 6 phases at 1× and 1.4×: 30.9° → **15.7°**. |
| 3 | Any stance that slides: a thigh ~33° in one frame at every replant (headless). | Clean-4's rotation release ended on the spot when the foot planted again (a stance foot let go at the drift limit is planted on the next frame), and the engage was 0: the leg jumped the rest of the way at once. | The release carries on under the new plant. Knob `anim.plantReplantEase` (1). Same plants and releases (asserted). | Headless: 33.5° → **under 12.5°** at 0.5–3 m/s (6.4° with clean-4's release off). |
| 4 | Aero Aces: knees 51–63°, thighs 22–40° in one frame, 2–3 hard pops a run, all on the seated pose alone. | Every hero carries the foot planter; the pilot sits with his ankles at root height, so his feet read as down and were pinned to the ground while the plane flew on at 14–30 m/s. The planter-off flag removes every one. | A mode marks a seated body (`setPlantingSeated`); the planter treats it as airborne (no pin; a held one let go through the release). Aero marks its pilot. Knob `anim.plantSeatedOff` (1). A speed rule was rejected: on-foot modes reach 12.8–35 m/s in bursts. | Rig A/B: 3 hard pops → **0** with the planter off. Headless: pinned 160 of 240 flying frames, legs 12–19° a frame → no pin, under 1°. |

**Hurdle way in** (asked: did #546's 0.12 s fade drop the hurdle's thigh peak from ~26° a frame?): in play, before this lane's
changes, football's largest thigh turn off reset frames was **17.1°** (the hurdle entry, t = 6.17 s), against 26.2–26.5° in all
three §4f runs. Yes, as measured headless (15–17°).

**Tried and taken back (not committed):** an orphan rule under the same knob. A third clip played inside a fade retires the clip
being faded out on the spot (Duel: a jab at 0.75 fading into guard, the guard step played 3 frames in, arms 24–27°; the hero
headless 23.2°). Keeping that clip fading out took the hero's frame to 9.6°, but in play it made three-clip blends, and Babylon
blends three clips by chained slerps that can flip: Karate's thigh **117.9°** in one frame (`after-orphan` runs). Open, §4g list.

### Every mode, before (new counter; 14 s each, one run; "before" = release + clean-4)

Hard pop events in the run (per minute), the biggest cause read frame by frame (`popdetail.mjs`), and whose it is.

| Mode | Hard pops (per min) | What they are | Owner |
|---|---|---|---|
| dunk | 19 (80.8) | 14 inside `bball_mc_dribble_run` on the run-up: arms up to 102.6° a frame | dunk-flagship |
| karate VS | 11 (46.8) | hit react → guard ending inside its fade (fixed, #1); strike onsets (run → jab: the capture's first frames inside a 0.06 s fade); one orphan (open) | this lane / tuned fade |
| showdown | 10 (42.6) | hit react → guard ending inside its fade ×3 (fixed, #1); guard step → hit react onsets | this lane |
| karate | 10 (42.2) | jab → run ending inside its fade (fixed, #1); run → jab onsets, right forearm 33° (tuned 0.06 s fade); hit react legs | this lane / tuned fade |
| 3PT | 9 (38.3) | catch hop → follow-through ×7: left arm and hand | hoops-motion |
| duel | 8 (34.0) | the orphan ×3 (open); hit react / roundhouse endings (fixed, #1) | this lane |
| 1v1 | 6 (25.4) | the plant-and-cut lock: a thigh **167°** in one frame (179° in the after-run); dribble-run blends | hoops lanes |
| skateboard | 6 (25.4) | idle / push → `skate_ollie` onsets, right arm 27–40°; one frame of `board_push` alone, right thigh 47° | §4g list |
| mixed combat | 5 (21.2) | strike onsets (run → cross, shuffle → high kick, legs 38°), backspin | tuned fades |
| football | 4 (17.1) | the hurdle's way out ×3 (fixed, #2); the tackle (idle → fall, 0.05 s fade, forearm 31°) | this lane / tuned fade |
| 3v3 | 4 (17.0) | defend backpedal / slide, legs | hoops lanes |
| tiebreak | 3 (12.7) | swing onsets (arms 42° in a 3-frame fade); one frame inside `tennis_swing.M` alone, right thigh 34° | tuned fade / §4g list |
| baseball | 3 (12.7) | swing → stance ending inside its fade ×2, right arm 54.9° (fixed, #1); the swing's contact, arms 27–35° | this lane / bat-grip |
| dunk duel | 2 (8.5) | `dunk_mocap` → score hang, hang → land: arms 69° | dunk-flagship |
| aero | 2 (8.5) | the foot planter on the seated pilot: knees 51–63° (fixed, #4) | this lane |
| dance, freerun, penalty, big air, surf | 1 each (4.2–4.3) | dance stumble; freerun air hold → run landing; keeper dive (mirrored); grab → sketchy landing (26°); **surf: `board_air` restarted while playing, weight 0.81 → 0.14 in a frame, right arm 78°** (open) | animation / §4g list |
| carnival, derby, golf, tennis, volleyball, sprint, snowboard, kart, brain brawl, who-scene-it | 0 | — | — |

Derby: 0 hard pops, but the bat-flip vault's swing at 1.7× moves the arms up to 38.8° a frame for several frames running (fast
throughout, so not a pop by the rule). A tuned rate on a clip, not changed.

### After (the lane's head; one run each; the AI's choices differ run to run)

| Mode | Hard pops in the run (per min) | Blend · in-clip | Max turn a frame: thigh · knee · hips · arm |
|---|---|---|---|
| dunk | 19 (80.76) → **19** (79.53) | 5 · 14 → 5 · 14 | 15.4° · 22° · 2.9° · 102.6° → 15.4° · 22° · 2.9° · 102.5° |
| karate_vs | 11 (46.81) → **6** (25.32) | 11 · 0 → 6 · 0 | 34.3° · 39.4° · 17.2° · 49.5° → 34.5° · 37.5° · 17.1° · 49.5° |
| showdown | 10 (42.6) → **5** (21) | 10 · 0 → 5 · 0 | 45° · 28.9° · 10.2° · 40° → 58.7° · 38.3° · 10° · 38.9° |
| karate | 10 (42.2) → **8** (33.88) | 10 · 0 → 8 · 0 | 53.8° · 32.6° · 11.3° · 40.9° → 53.8° · 29.8° · 11.3° · 40.9° |
| duel | 8 (33.96) → **4** (17) | 8 · 0 → 4 · 0 | 58.7° · 32.7° · 10.2° · 41.4° → 44° · 29° · 10.1° · 97.8° |
| onevone | 6 (25.41) → **5** (21.35) | 5 · 1 → 4 · 1 | 167.3° · 18.7° · 5.2° · 104.3° → 179° · 21° · 5.4° · 95.7° |
| skateboard | 6 (25.38) → **5** (21.28) | 6 · 0 → 5 · 0 | 47.1° · 24.5° · 13.2° · 39.9° → 22° · 18.8° · 7.9° · 39.9° |
| mixedcombat | 5 (21.15) → **5** (21.1) | 5 · 0 → 5 · 0 | 42.8° · 38° · 17.1° · 47.2° → 42.8° · 37.8° · 17.1° · 47.2° |
| football | 4 (17.1) → **1** (4.27) | 4 · 0 → 1 · 0 | 17.1° · 12.4° · 18.1° · 31.1° → 17.1° · 11.1° · 18.1° · 30.8° |
| derby | 0 (0) → **0** (0) | 0 · 0 → 0 · 0 | 14° · 3.7° · 15.6° · 38.8° → 14° · 3.9° · 15.6° · 38.8° |

| Mode, same build | knobs off (`anim.fadeHoldEnded` 0, `anim.plantReplantEase` 0) | knobs on |
|---|---|---|
| showdown | 8 hard pops | **4** |
| karate | 10 | **8** |

Aero Aces, the planter A/B on the before-build: 3 hard pops, knee 63.1° → **0**, every bone under 1.3° with `?noplant=1`. The
fix (#4) marks the pilot seated; its after-run: see below.

### What is left, ranked (hard pops a minute × how many modes), with its owner

1. **Strike and swing onsets** — karate, karate VS, mixed combat, showdown, tiebreak, skateboard's ollie, the football tackle: a
   capture's fast first frames landing inside a 0.04–0.07 s fade (arms 30–42°). Every one is a tuned fade time. *Owner: you (a feel
   call), then the animation lane.* `anim.inertial` (AF-1, off) is the lever that does not slow the strikes.
2. **The dunk's dribble run-up** (`bball_mc_dribble_run`, arms to 103° a frame, 14 hard pops in 14 s). *dunk-flagship.*
3. **1v1 / 3v3 / 3PT** — the plant-and-cut lock (a thigh 167–179° in one frame), the defend slides, the catch hop → follow-through.
   Not touched here. *Hoops lanes.*
4. **The orphan** — a third clip played inside a fade retires the clip being faded out on the spot (duel ×3 a run, arms 24–27°).
   Keeping it fading fixed the frame but made three-clip blends that flip (118°, karate). *This lane, next pass: keep the blend to two
   clips, or the inertial blend.*
5. **Knockdown → get-up** (karate family): the right arm 98–153° in ONE frame at the end of the 0.1 s fade, in 3 runs, **with this
   lane's knobs off as well as on** (so not caused by them); not reproduced headless on the bare hero, so a layer is in it. *This
   lane, next pass, with the layer-off flags on a run that reaches it.*
6. **Surf's air restarted while playing** — the animator's same-clip restart drops the clip to weight 0 and fades it back in (0.81 →
   0.14 in one frame, right arm 78°). *This lane (CharacterAnimator), next pass.*
7. **Clip content** — `tennis_swing.M` (a right-thigh frame of 34°), `board_push` (right thigh 47°), the dance stumble, the keeper's
   mirrored dive, the baseball swing's contact (arms 27–35°, with the bat-grip lane's hold). *Animation lane / bat-grip.*
8. **The dunk duel's** `dunk_mocap` → hang → land (arms 69°). *dunk-flagship.*

Not touched, as asked: the hoops plant-and-cut lock, `legSink`, `FootGlide`, `basketballTree.ts`, `baseballBat.ts`, the derby
vault's 1.7× rate.


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
