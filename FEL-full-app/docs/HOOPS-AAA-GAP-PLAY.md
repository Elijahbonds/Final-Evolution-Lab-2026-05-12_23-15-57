# Hoops against the AAA bar: how it PLAYS (hoops-audit-play, 2026-11-12)

The owner (2026-11-12): *"Audit and assess the gap, look for quality sinkers. Better basketball game than 2K."*

This is the **play** half of that audit: control, handling, shooting, passing, defence, the AI, contact, flow, depth and the
animation you see while you play, across 1v1, 3v3, the 3-point contest, Flight Night (the dunk contest), the dunk duel and the
carnival's hoops event. The **show** half (camera, HUD, look, bodies as drawn, audio, replays, menus, phone performance) is the
sister lane `hoops-audit-show`'s, and is not scored here.

It is an audit: **no game code or feel number was changed.** New measuring tools are in `scripts/probes/hoops-audit/`. Release
measured: `fbf197fb` (lane/finish-release). The benchmark is the genre's AAA level, with 2K as the named reference; nothing of
2K's (names, art, modes, UI) is proposed for copying.

**The verdict in one paragraph.** The game has a very wide *vocabulary* — sixteen dribble moves plus a post game, a dozen layup and
dunk finishes, timed shooting with early / late bodies, a ring that decides makes physically, screens, swings, box-outs and fouls —
and the controls now answer fast (phase 1). What sinks it against the AAA bar is the *grammar between* those pieces: whether a move
beats a man, whether a shot goes in, and whether a block lands are still mostly **a roll the player cannot read**; the hero and the
rival shoot from **two different rulebooks** (the hero's open three goes in 70–90 % of the time when timed, the rival's 38 %, and a
player who presses at random makes as many open threes as the rival does); the ball **ping-pongs between the hands** with a visible arm
snap every second you stand guarded; and nothing persists — **every athlete is the same player** and there is no reason to play
game 20. On the AAA scale the play scores **about 4.5 / 10 overall**: closest in control response (7) and vocabulary, furthest in
animation during play (2), depth (2) and shooting fairness (4).

## 1. What was measured, and how

| Source | What it is | Where |
|---|---|---|
| **[GC]** the gameplay-clean counter | The real `/play/<route>` page (esbuild production build), Chromium on SwiftShader, a sideways phone, a VIRTUAL clock (1/60 s a frame), 22–40 s of play. Pops, skate, root jumps, input answered, stuck time. Players: the counter's own scripted player (in 1v1 / 3v3 the agent bridge made it an idle hero — see below), the same scripted player with the keyboard reaching the hero, and a naive MASHER (8 random presses a second, a random stick and run key). | `scripts/probes/gameplay-clean/audit.mjs`, driven by `scripts/probes/hoops-audit/gc-hold.sh` + `mash-audit.mjs`; read by `summary.mjs` |
| **[HG]** the hoops-gap rig | The real 1v1 / 3v3 (dev bundle, the hoops dev seams), deterministic clock and seed, the scripted imperfect human ("intent bot") on the real InputBus: the input → response tests and possessions with frame strips. | `scripts/probes/hoops-gap/` (drive.mjs, run-set.sh) |
| **[SIM]** headless possession sims | The real brains and modules (rival offence, team offence, blocks, contest, steals) over hundreds of seeded possessions. | `scripts/probes/hoops-gap/rival-sim.mts`, `defense-sim.mts` |
| **[SKILL]** skill against dice | The real ShotMeter, grade table, contest bite, distance narrowing and the ring, per shot style, contest and distance: the green in milliseconds, the make rate per grade, the expected make % of a sharp timer, a decent human and a random presser, and how many shots it takes for skill to show over luck. | `scripts/probes/hoops-audit/skill-vs-dice.mts` (new) |
| **[DICE]** the dice ledger | Every place a hoops mode settles a gameplay outcome with a random draw, by file and line. | `scripts/probes/hoops-audit/dice-ledger.mjs` (new) |
| **[C]** code | `file:line` at `fbf197fb`. | |
| **[PRIOR]** earlier lanes | The phase 1–5 before/after reads (`docs/HOOPS-GOAL-GAP.md` §3, commit bodies of hoops-p01 / hoops-p02), `docs/GAMEPLAY-CLEAN-AUDIT.md` §4g–4i. Cited as such. | |

**A rig finding, first (it changes how earlier numbers read).** The gameplay-clean counter's 1v1 and 3v3 runs have never had a
player. That rig is a production build with agent-run hooks allowed, so the harness publishes the agent bridge, and both hoops
modes build the player's slot as `agentCtl ?? localSource` (`OneVOneMode.ts:1083–1091`; ThreeVThreeMode the same): the keyboard is
bypassed by design. Measured: the counter's 1v1 run held W, D and A for 22 s and the hero's root moved **0 m**; the score was 0–0 at
14 s and the only answers on screen were refusals ("NO TEAMMATE TO SCREEN"). So `GAMEPLAY-CLEAN-AUDIT.md` §5's 1v1 / 3v3 rows
(43 and 64 hard pops a minute, "16 of 16 presses answered") describe an **idle hero being guarded**, not a player. `mash-audit.mjs`
traps the bridge so the keyboard reaches the hero; every [GC] number below for 1v1 / 3v3 that says "script" or "mash" is from a run
where the hero really moved. (The hoops-gap rig is a dev build and was never affected.)

