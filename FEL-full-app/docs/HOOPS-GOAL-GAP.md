# 1v1 and 3v3 — the goal, today, and the gap (hoops-audit, 2026-10-27)

Owner playtest, 2026-10-27: *"1v1 and 3v3 mode are way behind goal."* All four pillars picked: controls and response,
movement and animation, AI and game flow, look and presentation. This file says what "goal" means in numbers, what the
game does today, and which gaps matter most. The plan that closes them is `docs/PLAN-HOOPS-1V1-3V3-10PHASE.md`.

Measurement only: no product code was changed by this lane. Release tip measured: `36593d3a` (lane/finish-release).
The pre-phase `lane/hoops-round2` (HOP-01–06: 3v3 steal coin, AI reaction delays, switch / double, hand-checks and contact
poses, 3v3 Havok, first frame) is in flight and is not double-counted below.

## Sources and how to re-run

- **[R] this audit's rig** — `scripts/probes/hoops-gap/` (build → drive → analyze; header comments say how). The real mode
  in an esbuild bundle, Chromium on SwiftShader, a VIRTUAL clock (1/60 s of game time per rendered frame), `Math.random`
  seeded (`SEED=7`), PRO, a scripted imperfect human on the real `InputBus`. `game` = 120 s of natural play (no seams
  forcing possessions); `input` = the input → response tests. Metric definitions follow `_hoops-motion-probe.mts` (pops,
  planted-foot slide). Output: `scratchpad/round9/hoops-audit/out/` (JSON per run, shots, strips). Section 3 holds its
  numbers.
- **[H2] the hoops-round2 rig, 2026-10-26/27** — the same esbuild + virtual-clock rig, 3v3, PRO: 16 scripted defensive
  possessions and 14 offensive ones on the release before (`bD2`) and after (`aD2`) its changes
  (`scratchpad/round8/hoops-round2/out/play-*`), and its phone-profile perf rows (`out/perf.jsonl`, `out/ff.jsonl`).
- **[C] code**, `file:line` at `36593d3a`.
- **[M] the hoops-motion baseline** (`docs/PLAN-HOOPS-MOTION-13PHASE.md`, 2026-09-24/25) for animation numbers no later pass
  re-took; marked as older wherever used.

## 1. What "goal" means: the bars

Every bar cites where it comes from. "2K bar" lines are the owner's benchmark (NBA 2K, bible §4.1; `SPEC-HOOPS-DEPTH-DECODE.md`).

### Controls and response
| id | bar | source |
|---|---|---|
| C1 | press → visible motion ≤ 100 ms on a phone; on the rig ≤ 3 frames of game logic (a phone adds 2–4 frames of display/touch) | owner 2026-10-20 QUALITY ("input lag … budget ≤ 100 ms on phones") |
| C2 | early presses count: an input buffer; a shot / move pressed during a move fires ≤ 220 ms after it clears | owner 2026-10-20; `StickHandle` BUFFER_AFTER_CLEAR_MS 220 |
| C3 | every press answered (silent presses 0 %) | hoops-depth phase 3 (silent 10 → 0 %) |
| C4 | right-stick flicks fire a move ≥ 95 % (standing and on the move) | owner 2026-10-17/20 ("sharpen up the moves"); hoops-motion phase 4 gate (≥ 95 % of crossing moves change sides) |
| C5 | weight without float: stick onset ≤ 2 frames; 90 % of jog pace ≤ 0.25 s; stop from a jog ≤ 0.25 s / ≤ 0.6 m; reversal ≤ 0.22 s | `CourtMovement` header ("~0.18 s to top speed; decel stronger than accel"); 2K decode S1 ("a guard stops in fewer frames"); assumption: the numbers are this audit's proposal |
| C6 | shot press: meter and body answer ≤ 1 frame, the ball rises ≤ 4 frames | 2K decode S6 (timing is time); assumption |

### Movement and animation
| id | bar | source |
|---|---|---|
| M1 | planted-foot slide p90 ≤ 3 cm per frame, every body | hoops-motion phases 3/5/13 gate |
| M2 | pose pops ≤ 4 per possession for the hero (≤ 3.5 per action), severe (≥ 3000 °/s) 0 | hoops-motion phase 4 / 13 gates |
| M3 | root snaps (> 20° yaw in one frame, outside resets) 0 | BIOMECH facing rule ("every turn is a slew, never a snap") |
| M4 | dribble apex: palm within 5 cm of the ball; ball path while held ≤ 15 cm / frame (warps 0) | hoops-depth phase 9 (hand-to-ball 2–4 cm); hoops-motion phase 4 gate |
| M5 | AI root acceleration p99 ≤ 34 m/s² | hoops-motion phase 5 gate |
| M6 | bodies touch, never overlap: roots < 0.6 m → 0 frames | owner 2026-10-20 ("bodies touch; they do not overlap") |
| M7 | blend + minimum hold on every clip change | owner 2026-10-20 QUALITY |

