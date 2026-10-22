# Dance extras: the four open choices, measured (lane/dance-options, 2026-10-17)

The owner asked to choose before anything is built ("Dance extras (options first, owner picks)", 2026-10-17). The
dance-extras lane (`d600da41`, merged in #279) left four choices open:

- **(a)** point the six `CHART_MOVES` short names at the captured moves;
- **(b)** a STYLE variety bonus;
- **(c)** more or longer freestyle sections;
- **(d)** re-time the moonwalk and the robot.

**The owner chose on 2026-10-17, and the choices are built.** See [Chosen and built](#chosen-and-built) at the end. The option
tables below are the measurements the owner chose from. They were taken on the charts as they shipped at `2ab6a314`,
and the script still reads those charts from git, so the tables reproduce.

Each option has 2–5 variants. Every variant was run on the six shipped charts
through the same pure functions the room uses to play a chart, by `scripts/dance-options-measure.ts`:

- `planChart` + `validateChart`;
- `chartForLevel` for EASY / NORMAL / HARD;
- `DancePerformance` for the flawless score;
- `onFloor` for mid-floor switches;
- `routeFreestyle`, through `tests/helpers/dancePressChain.ts`'s `runChain`, for the freestyle players;
- `closedCycle` for the capture loops.

Run it from `FEL-full-app/` with:

```
npx tsx scripts/dance-options-measure.ts [out.json]
```

It prints every table quoted below.

**Controls.** On the shipped charts the probe reads the same numbers the repo's own tests pin:

- the flawless scores `chart.test.ts` pins: 9,555 / 10,875 / 12,240 / 15,105 / 16,605 / 19,740;
- the mid-floor switch counts `floorPhase.test.ts` pins: 2 / 6 / 4 / 9 / 9 / 8.

If either drifts, the script throws.

The test impacts quoted as "measured" come from trials. Each trial applied the variant in the worktree, ran the dance
suites (`lib/babylon/dance`, the dance mode and core suites), and was then reverted. None of them was committed.

---

## What every option leaves alone: fairness, staking and pay

Read before the options. This is why none of the recommended variants moves pay.

- **The judge and the score.** No option touches `DanceCore.ts`:
  - the judge windows, the points and combo × 5;
  - `MISS_AFTER`, `WILD_TAP_COST`;
  - `DANCE_LIBRARY` and `generateRoutine`.

  So the dance equivalence suite (`DanceCore.equivalence.test.ts`) is unaffected: 9,828 runs, 0 differences in the
  trials above. `SCORED_STEP_CAP` (26 / 29 / 32 / 38 / 41 / 47) is untouched. The NORMAL flawless pins hold in every
  recommended variant.
- **Compared runs.** An Arena duel, an async challenge or a friend's link (`?arena=`, `?mp=`, `?c=`) always plays the
  chart at NORMAL with any button (`chartPlay.comparedRun`). A change that moves only HARD never reaches a compared run.
  **Dance staking stays off** either way: `lib/stakingPause.ts` holds `'dance'` until there is a real-DB proof. No
  option needs it on.
- **The score ceiling.** Dance is a finite mode. `sessionScoreCap` holds a dance score to `danceCeiling()` = 79,680.
  The Arena ceiling counts `DANCE_LIBRARY`'s shortest clip (2 beats). Every captured move is 4 beats, so no flip can
  raise it. The endless ceiling (`ENDLESS_SESSION_CEILING`) does not apply: dance is not in `ENDLESS_MODES`, and the
  free-dance toggle that would flag a run `endless` is not built.
- **Pay.** A session pays XP = 1.5 × score, plus 50 on a win (10 otherwise), and shards = score ÷ 20 (+3 on a win). The per-run cap is 14,150 XP
  and 100 shards (`lib/economy-caps.ts`), which a score of about 9,400 (XP) or about 1,940 (shards) already reaches.
  - Every song's flawless NORMAL run (9,555 to 19,740) is at the cap.
  - So are the flawless HARD runs, which are higher.
  - A HARD-only change of ±570 points changes pay only for a HARD run that scores under about 9,400.
- **STYLE is not pay.** STYLE is a separate tally.
  - It is shown on the results banner and the freestyle exit banner, and sent as `stats.style`.
  - It is **never read by the server.** `app/api/sessions` pays `score`; the session row has no style column.
  - Nothing else reads it either: the stars (accuracy), the PRQ (accuracy), the local bests (`danceBests`: score, grade,
    combo) and the Arena ceiling all ignore it.

  So a STYLE rule (option b) moves no pay, no ceiling and no comparison.

---

## (a) Point the six short names at the captured moves

**For a player.** Today a chart that says `kickstep`, `helicopter`, `headstand`, `moonwalk`, `robot` or `sidefreeze`
dances the **library** clip of that family: top rock, windmill, arm wave or baby freeze. Flipping a name makes the
dancer do the **captured** move there instead. The MATCH button, the instrument it earns, the cue's colour and the
judge are all the same, because the family is the same.

**What it touches.** One of two routes:

| Route | What changes | Tests that change (measured) |
|---|---|---|
| Edit the six lines of `CHART_MOVES` in `dance/chart.ts` | 6 lines | 10 tests in 3 files: `chart.test.ts`, `moves.test.ts`, `floorPhase.test.ts` |
| Spell the captured id on the note in the chart JSON (the opt-in path #279 already uses) | 10 notes in 4 charts, plus each chart's `about` line | 3 tests: the floor-cut pin in `floorPhase.test.ts`, and the two opt-in lists in `moves.test.ts` |

There is no code change and no scoring path either way. What changes is the step's length (`holdBeats`), which
captured moves have at 4 beats:

| Short name | Stand-in today | Length change |
|---|---|---|
| kick step | top rock | 4 → 4 beats (no change) |
| helicopter, headstand | windmill | 8 → 4 beats |
| moonwalk, robot | arm wave | 2 → 4 beats |
| side freeze | baby freeze | 2 → 4 beats (a longer hold) |

A step's length moves three things, and nothing at NORMAL:

1. how long a freeze is held;
2. HARD's fill;
3. when a floor move rises.

**Where the names are danced** (through every section; "scored / demoted to a STYLE tap by the cap"):

| song | kickstep | sidefreeze | helicopter | headstand | moonwalk | robot |
|---|---|---|---|---|---|---|
| warmup, cypher | – | – | – | – | – | – |
| goldenhour | 1 / 0 | – | – | – | – | – |
| battle | 1 / 3 | 1 / 0 | 1 / 0 | – | – | – |
| canals | 1 / 0 | 1 / 0 | – | 1 / 0 | – | – |
| evolution | 1 / 0 | 1 / 0 | 1 / 0 | – | 0 / 1 | 3 / 2 |

**Measured, per variant.** Every variant scores the same flawless NORMAL as shipped, with the same scored steps (the
same times and families) and the same EASY chart.

| Variant | All six charts valid? | HARD (flawless) | STYLE max | Mid-floor switches |
|---|---|---|---|---|
| **A3**: flip five, the side freeze stays on the baby freeze | yes | canals +570 (+1 step), evolution −615 (−1 step) | unchanged | battle 9→8, canals 9→8 |
| **A2**: flip only the three that get no longer (kick step, helicopter, headstand) | yes | canals +570 (+1 step) | unchanged | battle 9→8, canals 9→8 |
| **A1**: flip all six | **no**: battle, canals and evolution fail validation. The 4-beat side freeze's hold runs into the next move (`bar 24: the freeze at beat 92 ends at 96, less than 0.5 beat before the next move`). A chart that fails validation is **not** played: `load()` logs it and the room falls back to the generated steps, a different chart. | — | — | — |
| **A1 + side freeze at 2 beats** | yes, same numbers as A3 | same as A3 | unchanged | same as A3 |

On the last row: at 2 beats the side freeze's 1.4 s capture is squeezed into about ¾ of a beat between its ramps. That
plays it about 2.7–3.9× faster than captured across the six tempos (arithmetic from `MOVE_CAPTURES` and the capture
window). It is not a real option.

**Captured moves cut before their end** (the next step starts before the clip finishes):

- Under A3 and A2, battle's helicopter at beat 148 plays 75 %. It is already rising by then.
- Under A3, evolution's robot at beats 52 and 148 plays 75 % (3 of its 4 beats).
- Every other flipped site plays whole.

**Fairness and staking.** None. NORMAL is identical, compared runs play NORMAL, and staking stays off. HARD moves by
one step on one or two songs. That is free play only, and a flawless run is already at the per-run pay cap.

**Tuned numbers.** No new ones. The flip turns on #46's existing tuned numbers in more places: the captured moves' 4
beats and their drop/rise ramps (`MOVE_CAPTURES`), and the three floor phases (`FLOOR_PHASE`). It changes the length
of a step at the 10 flipped notes.

**Effort and risk.**

- **Effort: small.** Ten note names, four `about` lines, three test pins rewritten and flagged `test changed:`, and one
  look at each flipped move on the real room in headless Chromium.
- **Risk: LOW.** Chart data and display; the scoring path is identical at NORMAL. The clips are already built and
  registered (Gate 0 was run when they landed in #279). No rig, bone or clip change.

**Recommendation: A3 through the chart JSON.** It puts the captured kick step, helicopter, headstand and robot in front
of players on four songs. It keeps every chart valid and every NORMAL number identical. The side freeze stays in the
charts as the baby freeze, and stays reachable on Y in freestyle. If the owner wants zero HARD change on evolution,
take **A2**.

---

## (b) A STYLE variety bonus

**For a player.** Today a freestyle section pays 50 STYLE (`GROOVE_STYLE`) for each slot you hit, once per slot,
whatever you press. A variety bonus would pay a bit more for dancing different moves. Because STYLE is not pay (see
above), a bonus changes only two numbers: the results banner's `STYLE n` and the exit banner's `+n STYLE`.

**Measured today** (flawless steps, every STYLE tap outside the section hit; the cells are the section's own STYLE):

| song | slots in the section | STYLE max for the run | section share | one button | two | all four | mashing A | mashing all four |
|---|---|---|---|---|---|---|---|---|
| warmup | 4 | 1,600 | 12.5 % | 200 | 200 | 200 | 200 | 200 |
| cypher | 4 | 3,000 | 6.7 % | 200 | 200 | 200 | 200 | 200 |
| goldenhour | 4 | 3,850 | 5.2 % | 200 | 200 | 200 | 200 | 200 |
| battle | 8 | 5,450 | 7.3 % | 400 | 400 | 400 | 400 | 400 |
| canals | 8 | 7,100 | 5.6 % | 400 | 400 | 400 | 400 | 400 |
| evolution | 8 | 8,100 | 4.9 % | 400 | 400 | 400 | 400 | 400 |

Three things this shows:

1. **Mashing (8 presses a second) earns the full section STYLE**, exactly what deliberate on-beat dancing earns.
2. **One button already shows variety.** Each button's deck cycles its moves on each press (A, B and X have 4 moves,
   Y has 2). So pressing only A on the 4 slots of warmup dances 4 different moves.
3. **Hitting every slot shows little of each move.** A move plays from one press to the next. Battle, canals and
   evolution have a slot every beat, so you see 25 % of a 4-beat move and 13 % of a windmill. Warmup, cypher and
   goldenhour have a slot every 2 beats: 50 % and 25 %. A bonus that pays per *switch* makes this worse.

**The variants, with example values** (each is one new tuned constant). Section bonus on battle, canals and evolution
(8 slots); the 4-slot songs are in brackets:

| Rule | One button | Two in turn | All four in turn | Mashing A | Mashing four |
|---|---|---|---|---|---|
| **B1** At the section's end, +50 for each different button that hit a slot, past the first (most +150 a section) | +0 | +50 | +150 | +0 | +0 to +150 |
| **B2** Change-up: +25 for a slot hit with a different button from the last one | +0 | +175 [+75] | +175 [+75] | +0 | +0 to +75 |
| **B3** New move: +25 for a slot hit that dances a move not yet danced in the section | +100 | +200 [+100] | +200 [+100] | +25 | +25 to +100 |
| **B4** For contrast, not variety: +25 for a slot hit within 40 ms (the PERFECT window) | +200 [+100] | +200 [+100] | +200 [+100] | +125 to +150 [+50 to +100] | same as mashing A |

How the rules compare:

- **B1** rewards the choice the section exists for: using all four buttons. It is bounded (+150 a section, about 2–9 %
  of a run's STYLE). It does not push a switch on every beat; four different buttons anywhere in the section earn it.
- **B2** pays most for switching on every slot, which is what already hides the moves (point 3 above).
- **B3** is earned by mashing one button, because the deck cycles. It rewards the deck, not the player.
- **B4** is the only rule that pays dancing on the beat over mashing. It is a separate idea; it is listed because the
  measurement found mashing equal to dancing today.

**What it touches.** For B1:

- one pure function in `dance/freestyle.ts` (the bonus for a section's presses);
- `DanceMode.exitFreestyle`, which already computes the section's `gained` STYLE: add the bonus there and say it on the
  exit banner;
- `tests/helpers/dancePressChain.ts`, so the chain mirrors it;
- tests: the bonus itself, and a run with the bonus scoring the same `score`, `combo` and `counts` as one without.

No `DanceCore`, chart or server change.

**Fairness and staking.** None. STYLE is never paid, compared, staked or stored server-side. It would matter only if
STYLE were ever put into a compared number. Nothing plans that, and the staking proof the owner asked for is about the
accuracy score.

**Tuned numbers.** One new one: the bonus per extra button (example 50, the same as `GROOVE_STYLE`), and its cap (3 a
section).

**Effort and risk.** Small (about half a day with tests). Risk LOW: display and the STYLE tally only.

**Recommendation: B1** (+50 a different button, past the first, at most +150 a section). If what the owner wants is
skill rather than variety, B4 is the rule that does it. They can be combined.

---

## (c) More or longer freestyle sections

**For a player.** Today each song has one 2-bar freestyle section at the end of its last hook. Inside it the buttons
pick the moves and MATCH is not asked. More sections means more of the song is "your move". A longer one means a bigger
climax.

**Measured** (the variant applied to the shipped chart):

| Variant | Freestyle share of each song | Valid | NORMAL flawless | Scored steps identical? | STYLE taps | HARD (flawless) |
|---|---|---|---|---|---|---|
| **C1**: one more section, the first hook's last free phrase (2 a song) | 7–11 % (from 4–6 %) | all six | unchanged | yes | unchanged | −1 to −4 steps (warmup −460 … cypher −2,190) |
| **C2**: every free phrase is a section | 17–25 % | all six | unchanged | yes | unchanged | −2 to −12 steps (cypher −6,330) |
| **C3**: the climax grows from 2 to 4 bars (the called phrase before it becomes freestyle) | 7–11 % | all six | **warmup −855** (24 scored, cap 26); the other five unchanged | **no, on all six**: the cap re-picks demoted moves | −2 … +4 | canals +4 steps, evolution +12 steps, the others −2 to −4 |
| **C4**: C1 + C3 | 11–17 % | all six | **warmup −430** | no | −1 … +3 | −11 … +4 steps |

**Why C1 and C2 cost nothing.** A freestyle section is a free phrase marked `"freestyle": true`: the same slots, the
same STYLE, no scored step. Every song already has 3–5 unmarked free phrases. Marking them moves no scored step and no
STYLE tap.

**Why C3 costs more.** "Longer" needs a called phrase to become free. Its moves go, and the cap re-picks which of the
song's moves are scored, so the steps a player is judged on change (`freestyle.test.ts` "the sections cost nothing"
would fail). Warmup has only 26 authored moves against a cap of 26, so it drops two scored steps. Its flawless run then
scores less, which is a pay change on the easiest song.

**HARD.** HARD's fill never puts a step in a section (`chartForLevel`'s `keepClear`), so more freestyle is fewer HARD
fill steps. That is free play only, and capped pay at the top.

**The section's edges** (measured; this is shipped behaviour that more sections would repeat):

- On four of six songs, the next scored step comes **on the section's last beat line (0 ms after it ends)**.
- A press in a section's last 200 ms is that step's: the judge takes it as an early hit, by design (`routeFreestyle`).
- So a player who **mashes right to the end** and then plays the step on its beat loses the combo. Their on-beat press
  becomes a wild tap.
- The same happens when a late mash press takes the first STYLE tap after the section (canals, evolution).
- Measured cost of mashing to the edge, then dancing on: **−460 to −1,000 points** on the run.

C1 doubles these edges. C2 multiplies them by 4–6. A later build could soften it, for example by keeping the section's
last half-beat out of freestyle or showing the next step's cue through the section. That is not part of these options.

**What it touches.** C1 is chart data only:

- one new flagged phrase id in each of the six `charts/*.json`;
- each chart's `about` line;
- one test pin, "each song's last hook ends in one". Measured: 1 of 537 dance tests fails, and it would be rewritten to
  name both sections.

No code.

**Fairness and staking.** C1 and C2: none. NORMAL, the scored steps and STYLE are identical; compared runs play NORMAL;
staking stays off. C3 and C4 change the scored steps on every song and the flawless score on warmup. That breaks the
owner's 2026-10-13 rule that pay stays exactly unchanged, unless warmup is left at 2 bars or gets two accents promoted
(the same fix #224 used).

**Tuned numbers.** None new. These are chart edits. HARD fill counts move as measured.

**Effort and risk.** C1 and C2: small, LOW risk (chart data; the room already handles any number of sections, and its
cue, banner, pad and LED wall run per section). C3: medium (choosing phrases per song, the warmup fix, the test that
pins "sections cost nothing").

**Recommendation: C1** (a second section, at the end of the first hook). It doubles the freestyle on every song at no
cost to the score, the steps or STYLE, and it leaves MATCH asked for about 90 % of the song. C2 is the "freestyle is a
big part of the song" choice: a quarter of cypher becomes freestyle. C3 is not recommended unless warmup is excluded.

---

## (d) Re-time the moonwalk and the robot

**For a player.** How fast and how evenly the captured moonwalk and robot move inside their step.

- Today each one is a 4-beat step: a ¼-beat drop from standing, the capture's closed loop repeated at its **own
  recorded speed**, and a ¼-beat rise.
- The step is built at 120 BPM and played at the song's tempo, so on slower songs the dancer moves slower than the
  capture.
- #279 noted they "may be cut mid-cycle by the next step".

**First, where they are actually danced.** Measured:

- **The moonwalk is never a scored step on any shipped chart.**
  - Canals' opt-in moonwalk (phrase `kvDc`, from #279) is one of the 6 moves canals' cap demotes to a STYLE tap. A
    demoted move plays no clip, so players never see it.
  - Evolution's `moonwalk` name is demoted too, so (a) would not show it either.
- **The robot is danced only if (a) flips it**: evolution, 3 scored sites.
- Both are always reachable in freestyle on X (2nd and 3rd press). There each move plays only until the next press: 1
  or 2 beats.

**Measured fit.** "Speed" is how fast the dancer moves against the real capture (1.00 = the mover's own pace). The six
values are at warmup 88, cypher 96, goldenhour 104, battle 112, canals 118 and evolution 126 BPM.

Moonwalk (closed loop 0.91 s; seam error 0.28, the cleanest of any dance capture):

| Variant | Loops a step | Beats a loop | Speed across the six songs |
|---|---|---|---|
| **D0** shipped: 4 beats, ¼-beat ramps, real-speed loop | 2 | 1.75 | 0.76 / 0.82 / 0.89 / 0.96 / 1.01 / 1.08 |
| **D1** beat-locked: each loop exactly 2 beats, no ramps | 2 | 2.00 | 0.66 / 0.72 / 0.78 / 0.84 / 0.89 / 0.95 |
| **D2** a 2-beat step (the arm wave's length) | 1 | 1.50 | 0.88 / 0.96 / 1.04 / 1.12 / 1.18 / 1.26 |
| **D3** an 8-beat step | 4 | 1.88 | 0.71 / 0.77 / 0.83 / 0.90 / 0.95 / 1.01 |

Robot (closed loop 1.51 s; seam error 0.53):

| Variant | Loops a step | Beats a loop | Speed across the six songs |
|---|---|---|---|
| **D0** shipped | 1 | 3.50 | 0.63 / 0.69 / 0.74 / 0.80 / 0.84 / 0.90 |
| **D1** beat-locked (one loop = 4 beats, no ramps) | 1 | 4.00 | 0.55 / 0.60 / 0.65 / 0.70 / 0.74 / 0.79 |
| **D2** a 2-beat step | 1 | 1.50 | **1.47 / 1.60 / 1.74 / 1.87 / 1.97 / 2.10** |
| **D3** an 8-beat step | 2 | 3.75 | 0.59 / 0.64 / 0.69 / 0.75 / 0.79 / 0.84 |

How much of the clip plays before the next step, at evolution's three robot sites once (a) flips them:

| Length | Beat 52 | Beat 132 | Beat 148 | Chart valid? |
|---|---|---|---|---|
| 4 beats (D0) | 75 % | 100 % | 75 % | yes |
| 2 beats (D2) | 100 % | 100 % | 100 % | yes |
| 8 beats (D3) | 38 % | 50 % | 38 % | yes |

The six charts' scored wave-family steps (where an arm wave, or a flipped popping move, is danced) number 5 / 6 / 10 /
1 / 5 / 11. Of those, 3 / 4 / 5 / 1 / 2 / 5 have 4+ beats before the next step: room for a 4-beat popping move to play
whole.

What the measurements say:

- **D0 is already the closest to the capture's own pace.** The moonwalk runs at 0.76–1.08; the robot at 0.63–0.90,
  slower on the slow songs.
- **D2 suits the moonwalk** (0.88–1.26) **and wrecks the robot** (up to 2.1× speed). It also makes a flipped robot play
  whole at all three evolution sites, and leaves evolution's HARD as shipped (A1 + D2 and A3 + D2 measured).
- **D1** puts the loops on the beat but slows both, and drops the ramps, so the step starts mid-pose (covered only by
  the 0.12 s crossfade).
- **D3** makes them cut earlier, not later.

**Fairness and staking.** D0 and D1: none (the step stays 4 beats). D2 and D3 change a captured move's length (`beats`
in `dance/moves.ts`), which reaches HARD's fill only where a chart scores the move. The arena ceiling cannot rise: 2
beats is still `DANCE_LIBRARY`'s shortest, and `moves.test.ts` holds that.

**Tuned numbers.** Every variant but D0 moves one: TUNED `CAPTURED_MOVES[moonwalk|robot].beats` 4 → 2 or 8, or
`MOVE_CAPTURES` ramps ¼ → 0 with a beat lock.

**Effort and risk.**

- D2 for the moonwalk alone: small, **RIG-ADJACENT** (a clip's timing on the shared hero rig, so Gate 0 first; the
  composed keys are pinned in `danceClips.captures.test.ts`).
- D1: medium, RIG-ADJACENT (a new composition rule in `danceClips.ts`).

**Recommendation: D0, keep the shipped timing for now.** Re-timing changes almost nothing a player sees today, because
the moonwalk is never scored and the robot only appears once (a) flips it. Look at evolution's robot on the real room
after (a). If one change is wanted, **D2 for the moonwalk only** is the one that fits.

Separate, and worth a small fix whatever is chosen: canals' opt-in moonwalk should sit on a note the cap keeps scored.
Today #279's moonwalk never plays. Canals has 2 scored wave steps with 4+ beats of room, both in the hook phrase `khA`
(beats 84 and 180). Measured, for either one: name the capture on that one placement and put `kvDc` back to `kvD`. The
chart stays valid, the scored steps and the NORMAL flawless score are identical, HARD loses one fill step (−565), and
the moonwalk plays whole (100 %).

---

## Owner questions (recommendation first in each)

**Q1. The six short names (a).**

- **A. Flip five through the chart JSON** (kick step, helicopter, headstand, moonwalk, robot; the side freeze stays the
  baby freeze in charts). Valid on all six songs, NORMAL identical, HARD canals +1 step / evolution −1 step. *(recommended)*
- B. Flip only kick step, helicopter and headstand. NORMAL identical, HARD canals +1 step.
- C. Flip all six. Needs chart edits first: the side freeze's 4-beat hold breaks battle, canals and evolution.
- D. Leave them as they are.

**Q2. A STYLE variety bonus (b).**

- **A. +50 STYLE for each different button used on a section's slots, past the first** (at most +150 a section). Never
  paid, never compared. *(recommended)*
- B. A's bonus plus +25 for a slot hit on the beat (within 40 ms), so dancing on time beats mashing.
- C. +25 every time the button changes between slot hits (pays most for switching every beat).
- D. No bonus: STYLE stays one payment per slot.

**Q3. Freestyle sections (c).**

- **A. One more on every song, at the end of the first hook** (two a song; 7–11 % of each song). No change to the
  score, the steps or STYLE. *(recommended)*
- B. Every free phrase becomes a section (17–25 % of each song). No change to the score, the steps or STYLE; MATCH is
  asked less.
- C. A 4-bar climax (the phrase before it becomes freestyle). Changes the scored steps on every song and warmup's
  flawless score (−855) unless warmup stays at 2 bars.
- D. Keep one 2-bar section a song.

**Q4. Moonwalk and robot timing (d).**

- **A. Keep the shipped timing.** Decide after seeing evolution's robot (via Q1) on the real room. *(recommended)*
- B. The moonwalk as a 2-beat step (closer to its own pace on the fast songs); the robot unchanged.
- C. Beat-lock both loops (on the beat, but slower, and no ramps in or out).

**Q5. Canals' captured moonwalk, which the cap hides today.**

- **A. Move it to a canals wave note the cap keeps scored and that has 4 beats of room**: the hook's arm wave at beat
  84. One chart note. Measured: valid, NORMAL and the scored steps identical, HARD −1 step, and the moonwalk plays
  whole. *(recommended)*
- B. Leave it. The moonwalk stays freestyle-only.

**Q6. The freestyle edges** (shipped behaviour: mashing up to a section's end, then dancing the next step on its beat,
costs that combo).

- **A. Leave it for now; revisit if Q3 adds sections.** *(recommended)*
- B. Plan a small follow-up: the section's last half-beat stops being freestyle, and the next step's cue shows through
  the section.

---

## Chosen and built

The owner's answers (2026-10-17): Q1 A, Q2 A, Q3 A, Q4 A, Q5 A, and for Q6 the small follow-up.

`npx tsx scripts/dance-options-measure.ts` prints all of the following in its BUILT section. It compares the charts at
`2ab6a314` with the charts as they ship now.

### What was built

| Choice | What changed |
|---|---|
| **Q1 A**: five short names → captures | The chart files spell `dance_toprock_kick`, `dance_power_helicopter`, `dance_power_headstand`, `dance_pop_moonwalk` and `dance_pop_robot` wherever they said `kickstep`, `helicopter`, `headstand`, `moonwalk` or `robot`. That is goldenhour 1 note, battle 2, canals 3, evolution 4. `CHART_MOVES` is unchanged. Evolution's opt-in phrase `ehBc` is `ehB` itself now and was removed. `sidefreeze` stays the baby freeze. |
| **Q2 A**: variety bonus | `dance/freestyle.ts` `varietyBonus`: +50 STYLE for each different button that took a slot in a section, past the first, at most +150, counted when the section ends. One button earns none, however often it is pressed. A press off the beat adds no button. The exit banner reads `FREESTYLE OVER · +n STYLE (VARIETY +m)`. **TUNED: (new) variety +50/button, cap +150, owner 2026-10-17.** |
| **Q3 A**: second section | Each song's first hook plays its own marked freestyle phrase in place of its last free phrase. These are the same slots, so no new phrase was needed (`fs2`, `bfreeFS`, `kfreeFS`, `efreeH`). |
| **Q4 A**: timing | Unchanged. |
| **Q5 A**: canals' moonwalk | A new phrase `khAm` is `khA` with its arm wave on beat 4 spelled `dance_pop_moonwalk`. It plays at the first hook's first placement, beat 84. `kvDc` is `kvD` again. |
| **Q6**: the edge | Two parts, both in `dance/freestyle.ts`, wired in `DanceMode`, and mirrored in `tests/helpers/dancePressChain.ts`. (1) Inside a section, MATCH never fumbles the next step: a press with another button in the section's last moment dances its move instead (`routeFreestyle` `matchOn`). (2) The **exit grace** (`exitGraceForgives`): a press the judge would call a wild tap is absorbed if it lands within `EXIT_GRACE_SEC` after a section ends, and the player pressed inside that section within `MISS_AFTER` of its end. **TUNED: (new) grace window 100 ms.** |

**Why Q6 has two parts.** The measurement found the combo break has two causes:

- **MATCH on: the wrong button.** A last-moment press with another button fumbled the next step, a MISS. This was the
  bigger cause: every model broke on every song.
- **Any mode: an early catch.** A last-moment press caught the step early, so the on-beat press after it was a wild tap.

A grace window alone cannot fix the first cause: a fumbled step is not a wild tap.

**Why 100 ms.** Measured against all six songs with MATCH on and off. The players:

- one press 20 / 60 / 100 / 150 / 190 ms before a section ends, with the next step's button or another;
- or mashing all four buttons through the section;
- then dancing on with presses up to 90 ms late (the GREAT window).

A window of 90 ms still lets 5–11 of those runs break on five songs; 95 ms clears them all. 100 ms is 95 ms rounded to a
whole step: the GREAT window plus 10 ms.

### Before and after, per song

| Song | NORMAL flawless | EASY | Scored steps | HARD flawless (steps) | Sections | STYLE max | Mid-floor switches | Captured moves scored |
|---|---|---|---|---|---|---|---|---|
| warmup | 9,555 (same) | 8,700 (same) | identical | 12,240 → 11,780 (32 → 31) | 1 → 2 | 1,600 → 1,900 | 2 | 0 |
| cypher | 10,875 (same) | 8,700 (same) | identical | 21,930 → 19,740 (51 → 47) | 1 → 2 | 3,000 → 3,300 | 6 | 0 |
| goldenhour | 12,240 (same) | 9,125 (same) | identical | 24,200 → 23,625 (55 → 54) | 1 → 2 | 3,850 → 4,150 | 4 | 0 → 1 |
| battle | 15,105 (same) | 11,325 (same) | identical | 22,490 → 21,375 (52 → 50) | 1 → 2 | 5,450 → 5,750 | 9 → 8 | 0 → 2 |
| canals | 16,605 (same) | 14,130 (same) | identical | 23,055 → 22,490 (53 → 52) | 1 → 2 | 7,100 → 7,400 | 9 → 8 | 0 → 3 |
| evolution | 19,740 (same) | 14,615 (same) | identical | 28,980 → 27,755 (63 → 61) | 1 → 2 | 8,100 → 8,400 | 8 | 2 → 7 |

How to read the table:

- **Scored steps "identical"** means the same times, families and mirrors, and the same STYLE taps (23 / 51 / 71 / 97 /
  130 / 150 on the six songs) and the same demotions.
- **STYLE max** is every STYLE tap × 50, plus every freeze released clean × 150, plus each section's variety cap (150).
- **The HARD changes are the sum of the measured pieces.** They all come from the second section, because HARD's fill
  keeps clear of sections. Against the same charts with the short names spelled back, the flip itself moves no HARD
  number.
- **Pay.** HARD is free play only, and every flawless HARD run is above the per-run XP cap (a score of about 9,400).
- **Canals' moonwalk** is scored at beat 84 and plays 100 % of its clip.
- **Cut early:** battle's helicopter at 148 and evolution's robots at 52 and 148 play 75 % before the next step, as
  measured for option A3.

**The section's edge, before → after:** the same players as the 100 ms measurement above, 44 runs a song in each mode.

| | warmup | cypher | goldenhour | battle | canals | evolution |
|---|---|---|---|---|---|---|
| Runs with a broken combo or a MISS, MATCH on | 44 → 0 | 44 → 0 | 44 → 0 | 44 → 0 | 44 → 0 | 41 → 0 |
| The same, MATCH off | 0 → 0 | 20 → 0 | 0 → 0 | 44 → 0 | 6 → 0 | 8 → 0 |

**Flawless play with the sections danced** (all four buttons on every slot): the score is the flawless pin on every
song, a full combo, and STYLE gains exactly the slots plus 300 of variety (150 for each of the two sections).

### Tests (all new or changed tests are flagged in the commits)

- **New, `lib/babylon/dance/danceOptions.test.ts`:**
  - the variety rule: one button 0, two +50, three +100, four +150, the cap holds;
  - mashing one button through every section earns 0;
  - three buttons on the slots earn +100 a section; off-beat buttons add nothing; the bonus leaves the score, combo,
    counts and labels unchanged;
  - the MATCH pass-through, and the grace's bounds: the window, the last-moment condition, no section;
  - on every shipped chart:
    - last-moment presses, right or wrong button, MATCH on and off, followed by presses up to 90 ms late, keep a full
      combo with no MISS;
    - without the fix the same players break, so the case is real;
    - a step nobody presses is still a MISS that breaks the combo;
    - a flawless run is unchanged, with nothing graced;
  - Q1 on all six charts against the short-name form (the same steps, STYLE, demotions, and NORMAL / EASY / HARD);
  - the captured moves scored per song;
  - canals' moonwalk scored and whole;
  - the two sections per song;
  - the HARD pins.
- **Changed:**
  - `floorPhase.test.ts`: battle 9 → 8 and canals 9 → 8 mid-floor switches.
  - `freestyle.test.ts`: one section a song → two, at the first and the last hook's ends.
  - `danceFreestyleWiring.test.ts`: the STYLE writers gain the variety's two.
  - `moves.test.ts`: the two opt-in phrase comparisons are gone with their phrases; their promise is held on all six
    charts in the new file.

**Mutation check:** 25 of 26 mutants killed.

- The mutants covered:
  - the variety rule and its cap;
  - the room's and the chain's slot buttons;
  - the exit payment and the finish payment;
  - the MATCH pass-through, three ways;
  - the grace's value, 90 and 300 ms;
  - each grace condition;
  - the chain's grace and the room's grace, and where the grace sits;
  - the room's `matchOn` and the room's last-press note;
  - four chart edits.
- The survivor is equivalent. Removing `Math.min(VARIETY_CAP, …)` changes nothing, because four buttons can pay at most
  3 × 50 = 150.

**On the real room** (the esbuild + Playwright static rig, headless Chromium, swiftshader, playtest build):

- **Warmup's new first-hook section opens and closes.** The room sent `ENTER … FREESTYLE — YOUR MOVE` at about 53 s,
  which is bar 19.
- **The exit banner pays variety.** Bursts of A, B, X and Y were aimed at the four slots; two different buttons took
  slots. The banner read **`FREESTYLE OVER · +150 STYLE (VARIETY +50) · MATCH IS BACK`**: 100 for the two slots plus 50
  variety, which is the rule.
- **Canals' captured moonwalk is a scored step.** The lane cues `MOONWALK · X` about 43 s in. The frames show the hero
  in the capture's bent-knee pose, and the step expires as a MISS because nothing pressed it.
- **The frames** are in the lane's scratch evidence: `round5/dance-options/shots/section/` and `…/moonwalk-portrait/`.
  They were taken with a screenshot that stalls the page under swiftshader, so each frame is a moment or two after the
  event the log names.
