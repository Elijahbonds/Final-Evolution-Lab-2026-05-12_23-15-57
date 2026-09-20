# Copy-paste prompt — full benchmark parity pass

---

You are continuing work on **FEL**, a Next.js 14 + Babylon.js 9.23 sports/action
platform at `FEL-full-app/`. **Read `docs/HANDOFF-CONTEXT.md` first, completely,
before touching anything.** It contains the architecture, the process, the status
of every mode, and nine traps that have each already cost hours. Do not
re-discover them.

## The mission

Every mode has a **locked benchmark** — a real, shipped commercial game — in
`PHASE2_BENCHMARK_LOCKS.md` **at the repository root, one level above the app**.
A previous pass made each mode *structurally correct* against its benchmark: the
rim is at 3.05m, the three-point line is the real shape, a dunk is worth two.
That was the floor, not the goal.

**Your job is depth.** Take each mode from "the rules are right" to "this feels
like the game it is measured against." A player who knows the benchmark should
recognise it in the way this plays — not in a feature list, in the moment-to-
moment feel.

## Where the bar is highest: the basketball modes

`onevone`, `threevthree`, `dunk`, `threepoint` are benchmarked to **NBA 2K** and
**NBA Live 08**, and they are the modes that most need to stand next to their
inspirator. Their locks record what was fixed; almost none of what makes 2K feel
like 2K has been attempted. Work these first and hardest:

- **Dribbling is a vocabulary, not a joystick.** 2K has size-ups, hesitations,
  crossovers, behind-the-back, in-and-out, step-backs — each with a real cost in
  momentum and a real payoff in separation. FEL has movement with a turbo meter.
- **Defence must be a skill.** 2K defenders slide, contest with timing, bite on
  fakes, and get beaten by a good move rather than by a dice roll. Check what
  `DefenderBrain` actually does before assuming.
- **Contact and finishing.** Layup packages, contested finishes, and-ones,
  posterizing dunks against a real contest — 2K's signature moments are all
  collisions resolved into animation.
- **Shot feedback.** 2K tells you *why* a shot missed (early/late, contested,
  off-balance). FEL has a shot meter; make the result legible.
- **Momentum and crowd.** There is a `MomentumBus` already; 2K's runs, timeouts
  and crowd swings are a system, not a meter.

**The dunk contest is held to the same bar, and it is its own discipline.** Its
benchmark is NBA Live 08's contest, and a contest is judged on things this mode
does not yet model:

- **Variety is scored.** Repeating a dunk you already threw should cost you.
  Judges reward a package they have not seen; `DUNK_TRICKS` exists but nothing
  penalises repetition.
- **The approach is part of the dunk.** Speed, angle, one-foot versus two-foot
  takeoff, and how late you gather all change what is available in the air and
  what the judges see.
- **Difficulty must be earned, not selected.** An eastbay off the bounce, a
  between-the-legs, a 360 windmill — these should be *harder to execute*, not
  just worth more. If the hardest dunk is the same input as the easiest, the
  score is a menu.
- **Props and contact.** Dunking over a person or a chair is the contest's
  signature image. There are props in the HUD; make them change the dunk, the
  risk and the reaction.
- **The landing counts.** Hanging on the rim, a clean two-foot land, a stumble —
  contests are lost on the finish.
- **The crowd and the judges must react in the moment**, not only in a final
  tally. The five-judge panel and staged reveal exist; the arena around them does
  not respond yet.

Do not add all of these. **Pick the ones whose absence a 2K player would notice
in the first minute**, build those properly, and record the rest as deferred with
reasons.

## Method — this is not optional, it is what has worked

1. **Read the mode's concept lock** (`docs/concept-lock/<mode>.md`) and its
   sign-off. They name what is already ruled out of scope and why. Do not
   re-litigate a settled decision; do not quietly reopen one either.
2. **Play it before you judge it.** Use the drivers in `scripts/` — and if none
   can exercise the mechanic you care about, **write one**. A bot that never
   dribbles will report that dribbling is fine. Three separate "this mode is
   broken" diagnoses in this project were the driver, not the mode; and one
   mode's total soft-lock was invisible until a driver played it like a person.
3. **Measure, do not guess.** `?agent=1` exposes `window.__NEXUS_AGENT__.state()`
   for real in-world numbers. `[FEL-FRAME]` tells you which side of the lens a
   subject is on. When your reasoning and a measurement disagree, the measurement
   is right.
4. **Assert against reality, not your own constants.** A test that checks
   `RACK_R === RACK_R` proves nothing. Check the real sport, or the real
   benchmark's rule. This caught a slalom gate no rider could reach and a spike
   that could not clear a net.
5. **Fix root causes.** If a fix does not work, revert it and say so. Two modes
   here have four documented wrong turns each, kept in their sign-offs.

## Definition of done, per mode

A mode is finished when `docs/concept-lock/<mode>-signoff.md` honestly reads
**8 of 8** against the §7 checklist in `docs/10-PHASE-CONVERGENCE-PROTOCOL.md`,
with:

- `npx tsc --noEmit` clean and `npx vitest run` green (currently 64 tests).
- `FEL-FRAME 0 | MISSING CLIP 0 | errors 0` on `/dev/mode/<key>` **and** on the
  shipping `/play/<slug>` route, logged in.
- A mobile pass via `scripts/capture-mobile-touch.mts` — a 390×844 touch run has
  found a black screen in five modes at once and a camera bug no desktop capture
  could.
- Every verb the mode reads present on the touch overlay **and** in Controller
  Link, or the mode is unreachable from a phone.
- A World-Population pass (L1–L5) recorded in the sign-off.
- New mechanics covered by a headless suite in `scripts/`, registered in
  `scripts/headless-checks.suite.test.ts`.

## Hard rules

- **Never invent a benchmark** (§7.3). If one is missing, stop and ask.
- **Never delete a failing criterion to make a sign-off pass.** Write
  NOT SIGNED OFF and name the failures. Two sign-offs here were published at 6/8
  and later earned 8/8; that is the correct sequence.
- **Never claim a number you did not measure**, and re-measure after any change
  to shared code (`CameraDirector`, `RallyCore`, `NetSportMode`,
  `precisionModes`, the hosts) — those are shared by many modes.
- **Do not touch a mode's HUD without checking the host renders it.** Four modes
  computed state every frame that no bezel ever drew.
- **Do not edit `lib/babylon/modes/GolfMode.ts`** or the `TennisMode` inside
  `precisionModes.ts` — both are dead. The live ones are `precisionModes.ts` and
  `TennisMode.ts`.

## Order of work

1. `onevone` — the purest 1-on-1 test of dribble, defence and finishing.
2. `threevthree` — adds help defence, spacing and passing reads.
3. `dunk` — the animation and judging showpiece, and held to the bar above:
   variety penalties, an approach that matters, difficulty that is executed
   rather than chosen, props that change the dunk, a landing that can cost you,
   and a crowd that reacts as it happens.
4. `threepoint` — smallest gap; finish the rival presentation.
5. Then `derby` (baseball: 4 open frame warnings, no Phase 6) and `penalty`
   (soccer: needs Phases 6–10).
6. Then the untouched modes: `football`, `gymnastics`, `bigair`, `sprint`,
   `carnival`, `mixedcombat`, `dunkduel`, `showdown`, `duel`, `dance`.

Work **one mode at a time**, all the way to its sign-off, before starting the
next. Commit with the reasoning and name what is still broken.
