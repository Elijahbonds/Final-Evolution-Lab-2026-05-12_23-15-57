# Why the movement still feels off — a measured diagnosis (lane/move-feel, 2026-11-12 → 17)

The owner (2026-11-12): **"Find out why the movement still feels off?"**

**assumption:** "the movement" is mainly the basketball modes the owner has been playing (1v1, 3v3). Each cause below also says whether
it lives in the shared locomotion other modes use (`CameraDirector`, `InputBus` / `PlayerSlot`, `CourtMovement`, `ModeHarness`).

This lane measured and prototyped. **No tuned feel number was changed.** Three new feel knobs exist, each **off by default** (today's game
exactly); §5 is the short "try these values" list for the feel panel.

## The answer in one paragraph

The controls themselves now answer at the bar — a press moves the body in 2–3 frames, the jog reaches 90 % of its pace in 0.25 s, a stop
from a jog takes 0.15 s and 0.29 m. What feels off is everything **around** that answer. (1) **The camera**: the stick is read relative to a
camera that swings round the rim while you run, so a stick held still bends your run 30–43° a second; and the camera's look-ahead is the
raw one (every other follow camera eases it), so every stop, turnaround and cut jerks the view in one frame at 290–380 °/s, and a steady jog
across the court makes the view shiver frame to frame. (2) **The feet slide**: at a run the planted foot slides 11 cm a frame, at a sprint
15–16 cm (the bar is 3 cm) — the body glides over its legs, with no start, stop or plant clip to sell the change. (3) **The phone stick**
is a fixed 82-pixel circle with two speed cliffs in it, and the same full push sprints for the first part of a game and jogs after the
TURBO pad is touched once. (4) **Changes land in one frame**: a turbo cut brakes at 71 m/s² for one frame, the turbo press kicks at
68 m/s², a 90° turn runs at 64 % of its rate. Of these, only the phone's frame rate is better on the release than on the live site; the
movement, camera and feet are the **same code** on both, and measured the same.

## 0. What was measured, and how

| Source | What it is | Where |
|---|---|---|
| **[STICK]** | The real `DribbleController` (its `CourtMovement`, `GEARS_HANDLER`, `CUT_COST_HOOPS`) stepped at 60 fps in node: start, stop, turn 45° / 90° at a jog and a sprint, the turbo kick, the reversal, a weave, the walk / jog line. `PRESET=h3a|try` and `FEEL=` apply knob values through the panel's own `feel()`. Control: `SELFTEST=1` (a turn through the lerp equals its closed form, the slerp its share). | `scripts/probes/move-feel/stick-feel.mts` |
| **[STRIDE]** | From the code: per stick, the speed the handler settles at, the locomotion state the hoops tree picks, its stride rate (StrideMatch) and the ground its feet cover. | `scripts/probes/move-feel/stride-cover.mts` |
| **[RIG]** | The real 1v1 / 3v3 in the hoops-gap rig (esbuild dev bundle, Chromium on SwiftShader, the deterministic 1/60 s clock, seed 7, PRO, drawn at 320×180 / 400×225), stick timelines through the real InputBus, every drawn frame recorded: root, feet, camera, the hero's anim state and clips; page.js's own pops and planted-foot slide over the same frames. `QS=dummy=1` makes the 1v1 rival stand off in a corner (the clean locomotion control). The **live** build is `origin/main` at 7ff7d1f9 (the movement code on `main` 09cc9310 is the same), the **release** `e38948cc` (merged to 35e8b10d: no movement file changed). Analysed by `analyze.mjs` (`--selftest`: a synthetic run with closed-form answers). | `scripts/probes/move-feel/feel-ext.mjs`, `analyze.mjs` |
| **[PRIOR]** | Earlier lanes' numbers (HOOPS-AAA-GAP-PLAY / -SHOW, GAMEPLAY-CLEAN-AUDIT), cited as such. | |

