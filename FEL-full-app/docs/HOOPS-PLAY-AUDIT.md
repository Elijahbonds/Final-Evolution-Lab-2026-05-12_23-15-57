# Hoops: what makes 1v1 and 3v3 play worse — a measured audit (lane/hoops-play, 2026-11-21)

The owner (2026-11-21): **"Gameplay could still be improved greatly."** He had just said the 1v1 follow camera made it hard to play;
the camera is the hoops-cam lane's and is not measured or touched here. The bar is the best basketball games, as a quality bar only
(nothing of theirs is copied).

This is phase 1 (the audit) and phase 2 (the top three fixes, each behind its own knob) of that brief. The earlier play audit
(`docs/HOOPS-AAA-GAP-PLAY.md`, 2026-11-12) found fourteen sinkers; most of its top ones were fixed since by hoops-p06 (the hand change),
hoops-p09 (one rulebook: the release decides the shot, moves read the man), hoops-flow (any press skips a replay, the 3v3 clock),
move-feel (the six movement switches) and the gather lanes. This audit re-measures play at `63a43402` (lane/finish-release) and ranks
what is left.

## 0. The answer in one paragraph

The controls answer at the bar (a stick press moves the body in 2 frames, a stop from a jog takes 150 ms, every flick answers in one
frame) and bodies never pass through each other. What makes play worse now is **the other side of the ball**. On defence, **reaching is
too strong**: against a scripted player who pokes about once a second the hero stripped the 1v1 rival on half of his possessions and the
3v3 rivals on 14 of 16, so the PRO rivals hardly ever got a shot off (1v1: 1.2 shots a minute, 3 made of 10; 3v3: one shot in three
minutes) and games ran 10–0 and 12–0. In 1v1, **a long rebound stops the game**: the rival never goes for a loose ball, so a quarter of
1v1 boards sat on the floor until the mode's 4 s stall guard teleported both players to the check (3v3, whose AI does chase, never
stalled). And **the first press of every game is slow** — 383 ms against 33 ms for every later press — because the opening broadcast
intro holds the game through its whole camera hand-over.

## 1. How it was measured

| Source | What it is | Where |
|---|---|---|
| **[FLOW]** natural games | The real 1v1 / 3v3 (esbuild dev bundle) in the hoops-gap rig, Chromium on SwiftShader, the rig's deterministic 1/60 s clock and seeded random, PRO; the rig's scripted "intent bot" plays both ends (it drives with a sway, flicks a random move every 0.9–2.3 s, shoots at 2–6 s or near the rim with a timing error of 0.75 of the green, defends 1 m in front of the driver on his line to the rim, pokes half the time it is inside 1.6 m every 0.6–1.6 s, jumps 220 ms after a gather). 50–60 s of game a run, five seeds a side, no seams forcing possessions. Every frame: the score, who has the ball, a replay on, the hero, the ball-side rival and the ball. | `scripts/probes/hoops-play/flow-ext.mjs` (an `ext` scenario for `hoops-gap/drive.mjs`), read by `flow.mjs`, `events.mjs`, `ab.mjs` |
| **[INPUT]** input → response | The hoops-gap rig's `input` scenario (stick onset, pace, reversal, stops, shot press, a shot tapped mid-spin / mid-crossover, the eight flicks standing and jogging), three seeds per mode. | `hoops-gap/drive.mjs input`, read by `hoops-play/input-table.mjs` |
| **[HEAD]** headless | The real modules: `move-feel/stick-feel.mts` (the DribbleController), `hoops-p09/rulebook-measure.mts` (the one rulebook), `hoops-gap/rival-sim.mts` and `defense-sim.mts` (the brains over hundreds of possessions). | as named |
| **[C]** code | `file:line` at `63a43402`. | |

**Controls checked first (how far the rig can be trusted).**
- *A NODRAW run used to stop at ~10 s of play.* The page's RenderWatchdog read the undrawn canvas as black, ran its rescue (lights ×1.5)
  at ~5 s and set the phase to `error` at ~10 s (`docs/MOVE-FEEL-DIAGNOSIS.md` §0). New `WD_OFF=1` (drive.mjs, NODRAW runs only) makes the
  watchdog's 64×64 luma sample read a lit frame. With it a 50 s game takes ~65 s of wall instead of ~640 s drawn. No run here logged a
  watchdog line.
