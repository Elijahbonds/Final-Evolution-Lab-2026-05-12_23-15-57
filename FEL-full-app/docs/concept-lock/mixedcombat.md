# Concept Lock — Mixed Combat

**Benchmark (RE-LOCKED by Elijah, 2026-09-01, §7.3): Soul Calibur style** —
the arena fighter. Was MMA; the owner moved it: "mix combat like soul calibur
style." Joins karate/karate-vs under the same reference family; recorded in
`PHASE2_BENCHMARK_LOCKS.md` → POST-LOCK RE-LOCKS.

**Mode id:** `mixedcombat` · **Implementation:** `lib/babylon/modes/MixedCombatMode.ts`
over the shared `FightCore` · **Route:** `/play/mixedcombat`

Soul Calibur in one sentence: 8-way movement around a locked-on opponent in a
live ring — verticals are powerful but steppable, horizontals catch steppers,
and the edge is always a way to lose.

---

## A. The arena-fighter skeleton (predates this pass, verified)

| # | Criterion | Status | Where |
|---|---|---|---|
| A1 | A live ring — step or get knocked past the edge and you FALL | ✅ | `RING_RADIUS`, `offRing`, `ringOut` — instant round loss at any HP |
| A2 | 8-way movement around a locked-on opponent | ✅ | free planar movement + `faceEachOther` |
| A3 | Reach-vs-speed matchups | ✅ | FISTS vs STAFF loadouts, rival always takes the opposite |
| A4 | Guard, chip, guard-break | ✅ | FightCore guard gauge + `GUARD_BREAK_STAGGER_SEC` |
| A5 | Timed parry | ✅ | 160ms window, slow-mo payoff |
| A6 | A super that costs a resource | ✅ | full-chi DRAGON — the big ring-out tool |

## B. The Soul Calibur grammar (this pass's build)

| # | Criterion | Status |
|---|---|---|
| B1 | Verticals are STEPPABLE | ✅ `AttackDef.line`, `STEP_EVADE_M` 0.32 — measured live: `foe poke lat=0.59 → stepped` |
| B2 | Horizontals catch steppers | ✅ kick/sweep are `horizontal` — the answer to circling |
| B3 | The attacker COMMITS to the line | ✅ facing locks at swing start; per-frame auto-face used to erase every step (measured: 150s orbiting, zero steps) |
| B4 | The step is PAID and NAMED | ✅ +8 chi to the stepper; "STEPPED IT!" / "STEPPED!" banners say why the swing missed |
| B5 | The edge is legible | ✅ bezel warns "EDGE BEHIND YOU" / "RIVAL ON THE EDGE — PRESS!" off the real ring radius |
| B6 | The pit fight is watched | ✅ 14-instanced onlooker ring on the apron; ring-outs and guard breaks get cheers |

## C. Platform

| # | Criterion | Status |
|---|---|---|
| C1 | Every verb on the touch overlay | ✅ STRIKE/KICK/GUARD/HEAVY + stick |
| C2 | Phones can join (Controller Link) | ✅ schema added — dpad as `move`; the loadout pick ALSO accepts a stick flick so phone players aren't locked into fists |
| C3 | The bezel renders what the mode publishes | ✅ `hint` and `edge` added — trap "published is not rendered", eighth occurrence (the loadout instructions were invisible) |
| C4 | The frame survives StrictMode | ✅ canvasOwner guard ported — measured black-screen on /play before it |
| C5 | The recap tells the truth | ✅ host checked `outcome === 'WIN'` while the mode ends `MATCH_WON` — every recap read DEFEATED with score 0; fixed |

---

## D. Deviations

**D1 — No throws. → DEFERRED.**
Soul Calibur's third strike type beats guard. Here the guard gauge + chip +
guard-BREAK already punishes turtles (guard shatters into a 1.4s stagger), so
the defensive stack has an answer without a throw input. A real throw (whiff
animation, tech window) is a FightCore build; recorded with the reason.

**D2 — No deliberate AI sidestep. → DEFERRED.**
The rival brain circles at range, which steps verticals ORGANICALLY (measured
live: `steppedMe` fires). A brain that reads YOUR startup and deliberately
steps would be the next rung; the reactive-guard already provides the
defensive read. Recorded.

**D3 — One ring, no stage rotation. → RULED.**
SC's stages vary; this mode's identity is THE octagon over the pit. One
arena, mastered. Recorded so it is not re-litigated.

**D4 — The DRAGON is horizontal (unsteppable). → RULED.**
The finisher must not be sidestepped into a guaranteed ring-out whiff; you
beat it with range, guard or the 160ms parry. Recorded.

---

## E. Exit criteria

Parity when A1–A6, B1–B6, C1–C5 hold, with D1/D2 deferred and D3/D4 ruled.

**Currently: all hold.**
