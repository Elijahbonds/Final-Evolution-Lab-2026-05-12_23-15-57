# Build my program (PROGRAM-ASK, 2026-11-02)

The owner said on 2026-11-02: *"The AI should be able to give me an entire workout program if I tell it, all I have is a band. I can get
full body programming properly etc."*

A person types what they have and what they want, in plain words. The app reads it into editable chips and builds a full program
from **real library entries**. Day 1 then plays in the existing session player.

- **Where it is:** `/train/build`. It is the "Build my program" card on Train, and the library Ask links to it whenever a question
  asks for a program.
- **No AI needed:** everything below runs with the Abacus switch off, which is the default.

## How it works

| Step | Code | What it does |
|---|---|---|
| Ask → request | `lib/program-ask/request.ts` | Reads the ask deterministically and always runs. Builds on `lib/library/ask/parse.ts`. Every default it fills in is listed as `assumption:`. Chips: a number gets − / +, and a choice opens its options. The account's age rules set the floor: words can make them stricter, never looser. |
| Pain or injury | `request.ts` + `server.ts` | The library Ask's own `INJURY_WORDS`, or a stored pain decision that says stop. The person gets FEL's existing lines (`AI_COACH_DISCLOSURE` plus `PAIN_DECISION_COPY` stop line) and **no program**. |
| Request → program | `lib/program-ask/build.ts`, `rules.ts`, `slots.ts`, `time.ts` | The rule-based build. The same request and library always give the same program. |
| Every rule, checked | `lib/program-ask/check.ts` | Runs on every program the server builds. A program with a problem is never served (the route answers 500). |
| AI polish (optional) | `lib/program-ask/ai.ts` | Picks among equivalent entries, then the rules rebuild and re-check. Writes the "why" paragraph through guards. Never sets a dose. |
| Checkpoint | `lib/program-ask/checkpoint.ts` | One question after each lighter week. Answers: advance, repeat the block once, or (pain) repeat the lighter week. |
| In-block progress | `lib/program-ask/adjust.ts` | Each exercise carries a "Too easy?" line and a "Too hard?" line, plus a band-setup line. |
| Save | `lib/program-ask/device.ts`, `accountStore.ts`, `accountServer.ts`, `app/api/program-ask/saved/route.ts` | Always saved on the phone, under the `fel.program-ask.v1` key. For an adult, also saved on the account once `prisma/pending/2026-11-03-program-ask.sql` is applied (below). |
| Band set | `request.ts`, `adjust.ts bandForJob` | The "What bands do you have?" chip. With two or more bands, each band exercise names its band: the heaviest for legs and hips, the middle one for the big pulls and presses, the lightest for small muscles and the trunk. |
| Player | `lib/session-player/fromProgram.ts` | Day → player steps. Pairs alternate set for set. Warm-up first, cool-down last. |
| Free or Pro | `lib/program-ask/access.ts` | **Owner call.** The default matches the signature programs: week 1 free, then FEL Pro. |
| Route and page | `app/api/program-ask/route.ts`, `app/train/build/page.tsx`, `components/program-ask/program-builder.tsx` | |

## The programming rules, with sources

**Split by days** (`rules.ts splitFor`):

| Days | Split |
|---|---|
| 2–3 | Full body every day, alternating A/B, so the main lifts repeat often enough to learn |
| 4 | Upper/lower for strength or muscle; full body A/B for every other goal |
| 5 | Upper, lower, a goal day (conditioning, athletic, mobility or full body), upper, lower |
| 6 | Push/pull/legs twice for strength or muscle; otherwise upper/lower with two goal days |

**Every full-body day covers:**
- a knee-dominant squat
- a hinge
- a horizontal push and a horizontal pull
- a vertical push or pull (alternating by day)
- a single-leg move
- two trunk patterns: anti-extension and anti-rotation

**Every week** covers all of the above, whatever the split.

**Weekly volume** is counted in hard sets per group per week. It is fractional: a split squat or a lunge counts half to the legs
and half to the hips.

| Goal | Beginner | Intermediate | Advanced |
|---|---|---|---|
| Full body | 5–12 | 8–16 | 10–20 |
| Strength | 5–12 | 6–14 | 8–16 |
| Muscle | 8–14 | 10–20 | 12–22 |
| Conditioning | 4–12 | 5–14 | 6–16 |
| Athletic / sport | 5–12 | 6–14 | 8–16 |
| Mobility | 2–8 | 3–8 | 3–10 |