### AI and game flow
| id | bar | source |
|---|---|---|
| A1 | no dice on blocks, steals or boards: hand meets ball, AI times its jump, the bounce + box-out + timed jump decides | owner 2026-10-20 HOOPS DEFENSE / SHOOTING |
| A2 | block and steal rates in a believable band and close to today's for what the owner did not ask to change: my blocks on their shots ≤ 25 %; the AI's stops on my possessions 1–4 per 10 | defense.md ("block rates close to today's"); assumption: the bands |
| A3 | AI decision variety: ≥ 6 distinct rival actions per 10 possessions, entropy ≥ 2 bits; tiers differ in behaviour | `core/Difficulty` contract ("tiers differ in BEHAVIOUR"); assumption: the numbers |
| A4 | possession length: 1v1 6–12 s, 3v3 8–16 s median | 2K street pace; owner shot clock 12 s 1v1 / 14 s 3v3 on ELITE (2026-10-20); assumption: the bands |
| A5 | pace: an ordinary make → next live possession ≤ 2.5 s; big plays add a ≤ 2.5 s replay | owner 2026-09-24 ("normal buckets stay quick"); hoops-motion phase 12 gate |
| A6 | team play in 3v3: rivals swing / screen; my mates pass back | owner 2026-10-24 H3 ports (#315 teammate smarts); 3v3 concept lock C1–C4 |

### Look and presentation
| id | bar | source |
|---|---|---|
| P1 | camera: smooth damped follow + slight look-ahead; snaps 0 outside cuts; hero in frame 100 % | owner 2026-10-20 QUALITY; sign-off docs (0 `[FEL-FRAME]`) |
| P2 | 60 fps when the phone can hold it, else an even 30; long frames rare | owner 2026-10-20 QUALITY |
| P3 | phone budget: 3v3 draws ≤ 208, skinned bodies ≤ 16 | `config/mobileBudget.json` |
| P4 | first frame / play sooner (1.25–1.75 s measured by perf-lag) | owner 2026-10-24 PERF-LAG; hoops-round2 HOP-06 |
| P5 | premium look: dark premium athletic UI, NBA 2K/EA class | owner 2026-10-27 ("still feels cheap"); premium-ui lane |
| P6 | the show on big plays only, ≤ 2.5 s | owner 2026-09-24 |

## 2. What the code does today (the root causes, read and cited)

These are facts from the release source; section 3 puts numbers on what they cause.

1. **Blocks are dice, both ways.** The AI blocks my shot with `roll() < aiBlockChance(…)` (ThreeVThreeMode.ts:2514–2516; the
   dunk swat 2717–2718; OneVOneMode.ts:2809 and 3348; base table `AI_BLOCK_BASE` HoopsDefense.ts:46, up to 0.35). My block on
   their shot is a window with no hand and no ball: `checkBlock` = "jumped ≤ 0.4 s ago and within 1.5 m planar"
   (BasketballCore.ts:1280–1286).
2. **Boards have a ±1.3 m dice term.** 1v1 `REBOUND_JITTER = 2.6` (OneVOneMode.ts:281, used at 3792); 3v3 `BOARD_JITTER = 2.6`
   (HoopsOffball.ts:50, used at 158).
3. **The 3v3 rival possession is one scripted drive.** `driveSec = min(1.6, max(0.8, driveLen / 5.4))` (ThreeVThreeMode.ts:4115);
   the driver's root is written along that path each frame (≈4160–4170); the finish is decided at the tell; at most
   `maxPasses` swing passes (PRO 1, threevthreeRules.ts:30–34). No screens, no dribble moves, no post-ups for the rivals.
4. **The 1v1 rival is a small script.** `AttackerBrain` (BasketballCore.ts:1349): check 0.5 s → a sinusoidal weave at 4.6 m/s →
   a sidestep (crossover or shuffle) when contained → a step-back → layup / jumper / dunk; a 6 s `SHOT_CLOCK_SEC`
   (BasketballCore.ts:1312). Three shot types, one move, no reads beyond "contained".
5. **The defender is much faster than the attacker it guards.** DribbleController `maxSpeed 6.4` (BasketballCore.ts:142) against
   `RIVAL_DRIVE_SPEED 4.6` (BasketballCore.ts:1307): the scripted defender is always in front, which is also why the rival is
   always "contained".
6. **Two standoffs.** Havok capsules stop bodies at 0.76 m (`ContactSystem.ts:88`, radius 0.38), `BODY_STANDOFF` is 1.10 m
   (BasketballCore.ts:482) and the rule ranges assume 1.10 (hoops2/defense.md).
7. **The 3v3 game clock is 90 s** (`POSSESSION_SEC = 90`, ThreeVThreeMode.ts:232) for a first-to-21 game.
8. **The stop glides at speed, by design of today's numbers.** The handler runs on `CourtMovement` with `GEARS_HOOPS`
   (DribbleController, BasketballCore.ts:142). The stop decelerates at `HOOPS_STOP_DECEL_LOW` 22 m/s² at a walk and
   `HOOPS_STOP_DECEL_HIGH` **11** m/s² at top speed (HoopsStick.ts:33–35; "a sprint slides longer"): from a 4.6 m/s sprint
   that is ≈ 0.42 s and ≈ 0.96 m — while `CourtMovement`'s own header promises "~0.28 s at full sprint, never a glide". The
   first step is loaded at 0.45 (HoopsStick.ts:29), the gear-down 9 m/s². The owner's H3a numbers (#311: stop 32 / 26,
   load 0.7, gear-down 12, turn 720 °/s) are already feel knobs one tap away (hoops-reverse, `hoops.*` H3a group), with the
   release values as defaults.
9. **Cameras are already preset-driven** (`CameraDirector.ts:131` hoops: lag 0.11, lookAhead 1.2) and called from one place per
   mode (OneVOneMode.ts:1131, ThreeVThreeMode.ts:1101): presentation work does not need the shared files.

## 3. Measured today