**[GC] the runs** (`fbf197fb`, one run each, virtual clock; "idle" = the counter's own player in 1v1 / 3v3, which the bypass made an idle
hero being guarded; "script" = the same scripted player with the keyboard reaching the hero; "mash" = the masher; the bars are the
counter's own greens: hard pops ≤ 2 a minute, skate ≤ 0.3):

| Mode · player | Play | Hard pops a minute (n) | What they are (the top transitions) | Skate med / p90 | Presses answered, median | Possession resets / camera cuts | Makes / misses in the log |
|---|---|---|---|---|---|---|---|
| 1v1 · idle | 22 s | **55.8** (21) | 14 × the dribble hand change (`bball_dribble_idle_left` ⇄ `bball_mc_dribble_idle`), arms 104–134° in a frame; 7 × `bball_contact_react`, a forearm 58–90° | 0.78 / 1.50 | (no player) | 1 / 2 | — |
| 1v1 · mash | 40 s | **43.9** (29) | the defend stance, the block reach, the run, the fadeaway; the spin's arms 10 498°/s | 1.94 / 6.28 | 188 / 188, 33 ms | 10 / 9 | 6 / 2 (2 of the masher's 4 releases, both "early", went in) |
| 1v1 · script (2 runs) | 22 s | **18.8 / 18.8** (7 / 7) | the defend backpedal, the block reach (a thigh 10 599°/s), the defensive cross-run | 2.02 / 7.38 | 16 / 16, 33 ms | 5 / 6 | 1 / 2 |
| 3v3 · idle | 22 s | **37.5** (14) | 11 × the dribble hand change, up to 8 078°/s | 0.38 / 0.54 | (no player) | 1 / 1 | — |
| 3v3 · mash | 40 s | **53.5** (36) | the jump shot, the block reach, the crossover, the dunk gather; up to 8 949°/s | 3.38 / 9.0 | 189 / 189, 17 ms | 13 / 27 | 4 / 5 |
| 3v3 · script (2 runs) | 22 s | **34.5 / 26.7** (13 / 10) | the defend backpedal and slide (a forearm 5 154°/s), the run | 3.55 / 7.37 | 16 / 16, 17 ms | 1 / 4 | 1 / 1 |
| 3PT · script | 22 s | **34.9** (13) | 11 × the catch hop → the jump shot | 2.24 / 6.1 | 15 / 16, 67 ms | 0 / 0 | — |
| 3PT · mash | 40 s | **34.5** (17) | the catch hop, the early follow-through | 2.63 / 6.1 | 141 / 142, 33 ms | 0 / 0 | 8 / 17 (23 of 25 releases early; early pays 0.35) |
| Flight Night · script | 22 s | **64.3** (24) | 20 × inside `bball_mc_dribble_run` (the run-up dribble) | 0.78 / 4.8 | 16 / 16, 33 ms | 1 / 3 | — |
| Flight Night · mash | 40 s | **41.5** (28) | 14 × the run-up dribble | 1.58 / 3.98 | 146 / 166, 50 ms | 6 / 20 | 1 slam judged: IRON (a press buffered 210 ms early) |
| Dunk duel · script | 22 s | 5.4 (2) | `dunk_mocap`, `dunk_score_hang` | 4.51 / 8.09 | 15 / 16, 33 ms | 2 / 5 | — |
| Dunk duel · mash | 40 s | 16.3 (11) | the dunk → hang and hang → land blends, `dunk_360_eastbay` | 4.13 / 8.83 | 172 / 196, 33 ms | 7 / 24 | — |
| Carnival · script / mash | 22 / 40 s | 2.7 / 3.0 | (the drawn events were the board and the fight ones: neither run reached Slam Rush) | 4.24 / 3.35 | 14 / 14; 149 / 163 | — | — |

(Skate in the dunk, duel and carnival rows is the counter's ratio over runs where the body flies or rides: read the 1v1 / 3v3 rows.)


**[HG] the intent bot's possessions** (`drive.mjs onevone poss`, seed 7, PRO, drawn at 320×180, 6 possessions; the bot shadows the
driver, pokes, jumps 220 ms after the gather on defence, and drives, moves and shoots on offence):

| # | Side | Length | What happened (the mode's own banners and log) |
|---|---|---|---|
| 0 | theirs | 4.5 s | hesitation → spin → step-back → pull-up; contest 0.80, the rival's rate **0.06**; miss ("SMOTHERED 80 %") |
| 1 | mine | 4.0 s | "BIT ON THE HESI!"; a reverse layup at contest 0.79 ("held", rate 0.50) misses; out of bounds |
| 2 | theirs | 4.5 s | behind → hesitation → step-back → pull-up; contest 0.78, rate **0.06**; miss |
| 3 | mine | 3.0 s | a reach-in foul, then the AI's reach strips me ("STRIPPED!"), I win the contested board |
| 4 | theirs | 3.5 s | my strip on the bump; my scoop at contest 0.85 ("good", rate 0.54) misses |
| 5 | mine | 4.0 s | behind-the-back → between the legs → double cross; a called-glass reverse at contest 0.87 ("good", rate 0.63) goes in |

Every possession 3–4.5 s (the bar 6–12 s); both rival possessions end in the same move string and the same 6 % shot; every hero shot
was taken under a 0.79–0.87 contest. One more thing the log shows: a **behind-the-back pressed on the stick rendered the in-and-out
clip** ("move behind_back right → bball_in_and_out_right (same-hand twin in_and_out)") — the move you ask for is not the move you see
when the ball is already in that hand. (After possession 5's make the log reads "THEIR BOARD — DEFEND!": the rig's seam started that
possession while possession 4's board was still live, and `resetPositions` (`OneVOneMode.ts:804`) does not clear `board`. assumption:
a seam artifact — real play resolves the board before the next possession — but the reset leaving the board open is worth a test.)

The frame strips of the worst moments, one JPG: `scratchpad/hoops-audit-play/hoops-play-worst-moments.jpg` (the coordinator's
scratch; the frames are the rig's auto-strips and the counter's screenshots).

## 2. The scorecard

0 = absent, 5 = works and reads, 10 = the genre's AAA level. "What a 10 looks like" is in plain words.

