# 1v1 and 3v3 — the ten-phase improvement pass (plan, 2026-10-27)

Owner, playtest 2026-10-27: *"1v1 and 3v3 mode are way behind goal."* Asked what felt off, the owner picked **all four**:
controls and response, movement and animation, AI and game flow, look and presentation. Then: *"10 phase improvement pass on
1v1 and 3v3."*

This plan is built from the hoops-audit lane's measured gap list (`docs/HOOPS-GOAL-GAP.md`, the same commit) and the
instrument it left behind (`scripts/probes/hoops-gap/`). Every exit gate below is a number that instrument prints.

- **Pre-phase, in flight:** `lane/hoops-round2` (HOP-01–06): the 3v3 steal without the coin flip, AI reaction by
  difficulty (420 / 220 / 120 ms), the 3v3 switch and double, hand-checks and contact poses, 3v3 on Havok bodies, the
  hoops first frame. This plan does not redo any of it, and its phases start after it merges (it holds the shared files).
- **Shared hoops files:** `OneVOneMode.ts`, `ThreeVThreeMode.ts`, `BasketballCore.ts`, `HandleSystem.ts`, `anim/Dribble.ts`,
  `CourtMovement.ts`. One lane at a time holds them. Phases marked **shared** run in the order below, one after another;
  phases marked **free** can run beside them.
- **Order:** by what the owner will feel most in the first minute of a game: the stick and the buttons, then whether the
  defence and the rival play basketball, then how the bodies move, then the flow, then the look.
- **Shippable one at a time:** each phase is one lane, one PR, its own before/after on the rig and its own owner feel-check.

## Phase table

| # | Phase | Pillar | Shared files? | Headline gate (rig, `scripts/probes/hoops-gap`) |
|---|---|---|---|---|
| 0 | hoops-round2 (in flight) | AI, bodies, load | holds them now | its own brief (HOP-01–06) |
| 1 | Controls that answer | controls | **shared** (CourtMovement, HandleSystem, mode hooks) | stick onset ≤ 2 frames; stop from a jog ≤ 0.25 s / ≤ 0.6 m; flicks fire ≥ 95 %; a press never silent |
| 2 | Defence is skill, not dice | AI and flow | **shared** (modes, BasketballCore) | 0 dice-decided blocks; my block rate ≤ 25 % of their shots (today far higher); the AI gets ≥ 1 stop per 10 of my possessions |
| 3 | Rivals that play basketball | AI and flow | **shared** (BasketballCore, ThreeVThreeMode) | ≥ 6 distinct rival actions per 10 possessions; 3v3 rival possession ≥ 6 s median; AI root accel p99 ≤ 34 m/s² |
| 4 | Feet and transitions | movement | free if kept to `anim/**` | planted-foot slide p90 ≤ 3 cm/frame; hero pops ≤ 4 per possession, severe 0; root snaps 0 |
| 5 | The ball lives in the hand | movement | **shared** (Dribble.ts, mode call sites) | dribble-apex palm gap ≤ 5 cm; ball warps (> 15 cm/frame held) 0; catch jump ≤ 0.12 m |
| 6 | Flow and pace | AI and flow | **shared** (modes, HoopsOffball) | rebound jitter gone; make → next possession ≤ 2.5 s; possession medians in band |
| 7 | Bodies that touch | movement | **shared** (BasketballCore standoff, ContactSystem) | overlap frames (roots < 0.6 m) 0; defence clip changes ≤ 2.5 /s |
| 8 | Broadcast camera, a live court | presentation | free | camera snaps 0 outside cuts; hero in frame 100 %; replay cut ≤ 2.5 s on big plays only |
| 9 | Premium HUD and menus | presentation | free (hosts only) | the premium-ui tokens on every hoops HUD surface; 0 static control text on the court |
| 10 | Phone budget, re-measure, reel | presentation (perf) | light | 3v3 draws ≤ 208 (budget); steady 60 or an even 30 on the phone profile; every gate above true at one tip |

Phases 8 and 9 can start as soon as a lane is free; they never wait for the shared slot. Phase 4 is free as long as it stays
in `anim/**`, `core/StrideMatch.ts` and `anim/FootPlanting.ts`; if it needs a mode hook, that hook waits for the slot.

The measured baseline for every gate, the evidence and the root causes are in `docs/HOOPS-GOAL-GAP.md`. The per-phase
briefs, ready to run, are in the coordinator's scratchpad under `round9/hoops-phases/phase-NN.md`.

## How every phase is measured