**Controls checked first.** The rig's jog start and stop read **exactly** the headless controller's (90 % at 250 ms, stop 150 ms / 0.29 m,
sprint stop 233 ms / 0.68 m vs 217 ms / 0.69 m) — the instrument agrees with a known-good one. The live and release builds play every
1v1 test frame-for-frame the same root path (identical speeds and turn numbers), so where their feet or pops differ, the animation differs.

**A rig finding for every lane (not a game bug).** On this release a `NODRAW=1` rig run is **cut at about 10 s of play**: the page's
`RenderWatchdog` reads the undrawn canvas as black output, runs its rescue at ~5 s and sets the mode's phase to `error` at ~10 s; every
later frame is a frozen body. My first runs measured nothing after their second test for that reason (found by a per-test `diag`). Draw
small instead (`VIEW=320x180`). Any lane whose NODRAW numbers run longer than ~10 s of play should re-read them.

## 1. The ranked causes

Ranked by how much each contributes to "feels off": how often a player meets it × how hard it reads. "Live" = the owner's phone today.

| # | What the player feels | The number (bar) | Cause (`file:line`) | Live / release | Fix (size) | Owner's feel call? |
|---|---|---|---|---|---|---|
| 1 | **"He doesn't go where I push."** Hold the stick steady and the run bends; you keep correcting. | A constant stick's court direction turned **34° in 1.1 s of jogging, 43° in 1.0 s of sprinting** (1v1), 30° (3v3); the run itself bent 30–37°. A broadcast hoops camera keeps the stick's court direction fixed (2K's default view does not orbit). | The stick is camera-relative every frame (`OneVOneMode.ts:695–700` `camRel`; `ThreeVThreeMode.ts:1684`) and the hoops follow camera orbits the rim (`CameraDirector.ts:700–703` fitTwo `back = subject − objective`; the bearing slews at `MAX_BEARING_RATE` 2.2 rad/s, `:288`). | Same on both | **Hold the stick's frame while it is held** (capture the camera's flat axes when the stick leaves centre, ease to the live camera only after it is released or over ~0.5 s). M; needs a two-line change in each mode's `camRel` (the gathers / flow lanes' files): not built here | **Yes** — whether "stick right" should circle the arc (today) or run a straight line |
| 2 | **The view jerks** on every stop, turnaround and cut, and **shivers** on a steady run across the court. | One-frame camera turns of **289 °/s (jog stop), 300 (sprint stop), 291 (reversal), 378 (weave)** against the bar p99 ≤ 120 °/s (phase 8). Steady jog: the turn rate alternates 0 ↔ 55 °/s on **50 of 114 frames** (cut 34 / 118, reversal 33 / 136). 1v1 defence slide: p99 **536**, max 710 °/s. [PRIOR] the phone audit's p99 139 °/s. | The hoops modes never got the **eased look-ahead** (`ModeHarness.ts:623`: `leadEase` off for the modes in `OCCLUDER_FADE_OFF`, `OccluderFade.ts:56`), so `CameraDirector.aim` rebuilds the 1.2 m lead from the velocity's direction every frame (`CameraDirector.ts:903–920`) — it vanishes the frame you stop and flips the frame you reverse. The shiver: not isolated (**assumption:** the occlusion whiskers' 8° lean toggling frame to frame near the court's edge, `CameraDirector.ts` `resolveOcclusion`; the eased lead halves it, 50 → 29 frames). | Same on both | **`hoops.camLeadEase` 1 (built, off by default).** Measured on the rig: reversal 291 → 66 °/s max, sprint stop 300 → 57, weave 378 → 130 (p99 126 → 129), cut 67 → 68. S. The shiver and the defence whip: S–M, camera work for the show lane / phase 8 | Yes (feel it); it is the camera every other mode already has |
| 3 | **The feet skate.** The body glides over its legs at a run and a sprint, slides on into a stop, and slides the plant foot on defence. | Planted-foot slide p90 a frame (bar 3 cm [PRIOR GAP-PLAY]): 1v1 jog **11.1 cm** in the jog loop, sprint **15.4 cm** (`sprint_dribble`) and **16.7 cm** in the sideways carry the turn passes through; skate ratio (planted foot travel ÷ body travel) **0.53 jog, 0.76 sprint, 0.82 turbo cut** (counter's green 0.3). Walk and creep are fine (1.1–2.5 cm). 1v1 defence 3.2 cm p90, the idle stance 6 cm (the slide's change of direction). 3v3 defence slide: **6.9 cm p90, ratio 0.78 on the release against 3.9 cm, 0.48 live** (one deterministic run each — a release regression, routed). | The run loops are paced by StrideMatch to the body's speed (`StrideMatch.ts:212`), and [STRIDE] says their feet do cover the ground at a steady pace — so the slide is in the changes: there is **no start, stop, plant or pivot clip**, the loop changes by crossfade (walk → jog → sprint, `basketballTree.ts:189`), and the foot planter's pin budget is spent in a few frames at 4–6 m/s (`StrideMatch.ts` header). [STRIDE] also: a thumb at 0.1–0.15 of the stick creeps at 0.54–0.81 m/s on the **idle** dribble (no stride), the walk loop tops out at 1.79 m/s while the walk runs to 2.38 (75 %), the retreat dribble (`carry_back`) covers 2.16 m/s of its 3.05. | Same on both (1v1 jog 11.1 vs 10.7, sprint 15.4 vs 15.2); 3v3 defence worse on the release | Start / stop / plant clips and a phase-matched loop change (M–L, **RIG-ADJACENT**, GATE 0; capture best); the 3v3 defence regression to the lane that owns the defend legs (p05 / gameplay-clean) | No (animation work) — the owner sees it |
| 4 | **The phone stick is hard to drive.** Small, fixed, two speed cliffs; the same push is a sprint at the start of a game and a jog later; a sprint that runs out by itself. | The deck's stick is **96 px (82 px on a sideways phone)**: full speed at **41 px** from its centre (≈ 6–7 mm of thumb), the walk line at **18 px**; no dead zone; a thumb landing outside the circle does nothing (`TouchOverlay.tsx:147–181`, `COMPACT_SCALE` 0.85). [STICK] the walk line: **2.38 m/s at 0.44 of the stick, 3.71 at 0.46 (+56 %)**. [RIG] before a trigger has ever reported, a full push runs **6.23 m/s** (turbo) — after the TURBO pad is touched once the same push runs **4.33 m/s**; the fallback sprint empties the tank in **2.9 s** and re-arms at 25 % (`BasketballCore.ts:1135–1150`). (**assumption:** typical mobile action sticks float under the thumb and are 25–30 mm across; no decode-spec number exists for touch.) | `PlayerSlot.ts:206` (`sprint: turboHeld || (!turboSeen && |stick| > 0.85)`); `CourtMovement.ts` gearTop (the jog starts at 0.85 of its top past `walkStick` 0.45); `TouchOverlay.tsx` AnalogStick | Same on both | **`hoops.stickSprintFallback` 0** and **`hoops.gearBlendBand` 0.2** (both built, off by default). A bigger, floating stick with a small dead zone: M, the shared touch deck (every Babylon mode) — not built | **Yes** — the stick's size and whether it floats; whether a full push may ever be the turbo |
| 5 | **Changes land in one frame**: the turbo cut stops you like a wall then lets go, the turbo press shoves, a 90° turn drifts wide. | [STICK] turbo 90° cut: **71 m/s² for one frame** (the decode spec's guard ≤ 34 m/s², SPEC-HOOPS-MOTION-DECODE §0 weight class); turbo kick **68 m/s²** one frame; a 90° turn at a jog **261 °/s** in its first 100 ms against a 338 °/s rate (the lerp: ~64 %), within 10° after **283 ms** (rig: 333 ms at a jog, 500 ms at a sprint). | `HoopsStick.ts:43–49` (`HOOPS_TURN_TRUE_ARC` 0, `HOOPS_KICK_SEC` 0, `HOOPS_CUT_SEC` 0); `CourtMovement.ts` cut cost (`speedT = speed × (1 − cost)` in one frame) | Same on both | **The H3a switches** (exist since lane/hoops-reverse; the owner has never felt them): turn 261 → 348 °/s, 283 → 233 ms; sprint 367 → 300 ms; the cut's brake 71 → 17 m/s²; the kick 68 → 23 m/s². No speed, stop or distance changes. S (values only) | **Yes** — §5 |
| 6 | **Uneven frame pacing on the phone** (a smooth game that hitches). | [PRIOR show audit, 4× CPU throttle] 1v1 JS a frame p50 59 / p95 144 ms, 3v3 86 / 186 ms; heap churn 14–19 MB a second. **assumption:** ÷4 for a phone ≈ 15 / 36 ms in 1v1 — the p95 frame misses two refreshes, so the picture steps between 60 and 30 fps. The sim is NOT on a fixed step: every system advances by the frame's own dt (`ModeHarness.ts:984–1004`), so there is no sim / render judder to interpolate away — a dropped frame is simply a step the eye sees. Not measured on a real device. | The court's draw and animation cost; GC | **The release is better** (hoops-p08's phone budget: merged meshes, the covered dome off, rail of two) — **fixed in the release, not live**; the perf lane is cutting the churn | the perf lane (being worked on) | No |
| 7 | **Small pops while just running.** | Pops (≥ 600 °/s and 3.5× the neighbours) in plain locomotion, release: jog 4 in 2 s, sprint 7, turbo cut 5, reversal 5, walk 5; nearly all 600–1 000 °/s legs at the loop changes (walk → jog → sprint); the hard ones (≥ 1 500 °/s): 1 at the walk-to-jog change (RightArm 1 480), 1 on the reversal's foot (RightFoot 1 779). Live the same (jog 4 = 4, sprint 9 vs 7). Plain locomotion is not where the 19–64 hard pops a minute are: those are the hand change, the contact reaction and the defence beats [PRIOR GAP-PLAY §3.10]. | Loop crossfades between captures in different phases (`basketballTree.ts:189`, the fades 0.12–0.16 s) | Same on both; the hand change's dwell (≤ 1 per 1.5 s at rest, the crossing meets the ball) is **fixed in the release, not live** (hoops-p06) | Phase-matched loop changes (with #3). M, RIG-ADJACENT | No |
| 8 | **The first press after START is slow.** | The first stick press moves the body after **23 frames (383 ms)**; every later one after 2–3. Its camera swings 1 692 °/s in a frame. | The walk-in intro hands over on the first press (a 15 m swoop, then a one-frame turn) [PRIOR show audit §3.1] | Same on both | The show lane's eased intro hand-over (phase 8) | No |

**Not a cause (at the bar, measured):** stick onset 2–3 frames; the jog's 90 % in 250 ms (the audit's 350 ms read is not reproduced: rig and
headless agree at 250); a stop from a jog 150 ms / 0.29 m and from a sprint 233 ms / 0.68 m; a reversal through zero, travelling the new way
within 10° in 133 ms; the walk itself (1.6 m/s, the feet keep up). The keyboard and a pad: no dead-zone problem (a pad's radial dead zone
rescales from 0.10–0.18, `lib/input/profiles.ts:186`; the keyboard is eight full-stick directions) — but the keyboard has #4's fallback too:
WASD sprints until Shift is first pressed.

### Shared locomotion (the other modes)

- **CameraDirector** — #2's raw look-ahead is hoops-only (every other follow mode has the eased lead since gameplay-clean P2 #10). #1's
  camera-relative stick is in every mode that reads `forwardFlat` (the Adventure modes too), but only a camera that orbits a fixed objective
  (hoops' `fitTwo` on the rim) bends a held stick this much. The dynamic FOV still eases per frame (`applyDynamicFov` 0.08 a frame), so it is
  slower on a 30 fps phone (small).
- **InputBus / PlayerSlot** — #4's stick-sprint fallback is in `LocalInputSource`, used by 1v1, 3v3 and Karate Endless (which never reads
  `sprint`). The touch deck's fixed 96 px stick is every Babylon mode's.
- **CharacterAnimator / StrideMatch** — #3 and #7 are the shared loop-and-crossfade model; the same skate shows wherever a body runs on loops
  without start / stop clips (football, freerun: GAMEPLAY-CLEAN-AUDIT §4).
- **ModeHarness** — no fixed step and no interpolation (#6): fine as built, a dropped frame is the whole story.

## 2. What is fixed in the release but not live

Measured: **none of the eight causes above is fixed in the release.** The movement (`HoopsStick`, `CourtMovement`, `DribbleController`), the
camera (`CameraDirector`), the input (`InputBus`, `PlayerSlot`, `TouchOverlay`) and the stride matching are byte-for-byte the same on `main`
and the release; the rig's 1v1 root paths are frame-for-frame identical and the feet within a run's noise. What the release does have that
the owner's phone does not:
- **Phone frame rate** (hoops-p08: the court's meshes merged, the covered dome off on phones, fewer textures) — #6, partly.
- **The hand change** (hoops-p06): the automatic outside-hand cross at most once in 1.5 s at rest, and its crossing meets the ball — fewer
  arm snaps while guarded (not plain locomotion).
- **Defence legs** (hoops-p05 / p05b) — but in the 3v3 defence slide this rig measures the release **worse** (6.9 vs 3.9 cm p90): routed (#3).
- Outside movement: the one-rulebook shooting (p09), the builder's ratings (casual only; rating 50 = today's speed).

## 3. The frame strips and charts

One JPG: `scratchpad/move-feel/move-feel-worst.jpg` (the coordinator's scratch; drawn by `sheet.mjs` from the rig's runs): speed against time on
a start and stop and through a 90° cut (shipped against the try values), the planted foot's slide per frame (1v1 sprint, 3v3 defence live
against release), the camera's turn rate (the one-frame whips, shipped against `hoops.camLeadEase` 1), and five frame strips — the stop at a
jog, the stop at full turbo, a 90° cut, the stick thrown back, the defence slide's change of direction.

## 4. The recommended fix order

| Order | What | Fixes | Size | Who |
|---|---|---|---|---|
| 1 | Feel §5's values on the phone (one paste), keep what feels right | #2 (whips), #4 (phone cliffs), #5 (one-frame changes) | S | **Owner** (10 minutes on the panel) |
| 2 | Hold the stick's court frame while the stick is held | #1 | M (two lines in each mode's `camRel`, behind a knob, off by default) | the 1v1 / 3v3 lanes (their files), owner feel call |
| 3 | A bigger floating stick with a small dead zone on the touch deck | #4 | M | shared touch deck, owner call on size |
| 4 | Start, stop and plant clips; phase-matched loop changes; the 3v3 defence slide regression | #3, #7 | M–L (RIG-ADJACENT, GATE 0; capture best) | animation / hoops-motion lane |
| 5 | The camera's frame-to-frame shiver and the defence whip (p99 536 °/s) | #2 (rest) | S–M | show lane / phase 8 |
| 6 | Phone frame time and GC | #6 | M | perf lane (running) |

## 5. Try these values (the feel panel)

**Owner, 2026-11-17: "Turn all six on now."** They are the shipped defaults since then (each knob's off value restores the old game); the
three H3a ones on the 1v1 / 3v3 handler only (the dunk approach keeps the old stick). Re-measured with the new defaults, [STICK]: a 90° turn
at a jog 261 → 348 °/s, within 10° 283 → 233 ms; at a sprint 203 → 275 °/s, 367 → 300 ms; the turbo cut's one-frame brake 71 → 17 m/s²; the
kick 68 → 23 m/s²; a weave settles 297 → 247 ms; the largest one-frame speed jump 1.13 → 0.92 m/s; 0.46 of the stick 3.71 → 2.44 m/s (the
step gone); starts, stops, top speeds and the reversal unchanged (250 ms, 150 ms / 0.29 m, 217 ms / 0.69 m, 183 ms). The camera and the
fallback as measured on the rig with these values: whips 289–378 → 57–130 °/s; a full push before TURBO 6.23 → 4.33 m/s.

Paste into the panel's values (the format **Copy values** produces). Every one is reversible with the panel's reset; nothing changes for
anyone else until the owner says which to keep.

```json
{ "hoops.camLeadEase": 1, "hoops.turnTrueArc": 1, "hoops.kickSec": 0.1, "hoops.cutSec": 0.08,
  "hoops.gearBlendBand": 0.2, "hoops.stickSprintFallback": 0 }
```

| Knob | Today | Try | What you should feel | Measured |
|---|---|---|---|---|
| `hoops.camLeadEase` (new) | 0 | 1 | the view no longer jerks when you stop, turn round or cut | one-frame camera whips 289–378 → 57–130 °/s [RIG] |
| `hoops.turnTrueArc` (H3a) | 0 | 1 | a cut turns as fast as the turn rate says, no wide drift | 90° turn 261 → 348 °/s, settled 283 → 233 ms [STICK]; rig 333 → 283 ms |
| `hoops.kickSec` (H3a) | 0 | 0.1 | the turbo press surges instead of shoving | one-frame push 68 → 23 m/s²; top speed and time to it unchanged |
| `hoops.cutSec` (H3a) | 0 | 0.08 | a turbo cut bites over a few frames instead of hitting a wall | one-frame brake 71 → 17 m/s² [STICK]; rig 25 → 17 m/s²; the speed paid is the same |
| `hoops.gearBlendBand` (new) | 0 | 0.2 | a thumb near the middle of the stick no longer surges walk ↔ jog | 0.44 → 0.46 of the stick: 2.38 → 3.71 m/s (+56 %) becomes a smooth ramp; full tilt unchanged |
| `hoops.stickSprintFallback` (new) | 1 | 0 | the same push always runs the same speed; turbo only on TURBO / R2 / Shift | full push before TURBO is touched 6.23 → 4.33 m/s [RIG] |

If the owner wants a little more snap after those, H3a's tuned numbers are the next step (they change TUNED numbers, so only on the owner's
word): `hoops.handlerTurnDeg` 540 → 720 and `hoops.jerk` 0 → 900 (docs/FEEL-PANEL.md, the H3a preset).

## 6. Waiting on the owner

1. **Feel §5 on the phone** and say which to keep (*recommend:* all six; the first is the biggest).
2. **"Stick right": circle the rim or run a straight line?** *Recommend:* a straight line while the stick is held (#1), built behind a knob
   off by default so the two can be felt side by side.
3. **The phone stick:** *recommend* a floating stick (it appears under the thumb), about 1.5× today's size, with a 10 % dead zone.

## 7. How to re-run

```
npx tsx scripts/probes/move-feel/stick-feel.mts            # [STICK]; PRESET=try|h3a; SELFTEST=1 (the control)
npx tsx scripts/probes/move-feel/stride-cover.mts          # [STRIDE]
node scripts/probes/hoops-gap/build.mjs <site> dev --dev   # the rig bundle (and `main` from a main checkout, PAGE=main)
/home/user/wt/gate-run.sh 890 scripts/probes/hoops-gap/run-set.sh <site> <out> \
  "onevone ext EXT=$PWD/scripts/probes/move-feel/feel-ext.mjs TAG=rel QS=dummy=1 STRIPS=1 VIEW=400x225" \
  "threevthree ext EXT=$PWD/scripts/probes/move-feel/feel-ext.mjs TAG=rel3 VIEW=320x180 TESTS=slide,jog,cut"   # never NODRAW (§0)
node scripts/probes/move-feel/analyze.mjs <out>/ext-*.json --series <series.json>    # --selftest
/home/user/wt/gate-run.sh 120 node scripts/probes/move-feel/sheet.mjs <series.json> <out>/shots <out.jpg> <rel> <main> <try> <rel3> <main3>
```