- *Two runs of one seed.* Seed 7 twice in one hold (`a7`, `a7b`): identical, frame for frame, over 2 880 frames. **But this is not
  guaranteed:** two later runs of the identical configuration (`ctloff`, `off7`) first differ at frame 40, by 1 mm on the rival's root,
  and the games then diverge (the same frame-40 split shows between batches; drawn and NODRAW runs of one seed also split, at frame 327).
  assumption: a load-timing dependency (the order in which load-time work lands before the clock starts); not chased further. So **a seed
  is a sample, not a replay**: every comparison below is pooled over five seeds a side, never one run against one run.
- *The rig against the headless controller.* The rig's stops read exactly the headless DribbleController's (jog 150 ms / 0.29 m, sprint
  233 ms vs 217 ms / 0.68 vs 0.69 m), as move-feel found.
- *The bot is not a person.* It pokes a lot, never shoots free throws (the flow scenario shoots them out for it, as `drive.mjs`'s
  possession loop does), only chases a loose ball within 6 m, and shoots whenever it has the ball near the rim. Each finding below says
  where the bot's style could be the cause.

## 2. The ranked list

Ranked by how much it hurts × how often a player meets it. "Tuned number?" = whether the proposed fix changes a number the owner has
already felt and signed off.

| # | What is wrong | The number behind it | The proposed fix | Tuned number? |
|---|---|---|---|---|
| 1 | **Reaching steals too easily; the AI cannot protect the ball.** The hero strips the rival on most of his possessions, so the rivals barely get to play offence and games are one-sided. | [FLOW] 1v1: **6 steals in 11 rival possessions** (0.55), 17 % of pokes; 3v3: **14 steals in 16** (0.88), **52 % of pokes**; reach-in fouls 17 % / 4 % of pokes. Rival shots **1.2 a minute** in 1v1 (3 of 10 made), **one shot in 3 minutes** in 3v3. Scores 12–0 in 48 s, 10–0 in 60 s. Cause: my poke lands on the exposure READ alone — in range (1.6 m) and the ball "exposed", and the 1v1 rival's ball reads exposed through about 61 % of every weave of a plain drive (`BasketballCore.ts:1490–1493`), whichever hand it is in; a bump makes any ball exposed for 0.4 s (`HoopsDefense.ts` bumpExposure). The AI's strip on ME is already a hand on the ball (`hoops/steals.ts` aiStripLands: reach, the body's shield, the ball off the palm). | **One rule for the strip, both ways**: my poke must also pass the AI's hand-on-the-ball test. Built: `hoops.myStripHandOn` (§5.1). | No (a new rule on top; every existing number unchanged) |
| 2 | **In 1v1 a long rebound stops the game.** Nobody goes for a ball that bounces off the rim and rolls away; after 4 s the mode gives up and teleports both players to the check. | [FLOW] **4 of 16 1v1 boards stalled the full 4 s**, median miss → board **2.3 s**; on the stalled ones the ball sat 6–14 m away. 3v3, whose AI chases every loose ball, **0 stalls in 9, median 0.8 s**. Cause: 1v1 never calls the brain's `chaseBall` (3v3 does, `ThreeVThreeMode.ts:3466–3473`); on my miss the rival holds his box-out seal, on his miss he crashes at 3 m/s after his follow-through (`OneVOneMode.ts:2448–2454`). | **The rival goes and gets it** (3v3's rule on the 1v1 rival). Built: `hoops.rivalChaseBoardOn` (§5.2). | No |
| 3 | **The AI offence gets little done.** Even when he keeps the ball, the PRO rival rarely scores. | [FLOW] 1v1 rival possession median **10.4 s** (mostly the 4 s size-up at the top, `hoops.rivalSizeUpSec`); his contested jumpers miss by 118–179 ms against a ±15–22 ms green (his PRO timing hand, `hoops.aiTimingProMs` 71 ms). [HEAD] rival-sim with a human-like defender: PRO jumpers 24 %, layups 43 %, 4.6 s possessions. Much of #3 is #1 (he loses the ball before he shoots). | Fix #1 first and re-measure; then, if he still cannot score, it is the AI timing hands of hoops-p09 (chosen numbers, re-picked once already) — an owner call, not built. | Yes, if it comes to the timing hands |
| 4 | **The first press of every game is slow.** Push the stick when the intro ends and nothing happens for about a third of a second. | [INPUT] the first stick press: **383 ms (23 frames)** to move the body in all six runs (1v1 and 3v3, three seeds); every later press **33 ms**. Cause: `hoopsBroadcast.holdIntro` returns the mode's whole update while the intro is on screen (`court/mount/hoopsBroadcast.ts:55–59`), and a press only starts the camera's 0.35 s hand-over (`CameraDirector.skipIntro`, INTRO.skipSec), so play waits for the camera. | **The press that skips the intro starts play on the next frame**, the camera's hand-over unchanged. Built: `hoops.introPressPlaysOn` (§5.3). | No |
| 5 | **1v1 makes a shot wait out a spin; 3v3 does not.** | [INPUT] a shot tapped 0.1 s into a spin: 1v1 **533 ms** press → shot (it fires the frame the spin clears); 3v3 **17 ms** (the shot cuts the spin). A crossover: 17 ms in both. | One rule for both modes — either the shot cuts the spin after its first half in both, or both buffer it. A move-feel call for the owner; not built. | Possibly (the spin's commitment is felt) |
| 6 | **A "ghost" shot after a make.** After a 1v1 make the hero has the ball under the rim during the 0.7 s banner, and a shot taken then cannot count. | [FLOW] 10 of 31 makes were followed by a gather inside 0.75 s. Mostly the bot (it shoots whenever it has the ball near the rim); a human mashing Square would see it. Cause: `carrying = true` at the make, the reset 0.7 s later (`OneVOneMode.ts:1394, 1403`). | Hold the shot during the make beat (or reset at once). Small; not built. | No |
| 7 | **Readability.** | The rig pictures (§3.7): who has the ball and where the defender is read at the rig's distance; the one thing that does not read is a loose ball rolling away while both bodies stand (#2). Not measured further: the camera that frames it is the hoops-cam lane's. | — | — |

**At the bar (measured, no fix needed):**
- **Input → motion** [INPUT, three seeds, both modes]: stick onset 33 ms after the first press; 90 % of the walk's pace 233 ms; reversal
  83–200 ms; stops 150 ms / 0.29 m (jog) and 233 ms / 0.68 m (sprint); shot press → meter and body 17 ms; every flick answered (47 of 48
  standing, 48 of 48 jogging), 17 ms to the move. The turbo's 90 % in 317–350 ms is the owner's own `hoops.kickSec` 0.1 (move-feel).
- **Collisions** [FLOW]: in all runs, 0 frames with two roots under 0.6 m; the closest pair 0.89 m (3v3) / 1.06 m (1v1).
- **Possession flow after a score** [FLOW]: 0.25–0.8 s of banner, then the check is instant (0.03 s to the first live frame); a big-play
  replay holds at most 2.5 s and any press skips it (hoops-flow).
- **Shooting** [HEAD, rulebook-measure]: inside the green goes in, outside misses; a masher makes 14 % of open threes against a decent
  player's 76 %; the banner names the grade with milliseconds. The rival's makes are #3.

## 3. The evidence, item by item

### 3.1 Reaching (#1)

[FLOW] at `63a43402` (no knob changed), PRO, the bot on both ends:

| | 1v1 (8 runs, 6.8 min) | 3v3 (3 runs, 3.0 min) |
|---|---|---|
| rival possessions | 11 | 16 |
| my steals (strip on the read / on the bump, drive-by, parry-vault) | 6 (3 read, 1 bump, 2 drive-by) | 14 (4 on the bump, 4 on the read, 5 drive-by, 1 parry) |
| steals a rival possession | **0.55** | **0.88** |
| pokes / steals a poke / reach-in fouls a poke | 36 / 0.17 / 0.17 | 27 / **0.52** / 0.04 |
| rival shots a minute (made) | 1.18 (3 of 10 over all 1v1 runs) | **0.33** (the rivals scored 2 points in 3 min) |
| final scores | 12–0, 6–0, 2–4, 2–0, 6–0, 6–0, 2–0, 4–0 | 4–0, 8–2, 10–0 |

(A "rival possession" is a stretch of frames in which the rig's possession code says they hold the ball — in 3v3 a loose ball can split one
possession in two, so the 3v3 ratio is a little generous to the rivals; the steal counts are the modes' own log lines.) The rule today (`OneVOneMode.ts:2407`, `ThreeVThreeMode.ts:1447–1450`): in range (1.6 m), the rival not in his check or
gather, and the exposure at least 0.5 — the crossing of a move (1.0 while it crosses), the sway of a drive (|lateral speed| / 2.4 m/s:
about 61 % of the 1v1 weave reads ≥ 0.5), or 0.75 inside 0.4 s of a body bump. Nothing asks where the ball is relative to his body.
Against that, the AI's strip on me since hoops-p02 is "a hand on the ball": within 1.2 m of the ball, my body not between his hand and the
ball (0.25 m), the ball below 0.85 m unless a bump jarred it (`hoops/steals.ts:79–103`). The bot pokes far more than most players will;
its 52 % hit rate in 3v3 is the rule's, not the bot's.

### 3.2 The 1v1 loose board (#2)

[FLOW], 16 resolved 1v1 boards over eight runs: 0.13, 0.13, 0.78, 0.78, 0.93, 1.6, 1.83, 2.13, 2.3, 2.3, 3.23, 3.23, **4, 4, 4, 4** s
(the 4.0 s ones are the stall guard: "[1V1-BOARD] nobody came down with it", then a teleport to the check). Two traced (seed 7):
- the rival's layup off the front rim: for 4.4 s both bodies stood within 1.5 m of the rim, moving under 0.15 m/s, while the ball rolled to
  11 m away; then the race and the teleport;
- the rival's three off the right iron: the ball ran 9 m to the sideline; he barely moved for 1.3 s (his follow-through), then crashed at
  under 3 m/s and was still 6 m off when the guard fired;
- on MY miss (seed 7, frame 1653): he stood on his seal ("foe d=11.96 sealing") the whole 4 s.
3v3 over three runs: 9 boards, median 0.8 s, no stall — every AI body there chases (`ThreeVThreeMode.ts:3466–3473`, "EVERY AI BODY GOES
FOR IT"). The bot only chases within 6 m, so on the hero's side a human would often get there first; the rival never does.

### 3.3 The AI offence (#3)

1v1 rival possessions [FLOW] (11, seeds 7–47): median 10.4 s; ended by my steal 5, a shot 6. His shots: a late fadeaway three (179 ms off
against a ±15 ms green), a late jumper (118 ms off, ±22 ms), an early layup (72 ms off, ±35 ms), two perfect ones that went in. The size-up
(`hoops.rivalSizeUpSec` 4 s × tier) is most of the length; it is play (probe moves at the top), not dead time.

### 3.4 The first press (#4)

[INPUT] `stick` test, first press of the run, both modes, seeds 7 / 11 / 23: onset **23 frames** every time (the second press: 2). The log
shows the game's first frame of play (the rival's first job, the hero's first gear change) 21 frames after the press — the intro's
hand-over (`INTRO.skipSec` 0.35 s) — not a swallowed press: the harness passes the press on and starts the hand-over
(`core/ModeHarness.ts:860`), but `holdIntro` keeps returning the mode until the intro is gone.

### 3.5 The spin and the shot (#5)

[INPUT] `buffer` test (Square tapped 0.1 s into the right-stick spin): 1v1 press → shot 517–550 ms, spin clears → shot 0–17 ms (the shot
buffer holds it to the spin's end, by design since hoops-p01); 3v3 press → shot 17 ms (the shot starts at once and the spin is gone).

### 3.6 The ghost shot (#6)

[FLOW] 31 makes in 14 runs; after 10 of them a gather or a release was logged within 45 frames (before the reset): e.g. seed 11, make at
frame 184, "[1V1-SHOT] gather reverse" at 185, released at 209, missed — none of it counts.

### 3.7 Readability (#7)

The rig's drawn pictures (`scratchpad/hoops-play/pic1`, 400×225) — the ball carrier's ring and the bodies read; the defender's place
reads in 1v1. The moment that does not read is #2's: a ball rolling off while both bodies stand still. Everything else about reading the
play is the camera (hoops-cam).

## 4. What changed since the 2026-11-12 audit (its sinkers, re-read here)

| Then | Now (measured here) |
|---|---|
| 1 The arms snap at every hand change | p06 rest gap 1.5 s and the catch lead (not re-measured here) |
| 2–3 Two rulebooks for the shot; greens miss | p09: inside the green goes in; masher 39 → 14 % on open threes [HEAD] |
| 4 Moves beat a man on a roll | p09: a crossover beats a wrong-footed man 100 %, a set one 0 % [HEAD] |
| 8 A blocked ball: a 0.9 s pause and a dice race | p06: no die (the bounce spot decides); the 0.9 s pause remains |
| 9 Replays swallow presses; every possession teleports | hoops-flow: any press skips; teleports remain (13–21 a minute) |
| — | NEW: reaching too strong (#1), the 1v1 board stall (#2), the slow first press (#4), the spin rule split (#5) |

## 5. The fixes (phase 2)

Each is behind its own knob; the off value restores today's behaviour exactly (tests pin both). A fix ships on only on a measured win
(at least three runs a side, pooled over seeds) with no frame-time regression on the phone tier.

### 5.1 One rule for the strip — `hoops.myStripHandOn`

RESULTS_STRIP

### 5.2 The 1v1 rival goes and gets a loose ball — `hoops.rivalChaseBoardOn`

RESULTS_CHASE

### 5.3 The press that skips the intro plays — `hoops.introPressPlaysOn`

RESULTS_INTRO

### 5.4 Phone-tier frame time

RESULTS_PERF

## 6. Recommended next

RESULTS_NEXT

## 7. How to re-run

```
# the bundles (no Next server): the dev rig and the phone-profile perf bundle
node scripts/probes/hoops-gap/build.mjs <site> fix --dev
ENTRY=perf-entry.mjs node scripts/probes/hoops-gap/build.mjs <site> perf
# natural games, knobs off against on (one hold of the gate lock; ~65 s a run with NODRAW + WD_OFF)
/home/user/wt/gate-run.sh 890 scripts/probes/hoops-gap/run-set.sh <site> <out> \
  "onevone ext TAG=off7 SEED=7 PAGE=fix NODRAW=1 WD_OFF=1 VIEW=320x180 FLOW_FRAMES=3000 EXT=$PWD/scripts/probes/hoops-play/flow-ext.mjs FEEL={\"hoops.myStripHandOn\":0,\"hoops.rivalChaseBoardOn\":0,\"hoops.introPressPlaysOn\":0}" ...
node scripts/probes/hoops-play/ab.mjs <out>/*.json            # KNOB=hoops.rivalChaseBoardOn … picks the side
node scripts/probes/hoops-play/flow.mjs <out>/*.json          # dead time, boards, teleports, overlap
node scripts/probes/hoops-play/events.mjs <out>/*.json        # shots, steals, fouls per run
# input → response
/home/user/wt/gate-run.sh 890 scripts/probes/hoops-gap/run-set.sh <site> <out> "onevone input TAG=i7 SEED=7 PAGE=fix NODRAW=1 WD_OFF=1 VIEW=320x180 TESTS=stick,stop,shot,buffer,flick"
node scripts/probes/hoops-play/input-table.mjs <out>/input-*.json
# phone tier frame time
/home/user/wt/gate-run.sh 890 scripts/probes/hoops-play/perf-set.sh <site> <out.jsonl> "onevone off {...}" "onevone on {...}"
```