The trunk range is 4–14 a week (FEL's own). Youth limits: the weekly range is capped at 12 for under-18s and at 8 for under-13s.
A teen does at most 3 sets per exercise and a child at most 2.

Pull sets are always at least push sets, and never more than 1.5×.

A building week sits inside the range. When the time cannot hold the low end, the program says so in plain words, for example:
"3 hard sets a week for pulling fit in this time; 5 is the low end for your goal…".

**Sources:**
- Schoenfeld, Ogborn & Krieger 2017, *J Sports Sci* 35:1073 — weekly sets per muscle: under 5 is low, 5–9 moderate, 10 or more
  high, with more growth from more.
- Ralston et al. 2017, *Sports Med* 47:2585 — about 5–9 weekly sets already build strength.
- ACSM 2009 position stand, *Med Sci Sports Exerc* 41:687 — novices start at 1–3 sets per exercise and 8–12 reps; rest is
  1–3 minutes by goal.
- ACSM 2011, *MSSE* 43:1334 — train each major group 2–3 days a week.
- Lopez et al. 2021, *MSSE* 53:1206 — light loads taken close to the end of a set build muscle about as well as heavy ones. This
  is why a band works.
- Faigenbaum et al. 2009, *J Strength Cond Res* 23:S60 — youth: 1–3 sets of 6–15 reps.
- Helms et al. 2016 — reps-in-reserve, through the effort bands in `lib/coach/taxonomy.ts`.

**Dose by goal** (`rules.ts GOAL_DOSE`):

| Goal | Reps | Rest |
|---|---|---|
| Strength | 4–10 by level | 75–180 s |
| Muscle | 10–20 | 45–150 s |
| Full body | 6–12 | 45–120 s |
| Conditioning | Circuits, 10–20 reps or 25–45 s | 30–60 s |

- **Tempo:** written on the "slow it down" week. The plan uses the library's real "4-Second Lower" variant where one exists;
  otherwise the base exercise carries a written tempo.
- **Effort:** every set carries an effort band — Cruise, Drive or Surge, which is reps in reserve. Full throttle is never used.
- **How a band set gets harder:** in this order —
  1. band tension (step further from the anchor, or hold the band shorter);
  2. reps;
  3. tempo or a pause;
  4. the next library rung (its `progressionId`, then its harder variants, then a harder entry for the same job).

**The load floor** (coordinator review, 2026-11-02):
- For an adult, a bodyweight two-leg squat or a wall sit cannot honestly reach the effort words, so the adult knee slot starts one
  rung harder:
  - first, a squat loaded with the kit the person owns (for example the band-resisted squat, marked `harderStart` when it is one
    level above the person's level);
  - then one-leg squats and split squats, which gives the single-leg bias.
- Under-18s keep the bodyweight squat.
- **Library gap, closed in PROGRAM-ASK-2:** the library had no band-under-the-feet squat, no band front squat, no band
  split squat, no band rear-foot-elevated split squat, no pike push-up and no beginner conditioning move that stays on
  the floor. These six are now authored as **drafts** in `data/library/authored/b5-program-ask.json`, written by
  `scripts/library/authoring/program-ask.ts`, built as batch 5 by the one generator (`npx tsx scripts/library/author.ts --batch 5`), which runs the library validator over the whole library before it writes.
  - All six are youth-safe, with no max-effort wording.
  - Each has regression and progression links to real entries:

    | Ladder | Rungs |
    |---|---|
    | Legs | Bodyweight Squat → Band Under-Feet Squat → Band Front Squat → Band Split Squat → Band Rear-Foot-Elevated Split Squat → Dumbbell Rear-Foot-Elevated Split Squat |
    | Vertical push | Incline Push-Up → Pike Push-Up → Handstand Push-Ups |
    | Conditioning | Bear Plank Hold → Step-In Mountain Climber → Mountain Climber Run |

  - The builder now prefers them: the sample's two squat days are both band-loaded (day A the under-feet squat, day B the
    front squat, the lower rung first). A no-equipment plan presses overhead with the pike push-up, and a beginner's
    finisher is the step-in mountain climber.
  - Demo loops: the squats and split squats play existing loops. `lib/library/demo.ts` gained `band` and `rfe-band` on
    the split-squat rules. The pike push-up and the step-in climber have no loop yet.

**Progression across weeks** (`rules.ts blockSteps`). A block is 5 weeks for a beginner (the lighter week is the 5th) and 4 weeks
for intermediate and advanced (the lighter week is the 4th: the coach templates' wave, owner decision #10).

| Week | What changes |
|---|---|
| Learn the moves | Low reps |
| Build | Reps up, plus one set on the day's key lift (capped at 10% of week-1 sets, `MAX_WEEKLY_SET_GROWTH`) |
| Build more | Top reps; the key lift at Surge |
| Slow it down | The tempo version |
| Lighter week | A set off everything, reps back down, everything at Cruise, and the checkpoint after it |

Later blocks climb each move's library ladder. Youth follow `YOUTH_WAVE`'s bands, capped at Drive; a child stays at Cruise.

**Safety:**
- **Jumps:** jump work only ever enters through one slot. It needs the protocol gate open, which happens for adults only (the
  warm-up's own `jumpGateFor` read). It never appears in a block's first week or lighter week.
- **Depth drops:** never.
- **Youth:**
  - adults-only entries never appear;
  - `youthSafeCues`;
  - no max-effort words;
  - no jump contacts.
- **Equipment:** only what was said, plus a wall and a floor. An entry that needs a bar or a partner (an inverted row, a Nordic
  curl) is read as needing it.
- **Warm-up and cool-down:** the warm-up is `generateWarmup` (jump gate passed in) and the cool-down is `generateCooldown`, on
  every day.

**Time:** every session of every week fits the stated minutes ± 10%. The estimate:
- sets × (reps × the tempo's seconds per rep, or 3 s per rep without a tempo; or the timed seconds), both sides counted for a
  one-sided move, plus 5 s to get set;
- the rest, never under the player's `CHANGE_SECONDS`;
- the warm-up and cool-down generators' own seconds.

When a session runs over, the plan uses shorter rests, then takes sets off the smallest jobs. When there is spare time, it adds
sets toward the top of the range, then longer rests, then a short conditioning finisher (at most 4 rounds), then easy range work.

## The old generator's failures, and the tests that hold each one

| Old failure (`lib/workout/plan-generator.ts` header) | Prevented by | Test |
|---|---|---|
| Every plan was the same flat plan | The split, slots, dose and time all come from the request | `program-ask.test.ts` "OLD #1" and the 23-ask variety tests |
| Sets and reps never changed across 12 weeks | `blockSteps` plus the ladder | "OLD #2": a 12-week plan in which reps, sets, effort and the exercise all move, and no two consecutive weeks match |
| A depth drop in week 1, past the gate | Jumps only behind the gate, never in week 1; depth drops never | "OLD #3" |

## Sample: the owner's ask

Generated by `npx tsx scripts/program-ask/sample.ts`. A full week is printed for weeks 1 and 4; weeks 2, 3 and 5 are in the
at-a-glance table.

<!-- SAMPLE:start -->
**Ask:** "all I have is a band, full body, 3 days a week, 40 minutes"

**Read as:** Only one band · Medium band (assumed) · Full body · 3 days a week · 40 min · Beginner (assumed) · 5 weeks (assumed) · 18 or over (assumed)

**Assumptions:**
- assumption: one medium long loop band — not a mini band as well, and not a set of bands.
- assumption: the band can be fixed at chest or head height (a door anchor or a post) for rows, pulldowns and the Pallof press.
- assumption: beginner (level not said). One tap changes it.
- assumption: 5 weeks (not said): a beginner's first block builds for 4 weeks and eases in week 5, then a checkpoint decides the next block.

**Band full body.** 3 days a week, 40 minutes, 5 weeks, with one band. Every session has a warm-up, the main work in pairs, and a cool-down. Reps and difficulty climb each week; week 5 is lighter, then a checkpoint decides the next block.

**Why this plan (FEL's own words; the AI may only rewrite this paragraph, through guards):** 3 full-body days: every session works the whole body: a squat, a hinge, a push, a pull, one leg at a time, and two trunk moves. Pairs alternate a lower and an upper move, so one rests while the other works and the session fits your 40 minutes. Pulling is kept at least equal to pushing.

**Notes the program shows:**
- The library has no squat loaded with a band under the feet yet, so the legs get the hardest real versions: the band-resisted squat and one-leg squats and split squats.
- One band can still get harder: step further from the anchor, hold the band shorter, slow the lowering, or pause at the hardest point.
- Rows, pulldowns and the Pallof press need the band fixed at about chest or head height: a door anchor or a solid post.

#### The block at a glance: every exercise, week by week

**Day A (Mon, Fri)**

| | Exercise | W1 | W2 | W3 | W4 | W5 lighter |
|---|---|---|---|---|---|---|
| A1 | Band Under-Feet Squat | 2 × 8 · Drive | 3 × 10 · Drive | 3 × 12 · Surge | 3 × 10, tempo 3-1-1-0 · Surge | 1 × 8 · Cruise |
| A2 | Band Row | 3 × 8 · Cruise | 3 × 10 · Drive | 3 × 12 · Drive | 3 × 10, tempo 4-0-1-0 · Drive (Band Row with 4-Second Lower) | 2 × 8 · Cruise |
| B1 | Band Good Morning | 3 × 8 · Cruise | 3 × 10 · Drive | 3 × 12 · Drive | 3 × 10, tempo 3-1-1-0 · Drive | 2 × 8 · Cruise |
| B2 | Pushups | 3 × 8 · Cruise | 3 × 10 · Drive | 3 × 12 · Drive | 3 × 10, tempo 4-0-1-0 · Drive (Pushups with 4-Second Lower) | 2 × 8 · Cruise |
| C1 | Split Squat | 2 × 8 each side · Cruise | 2 × 10 each side · Drive | 2 × 12 each side · Drive | 2 × 10 each side, tempo 4-0-1-0 · Drive (Split Squat with 4-Second Lower) | 1 × 8 each side · Cruise |
| C2 | Band Pulldown | 2 × 8 · Cruise | 2 × 10 · Drive | 2 × 12 · Drive | 2 × 10, tempo 3-1-1-0 · Drive | 1 × 8 · Cruise |
| D1 | Plank | 2 × 20 s · Cruise | 2 × 30 s · Drive | 2 × 40 s · Drive | 2 × 30 s · Drive | 1 × 20 s · Cruise |
| D2 | Band Pallof Press | 2 × 10 each side · Cruise | 2 × 12 each side · Drive | 2 × 15 each side · Drive | 2 × 12 each side · Drive | 1 × 10 each side · Cruise |

**Day B (Wed)**

| | Exercise | W1 | W2 | W3 | W4 | W5 lighter |
|---|---|---|---|---|---|---|
| A1 | Band Pull-Through | 2 × 8 · Drive | 3 × 10 · Drive | 3 × 12 · Surge | 3 × 10, tempo 3-1-1-0 · Surge | 1 × 8 · Cruise |
| A2 | Push-Up Wide | 3 × 8 · Cruise | 3 × 10 · Drive | 3 × 12 · Drive | 3 × 10, tempo 4-0-1-0 · Drive (Push-Up Wide with 4-Second Lower) | 2 × 8 · Cruise |
| B1 | Band Front Squat | 3 × 8 · Cruise | 3 × 10 · Drive | 3 × 12 · Drive | 3 × 10, tempo 3-1-1-0 · Drive | 2 × 8 · Cruise |
| B2 | Band Single-Arm Row | 2 × 8 each side · Cruise | 2 × 10 each side · Drive | 2 × 12 each side · Drive | 2 × 10 each side, tempo 3-1-1-0 · Drive | 1 × 8 each side · Cruise |
| C1 | Lateral Lunge | 2 × 8 each side · Cruise | 2 × 10 each side · Drive | 2 × 12 each side · Drive | 2 × 10 each side, tempo 4-0-1-0 · Drive (Lateral Lunge with 4-Second Lower) | 1 × 8 each side · Cruise |
| C2 | Shoulder Press - With Bands | 2 × 8 · Cruise | 2 × 10 · Drive | 2 × 12 · Drive | 2 × 10, tempo 3-1-1-0 · Drive | 1 × 8 · Cruise |
| D1 | Dead Bug | 2 × 20 s · Cruise | 2 × 30 s · Drive | 2 × 40 s · Drive | 2 × 30 s · Drive | 1 × 20 s · Cruise |
| D2 | Half-Kneeling Pallof Press | 2 × 10 each side · Cruise | 2 × 12 each side · Drive | 2 × 15 each side · Drive | 2 × 12 each side · Drive | 1 × 10 each side · Cruise |

Effort words: Cruise = 5–6 reps left, Drive = 3–4 left, Surge = 1–2 left (lib/coach/taxonomy.ts EFFORT_BANDS; a timed set says how it should feel).

#### Each exercise's own lines (week 1, day A)

| | Exercise | Band setup | Too easy? | Too hard? |
|---|---|---|---|---|
| A1 | Band Under-Feet Squat | Stand on the band, ends looped over your shoulders or held at your shoulders: it pulls you down as you stand up. | Too easy? Next session hold the band shorter or double it over; then lower for 3 s; then move to Band Front Squat. | Reps falling short? Switch to Bodyweight Squat, or hold the band longer. |
| A2 | Band Row | Anchor at chest height. Step back until the band is tight with your arms straight in front. | Too easy? Next session step further from the anchor; then lower for 3 s; then move to Paused Band Row. | Reps falling short? Stand closer to the anchor. |
| B1 | Band Good Morning | Stand on the middle of the band, feet hip-width. Loop it behind your neck (good morning) or hold the ends (deadlift). | Too easy? Next session hold the band shorter or double it over; then lower for 3 s; then move to Band-Resisted Frog Pump. | Reps falling short? Hold the band longer. |
| B2 | Pushups | — | Too easy? Next session lower for 3 s and pause at the bottom; then move to Paused Pushups. | Reps falling short? Switch to Wall Push-Up. |
| C1 | Split Squat | — | Too easy? Next session lower for 3 s and pause at the bottom; then move to Paused Split Squat. | Reps falling short? Shorten the range a little and build back up. |
| C2 | Band Pulldown | Anchor high: the top of a door or a high post. Kneel or stand back until the band is tight at the start. | Too easy? Next session step further from the anchor; then lower for 3 s; then move to Single-Arm Band Straight-Arm Pulldown. | Reps falling short? Stand closer to the anchor. |
| D1 | Plank | — | Too easy? Next session hold 10 s longer, then make the position longer or wider. | Too long to hold? Hold 10 s less and build back up. |
| D2 | Band Pallof Press | Anchor at chest height. Stand side-on and step out until the band pulls you toward the anchor. | Too easy? Next session step further from the anchor; then lower for 3 s. | Reps falling short? Switch to Half-Kneeling Pallof Press, or stand closer to the anchor. |

#### Weekly hard sets per group (fractional: a split squat or lunge counts half legs, half hips)

| Group | Range (sets/week) | W1 | W2 | W3 | W4 | W5* |
|---|---|---|---|---|---|---|
| knee | 5–12 | 10 | 12 | 12 | 12 | 5.5 |
| hip | 5–12 | 11 | 12 | 12 | 12 | 6.5 |
| push | 5–12 | 11 | 11 | 11 | 11 | 7 |
| pull | 5–12 | 12 | 12 | 12 | 12 | 7 |
| trunk | 4–14 | 12 | 12 | 12 | 12 | 6 |

\* lighter week: fewer sets on purpose.

#### Week 1 and week 4 in full (warm-up, pairs, finisher, cool-down, rest, minutes)

### Week 1 · Learn the moves

**Mon · Full body (A) · about 39 min**

| | Exercise | Job | Dose | Rest | Effort | Tempo / note |
|---|---|---|---|---|---|---|
| | Warm-up: Pressurize the System, Wake Up the Tripod, Open the Joints, Ankle Rock and Hold, Fast Squat Primer | | 6 min | | | |
| A1 | Band Under-Feet Squat | squat | 2 × 8 | → next | Drive: 3–4 reps left |  |
| A2 | Band Row | row | 3 × 8 | 1:15 | Cruise: 5–6 reps left |  |
| B1 | Band Good Morning | hip hinge | 3 × 8 | → next | Cruise: 5–6 reps left |  |
| B2 | Pushups | push | 3 × 8 | 1:15 | Cruise: 5–6 reps left |  |
| C1 | Split Squat | single leg | 2 × 8 each side | → next | Cruise: 5–6 reps left |  |
| C2 | Band Pulldown | pulldown | 2 × 8 | 1:15 | Cruise: 5–6 reps left |  |
| D1 | Plank | trunk (front) | 2 × 20 s | → next | Cruise: easy, could go longer |  |
| D2 | Band Pallof Press | trunk (anti-rotation) | 2 × 10 each side | 50 s | Cruise: 5–6 reps left |  |
| E | Step-In Mountain Climber | finisher | 4 × 20 s each side | 20 s | Drive: steady, some left at the end | Steady and smooth: breathing hard, never sloppy. |
| | Cool-down: 4-6 Recovery Breath, Ankle Rock and Hold, Open Book Rock and Hold, Hinge Rock and Hold | | 5 min | | | |

**Wed · Full body (B) · about 39 min**

| | Exercise | Job | Dose | Rest | Effort | Tempo / note |
|---|---|---|---|---|---|---|
| | Warm-up: Pressurize the System, Wake Up the Tripod, Open the Joints, Wall Calf Rock and Hold, Hip Snap Primer | | 6 min | | | |
| A1 | Band Pull-Through | hip hinge | 2 × 8 | → next | Drive: 3–4 reps left |  |
| A2 | Push-Up Wide | push | 3 × 8 | 1:20 | Cruise: 5–6 reps left |  |
| B1 | Band Front Squat | squat | 3 × 8 | → next | Cruise: 5–6 reps left |  |
| B2 | Band Single-Arm Row | row | 2 × 8 each side | 1:20 | Cruise: 5–6 reps left |  |
| C1 | Lateral Lunge | single leg | 2 × 8 each side | → next | Cruise: 5–6 reps left |  |
| C2 | Shoulder Press - With Bands | overhead press | 2 × 8 | 1:20 | Cruise: 5–6 reps left |  |
| D1 | Dead Bug | trunk (front) | 2 × 20 s | → next | Cruise: easy, could go longer |  |
| D2 | Half-Kneeling Pallof Press | trunk (anti-rotation) | 2 × 10 each side | 55 s | Cruise: 5–6 reps left |  |
| E | Step-In Mountain Climber | finisher | 4 × 20 s each side | 20 s | Drive: steady, some left at the end | Steady and smooth: breathing hard, never sloppy. |
| | Cool-down: 4-6 Recovery Breath, Wall Calf Rock and Hold, Open Book Rock and Hold, Hinge Rock and Hold | | 5 min | | | |

### Week 4 · Slow it down

**Mon · Full body (A) · about 44 min**

| | Exercise | Job | Dose | Rest | Effort | Tempo / note |
|---|---|---|---|---|---|---|
| | Warm-up: Pressurize the System, Wake Up the Tripod, Open the Joints, Ankle Rock and Hold, Fast Squat Primer | | 6 min | | | |
| A1 | Band Under-Feet Squat | squat | 3 × 10 | → next | Surge: 1–2 reps left | tempo 3-1-1-0 · Slow it down: 3 s on the way down, 1 s pause. |
| A2 | Band Row with 4-Second Lower | row | 3 × 10 | 1:15 | Drive: 3–4 reps left | tempo 4-0-1-0 · Slow it down: 4 s on the way down. |
| B1 | Band Good Morning | hip hinge | 3 × 10 | → next | Drive: 3–4 reps left | tempo 3-1-1-0 · Slow it down: 3 s on the way down, 1 s pause. |
| B2 | Pushups with 4-Second Lower | push | 3 × 10 | 1:15 | Drive: 3–4 reps left | tempo 4-0-1-0 · Slow it down: 4 s on the way down. |
| C1 | Split Squat with 4-Second Lower | single leg | 2 × 10 each side | → next | Drive: 3–4 reps left | tempo 4-0-1-0 · Slow it down: 4 s on the way down. |
| C2 | Band Pulldown | pulldown | 2 × 10 | 1:15 | Drive: 3–4 reps left | tempo 3-1-1-0 · Slow it down: 3 s on the way down, 1 s pause. |
| D1 | Plank | trunk (front) | 2 × 30 s | → next | Drive: steady, some left at the end |  |
| D2 | Band Pallof Press | trunk (anti-rotation) | 2 × 12 each side | 50 s | Drive: 3–4 reps left |  |
| | Cool-down: 4-6 Recovery Breath, Ankle Rock and Hold, Open Book Rock and Hold, Hinge Rock and Hold | | 5 min | | | |

**Wed · Full body (B) · about 44 min**

| | Exercise | Job | Dose | Rest | Effort | Tempo / note |
|---|---|---|---|---|---|---|
| | Warm-up: Pressurize the System, Wake Up the Tripod, Open the Joints, Wall Calf Rock and Hold, Hip Snap Primer | | 6 min | | | |
| A1 | Band Pull-Through | hip hinge | 3 × 10 | → next | Surge: 1–2 reps left | tempo 3-1-1-0 · Slow it down: 3 s on the way down, 1 s pause. |
| A2 | Push-Up Wide with 4-Second Lower | push | 3 × 10 | 1:20 | Drive: 3–4 reps left | tempo 4-0-1-0 · Slow it down: 4 s on the way down. |
| B1 | Band Front Squat | squat | 3 × 10 | → next | Drive: 3–4 reps left | tempo 3-1-1-0 · Slow it down: 3 s on the way down, 1 s pause. |
| B2 | Band Single-Arm Row | row | 2 × 10 each side | 1:20 | Drive: 3–4 reps left | tempo 3-1-1-0 · Slow it down: 3 s on the way down, 1 s pause. |
| C1 | Lateral Lunge with 4-Second Lower | single leg | 2 × 10 each side | → next | Drive: 3–4 reps left | tempo 4-0-1-0 · Slow it down: 4 s on the way down. |
| C2 | Shoulder Press - With Bands | overhead press | 2 × 10 | 1:20 | Drive: 3–4 reps left | tempo 3-1-1-0 · Slow it down: 3 s on the way down, 1 s pause. |
| D1 | Dead Bug | trunk (front) | 2 × 30 s | → next | Drive: steady, some left at the end |  |
| D2 | Half-Kneeling Pallof Press | trunk (anti-rotation) | 2 × 12 each side | 55 s | Drive: 3–4 reps left |  |
| | Cool-down: 4-6 Recovery Breath, Wall Calf Rock and Hold, Open Book Rock and Hold, Hinge Rock and Hold | | 5 min | | | |

<!-- SAMPLE:end -->

## Account save (PROGRAM-ASK-2, owner: "yes")

**What is stored:** one `AskedProgram` row per adult account —
- the ask;
- the chips' edits;
- the program id;
- the sessions done;
- the checkpoint answers.

The program itself is not stored: the ask rebuilds it, because the builder is deterministic.

**Who is saved where:**
- Adults: the phone, plus the account once the table exists.
- Youth (under 18, or no birth year): the phone only. The server refuses a youth write with 403 `youth_device_only`.

**Data rights:** exported with "Download my data" and deleted by the account erase (`lib/data-rights/registry.ts AskedProgram`).

**Fails closed:** until `prisma/pending/2026-11-03-program-ask.sql` is applied:
- reading the account plan answers "keep it on the phone";
- writes answer 503 `program_ask_not_ready`;
- the page keeps saving on the phone.

Within about 5 minutes of the SQL being applied, account save switches on, with no deploy (the shared pending-schema
probe).

`prisma/schema.prisma` is untouched. The SQL file holds the owner's steps.

## Owner calls (decided 2026-11-03, via the coordinator)

1. Free or Pro: keep `'like-signature'`. The owner may change it.
2. AI polish: stays off.
3. One medium band for v1. The band-set chip is there for anyone who has more.
4. Account save: yes (above). The table still waits on the owner applying the SQL.

## Owner calls (as first written)

1. **Free or FEL Pro.** The default (`PROGRAM_ASK_ACCESS = 'like-signature'`) gives week 1 free and the rest with FEL Pro, the
   same as the signature programs. The other setting is `'all-free'`.
2. **AI polish on or off.** It is off with the Abacus switch, which is off by default. Turning it on lets the model swap between
   equivalent entries and write the "why" paragraph, and nothing else.
3. **Band tension guidance.**
   - Today: one medium band is assumed, and progress comes from stance, grip length, tempo and the ladder.
   - Open question: should the ask prompt for a band set (light / medium / heavy) and prescribe a colour per exercise?
4. **Draft library entries.** About 88% of the library is draft. The program uses drafts (never rejected entries), as the
   owner-approved signature programs do: 119 of their 132 exercises are drafts.
5. **Account save.** Not built. Saving is on the phone only. Saving to an account would need a table behind the pending-schema
   seam, with a data-rights entry.
