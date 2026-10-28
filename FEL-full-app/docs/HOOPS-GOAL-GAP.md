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
