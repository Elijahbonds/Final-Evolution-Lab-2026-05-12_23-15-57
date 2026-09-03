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
| A6 | Racks sit along the three-point arc | ✅ D1 fixed — real NBA line | `rackRadius()` 6.71→7.24m |

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

**D1 — The arc is a constant radius, and the real one is not. → FIXED (Phase 2).**
`RACK_R = 6.75` puts every rack the same distance from the rim. The real NBA
three-point line is **6.71m in the corners and 7.24m at the top of the arc**, and
the racks sit *on that line* — so the corner racks are genuinely shorter shots
than the top-of-key rack. A 2K-benchmark mode should reproduce that: it is the
reason the top rack feels harder. **Recommend fixing in Phase 2.**

**D2 — The money ball is not visually distinct. → FIXED (Phase 2).**
`isMoneyBall()` affects scoring only. In the real event (and in 2K9) the money
ball is a different-coloured ball, and seeing it coming is part of the tension.
Currently every ball renders identically. **Recommend fixing in Phase 2 — cheap
and high value.**

**D3 — The ball racks are not on the court. → FIXED (Phase 6).**
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

**D6 — Physics is kinematic, not Havok. → RULED: ACCEPTED (Elijah, 2026-08-30).**
Scoring uses `ShotArc`, a kinematic parabola, not a Havok rigid body. Ruled
correct for this benchmark: 2K9 decides the make from the shot meter and then
animates the result, so simulating a rigid body through a rim would be modelling
something the benchmark does not do. §1's "Havok" is the platform default, not a
per-mode requirement. **No longer an open item.**

---

## E. Exit criteria for this mode

The mode is "2K9 parity" when A1–A6, B1–B6, C1–C3 all hold, D1 and D2 are fixed,
D3 is delivered in Phase 6 (done), and D4/D5/D6 have an explicit ruling recorded here (all three ruled).

**Currently: 15 of 15 A/B/C criteria hold. D1/D2/D3 fixed; D4/D5/D6 ruled.**

---

## F. Depth pass (2026-09-01) — the rival presentation, finished

**F0 — The contest was invisible on the shipping route.** The mode published
`board`, `round`, `money` and the reveal state every frame; the shipping host
(`three-point-babylon.tsx`) rendered `score / rack / ball / clock / streak /
meter / banner` and NOTHING else. The standings board — the entire contest —
existed only in the dev route's JSON dump. This is the handoff's trap #4
("HUD state is not a bezel"), fifth recorded occurrence. The host now renders
the board, the round, the money ball, and THE NEED. Guarded source-level by
`threepoint-depth-tests` (every published field must have a renderer).

**F1 — The reveal is staged.** Rival scores used to land all at once the
instant your run ended. Now the board walks one card every 0.75s, weakest
first, the favourite's number last, with unposted cards reading "— SHOOTING…".
The dunk contest's staged-reveal idiom, applied to the shootout.

**F2 — The final is played at a known number.** The finalists post their
final-round scores FIRST (staged), then the player runs with a live
"NEED N TO WIN" chip. This is board ORDER, not visible rival shooting — D4's
ruling stands. In the real event finalists shoot in reverse qualifying order
and the top qualifier goes last knowing the target; a one-player field makes
the same dramatic choice by construction. Ties don't qualify as wins: NEED is
the outright number (max rival + 1).

### Driver fixes found by this pass (shared, measured)

`capture-mobile-touch.mts`: (a) `networkidle` never settles on hosts that
long-poll (the Controller Link lobby heartbeats) — now `domcontentloaded` +
canvas wait; (b) the /play→/login redirect is client-side and lands after
hydration, so the URL check raced it — now detects the login FORM; (c) the
login inputs are SSR'd and a pre-hydration Enter is a no-op — now waits for
networkidle on /login specifically before filling; (d) the session cookie
needs a settle before the target page's `getServerSession` runs.

`threepoint-depth-drive.mts` (new): a blind shooter scores 0 and is
eliminated in qualifying, "proving" the final round didn't exist. It shoots
the exposed meter like a person (24 in qualifying), and a real elimination is
reported as a result, not a pass.

### Deferred, with reasons

- **Visible rival shot runs** — D4 stands (ruled out of scope: a large lift,
  and the staged board now carries the drama it was meant to provide).
- **Shooter selection** — D5 stands (conflicts with the platform identity
  model).
- **Tiebreak playoff** — a tied final currently goes to the earlier poster;
  the NEED chip tells the player the outright number, so no tie sneaks up on
  anyone. A playoff round is real-event-faithful and deferred as format
  polish.
