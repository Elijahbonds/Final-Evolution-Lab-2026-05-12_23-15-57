# Hoops: closing the gap — a measured gap audit and the plan (lane/hoops-gap, 2026-11-23)

The owner (2026-11-23): **"Can I get an agent working on making the gameplay for the basketball mode better. Still not 2ks equal. We're
close tho, let's close the gap and pass them."** The named series is the quality bar only: nothing of it (names, art, modes, UI,
animation data, sounds) is copied or proposed for copying. "What a top sim does" below is published, general knowledge of the genre.

This is phase 1 (the gap audit: §1–§4) and phase 2 (the first fixes: §5). It builds on, and does not undo, the earlier hoops work:
the AAA play audit (`docs/HOOPS-AAA-GAP-PLAY.md`, 2026-11-12), the goal-gap phases (`docs/HOOPS-GOAL-GAP.md`, hoops-p01…p09), the
gathers (`docs/HOOPS-GATHER-ESCAPE-PLAN.md`), the movement (`docs/MOVE-FEEL-DIAGNOSIS.md`), the play audit (`docs/HOOPS-PLAY-AUDIT.md`,
#678) and the camera (#681). Every owner decision in `docs/OWNER-DECISIONS.md` on hoops, movement, gathers, escapes, steals, the
camera and the builder stands; where one fixes a number or a rule here, this plan works around it.

Files of other lanes running now are not touched: `OneVOneMode.ts` / `ThreeVThreeMode.ts` (lane B, improve-hoops-2),
`CameraDirector.ts` (lane D), the physics arena. Everything built here is in the shared hoops systems.

## 0. The answer in one paragraph

The controls, the move vocabulary, the shot rulebook and the flow are at or near the bar now — measured: every flick answered in one
frame, a stick press moves the body in two, inside the green goes in and a masher makes 14 % of open threes, a crossover beats a
wrong-footed man every time and a set one never. What still separates us from the best basketball games is **what you watch the
other bodies do**. (1) **Defenders skate.** On the hero rig, the defensive slide's planted foot slides 4–10 cm a frame at the speeds
a defender really moves (the bar is 3 cm), a diagonal retreat 6–12 cm, the sat-down slide the AI plays on the ball 4–9 cm; every
defensive possession, every body, both modes. (2) **The rival team plays isolation basketball.** In 3v3 about two of three of their shots
are pull-ups taken with a man in their chest (contest 0.77–0.82, 30 % made; four of five against the rig's tighter scripted defender), they throw 0.24–0.34 passes a possession and score 0.51
points a possession at PRO against a defender with human reaction time — a top sim's AI moves the ball and finds the open man.
(3) The 3v3 defence has no pick-and-roll coverage on the ball (the man runs into the screener; away from the ball over or under is a coin), and (4) you cannot choose a pass (bounce, lob): the game
picks it. Built in this phase: **shot IQ for the 3v3 rivals** (`hoops.aiShotIqOn`) — they swing to the man his defender must close
out on, step back once for room, and kick out of a drive when the help comes: points a shot 0.627 → 0.666, passes 0.28 → 0.44,
catch-and-shoots ×2.1 (headless). Two foot-skate fixes were tried on the slide bench and **not** shipped (they measured too small or
worse); the skate needs new stepping clips, which is a GATE 0 art job (§6).

## 1. How it was measured

| Tag | Source | Where |
|---|---|---|
| **[HEAD]** | The real modules, headless, today on `48a7b244` + this lane: `hoops-p09/rulebook-measure.mts` (shooting, moves, dunks: expected values, no draws); `hoops-gap/rival-sim.mts` (the 1v1 rival's brain and kit, the 3v3 team offence on bodies, 200–300 seeded possessions a tier, the rig's scripted defender or a "human" one who sees the ball 220 ms late — this lane added `--def human` to the 3v3 half, and the contest at every release); `hoops-gap/slide-bench.mts` (the hero rig on NullEngine with the shipped clips, the tree and the leg layers: the planted-foot slide by the rig's own test, per direction and speed). | `scripts/probes/hoops-gap/`, `scripts/probes/hoops-p09/` |
| **[RIG]** | The real 1v1 / 3v3 in the hoops-gap browser rig (deterministic clock, seeded, the scripted player on both ends, `hoops-play/flow-ext.mjs`). | `scripts/probes/hoops-gap/drive.mjs` |
| **[PRIOR]** | Measured by an earlier lane, cited with its date and tip. | the doc named |
| **[C]** | Code read at `48a7b244`, `file:line`. | |

**Controls.** The slide bench is deterministic (the same run twice prints the same table); its left slide at 2.0 m/s reads 2.0 cm, the
gate, so a bad row is the clip, not the bench. rival-sim's off runs are the release exactly (the new knob at 0, `teamOffense3v3.shotIq.test`
pins it); three seeds a side, and a change is called only when the seeds' spreads do not overlap.

**Not measured this session: the browser rig.** The shared gate lock (one browser rig at a time across eight lanes) did not come to this
lane in the session: ten jobs were queued ahead, several holding it for up to two hours. The in-game numbers below are therefore
[PRIOR] (hoops-play, 2026-11-21 at `63a43402`: the release since then changed the camera and the hint lines, no play rule), and the
fix in §5 is measured headless only. The rig set is written and queued (§8).

## 2. The scorecard — each area against the bar

"At the bar" = no gap found that a player would feel. Size: S (a day), M (a few days), L (a lane). "Tuned?" = would the fix change a
number the owner has felt and signed off.

### 2.1 Ball handling

| Item | Measured now | The bar (what top sims do) | Gap | Fix | Tuned? | Size | Files |
|---|---|---|---|---|---|---|---|
| Move variety and chaining | 16 moves + a post game + size-ups (`core/HandleSystem.ts`); combos chain inside a combo window (owner 2026-10-20); left-hand set and the two-hand cross (p06, #384) [C] | a deep move list that chains, signature size-up rhythms | none felt | — | — | — | — |
| Answer to a flick | 47 / 48 flicks answered standing, 48 / 48 jogging, 17 ms to the move [PRIOR hoops-play] | one frame | at the bar | — | — | — | — |
| A move beats the man by his weight, not a roll | crossover vs a set man 0 %, wrong-footed / closing / airborne 100 % [HEAD rulebook D] | readable cause and effect | at the bar | — | — | — | — |
| Momentum, plant, stop-and-go | stop from a jog 150 ms / 0.29 m, a sprint 233 ms / 0.68 m; the six move-feel switches on (owner 2026-11-17); hesi v2 five held frames (owner 2026-10-20) [PRIOR] | weight you can feel, stops that bite | near the bar | — | — | — | — |
| Protecting the ball | the AI strips only with a hand on the ball (`hoops/steals.ts` aiStripLands); a protect dribble with the off arm [C] | a protect dribble and an arm bar | none felt | — | — | — | — |

### 2.2 Shooting

| Item | Measured now | The bar | Gap | Fix | Tuned? | Size | Files |
|---|---|---|---|---|---|---|---|
| Release window by shot | open three: green 104 ms; contest 0.5 → 64 ms, 0.8 → 44 ms; 4.5 m jumper 117 ms; a contested layup 62 ms [HEAD rulebook A] | the window shrinks with the contest and the range | at the bar (owner p09) | — | — | — | — |
| Skill against luck | open three: masher 14 %, a decent timer (45 ms) 76 %, a sharp one 100 %; a game's 20 shots: 6.1 / 29.5 / 47.8 points [HEAD rulebook B] | timing is the skill | at the bar | — | — | — | — |
| Make / miss feel | green = in, outside the green = out (early or late 0 %) [HEAD] — the owner's one rulebook | some sims give a slightly early shot a chance | **owner's rule**, not a gap to fix here | — | yes | — | — |
| Timing feedback | the banner names the grade with milliseconds; the meter shows the PERFECT band (owner 2026-10-14 / 10-20) [C] | clear, instant feedback | at the bar | — | — | — | — |
| Shot variety | set / pull-up / step-back (own release) / fade / hook / bank / floater; 11 finishes (`core/HoopsMoves.ts:137`) [C] | a package per shot type | near the bar | — | — | — | — |
| The pull-up three | the AI closes out on the gather: points a shot from a decent timer 1.71 → 0.91 at PRO [HEAD rulebook C] | no one exploit beats every tier | at the bar | — | — | — | — |

### 2.3 Finishing at the rim

| Item | Measured now | The bar | Gap | Fix | Tuned? | Size | Files |
|---|---|---|---|---|---|---|---|
| Gathers and pick-ups | the pick-up reads the bounce (1v1: within 8 cm of the palm 23 of 31; yanks 13 of 59 → 0) [PRIOR gather G1] | the ball meets the hand | near the bar | — | — | — | — |
| Combo finishes, dunk triggers | euro / hop into a dunk on (owner 2026-11-17); showtime and contact dunks; a mid-air adjustment on the right stick (owner 2026-11-12) [C] | packages you can trigger | near the bar | — | — | — | — |
| The hop step's planted foot | 4–14 cm a frame through `bball_hop_step` [PRIOR gather] | planted feet | gap (small) | re-key the clip's foot contacts | no | S | clip (GATE 0) |

### 2.4 Defence

| Item | Measured now | The bar | Gap | Fix | Tuned? | Size | Files |
|---|---|---|---|---|---|---|---|
| **Slide footwork (the skate)** | planted-foot slide p90, cm a frame [HEAD slide bench, the hero rig]: **slide right 4.5 at 1.5 m/s, 10.4 at 2.5**; slide left 1.9 / 4.2; **the sat-down slide (the AI's on-ball default inside 2 m) 4.2–5.9 at 1.5, 7.0–8.7 at 2.5**; **diagonal retreat 5.5 / 9.9 / 11.2 / 12.4 at 2.5 / 3.5 / 4.5 / 5.5**; straight back 1.0–3.9; the crossover step (over 2.8 m/s sideways) 0.1–0.2 but 15–20 leg pops in 2.5 s. 3v3 hero on defence, in play: p90 **10.95** [PRIOR hoops-p05b]; 1v1: 2.34 [PRIOR] | ≤ 3 cm (the repo's own gate M1); feet that plant | **the biggest visible gap** | stepping slide clips (the owner's standing "stepping defence" decision), a turn-and-run for the beaten diagonal (the body turns to the travel, the head stays on the man) | no | L | new clips (GATE 0), `anim/basketballTree.ts`, `core/StrideMatch.ts` |
| Cutting off a drive | the AI defender drops with the drive and steps up on a standing handler (`BasketballCore.ts` DefenderBrain); a drive into a set body bumps (DRIVE_BUMP 1.05 m) [C] | the body decides | near the bar | — | — | — | — |
| Contest, blocks | one contest model for all (owner 2026-10-20); blocks are the hand meeting the ball [C] | readable | at the bar | — | — | — | — |
| Help, switch, double (3v3) | the low man helps a drive; switch on a screen; a double in the paint [C] | rotations | near the bar | — | — | — | — |
| **Reading a pick-and-roll** | the ON-BALL man has no screen coverage: a screener within 1.2 m of the ball is skipped by the navigate read (`distXZ(foes[i], ball) < 1.2 … continue`, DefenderBrain), so he runs into the body and the 3v3 switch rule (`hoops/teamDefense.ts`) may swap marks; AWAY from the ball, over or under is a coin (`this.over = this.rng() < 0.6`) [C] | a coverage chosen by the handler: over the top on a shooter in range, under on one far out, a switch when beaten | gap | an on-ball coverage read (over / under / switch by the handler's range and the screen's spot), the coin replaced by the same read off the ball; behind a knob, OFF for a feel test (it makes the AI harder off a screen) | no | M | `core/BasketballCore.ts`, `core/HoopsOffball.ts`, `hoops/teamDefense.ts` |

### 2.5 Off the ball and passing

| Item | Measured now | The bar | Gap | Fix | Tuned? | Size | Files |
|---|---|---|---|---|---|---|---|
| **The rival team's ball movement** | 3v3 PRO, human-paced defender: **0.24–0.34 passes a possession**; screens 0.66; catch-and-shoots 8–12 % of shots; **pull-ups held in front 60–65 % of shots at contest 0.77–0.82 (30 % made)**; 0.51 points a possession, 0.63 a shot [HEAD rival-sim 3v3, three seeds] | the AI swings it, drives and kicks, finds the open man | **gap** | **shot IQ — built (§5)** | no | S | `hoops/teamOffense3v3.ts` |
| Passing control | the target is the stick cone or the most open man; the TYPE is chosen for you (a defender in the lane → bounce, a cutter at the rim → lob); a lead pass, a pass fake, the sling (`core/BallHandling.ts:122`, `ThreeVThreeMode.ts` ~2273) [C] | you choose bounce / lob / lead | gap | a held or double-tapped pass picks bounce / lob, the auto pick stays the default; a button-map call | no | M | `core/BallHandling.ts` + a hook in `ThreeVThreeMode.ts` (lane B's) |
| Screens, cuts, spacing | mates screen, roll or pop (`core/HoopsOffball.ts`), space on lanes, call for the ball, the alley-oop on a cut [C] | — | near the bar | — | — | — | — |

### 2.6 Physicality

| Item | Measured now | The bar | Gap | Fix | Tuned? | Size | Files |
|---|---|---|---|---|---|---|---|
| Bodies never pass through | 0 frames under 0.6 m root to root in 44 runs; closest 0.89 m [PRIOR hoops-play] | touch, never overlap | at the bar | — | — | — | — |
| Bumps and body-ups | contact poses (arm bar, forearm on the hip, chest to chest), reactions by direction and force, post contact, hand-checks, box-outs (owner 2026-10-20) [C] | contact that reads | near the bar | — | — | — | — |

### 2.7 Animation

| Item | Measured now | The bar | Gap | Fix | Tuned? | Size | Files |
|---|---|---|---|---|---|---|---|
| Foot planting and sliding | §2.4's skate is the worst of it; the hop step 4–14 cm [PRIOR] | ≤ 3 cm | gap (see §2.4) | §2.4 | no | L | as §2.4 |
| Pops at clip changes | the crossover step: 15–20 leg pops in 2.5 s on the bench (authored keys) [HEAD]; the hand change fixed in p06 [PRIOR] | ≤ 2 hard pops a minute (the gameplay-clean counter's bar) | gap | re-key or replace the authored crossover step (`bball_def_cross_run_*`) | no | M | clip (GATE 0) |
| Responsiveness against realism | the press answers in 1–2 frames while clips blend under the one transition rule (hoops-p04) [PRIOR] | both | near the bar | — | — | — | — |

### 2.8 Presentation

| Item | Measured now | The bar | Gap | Fix | Tuned? | Size | Files |
|---|---|---|---|---|---|---|---|
| Game flow | a make to the next live ball 0.25–0.8 s plus the check; replays at most 2.5 s, any press skips (owner 2026-11-12) [PRIOR] | quick, skippable | at the bar | — | — | — | — |
| Celebrations | a made-basket celebration, the crowd ooh on an ankle-breaker (owner 2026-10-20) [C] | cheap and skippable | near the bar | — | — | — | — |
| Sound on contact | 12 distinct sound ids across the two modes; a body bump is the shared `impact` / `thud` [C] | a sound per contact kind | small gap | a soft body thud by force, the sneaker squeak on a plant (CC0, owner 2026-11-12) | no | S | `core/HoopsSound*` / the shared kit |

## 3. The gaps, ranked by how much they would improve play

1. **Defenders skate** (§2.4): every defensive possession, every body, both modes, on screen all the time. Needs new stepping clips —
   an art job (GATE 0), then the tree. Two cheaper fixes were tried here and failed (§5.2).
2. **The rival team plays isolation** (§2.5): 3v3 on defence is where a player meets the AI most; smothered pull-ups and no ball
   movement read as a weak, predictable opponent. **Built: shot IQ** (§5.1).
3. **No pick-and-roll coverage on the ball** (§2.4): M. Built OFF (§5.3); measured not yet better than today's switch-everything.
4. **Passing is chosen for you** (§2.5): M, needs a button-map call and a hook in lane B's 3v3 file.
5. **The crossover step's pops** (§2.7): M, clip work (GATE 0).
6. **Sound on contact** (§2.8): S.
7. **The hop step's foot** (§2.3): S, clip (GATE 0).

## 4. What is at the bar (no fix proposed)

Control answer, move vocabulary and reads, the shot rulebook (the owner's), shot variety, gathers, contest and blocks, bodies that
never overlap, game flow and replays. The first three of these were the biggest gaps in the 2026-11-12 audit; they are closed.

## 5. Phase 2 — what was built and tried

Each change sits behind its own knob; off is today's game exactly (tests pin both ends).

### 5.1 Shot IQ for the 3v3 rivals — `hoops.aiShotIqOn` (built, ships OFF)

**What it does** (`hoops/teamOffense3v3.ts`): held in front (the planner's "stuck": contained for `hoops.rivalAttackPullUpSec` with no
move left), the handler (1) swings it to a team-mate whose man is at least `SWING_OPEN_M` 1.5 m off him, at least a pass length away,
with a clear lane — a catch his man must close out on — before he pulls up; with nobody to swing to, (2) he steps back once
(`STEPBACK_SEC` 0.38 s at `STEPBACK_MPS` 3.2 m/s away from a man inside `SMOTHER_M` 1.6 m), then pulls up; and (3) at the rim with a body
in his face (`HELP_FACE_M` 1.4 m: his man or the help), he kicks it to the open man (the release's kick read) instead of going up into
him. Off: the release's order (the pull-up first; the kick only when out of range; the finish whoever stands there). Every number is
new (the owner has felt none); none moves an existing one. No roll is added: the floor decides.

**Measured** [HEAD rival-sim 3v3, PRO, the defender sees the ball 220 ms late, 300 possessions × seeds 7 / 11 / 23]:

| | off (7 / 11 / 23) | on (7 / 11 / 23) |
|---|---|---|
| points a shot | 0.630 / 0.635 / 0.615 | **0.663 / 0.667 / 0.669** |
| points a possession | 0.514 / 0.527 / 0.480 | 0.533 / 0.547 / 0.511 |
| passes a possession | 0.24 / 0.34 / 0.27 | **0.44 / 0.44 / 0.43** |
| catch-and-shoots (of 300) | 21 / 29 / 20 | **45 / 54 / 50** |
| pull-ups (of 300) and their contest (median) | 160 / 160 / 153, 0.77–0.82 | 141 / 132 / 137, 0.72–0.75 |
| steals by the scripted defender | 44 / 36 / 52 | 49 / 46 / 59 |

By tier (seeds 7 / 11, the same defender): ROOKIE points a shot 0.435 / 0.426 → 0.465 / 0.458, ELITE 0.844 / 0.848 → 0.894 / 0.872;
points a possession ROOKIE 0.335 / 0.325 → 0.344 / 0.339, ELITE 0.698 / 0.696 → 0.742 / 0.683. Against the rig's tighter scripted
defender (no lag) the same direction, smaller: PRO points a shot 0.56 → 0.60.

**Read.** Points a shot is up on every seed and tier with no overlap at PRO; points a possession is up on average (0.507 → 0.530) but
the seeds' spreads overlap, and the scripted defender's steals go up a little (the ball is held longer and passed more — more pokes).
**Verdict: ships OFF.** The headless win is real but modest, and the brief's bar for ON (three rig runs a side plus a control, and the
phone-tier frame time) could not be run this session (§1). Recommendation: the owner plays 3v3 PRO on defence with it on, and the rig set
in §8 runs when the lock is free; it is a one-line flip (`AI_SHOT_IQ_ON`) once both agree. Its per-frame cost is a few distance checks,
only while the rival handler is held in front or at the rim. **Flag:** it makes the 3v3 rivals a little better at scoring — a change in
difficulty, which is why it waits for the owner's feel.

### 5.2 Tried on the slide bench and not shipped (no code kept)

- **The right slide on the left slide's mirror.** The two 78_30 slide captures are not a pair: the right one is 1.70 m/s against the
  left's 2.40, so it plays far above its cadence. Playing the left capture mirrored back across the body, at its own stride, for the right
  slide: 4.5 → 4.0 cm at 1.5 m/s, 10.4 → 8.3 at 2.5 m/s (the left itself reads 1.9 / 4.2). Too small for the risk of a new runtime clip on
  every body; reverted.
- **The drop step** (a diagonal retreat past the slide's reach plays the crossover step instead of the straight-back backpedal): worse —
  9.4–16.8 cm against the backpedal's 6.7–12.4, and 18–30 leg pops. The crossover step travels sideways, not on the diagonal. Reverted.

What the skate needs: clips that step at the speeds the bodies move (the owner's standing "stepping defence" decision, and the art jobs
already approved on 2026-11-12) — a slide pair captured or authored at 2.4–3.0 m/s both ways, and a turn-and-run for the beaten
diagonal (the body turned to the travel, the head on the man), which also needs the mode's facing (lane B's files).

### 5.3 Pick-and-roll defence — `hoops.pnrCoverageOn` (built, ships OFF; the coordinator's brief, 2026-11-23)

**What it does** (`hoops/pnrCoverage.ts`, wired in `core/BasketballCore.ts` DefenderBrain and `hoops/teamDefense.ts`; 3v3 only — a 1v1
brain has no mark and no screens): the man on the ball plays the screen — over the top on a handler inside `PNR_OVER_MAX_M` 7.5 m of the
rim, under past it (and a step deeper); the screener's man SHOWS into the corner the handler has to turn (over) or DROPS between his man
and the rim (under); the low man (the off-ball defender nearest the rim) tags a free roll man diving at the rim; the team defence
switches only when the screened man is beaten (the handler nearer the rim than him, or 1.9 m off him). Away from the ball the same read
replaces the 60 / 40 coin. Off is today exactly (`pnrCoverage.brain.test` pins the brain's steer frame for frame with the knob off).

**Measured** (`scripts/probes/hoops-close/pnr-sim.mts`: three AI defenders — DefenderBrain on AiMovers, re-marked by the team defence —
against the real 3v3 team offence, PRO, 300 possessions × seeds 7 / 11 / 23; a pick-and-roll possession is one where a screen was set):

| | today's coverage (control) | the coverage on |
|---|---|---|
| pick-and-roll possessions (of 300) | 204 / 212 / 215 | 173 / 171 / 170 |
| **points a pick-and-roll possession** | **0.597 / 0.604 / 0.579** | **0.655 / 0.635 / 0.592** |
| points a possession (all) | 0.587 / 0.597 / 0.602 | 0.641 / 0.684 / 0.638 |
| the handler's contest at his release (median) | 0.84 / 0.84 / 0.84 | 0.83 / 0.82 / 0.84 |
| **the roll man gets an open look** (rolling, inside 5 m, nobody within 2.2 m for 0.2 s) | **0 %** | **0 %** |
| the roll man gets the ball | 0 % | 0 % |
| switches a pick-and-roll | 0.26 / 0.28 / 0.25 | 0.36 / 0.32 / 0.31 |
| tags a pick-and-roll | 0 | 0.29 / 0.35 / 0.28 |

**Read.** The coverage makes this AI defence a little WORSE, not better: 0.593 → 0.627 points a pick-and-roll possession on average, and
0.595 → 0.654 overall. Today's rule — switch whenever the screener's man is nearer the handler — keeps a body in front of the ball; going
over or under means the screened man fights the screen (at 70 % pace) and is beaten more often, so the "switch when beaten" fires later
and more (0.26 → 0.33). A variant without the show (the screener's man always drops) measured the same (0.640 / 0.621 / 0.665). The coverage
reads work as written (the unit tests: over at 6.6 m, under at 9.2 m, the show and the drop steps, the tag, the switch only when beaten),
but every screen in these runs was set inside 7.5 m, so "under" was never played in the sim.
**Two findings for the next step:** (1) **the roll almost never happens** — against today's coverage the screener rolled once in 631 screens (67 frames of rolling); with
the show on, a handful of times (629 frames over 514 screens — the showing man leaves the lane), and the roll man was never open either
way, because the low man was there. He pops otherwise: his roll lane is "open" only when no defender is within 1.6 m of the line to the
rim (`core/HoopsOffball.ts` `rollLaneOpen`), and the low man at the rim nearly always is. So there is almost no roller to help: the tag
mostly fires on cutters. A real
pick-and-roll needs the screener to roll past his own man when that man steps up to the ball — an offence change, its own knob.
(2) the switch-everything defence is the strongest coverage in this sim; a coverage that beats it needs the on-ball man to get over the
screen without losing a step (a shorter fight-over cost, or the screener's man holding the handler with the show until he recovers).
**Verdict: ships OFF**, as asked, for the owner to feel; the numbers say it is not yet an improvement for the AI's defence.

### 5.4 A real roll man — `hoops.screenerRollOn` (built, ships OFF) — and the pick-and-roll re-measured four ways

**What it does** (`hoops/screenerRoll.ts`, wired in `core/BasketballCore.ts` TeammateBrain and `hoops/teamOffense3v3.ts`; 3v3): the
screener reads HIS OWN man, not the rim. At the screen's end he rolls when his man has stepped up to the ball (level with him or behind
him, or nearer the ball than him — a show, a hedge, a switch) or when nobody stands on the first `ROLL_NEAR_M` 2.5 m of his line; and
planted at least `SLIP_MIN_SEC` 0.25 s with his man already gone to the ball, he slips at once. The old whole-line read still rolls him
too. The handler (PRO and ELITE: the tier's `readsScreen`) hits the rolling man when he is open (`KICK_OPEN_M` 2.2 m) with a clear lane,
through the use and the attack — the release needed his own man to still be in his lane. Off is today exactly; mode files untouched.

**Measured** (`pnr-sim.mts`, PRO, 300 possessions × seeds 7 / 11 / 23, the four ways asked):

| | today (control) | roll only | coverage only | roll + coverage |
|---|---|---|---|---|
| **points a pick-and-roll possession** | 0.597 / 0.604 / 0.579 (**0.593**) | 0.650 / 0.655 / 0.626 (**0.644**) | 0.655 / 0.635 / 0.592 (**0.627**) | 0.605 / 0.581 / 0.542 (**0.576**) |
| the screener rolls (of pick-and-rolls) | 0 / 0 / 0.9 % | 24.9 / 27.9 / 30.2 % | 1.7 / 0.6 / 2.4 % | 37.9 / 44.4 / 44.1 % |
| the roll man's best separation inside 5 m (median of the rolls) | — | 0.95 / 1.08 / 0.99 m | 0.92 / 1.24 / 0.94 m | 0.94 / 0.96 / 0.93 m |
| **roll-man open looks** (nobody within 2.2 m for 0.2 s) | 0 % | 0 % | 0 % | 0 % |
| **roll-man catches** | 0 % | 0 % | 0 % | 0 % |
| points a possession (all) | 0.587 / 0.597 / 0.602 | 0.646 / 0.637 / 0.623 | 0.641 / 0.684 / 0.638 | 0.643 / 0.616 / 0.633 |
| switches / tags a pick-and-roll | 0.26 / 0 | 0.30 / 0 | 0.33 / 0.31 | 0.36 / 0.36 |

**Read.**
- **Against the roll, the coverage beats today's defence (defenders with no reaction delay; see §5.5 — with the game's delay it does
  not):** 0.644 → 0.576 points a pick-and-roll possession (−0.068, −11 %), no seed
  overlapping (the coverage's worst, 0.605, is under today's best against the roll, 0.626). That is the case a top-level defence must
  handle: when the screener really rolls, over-the-top plus the show, the tag and switching only when beaten defend it better than
  switching every screen. It even ends under today's pick-and-roll number with no roll (0.593).
- **Without the roll, the coverage is worse than today** (0.593 → 0.627, §5.3): switching every screen is the better answer to a screener
  who never rolls.
- **The roll man is never open and never catches it**, in any of the four: his own man stays attached (best separation about 1 m against
  the 2.2 m the pass needs), so the roll's points come from what it does to the defence (it drags his man and the help), not from the
  pass. A roll that gets him open needs either a slip before his man reads it (earlier, or out of a fake screen) or a pass read that
  takes a tighter window — the next tuning step if the owner wants the roll man to score.
- `assumption:` three AI defenders against the AI offence stand in for both directions in a game (the AI defending your team's
  pick-and-roll, and your AI mates defending theirs).

**Verdict: both switches ship OFF** for the owner to feel. (Superseded by §5.5: with the game's reaction delay in the sim, the coverage
does not beat today's defence against the roll; keep the coverage off.)

Not built (time): a fight over the screen that does not lose a step (§5.3's second finding).

### 5.5 The roll man scores — `hoops.rollScoreOn`, and a full-pace fight over — `hoops.pnrFightFullOn` (built, both ship OFF)

**What they do.** `hoops.rollScoreOn` (needs `hoops.screenerRollOn`; `hoops/screenerRoll.ts`): the EARLY SLIP (with his man already up at
the ball he goes the frame he plants), the GHOST SCREEN (coming to set it, inside `GHOST_RANGE_M` 1.5 m of the spot with his man already
gone to the ball, he cuts without planting), the LEADING PASS (the handler reads him where a chest pass meets him — his speed × the flight,
as the mode throws every 3v3 pass — open by `ROLL_LEAD_OPEN_M` 1.6 m there, with a clear lane), and THE CATCH IS A FINISH (inside
`ROLL_CATCH_RIM_M` 3 m of the rim he goes up at once, no triple-threat beat). `hoops.pnrFightFullOn` (needs `hoops.pnrCoverageOn`;
`hoops/pnrCoverage.ts`): the man on the ball fights over the top at full pace instead of `FIGHT_SLOW` 0.7 (the number is unchanged for
everyone else). Off = today exactly.

**A correction to §5.3–§5.4 first.** In the game every 3v3 AI defender sees the floor through its tier's reaction delay
(`hoops/reaction.ts` ReactiveDefender: 420 / 220 / 120 ms, owner 2026-10-20); the sim's defenders did not. pnr-sim now takes `LENS=1`
(the PRO 220 ms lens on every defender), and every number below is with it — the closer stand-in for the game. **With the lens, the
coverage no longer beats today's defence against the roll** (below), so §5.4's "beats today's defence" holds only for defenders with no
reaction delay.

**Measured** (pnr-sim, `LENS=1`, PRO, 300 possessions × seeds 7 / 11 / 23; "roll" = `screenerRollOn` + `rollScoreOn`):

| | today | roll | coverage | roll + coverage | roll + coverage + full-pace fight | (round 1: roll without the score parts) |
|---|---|---|---|---|---|---|
| **points a pick-and-roll possession** | 0.667 / 0.644 / 0.673 (**0.661**) | 0.681 / 0.697 / 0.701 (**0.693**) | 0.794 / 0.742 / 0.764 (**0.767**) | 0.752 / 0.735 / 0.659 (**0.715**) | 0.769 / 0.706 / 0.720 (**0.732**) | 0.712 / 0.710 / 0.658 (0.693) |
| points a possession, all (the offence overall) | 0.653 / 0.656 / 0.668 (0.659) | 0.667 / 0.673 / 0.701 (**0.680**) | 0.772 | 0.668 | 0.693 | 0.680 |
| the screener rolls | 0 % | 31–35 % | 1–2 % | 35–44 % | 33–45 % | 36–40 % |
| **roll-man catches** (of pick-and-rolls) | 0 % | **7.7 / 8.4 / 12.7 %** | 0 % | **4.8 / 5.6 / 8.2 %** | 3.4 / 7.0 / 7.9 % | 0–0.5 % |
| points a roll-man catch | — | 0.33–0.43 | — | 0.12–0.21 | 0.26–0.48 | — |
| **roll-man open looks, of rolls** (2.2 m clear, 0.2 s) | — | **0 %** | 0 % | 0–2 % | 0 % | 0 % |
| the same at the leading pass's 1.6 m | — | 0–1.8 % | 0 % | 0–8.2 % | 0–4.5 % | 2.7–3.2 % |
| the roll man's best separation inside 5 m (median) | — | 1.1–1.2 m | 1.0–1.1 m | 1.0–1.1 m | 1.0–1.1 m | 1.1–1.2 m |

**Read, against the brief's targets.**
- **Roll-man catches above 0: met** — 8–13 % of pick-and-rolls with the roll on (was 0), 5–8 % against the coverage.
- **Open looks 10–20 % of rolls: NOT met** — 0 % at 2.2 m, under 2 % at the pass's 1.6 m window. His man never leaves him by more than
  about 1.1 m, so the catches are contested: a catch is worth 0.33–0.43 points against today's defence and 0.12–0.21 against the coverage.
- **The offence overall is not broken:** 0.659 → 0.680 points a possession with the roll on.
- **The coverage against the roll:** 0.693 (today's defence) → 0.715 (the coverage) — slightly WORSE with the reaction delay, the seeds
  overlapping; the full-pace fight over does not help (0.732). The coverage alone is clearly worse than today (0.661 → 0.767).
- Why the roll man is never open: the defender guarding him plays the release's deny job (between his man and the rim, a third of the
  way), so a screener diving at the rim runs straight into his own man; and the low man helps the drive on top. An open roll needs the
  screener's man pulled AWAY from the rim — a hard show or a trap of the handler that the coverage does not do (its show is a step), or
  a slip before the screen is read, which the zero-lag rival planner never needs to make. That is the next design step: a real hedge
  (the screener's man out on the ball for half a second, and the recovery race to the roller), measured the same way.

**Verdict: all three switches stay OFF** (`hoops.screenerRollOn`, `hoops.rollScoreOn`, `hoops.pnrFightFullOn`, with
`hoops.pnrCoverageOn`). Recommendation: keep `hoops.pnrCoverageOn` off (worse than today with the game's reaction delay); the roll man
(`screenerRollOn` + `rollScoreOn`) is the one worth the owner's feel test on offence — the screener rolls, the handler finds him, the
offence scores a little more — but the roll man still does not get open.

### 5.6 Round 3 — the roll goes to the free block (inside `hoops.rollScoreOn`), and the full-pace fight over, re-measured

**What changed.** §5.5's roll man dived down his own line at the rim, straight into the man guarding him (the deny job sits a third of the
way from his man to the rim), so he was never more than about 1.1 m clear. Now, with `hoops.rollScoreOn`, he dives to whichever block
— `ROLL_BLOCK_SIDE_M` 2.0 m either side of the rim, `ROLL_BLOCK_OUT_M` 1.2 m out on the floor — has the most room from the defence
(`hoops/screenerRoll.ts` freeBlock; tested). New numbers, behind the switch. (A 1.6 / 1.0 m block measured on seed 7 only: 7.4 % open at
2.2 m against 6.8 % for 2.0 / 1.2, but 10 % at 1.6 m against 19 %; 2.0 / 1.2 kept.)

**Measured** (pnr-sim `LENS=1` — the game's PRO reaction delay on every defender — 300 possessions × seeds 7 / 11 / 23):

| | today | roll | coverage | roll + coverage | roll + coverage + full-pace fight |
|---|---|---|---|---|---|
| **points a pick-and-roll possession** | 0.667 / 0.644 / 0.673 (**0.661**) | 0.669 / 0.659 / 0.759 (**0.696**) | 0.794 / 0.742 / 0.764 (**0.767**) | 0.728 / 0.728 / 0.718 (**0.725**) | 0.728 / 0.629 / 0.730 (**0.696**) |
| points a possession, all | 0.659 | **0.697** | 0.772 | 0.683 | 0.697 |
| the screener rolls | 0 % | 36–41 % | 1–2 % | 30–41 % | 28–38 % |
| the roll man's best separation (median) | — | 1.4–1.5 m (was 1.1–1.2) | 1.0–1.1 m | 1.3–1.5 m | 1.3–1.4 m |
| **roll-man catches** (of pick-and-rolls) | 0 % | **15.9 / 19.4 / 16.0 %** | 0 % | 19.7 / 14.7 / 11.3 % | 18.4 / 17.9 / 9.4 % |
| points a roll-man catch | — | 0.42 / 0.57 / 0.84 | — | 0.51 / 0.88 / 0.65 | 0.69 / 0.42 / 0.99 |
| **roll-man open looks, of rolls** — at the pass's 1.6 m | — | **18.6 / 15.9 / 15.2 %** | 0 % | 21.3 / 8.3 / 14.7 % | 21.3 / 12.8 / 25.7 % |
| — at the stricter 2.2 m | — | 6.8 / 7.9 / 6.1 % | 0 % | 14.9 / 2.1 / 2.9 % | 6.4 / 7.7 / 5.7 % |

**Against the brief's targets.**
- **Roll-man catches above 0: met** — 16–19 % of pick-and-rolls against today's defence (§5.5: 8–13 %; before the roll man: 0).
- **Open looks 10–20 % of rolls: met at the leading pass's 1.6 m window (15–19 %)**; at the stricter 2.2 m, 6–8 %.
- **The offence overall is not broken:** 0.659 → 0.697 points a possession (up 6 %).
- **The defence against the roll:** today's switch-every-screen 0.696; the coverage 0.725 (worse); **the coverage with the full-pace fight
  0.696 — level with today, not better** (the seeds overlap: 0.629–0.730 against 0.659–0.759). So the fight over without losing a step
  is what brings the coverage back to today's level against a real roll; nothing here beats today's switch.

**Verdict: all OFF.** Recommendation, for the owner's feel test: the roll man on offence (`hoops.screenerRollOn` 1 + `hoops.rollScoreOn` 1)
— the screener rolls, gets open and is found, and the rival offence scores a little more. The coverage (`hoops.pnrCoverageOn`, with
`hoops.pnrFightFullOn` if it goes on at all) stays off: at best it matches today's defence.

### 5.7 Sound on contact — `hoops.contactVoiceOn` (built, ships OFF)

**What was there** (§2.8): every contact in 1v1 / 3v3 — a bump, a chest-to-chest check, a knockdown, a strip, a poke, a parry, a block —
plays SoundKit's `impact`, a square-wave boop with a noise crack, at a pitch per kind; the modes already sort them by pitch (hands on the
ball 1.2–1.5, bodies 0.7–1.0) and already debounce a repeated pair (OneVOneMode's `hardHitGate`). The rim has three recordings and the
backboard its own (`glass`), so those had variety already.

**What it does** (`audio/hoopsSfx.ts` contactVoice, applied in `audio/SoundKit.ts` play; no mode file, no new sound file): with the switch
and the court's sample bank active, an `impact` is re-voiced from the kit's own sounds — a hand on the ball (pitch ≥ 1.2) is the recorded
palm-on-leather slap (`catch`, pitched down) over a short knock (`thud` at 1.4); a body is the low, ringless `thud`. The volume each call
asks for is kept. Two contacts inside `CONTACT_MIN_GAP_SEC` 60 ms are one (on that audio context's own clock: a rebuilt context starts
afresh — a bug in the first draft, caught by the loudness probe, fixed and tested). Off the court (no hoops bank) the impact stays the
impact. **The mute silences it** (tested: `SoundKit.contactVoice.test`, the fake Web Audio graph — nothing starts with the effects off).

**Levels** (`scripts/probes/hoops-sound/loudness.mts`, Chromium, SoundKit's own graph, the loudest 50 ms at the limiter): today's impact
at the modes' contact pitches and volumes — a bump (0.95, vol 0.55) −37.3 dB, a body-bag (0.82, 0.70) −35.4, a knockdown (0.70, 0.80)
−34.1, a strip (1.3, 0.45) −39.2, a parry (1.5, 0.5) −38.4. With the contact voice at the first draft's
gains (hand 1.0, knock 0.35, body 0.9): the bump −35.3, the body-bag −33.2, the knockdown −31.8 (bodies 1.9–2.3 dB over today), the strip
−42.4, the parry −41.5 (hands 3.1–3.2 dB under). The gains were then set to land on today's level (body × 0.79 → 0.71; hand and knock
× 1.45 → 1.45 / 0.5): computed from those offsets (a linear gain), re-measured below if the probe's hold came in time.
**Re-measured at the shipped gains** (three renders each): the bump −37.0 (today −37.3), the body-bag −34.9 (−35.4), the knockdown −33.5
(−34.1), the strip −39.5 (−39.2), the parry −38.8 (−38.5) dB — every contact within 0.7 dB of the impact it replaces; each sounds
0.11–0.15 s (today 0.09–0.10).

**Verdict: ships OFF.** It is a feel item — the owner judges a slap and a thud against the boop by ear.

### 5.8 The stepping-defence clips drop in by name — `hoops.steppingDefenceOn` (wired, ships OFF until the clips exist)

`anim/basketballTree.ts`: with the switch on, each state in §6b's list plays its new clip when the rig owns it — as `bball_mc_<name>` (the
capture pipeline) or `bball_<name>` (authored) — forward, paced against the stride the list asks for (the slides 2.4 m/s, the sat-down
slides 2.5, the turn-and-run 4.0): `defend_slide_left_v2`, `defend_slide_right_v2`, `defend_slide_hard_left_v2`,
`defend_slide_hard_right_v2`, and for the beaten diagonal (a retreat 100–160° off the chest, in above 2.6 m/s, out under 2.2) the
`def_retreat_run_left` / `_right` pair, played inside the backpedal's own state with its own travel (135°) for the pelvis steer. A clip the
rig does not own plays today's clip exactly: tested (`basketballTree.stepping.test`: the same plays, clip for clip, with the knob on and
no new clips), and on the slide bench with the knob on and no new clips the numbers are today's to the decimal (right 4.5 / 10.4 cm at
1.5 / 2.5 m/s, back-left 2.7 / 5.6). #7 and #8 of §6b (the crossover step and the hop step re-keyed) keep their names and need no wiring.
When the owner's clips land: put them on the rig under those names, turn the switch on, run the slide bench (§8) against §6b's bar.

## 6. Waiting on the owner (recommendation first; each is reversible)

1. **Feel `hoops.aiShotIqOn` in 3v3 PRO on defence.** *Recommend:* turn it on if the rivals feel smarter and not unfair; the rig check
   runs before the flip either way.
2. **The stepping defence clips** (the biggest gap): *recommend* a capture or authored pair of slides at 2.4–3.0 m/s (left and right from
   one source) and a turn-and-run, as an art job after the current kit work; GATE 0 before and after.
3. **Passing control:** *recommend* a held pass = lob, a double-tap = bounce, a plain tap = today's auto pick. A button-map call; it needs a
   hook in `ThreeVThreeMode.ts` (lane B's file while it runs).
4. **The pick-and-roll coverage** (built OFF, §5.3): *recommend* leaving it off — measured, today's switch-everything defends the screen
   better. Next, the screener's roll (it never rolls today), then a fight-over that does not lose a step; then re-measure.

## 6b. The clip list for the stepping defence (the GATE 0 art job, for the owner)

Each on the 22-bone unprefixed FEL rig (GATE 0 before and after), a loop with a seamless seam, at least two full steps a loop, and the
planted foot still (under 1 cm of travel a frame) through its stance at the stride speed named. Acceptance for each: the slide bench
(`scripts/probes/hoops-gap/slide-bench.mts`) reads planted-foot p90 ≤ 3 cm a frame at every speed listed, and at most 2 leg pops in its
2.5 s run. Today's number for each is in brackets.

| # | Clip (new name) | Replaces | Travel, relative to where the chest faces | Stride speed at rate 1 | Must read clean at | Today |
|---|---|---|---|---|---|---|
| 1 | `bball_defend_slide_left_v2` | `bball_mc_defend_slide_left` (CMU 78_30) | straight left, chest square | 2.4 m/s | 1.5, 2.0, 2.5, 2.7 m/s | 1.9 / 2.0 / 4.2 / 4.7 cm |
| 2 | `bball_defend_slide_right_v2` (the exact mirror of #1, from the same take) | `bball_mc_defend_slide_right` (CMU 78_30, 1.70 m/s) | straight right | 2.4 m/s | 1.5, 2.0, 2.5, 2.7 m/s | 4.5 / 7.8 / 10.4 / 9.7 cm |
| 3 | `bball_defend_slide_hard_left_v2` | `bball_mc_defend_slide_hard_left` (CMU 78_26) | left, the sat-down stance (hips low, hands wide) | 2.5 m/s | 1.5, 2.0, 2.5 m/s | 5.9 / 8.0 / 8.7 cm |
| 4 | `bball_defend_slide_hard_right_v2` (the mirror of #3) | `bball_mc_defend_slide_hard_right` | right, sat-down | 2.5 m/s | 1.5, 2.0, 2.5 m/s | 4.2 / 5.6 / 7.0 cm |
| 5 | `bball_def_retreat_run_left` | the backpedal on a diagonal | back-left at 135° off the chest: hips open toward the travel, chest and head turned back to the man | 4.0 m/s | 2.5, 3.5, 4.5, 5.5 m/s | 5.5 / 9.9 / 11.2 / 12.4 cm |
| 6 | `bball_def_retreat_run_right` (the mirror of #5) | the same | back-right at 135° | 4.0 m/s | as #5 | as #5 |
| 7 | `bball_def_cross_run_left` / `_right`, re-keyed | the authored crossover step (H2c) | straight sideways, running | 2.8 m/s | 3.0, 3.5, 4.5 m/s | feet 0.1–0.2 cm, but **15–23 leg pops** a run |
| 8 | `bball_hop_step`, foot contacts re-keyed | itself | — | — | the hop's plant | 4–14 cm a frame [PRIOR gather] |

Priority: #1–#2 first (the slide every defender plays most), then #3–#4 (the AI's on-ball slide), then #5–#6, then #7–#8. #5–#6 also
need a small hook in the modes' defensive facing (the hips may open while the chest stays on the man), which is lane B's file while it
runs. Code after the clips (this lane or the next): the tree's state table and the stride references (`anim/basketballTree.ts`,
`core/StrideMatch.ts`), each new clip behind its own knob, off = today's clip.

## 7. Flags and assumptions

- No existing tuned number was changed. New numbers: §5.1's six (behind `hoops.aiShotIqOn`, off), §5.3's fourteen (behind
  `hoops.pnrCoverageOn`, off) §5.4's four (behind `hoops.screenerRollOn`, off), §5.5's five and §5.6's two (behind `hoops.rollScoreOn` and `hoops.pnrFightFullOn`,
  off); all listed in docs/FEEL-PANEL.md.
- `assumption:` (§5.3) three AI defenders against the AI offence stand in for the AI defending your team's pick-and-roll in a game (the
  handler is the AI's planner, not you).
- Probe changes (additive): `rival-sim-3v3.mts` reports the contest at each release and takes `--def human` (it ignored the flag before);
  `slide-bench.mts` takes `INTENSE=1` (the sat-down slide).
- `assumption:` 220 ms is a fair human reaction for the "human" defender (rival-sim's 1v1 default, reused).
- `assumption:` the ranking in §3 weighs how often a player sees a thing over how much it costs to fix; it is a judgement, not a number.
- `assumption:` "what top sims do well" is general published knowledge of the genre (stepping defence, ball movement, pick-and-roll
  coverages, choosable pass types); nothing was looked up from or copied out of the named series.

## 8. How to re-run

```
# headless (no lock): the shot rulebook, the rivals, the defensive feet, the pick-and-roll
FEEL='{"hoops.pnrCoverageOn":1}' npx tsx scripts/probes/hoops-close/pnr-sim.mts --n 300 --tier pro --seed 7
npx tsx scripts/probes/hoops-p09/rulebook-measure.mts
FEEL='{"hoops.aiShotIqOn":1}' npx tsx scripts/probes/hoops-gap/rival-sim.mts --mode 3v3 --n 300 --tier pro --seed 7 --def human
npx tsx scripts/probes/hoops-gap/slide-bench.mts --speeds 1.5,2.5,3.5,4.5,5.5 --dirs left,right,back,backleft --over none,hand_up --json out.json
INTENSE=1 npx tsx scripts/probes/hoops-gap/slide-bench.mts --speeds 1.5,2.0,2.5 --dirs left,right --over none
# the rig (one hold of the gate lock): natural games, both modes, four seeds; then the 3v3 shot-IQ A/B (three a side + a control)
node scripts/probes/hoops-gap/build.mjs <site> base --dev
/home/user/wt/gate-run.sh 890 scripts/probes/hoops-gap/run-set.sh <site> <out> \
  "threevthree ext TAG=iq0-7 SEED=7 PAGE=base NODRAW=1 WD_OFF=1 VIEW=320x180 FLOW_FRAMES=3000 EXT=$PWD/scripts/probes/hoops-play/flow-ext.mjs FEEL={\"hoops.aiShotIqOn\":0}" \
  "threevthree ext TAG=iq1-7 SEED=7 PAGE=base NODRAW=1 WD_OFF=1 VIEW=320x180 FLOW_FRAMES=3000 EXT=$PWD/scripts/probes/hoops-play/flow-ext.mjs FEEL={\"hoops.aiShotIqOn\":1}" ...
node scripts/probes/hoops-play/events.mjs <out>/*.json; node scripts/probes/hoops-play/flow.mjs <out>/*.json
```
