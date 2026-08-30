# Concept Lock — Three-Point Shootout

**Benchmark (LOCKED by Elijah): NBA 2K9 Three-Point Contest.**
**Mode id:** `threepoint` · **Implementation:** `lib/babylon/modes/ThreePointMode.ts`

Phase 1 of the convergence pass. The job here is to turn "2K9 parity" into
criteria that can be checked, so later phases have a fixed target and the §7
sign-off has something to sign off *against*. Anything not listed as in-scope is
out of scope — that is the point of a lock.

---

## A. Format criteria — the real event's rules

These are the 2009 NBA Three-Point Shootout rules, which 2K9 simulates.

| # | Criterion | Status | Where |
|---|---|---|---|
| A1 | 5 racks | ✅ | `RACKS = 5` |
| A2 | 5 balls per rack (25 shots) | ✅ | `BALLS_PER_RACK = 5` |
| A3 | Last ball of each rack is the money ball, worth 2 | ✅ | `isMoneyBall()` |
| A4 | Perfect score is 30 | ✅ | proved in tests |
| A5 | 60-second clock | ✅ | `GAME_LEN = 60` |
| A6 | Racks sit along the three-point arc | ⚠️ **deviation — see D1** | `RACK_R = 6.75` |

## B. Contest structure — what makes it a *contest*

A contest has a field and rounds. Without these a score has nothing to be
measured against, which is what the original `WIN_PTS >= 18` threshold got wrong.

| # | Criterion | Status |
|---|---|---|
| B1 | Field of 6 shooters (the 2009 field size) | ✅ `FIELD_SIZE = 6` |
| B2 | Qualifying round | ✅ |
| B3 | Top 3 advance | ✅ `FINALISTS = 3` |
| B4 | Final round decides the winner outright | ✅ |
| B5 | Rival scores land in a believable band (~9–19 qualifying) | ✅ proved statistically |
| B6 | Standings shown between rounds | ✅ |

## C. Shot mechanic

| # | Criterion | Status |
|---|---|---|
| C1 | Release timed against a sweeping bar | ✅ `SHOT_TARGET = 0.72` |
| C2 | Tight perfect window, wider good window | ✅ `PERFECT_BAND` / `GOOD_BAND` |
| C3 | Timing decides the make, not the input device | ✅ phone/touch/key judged identically |

---

## D. Deviations found in this phase — fix in Phase 2, or rule out of scope

**D1 — The arc is a constant radius, and the real one is not.**
`RACK_R = 6.75` puts every rack the same distance from the rim. The real NBA
three-point line is **6.71m in the corners and 7.24m at the top of the arc**, and
the racks sit *on that line* — so the corner racks are genuinely shorter shots
than the top-of-key rack. A 2K-benchmark mode should reproduce that: it is the
reason the top rack feels harder. **Recommend fixing in Phase 2.**

**D2 — The money ball is not visually distinct.**
`isMoneyBall()` affects scoring only. In the real event (and in 2K9) the money
ball is a different-coloured ball, and seeing it coming is part of the tension.
Currently every ball renders identically. **Recommend fixing in Phase 2 — cheap
and high value.**

**D3 — The ball racks are not on the court.**
The shooter moves between rack *positions*, but no rack geometry is built, so
there is nothing on court showing where the balls are or how many remain.
**Defer to Phase 6 (World Population).**

**D4 — Rivals do not visibly shoot.**
Rival scores are simulated as numbers at the end of the player's run. 2K9 shows
the other competitors take their turns. Reproducing that is a large lift
(AI shooter runs) for modest benchmark value. **Recommend OUT OF SCOPE for v1** —
the standings board already gives the score its meaning.

**D5 — No shooter selection.**
2K9 lets you pick a competitor. FEL has one player identity (§5.3 Shared Profile
Object). **OUT OF SCOPE — conflicts with the platform's own identity model.**

**D6 — Physics is kinematic, not Havok.**
Scoring uses `ShotArc`, a kinematic parabola, not a Havok rigid body. This is
believed correct for the benchmark — 2K9 decides the make from the meter and
animates the result — but §1 states the stack is Havok. **Needs a ruling.**

---

## E. Exit criteria for this mode

The mode is "2K9 parity" when A1–A6, B1–B6, C1–C3 all hold, D1 and D2 are fixed,
D3 is delivered in Phase 6, and D4/D5/D6 have an explicit ruling recorded here.

**Currently: 15 of 15 A/B/C criteria hold; A6 is qualified by D1.**