- **The instrument:** `scripts/probes/hoops-gap/` (README in the header of each file). `build.mjs` bundles the real mode
  (esbuild, no Next); `drive.mjs <mode> game|input <out>` plays it on a virtual clock (1/60 s of game time per rendered frame,
  `Math.random` seeded) with a scripted, imperfect human through the real `InputBus`; `analyze.mjs` prints the numbers;
  `perf.mjs` is the phone profile (390×844, DPR 3, 4× CPU throttle, SwiftShader); `run-all.sh` runs them one at a time under
  `flock /home/user/wt/gate-queue.lock`.
- **Before and after on the same seed** (`SEED=7`, `TIER=pro`, `GAME_S=120`), plus one ROOKIE and one ELITE game when the
  phase touches the AI. A gate is read on the mean of the runs the brief names, never on one lucky run.
- **Frame strips** come from the page's own canvas (`HG.strip`), every 3rd–4th rendered frame, saved under
  `<out>/shots/strip-<mode>-<name>/`; screenshots every GAME_S/8 of a game. Each phase saves its strips to
  `scratchpad/round9/hoops-phases/shots/phase-NN/` before and after.
- **Game-logic latency:** the input tests count rendered frames on the game clock. A phone adds its display and touch
  latency on top (about 2–4 frames); the owner's budget is ≤ 100 ms press-to-motion on a phone (2026-10-20), so the rig gate
  is ≤ 3 frames (50 ms) of game logic.
- **Fairness:** every new or changed number is a feel-panel knob (`feel()` + `knobs.ts` row + pinned default + FEEL-PANEL
  line). Knobs never apply in ranked, staked, arena, async-challenge or friend-link runs (the panel enforces it).

## Phase 1 — Controls that answer (controls and response) · shared

**Goal.** The stick moves the athlete now and stops him now; every button press is answered on the next frame; every
right-stick flick throws a move. This is the first thing the owner feels, and "input lag, moves not firing, floaty
players" is the first item on his list.

**Exit gates (rig, 1v1 and 3v3):**
- stick onset (root moved 2 cm) ≤ 2 frames from the press; 90 % of the jog's pace ≤ 0.25 s;
- stop from a jog ≤ 0.25 s and ≤ 0.6 m; from a sprint ≤ 0.35 s and ≤ 1.0 m; a reversal at pace (half the pace the new
  way) ≤ 0.22 s;
- shot press: the meter and the body answer ≤ 1 frame, the ball rises ≤ 4 frames;
- flicks: ≥ 95 % of the eight flicks fire a move from a standing dribble AND from a jog (`[1V1|3V3-HANDLE|STICK|MOVE]`);
  0 silent presses (every refused press says why, as the mechanics pass made true for B / Y);
