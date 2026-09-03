# Concept Lock — Snowboard Big Air

**Benchmark (LOCKED by Elijah, 2026-09-01, §7.3 stop-and-ask): SSX — Big Air
discipline.** No benchmark existed in `PHASE2_BENCHMARK_LOCKS.md` or any root
doc; the mission rule is never invent one, so it was asked, and the answer is
SSX's big air events — the same board family as the snowboard slalom lock.

**Mode id:** `bigair` · **Implementation:** `lib/babylon/modes/AirSessionMode.ts`
(shared `makeAirSessionMode` factory over `lib/feel/cores/big-air-skin.ts`)
· **Route:** `/play/big-air`

SSX Big Air in one sentence: charge the run-in, hit the kicker with speed,
spend the air on rotation, STOMP the landing — a sketchy landing kills the
score a big spin earned.

---

## A. Event format

| # | Criterion | Status | Where |
|---|---|---|---|
| A1 | Multiple hits, best/score accrues | ✅ | `BIG_AIR_TUNING.attemptsPerRound` (3), `winScore` 900 |
| A2 | Speed into the kicker is built by the rider | ✅ | cadence pushes (260ms target) |
| A3 | Rotation is the air game's currency | ✅ | `spinTurns` state, shown on the bezel |
| A4 | The landing grades the whole hit | ✅ | stuck/clean/sketchy/crash — a sketchy landing undercuts the spin |
| A5 | A win threshold | ✅ | 900 — measured reachable (three solid hits; a single clean pair read 370) |

## B. SSX's big-air identity

| # | Criterion | Status |
|---|---|---|
| B1 | The run-in is a rhythm, not a stick-hold | ✅ cadence pushes |
| B2 | Air is a budget bought with speed | ✅ the core's launchSpeed/height state |
| B3 | Stomp is a timed input | ✅ `core.stick()` in Air |
| B4 | The mountain reads as a venue | ✅ `buildSlope` — groom lines, gate flags, treeline |

## C. Presentation

| # | Criterion | Status |
|---|---|---|
| C1 | Landing grade lands as a moment | ✅ banner + scorePop + impact |
| C2 | Cadence readout on the bezel | ✅ (gymnastics pass D1 — shared host) |
| C3 | A crowd at the bottom of the hill | ✅ (gymnastics pass D2 — shared factory gallery) |

---

## D. Deviations

**D1 — No benchmark existed. → LOCKED by the owner (SSX Big Air), 2026-09-01.**
Recorded per §7.3: asked, not invented.

**D2 — "Big air has judges" vs this mode's score accrual. → RULED.**
SSX's big air is score-driven, not five-card-judged — accrual with a grade
ladder is the faithful read. The dunk panel belongs to a different benchmark.
Recorded so it is not re-litigated.

**D3 — Three hits, score counts. → RULED, kept.**
SSX big air events run multiple hits; three with a win threshold is the
arcade read. Recorded.

**D4 — No spin DIRECTION vocabulary (frontside/backside/cork). → DEFERRED.**
Rotation is a single scalar (spinTurns). SSX's trick vocabulary is grab ×
spin direction; the air-session core models the rotation count and the
landing, not the grab grammar. The board sports' trick grammar lives in
their own modes; porting it into the air core is a real build. Deferred with
the reason.

---

## E. Exit criteria

Parity when A1–A5, B1–B4, C1–C3 hold, with D2/D3 ruled and D4 deferred.

**Currently: all hold.**