| # | Dimension | Now | What a 10 looks like | Evidence (the short form; §3 has the numbers) |
|---|---|---|---|---|
| 1 | Control response | **7** | The athlete moves the frame you push, stops where you let go, cuts with weight and never ignores a press — in play, at a dead ball, during a replay. | Phase 1 on the rig: stick onset 2 frames, stop from a jog 150 ms / 0.29 m, from a sprint 233 ms / 0.68 m, flicks 8/8 standing and jogging (1v1), the shot buffer ≤ 17 ms [PRIOR]. Left: wide turns at 64 % of the turn rate, the sprint kick and the cut cost in one frame (`HoopsStick.ts:43–49`, H3a off), presses swallowed for a replay's ~3.8 s [PRIOR p01]. Re-read at this tip: onset 2 frames, stops 150 / 233 ms, shot 17 ms; the walk to 90 % pace 350 ms (bar 250) [HG]. |
| 2 | Ball handling | **4** | Every move reads the defender: it beats him when he is leaning the wrong way and fails when he is set, and you can see why. The ball lives in the palm; a hand change is a crossing, never a snap. | 16 dribble moves + size-ups + pausin + a post game (`HandleSystem.ts:61`); but a move beats a man on a roll (`HandleSystem.ts:525`, odds 0.10 for one crossover on a moving man, `:330–336`); every auto hand change snaps both arms 104–134° in one frame [GC]; the handle is 50 for everybody (`HandleSystem.ts:183`, H9 not wired). |
| 3 | Shooting | **4** | Timing is the skill and the skill shows within a game; the green is earned, distance and the contest matter, the rival shoots by the same rules, and every miss has a reason you can read. | Rich shot vocabulary and an honest ring (`RimDecides.ts:107`). But the grade sets a RATE and a draw decides the shot; the open green is 105–117 ms (2K's is ~55 ms); a random presser makes 39 % of open threes, the rival 38 %; contested shots need 500–630 attempts before a decent timer separates from luck [SKILL]. |
| 4 | Passing | **4** | You choose the pass (chest, bounce, lob, touch, no-look, a lead to a cutter), it goes where you aimed, its risk is readable, and the catch flows into the next action. | The type is chosen FOR you (`BallHandling.ts:118–144`); the target is the stick cone or the most open man (`:82–115`); a chest pass flies a flat 14 m/s (`:146`); since p05b it lands in the hands [PRIOR]. Interceptions exist ("PICKED OFF"). No pass in 1v1 by design. |
| 5 | Defence | **5** | Stance, slides and a hand up you control; steals and blocks from timing and position; help, switch and rotate in 3v3; fouls when you reach; it is fun to get a stop. | Steals are a read (`hoops/steals.ts`), blocks are the hand meeting the ball (phase 2). But a timed jump on a 3v3 layup gather blocks 67 % [SIM], the 3v3 hero's slide still skates (p90 10.95 cm a frame after p05b) [PRIOR], and the defender out-runs the man he guards (6.4 vs 4.6 m/s, `BasketballCore.ts:143`, `:1307`). |
| 6 | AI offence and defence | **4** | Rivals read you, punish a repeat, run sets with screens and cuts, shoot by the same rules, and the tiers play differently; nothing wins every time. | 3v3 team offence: 7.3 s median possessions, 75 % with a screen or two passes, tiers differ (TVD 0.40) [SIM]. But the 1v1 rival's possession lasts 2.7 s and his jumper goes in 6–7 % against a set defender [SIM]; the pull-up three is a dominant strategy (§3.6). |
| 7 | Bodies and contact | **4** | Bodies touch and never pass through; a bump reads by direction and force; box-outs and loose balls are fought for. | Live boards and loose balls are physical; box-out exists. But two standoffs (Havok 0.76 m vs 1.10 m, gap doc §2.6); one contact clip whose arms snap 5 000°/s [GC]; a blocked ball goes to a 0.9 s pause and a dice race (`OneVOneMode.ts:2973, 4008, 4102` → `:3886`). |
| 8 | Flow and pace | **5** | A make to the next live ball in about 2 s; checks and inbounds you play through; a game long enough for a comeback. | Makes reset in 0.7–0.9 s plus a replay on big plays; every possession teleports all bodies and cuts the camera (`OneVOneMode.ts:804–832`); the 3v3 game is a 90 s clock to 21 (`ThreeVThreeMode.ts:228, 249`): under the masher the 3v3 reset its bodies 13 times and cut the camera 27 times in 40 s [GC]. |
| 9 | Depth and replayability | **2** | Players with ratings that change how they play, a progression you can feel, rivals with names and tendencies, modes with stakes — reasons to play game 20. | No attribute differs between athletes; the handle is a constant (`HandleSystem.ts:183`, `MOVES_UNLOCKED_GATE 100`); difficulty is three tiers; the 3-point field's rivals are a rolled number (`ThreePointMode.ts:229`, `threePointRules.ts:43`). Stakes exist (arena / staked runs). |
| 10 | Animation during play | **2** | No pops you can see, feet that plant, blends you cannot spot, life at rest, a celebration that fits the play. | Every court mode 19–64 hard pops a minute (bar ≤ 2) [GC]. The auto hand change snaps both arms 104–134° in one frame, about once a second when guarded [GC]; the contact reaction snaps the forearm 70–90° [GC]; the 3v3 hero's feet still slide 10.95 cm a frame p90 on defence [PRIOR p05b]. |

**Overall: about 4.5 / 10 for play.** The control base is the strongest part; the decision layer (skill against dice), the
animation between clips and depth are the furthest from the bar.

## 3. The evidence, by dimension

### 3.1 Control response — 7

Re-measured at `fbf197fb` on the hoops-gap rig (1v1, seed 7, PRO, the stick, stop and shot groups; the flick, poke and block groups
did not fit the gate hold and keep phase 1's reading):

| Read | Now | Bar |
|---|---|---|
| stick onset (root moved 2 cm) | 2 frames (33 ms) median; one of the two samples 23 frames | ≤ 2 frames |
| 90 % of the jog's pace | **350 ms** (21–25 frames) walking; 150 ms on the turbo | ≤ 250 ms |
| reversal | 17 ms walking, 200 ms on the turbo | ≤ 220 ms |
| stop from a jog (4.3 m/s) | 150 ms, 0.29 m | ≤ 250 ms, ≤ 0.6 m |
| stop from a sprint (6.4 m/s) | 233 ms, 0.68 m | ≤ 350 ms, ≤ 1.0 m |
| shot press → meter / body / ball up | 17 / 17 / 67 ms | ≤ 1 frame / ≤ 1 frame / ≤ 4 frames |

The stop and the shot answer at the bar; the walk-up to pace is slow (the gate phase 1 read only on the movement harness, 250 ms), and
one stick press of two took 23 frames to move the body (the first press of the run, after the check: not explained here).

- What phase 1 bought, on the deterministic rig [PRIOR p01]: stick onset 4 → 2 frames; stop from a jog 250 → 150 ms (0.53 → 0.29 m),
  from a sprint 417 → 233 ms (1.40 → 0.68 m); flicks standing / jogging 1v1 8/8 → 8/8, 6/8 → 8/8, 3v3 6/8 → 7/8, 4/8 → 8/8; silent
  presses 2 → 0 (1v1); a shot pressed during a spin now fires the frame the spin clears. The meter answers in 1 frame; since phase 4 the
  ball rises 1 frame after the press (11 on a pull-up, the gather's own dip) [PRIOR p04].
- **Turn radius at speed.** The handler turns at 540°/s, but by lerp-and-normalise, so a 90° stick turns at about 64 % of that
  (`HoopsStick.ts:39–43`, `HOOPS_TURN_TRUE_ARC 0`). The sprint press's kick (0.9 m/s) lands in one frame — 54 m/s² — and the cut cost is
  paid in one frame (`HoopsStick.ts:44–47`, `HOOPS_KICK_SEC 0`, `HOOPS_CUT_SEC 0`). H3a has all three as knobs; the owner has not felt
  them on the phone.
- **Dead inputs.** A press during the dead-ball replay is swallowed (phase 1 found its before-run's silent flicks were all pressed during
  an ankle-break replay; the rig now waits ~360 frames). A player cannot skip or play through it.
- **Masher check.** The masher's presses are answered (a visible change inside the counter's window): 1v1 188 / 188 (median 33 ms), 3v3 189 / 189
  (17 ms), 3PT 141 / 142, the duel 172 / 196, Flight Night 146 / 166 — the unanswered ones fall inside the dunk's cinematics and the
  judges' reveal, where the dunk modes take no press by design. In play, no button is dead.

### 3.2 Ball handling — 4

- **Vocabulary: AAA-class.** `MOVE_HANDLE` (`HandleSystem.ts:61`) owns 16 moves (crossover, hesi, in-and-out, yo-yo, between the legs,
  behind the back, spin, slip-slide, double cross, snatch-back, shammgod, off the head, momentum cross, momentum between-the-legs,
  steezo roll, step-back) plus size-ups, pausin', and a post game (hook, fade, shimmy fade, drop step, spin, pump fake, up-and-under);
  the right stick maps them 2K-style relative to the ball hand (`onevoneRules.ts:96`). Chains have a window that scales with the
  handle (`HandleSystem.ts:201`).
- **Separation is a roll, not a read.** A move beats the defender only when `roll() < ankleBreakOdds(...)` (`HandleSystem.ts:525`):
  0.10 for a single move on a moving man, 0.32 / 0.54 for a two- / three-deep chain, 0.04 on a set man, +0.14 if he is closing, times the
  move's danger (`:330–336`). The read takes two booleans about the defender (closing, set) and nothing about which way he is leaning
  or moving. The jab, the shimmy, the pump fake and the pass fake are the same: fixed or table odds rolled (`OneVOneMode.ts:1607`, `:1956`
  0.45, `:3181` PUMP_BITE_CHANCE 0.55 in `HoopsMoves.ts:671`; `HoopsMoves.ts:926`). In the genre's best, a move works because the man
  bit the wrong way — you can see him lean, and you learn to bait it.
- **The hand change pops.** The owner's auto hand ("outside hand when guarded", `core/GuardHand.ts`) crosses the ball whenever the
  nearest defender inside 2 m changes side. Each crossing swaps the dribble loop for its mirror (`anim/basketballTree.ts:193`), and the
  crossfade between near-opposite arm rotations flips mid-way: in the [GC] 1v1 run the hero's arms turned **110–134° in one frame,
  7 300–8 000°/s, four times in 22 s**, and 14 of the run's 21 hard pops were around a dribble hand change (the other 7: the contact reaction). Known since clean-7
  (`GAMEPLAY-CLEAN-AUDIT.md` §4i item 1) and still open.
- **The ball in the hand.** After phase 5: held ball within 15–16 cm of the hand bone p90, no warps while held, dribble tops within 5 cm
  of the palm 2 of 3 (bar ≥ 90 %) [PRIOR p05b].
- **Repetition.** Each move has one clip (plus its left-hand twin); a three-move chain is three identical clips you have seen before.
  And a move can render as another: [HG] a behind-the-back from the right hand played `bball_in_and_out_right` ("same-hand twin").
- **The handle is a constant.** `BASELINE_HANDLE = 50` for everyone, and every move is unlocked at the gate (`HandleSystem.ts:183–192`,
  "H9 deletes it"). The handle prices the chain window and the odds, but nothing ever changes it.

### 3.3 Shooting — 4

[SKILL], shipped numbers, no overrides (`scripts/probes/hoops-audit/skill-vs-dice.mts`; the timing spreads are this probe's
illustration: a sharp timer ±12 ms, a decent human ±45 ms, a random presser uniform over the meter):

| Shot (distance) | Contest | Meter | Green / perfect band | Hero rate perfect / good / early / late | Expected make: sharp / decent / random | Shots before skill shows | The rival, same look |
|---|---|---|---|---|---|---|---|
| Jumper 4.5 m | open | 720 ms | 117 / 41 ms | 0.92 / 0.76 / 0.33 / 0.28 | 91 / 73 / 40 % | 31 | 46 % |
| Jumper 4.5 m | 0.5 | 610 ms | 71 / 25 ms | 0.76 / 0.63 / 0.27 / 0.24 | 72 / 50 / 31 % | 100 | 25 % |
| Jumper 4.5 m | full | 500 ms | 36 / 13 ms | 0.60 / 0.49 / 0.22 / 0.19 | 50 / 30 / 23 % | 526 | 6 % |
| Three 6.75 m | open | 720 ms | 105 / 37 ms | 0.92 / 0.76 / 0.33 / 0.28 | 90 / 70 / 39 % | 37 | 38 % |
| Three 6.75 m | 0.5 | 610 ms | 64 / 22 ms | 0.76 / 0.63 / 0.27 / 0.24 | 71 / 48 / 30 % | 119 | 17 % |
| Three 6.75 m | full | 500 ms | 32 / 11 ms | 0.60 / 0.49 / 0.22 / 0.19 | 48 / 29 / 23 % | 629 | 6 % |
| Fadeaway 6.75 m | open | 660 ms | 72 / 25 ms | 0.81 / 0.67 / 0.29 / 0.25 | 77 / 53 / 33 % | 84 | 38 % |
| Floater 3.5 m | open | 600 ms | 130 / 45 ms | 0.97 / 0.80 / 0.35 / 0.30 | 96 / 82 / 53 % | 37 | — |
| Layup 1.5 m | open | 550 ms | 149 / 52 ms | 0.98 / 0.94 / 0.41 / 0.35 | 98 / 92 / 64 % | 27 | 74 % |
| Layup 1.5 m | full | 450 ms | 68 / 24 ms | 0.74 / 0.61 / 0.27 / 0.23 | 70 / 53 / 39 % | 189 | 32 % |

What that table says, in plain words:

1. **Timing sets the odds; a draw decides the shot.** `rimDecides` draws one error whose scale puts the make rate exactly at the grade's
   rate (`RimDecides.ts:61–125`; the Monte-Carlo check: asked 0.97 / 0.80 / 0.35 → the ring made 0.969 / 0.797 / 0.348). A green that
   is not perfect misses one time in four; a perfect one in twelve. The ring's dwell and rattle are honest (they are planned from the
   same error), but the player cannot learn why a green missed — there is no reason other than the draw. In the genre's best a green is a
   make; the risk is in getting the green.
2. **The green is about twice as wide as the reference.** 105–117 ms open (`BasketballCore.ts:655–690`: 0.09 of a 0.72 s rise either side)
   against the decoded 2K green of ~55 ms (`docs/SPEC-HOOPS-DEPTH-DECODE.md`). Distance narrows it by at most 22 % (`ShotWindow.ts:40`),
   so a perfect three from 7.5 m is 92 % open — distance is almost free.
3. **Skill shows quickly when open and almost never when contested.** Open, a decent timer separates from a random presser in about
   35 shots (one game). Under a full contest the green is 32–36 ms and it takes 500–630 shots — every contested shot is effectively a
   coin weighted by the contest.
4. **The hero and the rival shoot from two rulebooks.** The hero's rate is a timing grade × style × contest (`OneVOneMode.ts:3428`); the
   rival's is a distance table minus 0.42 × contest (`BasketballCore.ts:1506–1508`), floored at 6 %. A **random presser makes 39 % of
   open threes; the rival makes 38 %.** A decent human makes 70 %.
5. **Readable outcomes.** Good: the early and late releases have their own follow-throughs (depth phase 7), the banner names the
   grade with milliseconds, and the miss's direction follows the error (short for early, long for late). Missing: why a green missed.
6. **Showtime and trick dunks are a judged press and then a roll** (`OneVOneMode.ts:2806`, `:2839`, `:2848`; ThreeVThree `:2770`,
   `:2778`, `:2843`), and **not pressing pays more than a mistimed press**: `SHOWTIME_PCT` none 0.70 against early 0.42 / late 0.50
   (`core/ShowtimeDunk.ts:31`).
7. **Rim, ball and net.** The ring decides with real geometry (rattles, rolls, in-and-outs, glass kisses, airballs only on a miss), the net
   has an exit speed per make kind; this part is at the bar.

### 3.4 Passing — 4

- The pass type is decided for you: a defender in the lane forces a bounce, a cutter near the rim gets the lob, everything else is a
  chest pass (`BallHandling.ts:118–144`). There is no player-chosen bounce, lob, touch or no-look pass, and no lead pass you aim.
- The target is the man inside the stick's cone, else the most open man (`BallHandling.ts:82–115`): right for two teammates.
- The flight is a flat 14 m/s chest pass (`BallHandling.ts:146`), so the ball arrives 23 cm a frame up to the hands; since p05b the
  flight eases onto the receiver's hands and a teammate's pass leaves from the ball [PRIOR p05b].
- Interceptions are real (a body within `SWING_PICK_M` of the flight picks it off; "PICKED OFF! — you threw into coverage").
- Measured on the rig by p05b (the pass and the call-back): the receiver's palms 0.28 / 0.36 m off the ball on the catch frame, the catch
  read 4.8 and 2.0 cm off the ball's own path (bar 12) [PRIOR].

### 3.5 Defence — 5

- **Skill-based where it matters most:** my steal is a read of the ball's exposure (the crossing, the lateral sway) inside 1.6 m, never a
  roll (`hoops/steals.ts:1–15`); my block is my hand meeting the ball's real arc (phase 2, `hoops/blocks.ts`); charges, hand-checks,
  blocking fouls and goaltending (on a touch only) are called by the ref.
- **Too generous where it is easy:** [SIM] my jump ON the gather blocks a 3v3 layup 67 % and a 3v3 jumper 31 %; the scripted 220 ms-late
  jump blocks a layup 7–16 % and a jumper ~0 %. A defender who learns the gather tell erases two layups in three.
- **The AI's choices to defend are rolls:** whether the AI reaches (`roll() < aiReachGate()` 0.7, `OneVOneMode.ts:3922`), jumps at my
  gather (0.45, `HoopsDefense.ts:180`) or raises a hand (0.75, `HoopsDefense.ts:164, 182`). The outcome of each is then geometry.
- **AI stops on my possessions:** 1.78 per 10 in the headless possession model (strips 0.34, blocks 1.18), inside the 1–4 band; the rig
  saw 0 in 18 after phase 2 [PRIOR p02].
- **The defender is faster than the man he guards**: the DribbleController's 6.4 m/s against the 1v1 rival's 4.6 m/s drive
  (`BasketballCore.ts:143`, `:1307`), so staying in front is free. The closeout now steps (p05b's authored chop, `hoops.closeoutStepOn` 1), but the
  3v3 hero's planted-foot slide is still 10.95 cm a frame p90 on defence (bar 3) [PRIOR p05b].
- The masher's 3v3 run shows the read working both ways: "JUMPED EARLY — WAIT FOR THE RELEASE" and "REACH — THEY GO BY" are said on
  screen when a press is wrong [GC screenshots], which is the readable feedback a 10 needs.

### 3.6 The AI — 4

[SIM] at `fbf197fb`, 200 rival possessions a tier, the human-like defender (`rival-sim.mts --def human`):

| | 1v1 ROOKIE | 1v1 PRO | 1v1 ELITE | 3v3 ROOKIE | 3v3 PRO | 3v3 ELITE |
|---|---|---|---|---|---|---|
| distinct actions per 10 possessions | 6.4 | 9.2 | 9.2 | 6.7 | 9.75 | 9.75 |
| mix entropy, bits | 2.40 | 3.00 | 2.98 | 2.41 | 3.08 | 3.08 |
| possession median | 2.42 s | 2.73 s | 2.78 s | 5.6 s | 7.27 s | 7.53 s |
| a screen or two passes | — | — | — | 35.5 % | 75.5 % | 83.5 % |
| jumper make | 7.1 % | 6.4 % | 6.4 % | 20.1 % | 26.0 % | 32.2 % |
| layup make | 56 % | 49 % | 55 % | 33 % | 39 % | 45 % |
| points per shot | — | — | — | 0.42 | 0.56 | 0.68 |

- **Variety and spacing are there in 3v3** (phase 3): a called and set screen, swings, catch-and-shoot, tiers that play differently.
- **The 1v1 rival has no jump shot.** Against a defender in front of him he makes 6–7 % of his jumpers, and his possession is over in
  under three seconds (bar 6–12 s). His points come from layups and dunks.
- **One exploit beats every tier: the pull-up three.** The 1v1 AI defender settles 1.25–1.35 m off a standing shooter
  (`BasketballCore.ts:798` ARMS_LENGTH, and phase 2's cushion), which the one contest model reads as 0.48 (0.67 with his hand up). A decent timer's
  three from there is ~40–48 % (1.2–1.4 points a shot); a sharp timer's ~60–70 %. The rival's best look returns ~1.0 point a shot at
  PRO. (Headless: the rig's intent bot does not aim for threes, so this was not played out on the rig.)
- **Does it cheat?** Not in movement (the AI shares the movement model since phase 3 — root accel p99 33 m/s²). In outcomes it plays a
  different game: its shots are a rate table, not a timed release (above); its 3-point rivals never shoot, they are a number drawn
  around `rivalCentre` (`threePointRules.ts:43`); the carnival rival's score is a range ticked up on a curve.
- **Masher and idle.** A masher (8 random presses a second, random stick, no aim) **led the 3v3 6–4, 28 s into the 90 s game** (the score bug's left number is the player's, `three-v-three-babylon.tsx:123`) and
  trailed the 1v1 PRO rival only 4–6 at 30 s; two of its four 1v1 releases were graded "early" (rates 0.33 and 0.28) and both went in
  [GC]. In the 3-point contest it made 8 of 25 with 23 early releases, because an early release still pays 0.35. Nothing the AI does
  punishes mashing: the rival does not take a charge off a flailing drive, the AI's reach only lands on the ball (phase 2), and the
  masher's mistimed shots are 30 % shots.

### 3.7 Bodies and contact — 4

- Live boards are physical (the ball bounces off chests, a seal is real position, a bobble keeps it alive: `OneVOneMode.ts:3705–3780`);
  the jitter term survives only in the stall guard. But **a blocked ball is not a live ball**: the swat paths call
  `later(900, () => boardRace(ctx))` (`OneVOneMode.ts:2973, 4008, 4102`), a 0.9 s freeze and then distance + box-out + `(rnd − 0.5) × 2.6 m`
  decides the possession (`:3882–3889`). The genre's best plays the swat out.
- Two standoffs: Havok capsules stop bodies at 0.76 m, `BODY_STANDOFF` is 1.10 m (`BasketballCore.ts:483`) — phase 7, not started.
- One contact reaction clip for every bump (`bball_contact_react`); in the [GC] runs it snaps the forearm 58–90° in one frame, every
  time it plays (4 850–5 400°/s).
- Box-outs exist on both teams (L1 for me; the AI seals on every shot near the rim).

### 3.8 Flow and pace — 5

- 1v1: first to 11, make-it-take-it, 2s and 3s (`OneVOneMode.ts:262`); the rival's own shot clock is 6 s (`BasketballCore.ts:1323`), the
  visible clock 12 s on ELITE only (owner 2026-10-20).
- 3v3: first to 21 **inside a 90 s game clock** (`ThreeVThreeMode.ts:228, 249`). With rival possessions of 7.3 s (phase 3) and mine of
  similar length, a game is ~6–7 possessions a side: one hot hand decides it, and a comeback has no room.
- Every new possession moves every body to its spawn in one frame and cuts the camera (`resetPositions`, `OneVOneMode.ts:804–832`;
  `resetPossession`, `ThreeVThreeMode.ts:953`). There is no walk back, no check you play, no inbound.
- Make → next live ball: 0.7–0.9 s of banner (`later(700 | 900, …)`) plus, on a big play, the replay at the dead ball (~3.8 s, input
  swallowed). Under the masher the 3v3 reset every body 13 times and cut the camera 27 times in 40 s; the 1v1 10 and 9 [GC]: a possession every
  3–4 seconds, each one a teleport.

### 3.9 Depth and replayability — 2

- No attributes: every athlete plays the same — the same speed, the same green, the same handle (50), the same odds.
- Difficulty is three tiers that change the rival's odds and choices (`onevoneRules.ts:20`, `threevthreeRules.ts:30–34`).
- Modes: 1v1, 3v3, the 3-point contest (a field and a final; rivals simulated), Flight Night (a judged contest with tricks and props),
  the dunk duel (pass-and-play), the carnival's Slam Rush. Stakes: arena, staked and head-to-head runs play PRO, rating-free.
- No progression in hoops: nothing you do in game 1 changes game 20 (the handle rating, H9, is not wired).

### 3.10 Animation during play — 2

The counter's hard pops a minute (green ≤ 2; [GC], one run each): **1v1 55.8 guarded at rest, 18.8 under the scripted player, 43.9 under a masher; 3v3 37.5 / 27–35 / 53.5;
3PT 34.9 / 34.5; Flight Night 64.3 / 41.5; the duel 5.4 / 16.3; the carnival 2.7 / 3.0.** Every hoops court mode is red, by 9–30 times
the bar. The families, by how often a player sees them:

- **The hand change** (sinker 1): 1v1 / 3v3 at rest, both upper arms 104–134° in one frame, ~once a second while guarded.
- **The contact reaction:** one clip for every bump; its forearm 58–90° in one frame each time (1v1 at rest: 7 in 22 s).
- **The defence beats:** the block reach and the defend stance, the legs up to 7 400°/s (1v1 masher); clean-7 measured the defend legs
  layer at 75–152° a frame in both blends [PRIOR].
- **The 3PT catch hop → jump shot:** 11 of 13 hard pops in the shootout, the arm and hand — on every ball.
- **Flight Night's run-up dribble** (`bball_mc_dribble_run`): 14–20 hard pops a run, still, after clean-6's run-up change (dunk-flagship's).
- **The made-shot celebration's ball arm** (5 929°/s, [PRIOR p05]) and the dunk duel's hang → land (69° a frame, clip content).
- **Feet:** the 1v1 / 3v3 skate ratio under a real player is 1.9–3.4 (red over 0.6): the body travels while the stance foot is planted —
  the 3v3 hero's planted-foot slide p90 is 10.95 cm a frame on defence [PRIOR p05b].
- **Repetition:** each handle move, each finish and each reaction is one clip; idle life (the rest dribble, the breathing) exists, the
  celebration is one clip (`dunk_mc_celebrate_big`) for every make.

## 4. The quality sinkers, ranked

What a first-time player notices inside a minute that makes it feel cheap. Ranked by severity × reach (severity 1–5, reach = how
many modes × how often). The dice ledger (`dice-ledger.mjs`) is the map behind several of them: of the draws that settle an outcome in
the hoops modes, 8 sites roll a shot's make at a rate (the ring), 8 decide whether a move or a fake beats the defender, 11 settle a
dunk or trick dunk, 5 gate an AI reach or strip, 6 a block (4 of them only behind the `hoops.blockDiceOn` A/B knob, 0 by default), 2 a
tip-in, and the AI's choices (drive, kick, screen, swing, hand up, jump) roll on purpose — variety, which is fine. "Needs" says whether the fix needs the owner's eye (a feel call), a clip or rig change (GATE 0), or new captured
animation.

| # | Sinker (what the player sees) | Evidence | Reach | Sev. | Likely cause (`file:line`) | Fix | Needs |
|---|---|---|---|---|---|---|---|
| 1 | **The arms snap every time the ball changes hands.** Standing guarded, the ball crosses on its own about once a second and both upper arms whip 110–134° in one frame. | [GC] 1v1 (guarded, at rest): 14 of 21 hard pops in 22 s are hand changes, the worst four 7 300–8 000°/s; 3v3: 11 of 14, up to 8 078°/s. Clean-7 saw it in both blends. | 1v1, 3v3; every guarded possession, ~1/s; the AI handlers cross too (`core/AiBallHand`) | 5 | The hand change is a crossfade from a dribble loop to its MIRROR (`anim/basketballTree.ts:193`), and near-opposite arm rotations flip half-way; the owner's auto hand (`core/GuardHand.ts`, the 2 m ring) fires it whenever the defender's side changes. | M | GATE 0 (a hand-change clip, or the carry crossing the ball first with the arm following) + owner eye on how often the auto hand may cross |
| 2 | **Shots go in by the hero's rules for him and a table for the rival — and a mistimed press is a good shot.** A random presser makes 39 % of open threes; the rival makes 38 %. A green misses one time in four. | [SKILL] table §3.3; the ring makes at exactly the rate it is handed (0.969 / 0.797 / 0.348). | 1v1, 3v3 every shot; 3PT every ball (same grade table) | 5 | Grade → rate (`BasketballCore.ts:747` SHOT_QUALITY_PCT) → one draw at that rate (`RimDecides.ts:107`); the green 0.09 of a 0.72 s rise (`BasketballCore.ts:655–690`); the rival's distance table (`BasketballCore.ts:1506`). | M | Owner feel calls: what a green pays, the green's width, how much distance costs; the rival on the same release model |
| 3 | **Unreadable outcomes: greens miss, mashed shots go in.** "That was green — why did it miss?" and "I mashed and it went in." | Falls out of #2: a good green is 0.76 open (a quarter of greens miss); an early or late release still pays 0.28–0.35. A masher led the 3v3 6–4 after 28 s, made 2 of 4 early 1v1 releases and 8 of 25 threes in the shootout [GC]. | 1v1, 3v3, 3PT | 4 | As #2: the verdict is a draw, so no reason exists to show. | S (with #2) | Owner call (#2) |
| 4 | **Moves beat a man on a roll.** A crossover on a moving defender gets by one time in ten; a three-deep chain one in two; you cannot see why it worked. Fakes (jab, shimmy, pump, pass) the same. | `HandleSystem.ts:330–336` (0.10 / 0.32 / 0.54, set 0.04), `:525` the roll; `OneVOneMode.ts:1607`, `:1956` (0.45), `:3181` (`HoopsMoves.ts:671` 0.55); `HoopsMoves.ts:926`. The read is two booleans (closing, set). | 1v1, 3v3; every move | 4 | The decision ignores which way the defender is moving or leaning when the ball leaves. | M | Owner feel call on the new read; the stumble / bite clips exist |
| 5 | **One exploit wins at every tier: the pull-up three.** | The 1v1 AI settles 1.25–1.35 m off a standing shooter (contest 0.48, 0.67 with a hand up). Pull-up three from there: a decent timer 41–49 % (1.2–1.5 points a shot), a sharp one 64–72 % (1.9–2.2), a random presser 28–31 % (0.8–0.9) [SKILL]; the rival averages ~0.7 points a possession at PRO ([SIM] mix). (headless) | 1v1 all tiers; 3v3 partly | 4 | `BasketballCore.ts:798` ARMS_LENGTH + phase 2's cushion; no closeout on a gather; #2's tables | S–M | Owner feel call (closeout distance) |
| 6 | **The 1v1 rival cannot shoot and his possessions are over in under three seconds.** | [SIM] rival jumper 6–7 % against a set defender; possession median 2.4–2.8 s (bar 6–12 s); 17 % end in a steal. [HG] both rival possessions: the same move string into a 0.06 pull-up, 4.5 s each. | 1v1, every defensive possession | 4 | `AttackerBrain` + `hoops/rivalOffense.ts` take the first look; `rivalShotPct` floors at 6 % under contest (`BasketballCore.ts:1506–1508`) | M | Owner feel call (rival make rates are tuned) |
| 7 | **Every bump plays the same reaction, and its arm snaps.** | [GC] 1v1: `bball_contact_react` 7 times in 22 s, the forearm 58–90° in one frame (4 850–5 400°/s) each time. | 1v1, 3v3; every hand-check and bump | 4 | One clip for every contact; clip content | M | GATE 0 / new reactions by direction and force (phase 7's own gate) |
| 8 | **A blocked shot stops the game, then a roll gives the ball away.** | `OneVOneMode.ts:2973`, `:4008`, `:4102`: `later(900, () => boardRace(ctx))` → `:3886` distance + box-out + `(rnd − 0.5) × 2.6 m`. | 1v1 every block (3v3 stall guard similar, `HoopsOffball.ts:158`) | 3 | The swat paths skip the live board the misses use (`liveBoard`, `:3705`) | S | none (the live board exists) |
| 9 | **The game freezes for every replay and every check.** A press during the dead-ball replay is swallowed; every possession teleports all bodies and cuts the camera. | [PRIOR p01] a replay holds ~230+ frames, presses lost; `resetPositions` (`OneVOneMode.ts:804–832`), `resetPossession` (`ThreeVThreeMode.ts:953`). [GC] masher: 3v3 13 resets and 27 camera cuts in 40 s. | 1v1, 3v3; every possession, every big play | 3 | Dead balls are cuts, not play | S–M | Owner call on skipping replays (the show lane owns the replay itself) |
| 10 | **Showtime and trick dunks: pressing badly is worse than not pressing.** | `core/ShowtimeDunk.ts:31` none 0.70 > late 0.50 > early 0.42; then `roll() < SHOWTIME_PCT[j]` (`OneVOneMode.ts:2806`; ThreeVThree `:2843`); trick dunks the same (`:2839`, `:2848`). | 1v1, 3v3 showtime / trick dunks | 3 | The 'none' rate | S | Owner feel call |
| 11 | **Defence is solved once you learn the gather tell.** | [SIM] a jump on the gather blocks 67 % of 3v3 layups, 31 % of jumpers; the defender is faster than the 1v1 driver (6.4 vs 4.6 m/s). | 1v1, 3v3 defence | 3 | `hoops/blocks.ts` reach + `hoops.aiBlockJumpChance`; `BasketballCore.ts:143`, `:1307` | S | Owner feel call |
| 12 | **Every athlete plays the same, and nothing carries over.** | `HandleSystem.ts:183` BASELINE_HANDLE 50 for all, `:192` every move unlocked; no attribute anywhere in the hoops modes. | every mode, every game; felt by game 5 | 3 | H9 not wired; no rating model | L | Owner product call (what an athlete's ratings are, how they grow) |
| 13 | **Passing is automatic.** You pick the man; the game picks chest, bounce or lob. | `BallHandling.ts:118–144`; a flat 14 m/s (`:146`). | 3v3 every pass | 2 | No pass-type input | M | Owner call (a button map) |
| 14 | **The 3-point field never shoots.** Your rivals are a number; a timed player wins the contest easily. | `ThreePointMode.ts:229` simulateRival around `threePointRules.ts:43` (12.5–19.5 + money rack); green pays 0.80–0.97 (#2). | 3PT every contest | 3 | Simulated field | M | none for the sim; owner call if rivals shoot on court (time per round) |


## 5. Mode by mode

| Mode | What plays well | What sinks it | Run evidence |
|---|---|---|---|
| **1v1** | The stick, the stop, the flicks, the move vocabulary, the post game, the honest ring, live boards. | Sinkers 1–10. The rival has no jumper and short possessions; the pull-up three wins; the arms snap at every hand change. | idle hero: 55.8 hard pops / min, 14 of 21 at the hand change; masher: 4–6 at 30 s against PRO, 43.9 / min |
| **3v3** | A team offence with screens and swings (phase 3), the screen call, the one contest model, steals by read. | Sinkers 1, 2, 4, 7, 9, 11, 13; a 90 s game to 21; mates that space but rarely create (the mate read, `hoops.mateReadOn`). | masher: led 6–4 after 28 s; 53.5 hard pops / min; 13 resets and 27 camera cuts in 40 s |
| **3-point contest** | A field, a cut line, a final, the money rack, the set and hop, the rim in frame at every rack. | The grade → rate → draw (sinker 2); green pays 0.80–0.97 so a timed player wins easily; the field is simulated (sinker 14). | 34.5–34.9 hard pops / min, 11 of 13 at the catch hop → jump shot; masher 8 of 25 (23 early) |
| **Flight Night (dunk)** | A real contest: run-up on the movement model, plant and takeoff, style taps that shrink the slam window, judges with variety memory, props, the first slam press decides (the masher fix of depth phase 10). | The rival dunkers are simulated (`core/DunkRivalSim.ts:58, 65`); the run-up and hang clips' arm pops (clean §5: 70 hard pops a minute before clean-6's run-up fix). | 64.3 / 41.5 hard pops / min, 14–20 inside the run-up dribble; masher: one slam judged in 40 s (IRON, the buffered press) |
| **Dunk duel** | Pass-and-play head to head with the same loop and per-player variety memory. | The hang → land arm (69° a frame, clip content, clean §4h); a duel of two dunks each is short. | 5.4 / 16.3 hard pops / min (the hang and land blends) |
| **Carnival (Slam Rush)** | One verb, readable: hold the charge, let go in the gold band (0.85 ± 0.12, `carnivalEvents.ts:160–169`), no dice (IMPROVE 2026-10-06). | The only hoops event, and the ball never leaves the hand — no flight, no rim, no movement; the rival is a range ticked up on a curve. The clean audit saw 4 of 13 taps answered on the carnival (median 367 ms). | 2.7 / 3.0 hard pops / min; neither run drew Slam Rush (4 events of 6 a night): Slam Rush is read from code |


## 6. The fix plan

Ordered by the felt gain per unit of work, mapped onto the planned phases 6–10 of `docs/PLAN-HOOPS-1V1-3V3-10PHASE.md` where they fit;
new phases are numbered on from 11. **Owner** = needs the owner's eye or a product call before it is built. **GATE 0** = touches clips or
the rig (verify the rig first and last). **Capture** = new captured animation would do it best.

| Order | Phase | What it fixes (sinkers) | Exit gate (measured by this lane's tools) | Size | Needs |
|---|---|---|---|---|---|
| 1 | **11 (new) — The hand change** | 1 (and the AI handlers' crossings) | the counter with a real player (`mash-audit.mjs PLAYER=script`): a guarded 1v1 possession's hard pops ≤ 2 a minute; no arm turn > 25° in a frame at a hand change; the auto hand crosses no more than once per 1.5 s at rest | M | GATE 0 (a hand-change clip, or a carry-led crossing with the arm following the ball); **Owner** (the auto hand's dwell); Capture would be best |
| 2 | **7 — Bodies that touch** (planned) | 7, 8 (the swat as a live ball), the two standoffs | its own gates, plus: every contact reaction's forearm ≤ 25° a frame; ≥ 3 reactions by direction; a swat goes to the live board (dice ledger: 0 board races off a swat) | M | GATE 0; Capture for the reactions |
| 3 | **12 (new) — One rulebook for the shot** | 2, 3, 5, 6, 10 | [SKILL]: a random presser ≤ 15 % on open threes; a decent timer separates from random in ≤ 15 shots open and ≤ 60 contested; the rival releases on the same meter with a tier skill (one table, three shooters); a perfect open release is a make (or the owner's number); no-press never beats a press on showtime | M | **Owner** first: a 30-minute phone session on the knobs (what green pays, its width, distance, the rival's tier skill) |
| 4 | **13 (new) — Moves that read the man** | 4, 11 | dice ledger: 0 rolls in "move beats defender"; a move into a set defender never breaks him, the same move against his committed lean always does (headless, the AI's reaction delay by tier 420 / 220 / 120 ms deciding the window); the AI closes out on the gather (the pull-up three at ≤ 1.0 point a shot for a decent timer) | M | **Owner** feel call on the read; the stumble / bite clips exist |
| 5 | **6 — Flow and pace** (planned) | 6, 9 | its own gates, plus: 1v1 rival possession median 6–12 s; a press during a replay skips it (0 swallowed presses, the hoops-gap input run without its 360-frame wait); the check is a beat you play (no teleport visible) | M | **Owner**: the 3v3 game length; replays are the show lane's (coordinate) |
| 6 | **14 (new) — Players who differ** | 12 | an athlete's ratings change his speed, handle, green and finishing within a stated band; H9's handle grows with play; staked / arena runs stay rating-free (the owner's rule) | L | **Owner** product call (what the ratings are, how they grow, what is fair in ranked) |
| 7 | **15 (new) — Pass you choose, a field that shoots** | 13, 14 | a pass-type input (bounce, lob, lead) with the auto pick as the default; 3PT rivals shoot their racks on court (or a watched ticker of real releases) | M | **Owner** (the button map; round length) |
| 8 | **10 — Re-measure** (planned) | all | every gate above at one tip, the counter with a real player and a masher, the reel | S | — |

Phases 8 (camera, court) and 9 (HUD) are the show half (`hoops-audit-show`).

**The first three moves for the biggest felt gain:** (1) phase 11, the hand change — it is on screen every guarded second of every
possession; (2) the owner's shooting session that unlocks phase 12, because every shot in three modes reads through it; (3) phase 13,
moves that read the man, which takes the dice out of the ball handling and closes the pull-up exploit at the same time.


## 7. Waiting on the owner

Recommendation first; each is reversible except where marked.

1. **What a green pays and how wide it is (phase 12).** *Recommend:* an open perfect release is a make, an open good release about 0.9,
   and the contest and distance narrow the WINDOW rather than shaving the rate; the open green about 70 ms (today 105–117 ms). Felt on the
   phone first, through knobs that put today's numbers back in one tap.
2. **The rival shoots on the same model (phase 12).** *Recommend:* yes — his release is a timed one with a tier skill (ROOKIE loose,
   ELITE tight), so his make rates come from the same table as yours. Rival make rates are tuned numbers today: they move only with
   your sign-off.
3. **How often the auto hand may cross at rest (phase 11).** *Recommend:* no more than once every 1.5 s while you stand; any move of
   yours wins at once (today's rule already says so).
4. **Moves read the man (phase 13).** *Recommend:* a move breaks a defender only when he is committed the wrong way (his velocity
   toward the side the ball leaves, inside his tier's reaction window); no roll.
5. **The 3v3 game length.** *Recommend:* first to 21 with a 4-minute running clock (today 90 s), so a game has 12–15 possessions a side.
6. **Replays.** *Recommend:* any press skips the replay and gives the ball back (with the show lane, which owns the replay).
7. **Ratings and progression (phase 14).** A product call; *recommend* starting from the handle rating H9 already reserves, plus
   speed and shooting, with ranked / staked / arena runs rating-free as today.

Not the owner's, routed: **the gameplay-clean counter has never had a player in 1v1 / 3v3** (§1). The fix is in its probe, not the
game: trap the agent bridge as `scripts/probes/hoops-audit/mash-audit.mjs` does, then re-read clean §5's hoops rows.


## 8. How to re-run

```
# the counter over the hoops routes, three players (one hold of the gate lock each; the server on the lane's port)
node scripts/probes/gameplay-clean/build.mjs <site>
/home/user/wt/gate-run.sh 900 scripts/probes/hoops-audit/gc-hold.sh <site> <out> <jobs>                     # the counter's own player (no keyboard in 1v1 / 3v3!)
AUDIT=$PWD/scripts/probes/hoops-audit/mash-audit.mjs PLAYER=script|mash|idle /home/user/wt/gate-run.sh 900 scripts/probes/hoops-audit/gc-hold.sh <site> <out> <jobs>
node scripts/probes/hoops-audit/summary.mjs <out> --md
# headless (no browser)
npx tsx scripts/probes/hoops-audit/skill-vs-dice.mts
node scripts/probes/hoops-audit/dice-ledger.mjs --md
npx tsx scripts/probes/hoops-gap/rival-sim.mts --mode both --n 200 --tier all --def human
npx tsx scripts/probes/hoops-gap/defense-sim.mts --n 4000 [--stops]
# the hoops-gap rig (the intent bot): see scripts/probes/hoops-gap/run-set.sh
```