- the input buffer: a shot pressed during a move fires ≤ 220 ms after the move clears (StickHandle `BUFFER_AFTER_CLEAR_MS`);
- no regression in the hoops-motion gates the stop / launch touch (pops at a stop ≤ today's).

**Shots / strips:** `strip-*-crossover-stand`, `strip-*-crossover-jog`, `strip-*-jumper`, and a new stop strip; before and after.

**Files:** `core/CourtMovement.ts` and `core/BasketballCore.ts` DribbleController (shared: the stop and reversal profile),
`core/StickHandle.ts`, `core/HandleSystem.ts` (shared: the flick read and the lock that swallows it), new
`lib/babylon/hoops/response.ts` (press-to-beat: the first frame of every press is a visible beat), one-line hooks in both
modes (shared), knobs.

**Risk to tuned feel: HIGH.** `GEARS_HOOPS` stop / launch / reverse numbers and the DribbleController's 26 / 34 m/s²
(BasketballCore:142) are tuned. Each is changed only if the gate needs it, flagged `TUNED from → to`, and kept as a knob so
the owner can put today's value back on his phone in one tap.

**Owner feel-check:** 1v1 on ROOKIE, two minutes, no shooting: sprint and let go (does he stop where you let go?), cut back
the other way, throw each right-stick direction from a stand and from a jog (does every one go?), then tap Square while a
crossover is still going (does the shot come out right after?).

## Phase 2 — Defence is skill, not dice · shared

**Goal.** Blocks and steals come from bodies and timing, never from a roll; the AI defends my drives for real. The owner
(2026-10-20): "blocks: hand meets ball for everyone; AI times its jump (no dice); contest: one model for all; goaltending
needs a touch." hoops-round2 already removes the 3v3 steal coin and adds reaction delays; this phase does the rest of that
list.

**Exit gates:**
- 0 dice-decided blocks: `aiBlockChance` + `roll()` (3v3:2514–2516, 2717; 1v1:2809, 3348) replaced by hand-meets-ball
  geometry; the AI's block is a timed jump whose hand reaches the ball;
- my block on their shot needs my hand at the ball (BasketballCore `checkBlock`:1280 today is "jumped ≤ 0.4 s ago and
  within 1.5 m" — no hand, no ball): my block rate on their shots under the scripted defender ≤ 25 % (today's rate in
  `HOOPS-GOAL-GAP.md`) and > 0;
- the AI's block rate on my shots stays within ±3 points of today's measured rate (the owner kept block rates);
- one contest model for every shooter (distance, hand raised toward the ball, closeout AT the shooter, jump timing curve):
  the contest → make % curve is monotonic for the hero, the rival and the mates (one table, three shooters);
- the AI on-ball defender produces ≥ 1 stop (steal, block, or forced turnover) per 10 of my possessions on PRO, and ≤ 4
  (today: none in the hoops-round2 runs and in this audit's game);
- goaltending is called only after a touch.

**Strips:** a block from the side (`strip-*-defense`), a contested jumper, an AI block on a layup.

**Files:** new `hoops/blocks.ts`, `hoops/contest.ts`; `core/HoopsDefense.ts` (the dice retired behind a knob,
`hoops.blockDiceOn` 0); `core/BasketballCore.ts` (shared: `checkBlock`, DefenderBrain pressure); `core/Ref.ts`
(goaltending); call sites in both modes (shared); knobs.

**Risk: HIGH.** Make, block and steal rates are felt. Rule (defense.md): every rate the owner did not ask to change stays
within tolerance of today's; every new number a knob with today's behaviour one tap away.

**Owner feel-check:** 3v3 PRO, defend five possessions: jump on the gather (does the block need you to be there with a
hand?), jump late (does it get through?). Then attack five times into a set defender: does he ever take it from you?

## Phase 3 — Rivals that play basketball · shared

**Goal.** The 1v1 rival uses a move kit and reads; the other 3v3 team runs an offence. Today the 1v1 rival is a script —
check, a sinusoidal weave, a sidestep, a step-back, three shot types (`AttackerBrain`, BasketballCore:1349) — and the 3v3
rival possession is ONE drive whose root is written along a lerp in 0.8–1.6 s (`driveSec`, ThreeVThreeMode:4115), with at
most one swing pass (PRO).

**Exit gates:**
- ≥ 6 distinct rival actions per 10 rival possessions (crossover, hesitation, in-and-out, behind, spin, step-back, post-up,
  pull-up, drive, layup, floater, dunk, swing pass, screen), entropy ≥ 2 bits (today in `HOOPS-GOAL-GAP.md`);
- 3v3 rival possession median ≥ 6 s and ≤ 16 s (today's median there); ≥ 1 screen or ≥ 2 passes in ≥ 40 % of them on PRO;
- the rival driver moves on the same movement model as the hero (a body, not a lerp): AI root acceleration p99 ≤ 34 m/s²
  (hoops-motion phase 5 gate);
- the rival's make rate per shot type unchanged within ±4 points (`rivalShotPct` / `rivalReleasePct` untouched);
- the tiers differ in what the rival does, not only in percentages (ROOKIE vs ELITE action mix differs).

**Strips:** a 1v1 rival hesitation-crossover, a 3v3 swing and catch-and-shoot, a screen.

**Files:** new `hoops/rivalOffense.ts` (1v1 repertoire + reads, adaptRate from `core/Difficulty`), new
`hoops/teamOffense3v3.ts`; `core/BasketballCore.ts` (shared: AttackerBrain delegates); `modes/ThreeVThreeMode.ts` (shared:
the rival possession drives a body); `modes/threevthreeRules.ts`; knobs.

**Risk: MEDIUM.** The rival's odds stay; his possessions get longer and smarter, so games take longer (phase 6 re-reads pace).

**Owner feel-check:** 1v1 ELITE: does he ever hesitate, spin or post you? Does he punish the same move twice? 3v3 PRO: do
they pass and screen, or does one man always drive?

## Phase 4 — Feet and transitions · free (anim/** only)

**Goal.** No sliding, no pose pops, no snapping roots. The owner (2026-10-20): "Animation: blend + minimum-hold rules on
every clip change, all sports (pose jumps/s before/after)"; "Movement pass: foot sliding, stops and starts, turn
smoothing everywhere (hoops)."

**Exit gates (every body, both modes):**
- planted-foot slide p90 ≤ 3 cm per frame (the hoops-motion gate; today in `HOOPS-GOAL-GAP.md`);
- hero pops ≤ 4 per possession, severe (≥ 3000 °/s) 0; AI bodies ≤ 3;
- root snaps (> 20° of yaw in one frame, outside resets) 0;
- every clip change goes through one blend + minimum-hold rule (a unit test over the hoops clip pairs); pose jumps per
  second before / after reported;
- the press-to-beat frame from phase 1 unchanged (a blend never delays a press).

**Strips:** a jog → stop → crossover → drive; a defensive slide → closeout; before/after side by side.

**Files:** `anim/CharacterAnimator.ts` (the rule), new `anim/hoopsTransitions.ts` (a per-pair blend table), `anim/FootPlanting.ts`,
`core/StrideMatch.ts`. RIG-ADJACENT: GATE 0 first and last.

**Risk: RIG-ADJACENT, low gameplay.** No timing changes.

**Owner feel-check:** 1v1, watch your feet in a stop and a cut, and the defender's in a slide. Any skate, any pop?

## Phase 5 — The ball lives in the hand · shared

**Goal.** The ball is in the palm on every dribble, leaves from the hands on a pass, arrives in the hands on a catch, comes
down in two hands on a board. "The ball not in the hand" is on the owner's list.

**Exit gates:**
- dribble apex: the carrier's palm within 5 cm of the ball (centre − 12 cm radius) on ≥ 90 % of bounces (today in the gap doc);
- held ball: centre ≤ 17 cm from the hand bone p90;
- ball warps (> 15 cm in one frame while held) 0 (hoops-motion phase 4 gate);
- passes leave from chest / overhead / bounce height (not the dribble point); catch jump ≤ 0.12 m (phase 11 gate);
- rebounds: two hands, then chinned; no 0.7–1.4 m palm warps.

**Strips:** a dribble at rest and on the move, a 3v3 pass and catch, a defensive rebound.

**Files:** `anim/Dribble.ts` (shared), `anim/ballCarry.ts`, new `hoops/ballHandoff.ts`, authored pass / catch / rebound /
chin clips, mode call sites (shared). RIG-ADJACENT: GATE 0.

**Risk: LOW gameplay.** Pass speed and catch timing unchanged.

**Owner feel-check:** 3v3, pass around the arc three times and watch the hands; grab two boards.

## Phase 6 — Flow and pace · shared

**Goal.** Possessions that breathe and a game that moves. Rebounds decided by the bounce, the box-out and a timed jump (the
owner, 2026-10-20), not by `(rng − 0.5) × 2.6 m` (1v1 `REBOUND_JITTER`:281, 3v3 `BOARD_JITTER` HoopsOffball:50); dead
balls short; checks quick; the shot clock on ELITE as the owner set it.

**Exit gates:**
- 0 jitter terms in the board decision; offensive-board share for the same box-out within ±5 points of today's;
- make → next live possession ≤ 2.5 s for an ordinary bucket, big plays ≤ 2.5 s more for the replay cut (today in the gap doc);
- possession medians: 1v1 6–12 s, 3v3 8–16 s (after phase 3); my 3v3 mates pass back to me in ≥ 30 % of their touches;
- game length: a 1v1 to 11 lands in 4–8 minutes, a 3v3 in its clock, at PRO with the scripted human.

**Files:** new `hoops/rebound.ts`, `hoops/pace.ts`; `core/HoopsOffball.ts`; mode resets / checks (shared); `threevthreeRules.ts`; knobs.

**Risk: MEDIUM.** Game length and rebound share are felt.

**Owner feel-check:** a full 1v1 to 11 on PRO. Does it flow? Who wins the boards, and does it feel earned?

## Phase 7 — Bodies that touch · shared

**Goal.** Bodies meet and do not pass through each other; contact reads by direction and force; the defender's body does
not thrash. Owner (2026-10-20): "one standoff that matches the rules"; "contact reactions by direction and force (visual
only)". hoops-round2 brings the contact poses and 3v3 Havok; this phase unifies the standoff (Havok stops at 0.76 m,
`BODY_STANDOFF` 1.10 m, BasketballCore:482) and reads every rule's range off it.

**Exit gates:**
- overlap (two roots < 0.6 m, outside resets) 0 frames in a game (today in the gap doc);
- one standoff constant read by the physics, the rules and the drawing (a test);
- `contact_react` no longer plays every reaction: ≥ 3 reactions picked by direction and force;
- defensive clip changes ≤ 2.5 per second (the hoops-motion baseline found ~5 in 1.2 s);
- AI drawn hand ≤ 5 cm off its bone (AI-ARMS, hoops-motion phase 5) — if the rival bodies still carry the Meshy skin.

**Files:** `core/BasketballCore.ts` (shared), `core/ContactSystem.ts`, new `hoops/contactReact.ts`, `hoops/defenseSlide.ts`.
RIG-ADJACENT: GATE 0.

**Risk: MEDIUM.** The poke and contest ranges assume 1.10 m; they are re-read from the one constant, odds unchanged.

**Owner feel-check:** 1v1 defence, body him up on a drive. Do you touch, does he react the way you hit him?

## Phase 8 — Broadcast camera and a live court · free

**Goal.** A camera that follows like a broadcast (damped, a slight look-ahead, never a snap) and a court with life around it;
replays only on big plays and short. Owner (2026-10-20): "Cameras: smooth damped follow + slight look-ahead;
distances/heights/FOV unchanged"; (2026-09-24) "the show: big plays only… normal buckets stay quick".

**Exit gates:**
- camera snaps (> 0.5 m or > 10° in one frame) 0 outside cuts; turn rate p99 ≤ 120 °/s; hero in frame 100 % (today in the gap doc);
- 3v3: all six bodies in frame ≥ 90 % of live frames;
- replay cut ≤ 2.5 s on 100 % of big plays, none on ordinary buckets (hoops-motion phase 12 gate);
- the crowd reacts to runs, stops and big plays (an audible and visible change within 0.5 s);
- distances, heights and FOV equal to today's (a test).

**Files:** `core/CameraDirector.ts` (hoops / team presets), `court/mount/hoopsCourt.ts` (replays, crowd), `court/**`, venue
specs. No mode file.

**Risk: LOW.** Framing numbers the owner signed are pinned.

**Owner feel-check:** play a 3v3 and watch the picture, not the ball: does it ever jump? Does a dunk get a quick replay and a
plain layup none?

## Phase 9 — Premium HUD and menus · free

**Goal.** The hoops HUD and menus on the dark premium athletic system the `premium-ui` lane is building (owner 2026-10-27:
"make this feel like a premium app… still feels cheap"; benchmarks include NBA 2K/EA): the score bug, the shot meter and its
grades, the shot clock, banners, the pause / controls card and the end card.

**Exit gates:**
- every hoops HUD surface uses the premium-ui tokens and components (a scan test over `components/games/` hoops hosts);
- banner text ≤ 3 words at play time; 0 static control text on the court (stripStaticControls already moves it);
- phone (390×844) and TV (1280×720) screenshots of: tip-off, a make, a stop, the meter in flight, the end card;
- a11y: contrast and labels pass the premium-ui checks.

**Files:** `components/games/basketball-babylon.tsx`, `three-v-three-babylon.tsx`, `hoops-shot-meter.tsx`,
`hoops-shot-clock.tsx`, the hoops TV HUD parts; premium-ui components consumed, not edited. No mode file (a missing HUD key
waits for the shared slot).

**Risk: LOW.** Presentation only. Waits for premium-ui's tokens to land.

**Owner feel-check:** look at a phone screenshot and a TV screenshot next to a 2K broadcast frame. Does it look like the same
class of product?

## Phase 10 — Phone budget, the re-measure and the reel · light

**Goal.** Steady on the phone; every gate of phases 1–9 true at one tip; one reel for the owner.

**Exit gates:**
- phone profile (`perf.mjs`): 1v1 and 3v3 hold 60, or an even 30 with steady pacing (owner 2026-10-20); long frames
  (> 50 ms) per minute and update + animation ms per frame at or below today's (in the gap doc);
- 3v3 draws ≤ `mobileBudget.json` (208; measured 228–289 by hoops-round2's runs), skinned bodies ≤ 16;
- every gate of phases 1–9 re-read at one tip, in one table, against this plan's baseline;
- the reel: one 1v1 and one 3v3 possession set per pillar, for the owner.

**Files:** `config/mobileBudget.json` (3v3 row), the hot spots the profile names (a mode file only in the shared slot),
`scripts/probes/hoops-gap/**`.

**Risk: LOW–MEDIUM.** A level-of-detail choice is visible; nothing tuned changes.

**Owner feel-check:** the reel, then a game on the phone.
