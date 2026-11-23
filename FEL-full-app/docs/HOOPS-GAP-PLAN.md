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
3. **No pick-and-roll coverage on the ball** (§2.4): M, next.
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

## 6. Waiting on the owner (recommendation first; each is reversible)

1. **Feel `hoops.aiShotIqOn` in 3v3 PRO on defence.** *Recommend:* turn it on if the rivals feel smarter and not unfair; the rig check
   runs before the flip either way.
2. **The stepping defence clips** (the biggest gap): *recommend* a capture or authored pair of slides at 2.4–3.0 m/s (left and right from
   one source) and a turn-and-run, as an art job after the current kit work; GATE 0 before and after.
3. **Passing control:** *recommend* a held pass = lob, a double-tap = bounce, a plain tap = today's auto pick. A button-map call; it needs a
   hook in `ThreeVThreeMode.ts` (lane B's file while it runs).
4. **The pick-and-roll coverage:** *recommend* building it next (over the top on a shooter inside ~7.5 m, under one past it, a switch when
   beaten), shipped OFF for a feel test — it makes the AI harder to beat off a screen.

## 7. Flags and assumptions

- No existing tuned number was changed. New numbers: §5.1's six (all behind `hoops.aiShotIqOn`, off).
- Probe changes (additive): `rival-sim-3v3.mts` reports the contest at each release and takes `--def human` (it ignored the flag before);
  `slide-bench.mts` takes `INTENSE=1` (the sat-down slide).
- `assumption:` 220 ms is a fair human reaction for the "human" defender (rival-sim's 1v1 default, reused).
- `assumption:` the ranking in §3 weighs how often a player sees a thing over how much it costs to fix; it is a judgement, not a number.
- `assumption:` "what top sims do well" is general published knowledge of the genre (stepping defence, ball movement, pick-and-roll
  coverages, choosable pass types); nothing was looked up from or copied out of the named series.

## 8. How to re-run

```
# headless (no lock): the shot rulebook, the rivals, the defensive feet
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