### 3a. From the hoops-round2 rig [H2] (3v3, PRO, same rig and clock, release before/after its lane)

| bar | measured | n |
|---|---|---|
| A4 3v3 rival possession, check → release / stop | **median 1.4 s (bD2) / 1.5 s (aD2)** — bar 8–16 s | 16 possessions |
| A2 my blocks on their shots (jump on the gather tell) | **10 swats in 16 possessions (62 %)** — bar ≤ 25 % | 16 |
| A2 AI stops on my possessions (steals + blocks) | **0 in 14** — bar 1–4 per 10 | 14 |
| A3 rival 3v3 finishes seen | dunk-heavy: e.g. `rival 360 (dunk_360_spin) speed 5.4` 1.3 s after the check | log |
| P3 3v3 draws on the phone profile | **228 / 207 / 224 / 265–266** (budget 208) | 6 perf rows |
| P2 3v3 frame p50 / p95 on SwiftShader, 4× throttle | 71–74 / 111–171 ms; update 4.6–5.5 ms + animation 3.2–4.2 ms per frame; long (> 50 ms) frames every frame | perf rows |
| P2 1v1 frame p50 / p95 | 48.7 / 86.5 ms; update 4.0 + animation 2.1 ms; draws 119 | 1 row |

(SwiftShader renders on the CPU, so the absolute frame time is not a phone's; the update and animation milliseconds, the draw
count and the long-frame pattern are the comparable parts.)

### 3b. This audit's rig run [R] — not yet taken

The instrument is built and committed (`scripts/probes/hoops-gap/`), and the bundles were built from `36593d3a`. The runs
did not get a turn: the shared gate lock (one browser across all lanes, `round9/resource-rules.md`) was held or queued by
five other lanes from 04:30 to 05:10 UTC, and on this box the rig plays about 1/60 of real time (hoops-round2's 3v3 run:
~6 s of game per 400 s of wall time). The runs stay queued (`scratchpad/round9/hoops-audit/logs/run-all.log`, output in
`out/`): 1v1 and 3v3 `game` (40 s / 30 s at 128×72) and `input` (320×180, with strips).

What that means for the plan: every "today" a gate cites from [R] is read by **that phase's own before-run** on the same
instrument and seed (each brief says how), so no phase starts without its baseline. The numbers that already exist
([H2], [C], [M]) are enough to rank the gaps.

### 3c. Phase 3 (rivals that play basketball, lane/hoops-p03-rivals) — before → after

Headless possession sim (`scripts/probes/hoops-gap/rival-sim.mts`, the real brains and modules against the rig's scripted defender,
seed 7, 300 rival possessions a tier; before = `hoops.rivalKitOn` / `hoops.teamOffenseOn` 0, the release's script exactly):

| bar | 1v1 PRO | 3v3 PRO |
|---|---|---|
| A3 distinct rival actions per 10 possessions (min) | 5.33 (3) → 9.9 (7) | 3.0 (3) → 9.7 (9) |
| A3 entropy of the mix, bits (min) | 2.16 (1.53) → 3.07 (2.33) | 1.40 (1.23) → 3.07 (2.77) |
| A3 ROOKIE vs ELITE action mix (total-variation distance) | 0.013 → 0.40 | 0.005 → 0.43 |
| A4 rival possession median | 2.42 → 2.65 s | 0.78 → 7.38 s (ELITE 7.38, ROOKIE 5.68) |
| A6 ≥ 1 screen or ≥ 2 passes | — | 0 % → 75 % (ELITE 83 %, ROOKIE 38 %) |
| M5 driver root accel p99 | 33 → 33 m/s² | 154 → 33 m/s² |
| make rate, jumper | 7.6 → 6.7 % | 24.3 → 25.9 % |
| make rate, layup | 74.0 → 65.8 % (n 20 → 24) | n/a (the sim's bot blocked every scripted layup) → 39.3 % |

The rig (`after/poss-*.json`, PRO): 1v1 possessions throw spin / crossover / hesitation / in-and-out / behind / step-back; 3v3 possessions
run 12.6, 4.7, 7.0, 6.5 and 7.4 s with probes, a called and set screen, and a swing. The 1v1 layup rate moved because the kit makes a shot
the script never took — a layup with the man he just beat on his hip; `rivalShotPct` / `rivalReleasePct` are untouched.
On the rig the root accel p99 over one recorded 3v3 rival possession (`poss-threevthree-pro-s15-m2.json`) reads: the handler 59.8, the
screener 99.6, the third man 33.0 and my mates 33.1 / 36.3 m/s² (release game, every foe: 122–137). Only bodies that touched someone are
over 34. The movers are capped at 33; the rest is the contact separation pushing roots (`BodySeparation`, phase 7's single standoff).

### 3d. Phase 4 (feet and transitions, lane/hoops-p04) — before → after, the rig, same seed

| bar | before | after |
|---|---|---|
| C6 the ball rises after the shot press (frames; bar ≤ 4) | 14, 13, 7 | 1, 11, 1 (the 11 is the pull-up gather's own dip) |
| the rival's jumper leaves the hand (ball height at the release, same frame, same contest) | 1v1 0.77 / 0.80 m (hands 0.93 m); 3v3 0.97 m | 1v1 1.96 / 1.97 m (hands 1.65–1.81 m); 3v3 1.94 m |
| M2 1v1 pops over 4 possessions (hero / rival), severe | 39 / 42, severe 6 / 11 | 35 / 32, severe 3 / 8 |
| M2 3v3 pops in one rival possession (all six bodies) | 80 | 75 |
| M1 planted-foot slide p90 (1v1 hero / rival; input run hero) | 8.2 / 2.45; 2.56 cm | 8.19 / 2.29; 1.48 cm |
| M3 root snaps | 0 | 0 |

What is left over the bars, by where the rig puts it (severe pops with the log line beside them): the hero's thigh at 8–10 000 °/s on
his own possession with no move logged (frames 342 / 348 of seed 7, unchanged by the plant-lock fade); the arms on a gear change out
of the rest dribble ("gear stop → sprint") and on the guard hand's cross ("guard hand crosses") — the rest-dribble layers (anim/RestDribble,
core/HoopsLook) snapping on and off; the rival's arm at the start of a kit move.

### 3e. Phase 4b (the pops traced to a layer, lane/hoops-p04b) — before → after, the rig, same seed

The rig now traces WHICH LAYER moved a bone (`POP_LIST=1`: the after-animations observers wrapped, a layer's frame-to-frame change over
600 °/s logged against it) and records the pose as DRAWN (it recorded after hoops/contactPoses had put its arm bar and forearm back, and
before nothing else: the contact poses were never measured). Both before and after are on this rig. **The rig is not deterministic:** one
build and seed played two different 1v1 sequences (A: the pocket pick, then the step-back jumper; B: the reach-in, then the spin layup)
on different runs, so each after is paired with a before of the same sequence.

| what | before (p04 site) | after (p04b 27401346) |
|---|---|---|
| hero thigh spike in the step-back gather (1v1 A, frames 342–349) | 8 456 / 10 132 °/s — LocoAccent re-solving the legs under the gather beat | the legs' worst there 949 °/s (not severe); the ball arm's 3 967 °/s at frame 341 stays — the carry's let-go fades 108 → 44° and then cuts 44 → 0 in a frame |
| 1v1 A, defence possession (frames 0–194): pops hero / rival, severe | 8 / 11, severe 3 / 2 | 5 / 8, severe 0 / 1 |
| 1v1 A, offence possession to frame 437: pops hero / rival, severe | 26 / 16, severe 2 / 3 | 30 / 15, severe 1 / 1 |
| 3v3, one rival possession (329 frames before, 395 after — the play differs): pops all six bodies, severe; hero pops, severe | 76, severe 10; hero 17, severe 8 | 66, severe 3; hero 15, severe 0 |
| 1v1 input run (the scripted shots and stops), hero: pops, severe, slide p90, root snaps | 77, severe 9, 1.54 cm, 6 | 48, severe 5 (all five in the made-shot celebration), 2.07 cm, 0 |
| contact poses in 3v3: layer events ≥ 3 000 °/s | 7 (max 7 696) | 1 (max 3 797), over a longer possession |
| stop / start accent in 3v3: layer events ≥ 3 000 °/s | 10 (max 5 358) | 0 (max 1 758) |
| M3 root snaps | 0 | 0 |

The fixes, each traced to its layer first: the stop / start accent off under a beat (`hoops.accentOffBeatsOn`); a contact-pose arm
swap eased per arm (`hoops.contactArmSwapSec`); the carry's arm weights on an eased speed (`hoops.carryArmSpeedSec`); the leg re-solves'
knee pole is the clip's bend with a 1 cm memory of its own (legSink, footGlide), not the root's front under 1 cm of bend.

What is left over the bars (ranked by the tracer): footGlide's lift and step re-solving the legs (the largest hero source on offence),
the carry's reach on the ball arm through the moves and the release, the rival's foot planter and footGlide fighting the stumble and
the contact reaction (FootPlanting is every mode's: not changed here), clip-stage foot spins under `ankle_stumble` and `def_cross_run`
that the clip alone does not have (clip-flip.mts), and the celebration (`dunk_mc_celebrate_big`), whose arm pops come from after the
traced pass. M1 slide: the hero's "planted" feet in a fast slide, a run and a block reach are footGlide's lift at 4.9–5.4 cm, just
under the rig's 5 cm planted band, while the body moves 6–10 cm a frame: no foot is planted at all (clip pace, not a layer).

### 3f. hoops-p05 (the deterministic rig, the carry's let-go, the hero's slide) — before → after, the rig, same seed

**The rig is deterministic now** (`scripts/probes/hoops-gap/determinism.mjs`): three 1v1 runs of one bundle and seed (7, PRO, one defensive
possession cut at frame 180) matched frame for frame — both roots and facings, every watched bone, the ball, the random numbers drawn
(49 345 in frames, 39 693 outside), the game log, the pops and the slide. What was loose, all in the rig: START pressed during the load
(the game ran a wall-chosen number of frames before the clock), the load still moving the clock, one shared random stream, `Date` on the
wall clock, requests in flight at the start. Only the ORDER of announcer lines logged on one frame differs (each is logged when its audio
clip's playback promise settles); the comparator reads one frame's lines as a set. The rig runs about one frame a second of wall on the
shared box, drawing on or off: size a hold to ~700 frames (`MAX_FRAMES`, `run-set.sh`).

| what (1v1, seed 7, PRO) | before (knobs off) | after |
|---|---|---|
| a defensive possession to frame 180: hero slide p90; pops, severe | 2.57 cm; 5, severe 2 | 2.57 cm; 3, severe 2 (the same two left-foot pops at frames 130–131: 4 735 / 3 262 → 5 120 / 3 789 °/s — not new) |
| scripted turbo retreat, then the same with the hand held up: hero slide p90 over the run | 5.13 cm (the retreat 2.8, with the hand up 8.9) | 1.80 cm (1.8, 3.6) |
| … pops, severe | 2, severe 0 | 6, severe 0 (646–1 301 °/s; four are leg turns under the held hand-up) |
| step-back thrown at 5.7 m/s: the ball arm at the let-go's end (gather + 8 frames) | 5 577 °/s (severe) | gone |
| … hero severe pops over the run | 6 | 5 (the one left in the step-back is the make's celebration, 5 929 °/s, on the ball-carry layer — not the let-go) |
| step-back from a stand: arm pops / severe / the carry layer's fast-turn events | 5 / 0 / 39 | 4 / 0 / 29 |

The fixes (each a knob, 0 = before): the captured backpedal is a FORWARD run on the hero rig, so a retreat was a moonwalk — it plays in
reverse (`hoops.backpedalReverseOn`); the legs and pelvis keep the defensive loop under the steal reach, the block reach and the held
hand-up (`hoops.defenseLegsOn`); on defence the hero's pelvis turns toward his travel and his chest stays on his man (`hoops.hipSteerOn`
and four numbers); the carry's let-go ends on the clip (`hoops.carryLetGoToClipOn`).

Left over, for the animation lane: **the closeout always skates** — `closeoutFor` fires only at 2.9 m/s and up, and the authored chop
covers about 0.9 m/s at its rate cap (bench, the man 2 m ahead: p90 0.9 / 9.2 / 10.6 cm at 3 / 4 / 5 m/s); it is the worst leftover in
the real possession (6–15 cm frames). Running its legs from the run loop was tried and reverted (worse on the diagonal, 3–4 new severe
pops with a reach): it needs a stepping closeout clip. The made shot's celebration still pops the ball arm (the carry layer).

**3v3, the same three knobs** (seed 7, a defensive possession to frame 130, knobs off → on): every other body unchanged; the hero's
slide p90 12.27 → 12.65 cm, pops 4 → 3, severe 0 → 0. Frames 110–113 improve (11 → 2 cm, a closeout over a slide); frames 115–126 get
worse (4 → 8–11 cm) under a contact reaction that lands while the hips are turned. Holding the turn under such a beat (instead of
unwinding it) took a pop away but not this. Most of the 3v3 hero's 12 cm is a sprint to his man with footGlide holding the foot 5 cm up
while the body moves 10 cm a frame: the rig's 5 cm band counts that lifted foot as planted (before and after alike).

### 3g. Phase 5 (the ball lives in the hand) — the baseline on the deterministic rig, and the first change

| bar (seed 7, PRO, my possession) | 1v1 (200 frames) | 3v3 (180 frames) |
|---|---|---|
| held ball, centre to the hand bone p90 (bar ≤ 17 cm) | 15.1 cm | 16.4 cm |
| ball warps while held (> 15 cm a frame; bar 0) | 0 | 0 |
| release warps (new read: the step out of the hand well over the flight's own) | 0 | 0 |
| dribble tops with the palm within 5 cm (bar ≥ 90 %) | 2 of 4 | 1 of 2 |
| catch | none | the finish's own gather off the dribble at 4.2 m/s: 13.5 cm (the gather's 8.1 m/s cap) |

Both misses of the palm are the FIRST top after the dribble starts with a launch from a stand (frame 74 in both: 11 / 12.9 cm), the
frames after "gear stop → sprint". The headless dribble bench (`ball-bench.mts`, the carry and the clips only, a launch to 3.7 / 6.4 m/s)
keeps every top 4 cm off the palm, so the miss is in the layers the bench leaves out — the rest dribble and the posture layers, which
p04b already saw snapping on that gear change. Next: the same run with the stage tracer on.

The plan's "catch jump ≤ 0.12 m" cannot be read raw at the shipped pass speed: `PassFlight` flies a chest pass at a constant 14 m/s,
23 cm a frame up to the hands. The rig now reads the catch's departure from the ball's own path too (`devCm`).

First change (`hoops.passFromHandOn`, hoops/ballHandoff): a 3v3 teammate's pass starts its flight from the ball, not his root + 1.2 m.
Unit-tested; not yet seen on the rig (no teammate passed in the recorded windows).

### 3h. hoops-p05b — the 3v3 slide switches on one bundle, the first-bounce palm, the pass that lands on the receiver

All on the deterministic rig, seed 7 PRO, each before → after on ONE bundle (the same play: the roots identical frame for frame).

**3v3 defence, the hero (130 frames).** Every slide switch off → the defaults: slide p90 12.27 → 10.95 cm, pops 4 → 4, severe 0 → 0;
the other five bodies unchanged (one rival 7 → 6 pops). On p5e the defaults had 6 pops: the run → stepping-closeout crossfade (frames
80 and 85, 741–809 °/s), fixed by starting the closeout at the run's point of the stride (`hoops.loopInStepOn`; off it is p5e exactly).
The frame-119 pops stay (both sides) and run a little faster with the switches on (1 809 → 1 967 °/s; not severe). The p5e "foe1
regression" (7.26 → 12.19 cm) was one outlier run: that run differs from every other run of its bundle and config from frame 1
(bones) and frame 9 (the ball); the p5i defaults run twice is identical over all 130 frames.

**The first-bounce palm miss (1v1, the gear stop into the sprint).** The hand tracer (`handtrace.mjs`): the ball carry's own pass took
the palm from on the held ball (−1.5 cm) to 13.5 cm off it on the dribble's first frame — the dribble starts from where the palm had the
ball, but only the ball carried that offset. With the hand taking it too, from where it held the ball (`hoops.carryStartHandOn`): the
first top 11.0 → 0.4 cm, frames 67–79 all within 1.6 cm, tops within 5 cm 1 of 3 → 2 of 3, and the hero's pops 11 / 1 severe → 10 / 1
(the dribble start's arm pop, LeftArm 1 676 °/s, gone). Two rig rounds got there: aiming the hand straight at the stroke's point over
the real ball swung the arm 8 696 °/s on the first frame (no elbow swing limit on a reach's first frame; it now starts from the arm as
posed), then bent the elbow 3 432 °/s (the wrist moved 14 cm round the ball: the held ball sits in the palm, not under that point).

**1v1 defence (180 frames, p5i):** every slide switch off → the defaults: the hero's slide p90 2.57 → 2.34 cm (gate ≤ 3), pops 5 → 5,
severe 2 → 2 (the frame-130 landing: left foot 4 735 → 4 395 °/s, right foot 2 200 → 3 651, frame-131 left 3 262 → 2 722).

**3v3 pass and catch (the hero's pass to mate1, then the call for it back).** The flight now eases its landing onto the receiver
(`hoops.passHomeOn`): mate1's palms on the catch frame 1.14 / 1.48 m → 0.28 / 0.36 m off the ball, the 1.67 m draw into the hand gone
(release warps 1 → 0). The catch read sideways (the gate as now written): 4.8 and 2.0 cm (bar 12). The teammate's throw
(`hoops.passFromHandOn`, measured on the call-back): the ball's step on the throw frame 45.6 → 23.9 cm (the flight's own pace).

### 3i. hoops-p06 — phase 6 (flow and pace), phase 7 (bodies that touch), the hand change

Release `fbf197fb`, seed 7, PRO. "Before" is the same bundle with this lane's knobs at 0 (the A/B the panel gives the owner) unless it says
otherwise. Rig = the deterministic hoops-gap rig (`poss` runs, NODRAW, `scripts/probes/hoops-p06/analyze-p06.mjs`); sims are headless.

**Phase 6, the board.** The live board (the ball bounces off chests, whoever reaches it has it) was already physical; the dice lived in the
RACE the modes fall back on (a swat at the rim, a block at the release, a rattled-out dunk, a live board nobody came down with in 4 s):
1v1 `REBOUND_JITTER`, 3v3 `BOARD_JITTER`, both ± 1.3 m. Now `hoops/rebound.ts`: the body nearest the ball's bounce spot, less the seal and a
jump that is up; no roll (`hoops.boardBounceOn`). Jitter terms in the board decision: 2 → 0. Offensive-board share, the same situations
before (the die's expectation) and after (`scripts/probes/hoops-p06/board-sim.mts`, 3 000 each; assumption: bodies stand still for the
0.9 s before the race — in play they move toward the ball):

| situation | offensive board, before → after |
|---|---|
| 1v1 swat  shooter me  box-out off | 94.3 % → 100.0 % (Δ +5.7) |
| 1v1 swat  shooter me  box-out on | 100.0 % → 100.0 % (Δ +0.0) |
| 1v1 swat  shooter foe box-out off | 94.5 % → 100.0 % (Δ +5.5) |
| 1v1 swat  shooter foe box-out on | 34.2 % → 2.5 % (Δ -31.7) |
| 1v1 stall shooter me  box-out off | 50.4 % → 50.6 % (Δ +0.2) |
| 1v1 stall shooter me  box-out on | 84.7 % → 87.3 % (Δ +2.6) |
| 1v1 stall shooter foe box-out off | 50.2 % → 49.7 % (Δ -0.5) |
| 1v1 stall shooter foe box-out on | 15.6 % → 12.7 % (Δ -2.9) |
| 3v3 swat  shooter me  box-out off | 74.8 % → 81.9 % (Δ +7.0) |
| 3v3 swat  shooter me  box-out on | 95.9 % → 97.2 % (Δ +1.3) |
| 3v3 swat  shooter foe box-out off | 74.2 % → 81.6 % (Δ +7.4) |
| 3v3 swat  shooter foe box-out on | 38.4 % → 14.0 % (Δ -24.4) |
| 3v3 stall shooter me  box-out off | 49.6 % → 50.1 % (Δ +0.5) |
| 3v3 stall shooter me  box-out on | 73.1 % → 79.4 % (Δ +6.4) |
| 3v3 stall shooter foe box-out off | 49.7 % → 49.3 % (Δ -0.4) |
| 3v3 stall shooter foe box-out on | 27.1 % → 20.0 % (Δ -7.2) |

Read: with no box-out the share stays within ± 0.5 points on a stalled board and moves + 5.5 to + 7.4 after a swat (the swatted ball comes
back toward the shooter's side; the die used to give the far man a chance). With a box-out the seal now wins the race it is nearer for
every time: the defence's box-out against their shot takes the board 66 → 97 % (1v1) and 62 → 86 % (3v3) after a swat. **Not within the
plan's ± 5 points in the box-out rows** — that is what removing a ± 1.3 m die from a race between bodies a metre apart does. The rig saw no
race in its runs (every board in them was the live one).

**Phase 6, pace.** The dead-ball beats in the code, from the HUD's score to the next live ball: 1v1 my make 0.7 s (make-it-take-it: my
ball at once), their make 0.9 s + the 0.5 s check = 1.4 s, their dunk 1.0 s (1.6 s with me on the floor) + 0.5; 3v3 my make 0.3 s to their
ball, their make 0.9 s. Rig: 1v1 their layup → the check called 0.92 s later, live at 1.42 s (seed 7, size-up on); 3v3 my make → their drive under way 1.38 s (knobs off: these beats are not this lane's). Both under 2.5 s before and after. (The rig's 1v1 offence runs could not read my own make: under NODRAW the harness's render watchdog trips a few seconds after a dead ball and the mode reloads — a rig artifact, not the game; the drawn runs do not do it.) Big plays (a dunk, a block, an ankle-breaker, a poster) add a replay at the dead ball: 2.4–5
recorded seconds at half speed, **4.8–10 s on screen** before → **at most 2.5 s** (`hoops.replayCapSec`, the window around the moment).

**Phase 6, possession medians** (`rival-sim.mts`, 200 possessions a tier; "bot" = the rig's scripted defender, who reaches every 0.6–1.6 s
at 50 %; "set" = the same defender who never reaches):

| | before | after |
|---|---|---|
| 1v1 rival, PRO, bot | 2.63 s | 4.48 s |
| 1v1 rival, PRO, set | 2.55 s | **6.77 s** |
| 1v1 rival, ROOKIE / ELITE, set | 2.20 / 2.55 s | 5.25 / 7.52 s |
| 3v3 rival, PRO, bot | 7.27 s | **8.65 s** |
| 3v3 rival, ROOKIE / ELITE, bot | 5.60 / 7.53 s | 6.57 / 8.75 s |
| 1v1 rig, their two possessions (seed 7) | 4.5, 2.0 s | 6.0, 11.8 s |

The 1v1 size-up (`hoops.rivalSizeUpSec` 4 s) is the bigger change. Against the reaching bot the median stays under the band (4.5 s): a
reach that misses at the top sends him (PRO 55 % of the time), and the bot reaches constantly. Its trade, measured against that bot (PRO):
his shot mix moves from pull-ups to drives — layups 12 → 113, pull-ups 119 → 42, dunks 50 → 16 of 200 — and the bot's steals 19 → 29;
ELITE's action variety drops to a minimum of 5 per 10 possessions (the phase 3 gate is 6; PRO stays 8). Against a defender who stays home
every possession still ends in the same contested pull-up (6 %), only later. The make chances per shot type are untouched.

**Phase 7.** Both gates read **already met on the release**, measured before any phase 7 change. Overlap (two roots under 0.6 m, outside resets):
**0 frames** in all nine rig runs (1v1 and 3v3, their ball and mine, knobs on and off; 300–1 470 frames each), the closest pair 1.02 m
(3v3) and 1.10 m (1v1) — the #273 separation and the 0.55 m capsules already hold the one standoff. Defensive clip changes (a clip starting
on a defending body, per second of defence; `analyze-p06.mjs`): 1v1 hero 2.54 / 2.55 /s with the size-up off (two runs: just over the
2.5 bar), **0.58–0.64 /s** with it on (the rival works at the top instead of attacking off the check); the 1v1 rival 0 /s; 3v3 hero 1.39,
mates 1.04 / 1.21, their defenders 0.37–0.45 /s. A longer hold for the defence loops (0.4 s) was tried: 3v3 hero 1.39 → 1.13 /s but his
pops 17 → 29 and a mate's planted-foot slide p90 0.45 → 8.7 cm (a held loop under a body already moving the other way) — reverted, not
shipped. What phase 7 changes: the one standoff is now read, not retyped — 3v3's pair loop and `resolveBodyCollision` read
`BODY_STANDOFF / 2` (the literal 0.55, the same number), pinned by `hoops/standoff.test.ts` with the capsules and the rule ranges. Not done
(plan items outside this brief's gates): contact reactions by direction and force, the AI drawn hand.

**The hand change** (GAMEPLAY-CLEAN-AUDIT §4i, left open 1). Headless (`scripts/probes/hoops-p06/handchange.mts`: the hero as a hoops mode
spawns him, the tree's own hand change, the hoops carry on the ball arm, 64 hand changes over the idle / walk / jog / run loops, counted by
the gameplay-clean counter). The pop is not the slerp alone: with the carry on, the hand that will CATCH the ball is the clip's until 0.06 s
before the catch, then swings 100–140° to it in four frames at the move limit (30° a frame) — a hard event on both arm bones. On the carry's
own hand-change crossing it now comes to meet the ball over 0.45 s (`hoops.handChangeCatchLeadSec`): hard events within half a second of
a change **56 → 35** (by loop: idle 16 → 15, walk 16 → 7, jog 11 → 2, run 13 → 11; the clips alone, no carry, give 26 there, nearly all in
the run loop's own capture), every pop 1 405 → 1 205, the catching palm on the catch frame unchanged (median 0.20 m). Inertial blend: 57 →
36 (the same as linear: the twin swap is linear under it, `anim.inertialTwinLinear`), so 1v1 / 3v3 under the inertial blend do not beat
linear here; not re-measured in the modes. Not fixed: idle's changes (the old ball arm), the run loop's own arm keys, and the stick's own
crossover moves (their paths keep the schedule's lead).

After the play audit (HOOPS-AAA-GAP-PLAY, PR #583): most of the pops in play are the AUTOMATIC outside hand (core/GuardHand) crossing about
once a second while guarded at rest. Its crossing (modes/hoopsFlow, `runMove('crossover')`) now takes the same catch lead (headless, that
path: 56 → 35), and standing it crosses at most once in 1.5 s (`hoops.guardHandRestGapSec`; unit test: at rest the gaps go from the rule's
~0.9 s to ≥ 1.5 s, on the move unchanged). Not re-measured with the audit's player counter (`mash-audit.mjs`): the numbers above are this
lane's headless probe, which drives the tree and the carry itself (the counter's agent-bridge bug does not reach it). The bump's
contact reaction (a forearm 58–90° in a frame, the audit's other hard pop) is not touched here. A dedicated hand-change pose or clip, the
arm following the ball, would take the rest; it needs clip work (GATE 0) or a code-built pose — not done.

## 4. Ranked gaps

Ranked by what the owner feels first × how far from the bar. "Shared" = touches one of the shared hoops files.

| # | gap | bar | today | root cause | fix sketch | size | risk to tuned feel | shared | phase |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Blocks are random: the AI's are dice, mine need no hand | A1 A2 | AI blocks by `roll()`; my swat rate 62 % [H2] | §2.1 | hand-meets-ball for everyone; AI times a jump; rates re-tuned near today's | M | HIGH | yes | 2 |
| 2 | The 3v3 rivals don't play: one 1.4 s scripted drive | A3 A4 A6 | possession median 1.4–1.5 s [H2] | §2.3 | the rival team on movement bodies: dribble, screen, swing, reads | L | MED | yes | 3 |
| 3 | No defence on my drives | A2 | 0 AI stops in 14 possessions [H2] | DefenderBrain poke roll + dice blocks; §2.5 | on-ball pressure from body position, timed hands, physical blocks | M | HIGH | yes | 2 |
| 4 | Stops float, cuts slide | C5 | stop 11 m/s² at speed ≈ 0.42 s / 0.96 m from a sprint (§2.8); rig numbers in 3b | HoopsStick.ts:29–35 `GEARS_HOOPS` | the H3a profile (already knobs) or a speed-scaled stronger stop; owner picks on the phone | S–M | HIGH | yes | 1 |
| 5 | Moves don't always fire | C3 C4 | rig numbers in 3b | StickHandle flick ring / window, locks in HandleSystem | widen the read, buffer the busy flick, answer every refusal | S | MED | yes | 1 |
| 6 | The 1v1 rival is predictable | A3 | three shot types, one move (§2.4) | AttackerBrain | a move kit, reads, adapts (Difficulty.adaptRate) | M | MED | yes | 3 |
| 7 | Feet slide, poses pop, roots snap | M1–M3 M7 | [M] slide p90 8.4 cm, 7.6 pops per action (older); rig numbers in 3b | FootPlanting release, clip seams, no hold rule | blend + min-hold rule, plant fix, per-pair blends | M | RIG | no (anim/**) | 4 |
| 8 | The ball leaves the hand | M4 | rig numbers in 3b; [M] catch warps 0.54–0.79 m, passes from the dribble point (older) | Dribble / ballCarry, no pass / catch / board clips | hand-offs from the hands, catch reach, two-hand boards | M | RIG | yes | 5 |
| 9 | Boards are dice | A1 | ±1.3 m jitter (§2.2) | REBOUND_JITTER / BOARD_JITTER | the bounce + box-out + timed jump | M | MED | yes | 6 |
| 10 | Bodies overlap | M6 | two standoffs (§2.6); rig numbers in 3b | ContactSystem 0.76 m vs BODY_STANDOFF 1.10 | one standoff, contact reactions by direction | M | MED | yes | 7 |
| 11 | 3v3 over the phone budget | P3 | 207–266 draws vs 208 [H2] | six skinned bodies + court dressing | LOD, merged dressing, shadow casters | M | LOW | light | 10 |
| 12 | Pace: a 90 s 3v3, quick rival possessions, replays | A4 A5 P6 | §2.7; [H2] 1.4 s possessions; rig pace in 3b | clock + scripted drives | re-read after phase 3; dead-ball beats | S | MED | yes | 6 |
| 13 | Camera | P1 | rig numbers in 3b | preset lag / look-ahead | damped follow, look-ahead, snap-free cuts | S | LOW | no | 8 |
| 14 | The HUD looks cheap | P5 | owner 2026-10-27 | pre-premium components | premium-ui system on every hoops surface | M | LOW | no | 9 |

## 5. Reference shots

The sign-off references (`docs/shots/ref/1v1-halfcourt.jpg`, `3v3-baseline-fixed.jpg`, `final-1v1.jpg`, `final-3v3.jpg`) are the
2026-09 mannequin era: a fixed behind-the-hero camera, the rim centred, all six 3v3 bodies in a tight knot at the top of the
key. Today's court (hoops-round2's rig shot `scratchpad/round8/hoops-round2/shots/aD2-off-pro-double-0.png`, and this audit's
`out/shots/`) has the beach venue, skinned athletes and the broadcast framing; the knot is still the defining 3v3 picture
(five bodies within ~2 m of the ball) — which is the team-offence gap (#2) seen from the camera.

## 6. The plan

`docs/PLAN-HOOPS-1V1-3V3-10PHASE.md`: ten phases, each one lane, ordered by what the owner feels most, the shared-file phases
in sequence and the presentation phases (8, 9) free to run beside them. Briefs: `scratchpad/round9/hoops-phases/phase-NN.md`.
