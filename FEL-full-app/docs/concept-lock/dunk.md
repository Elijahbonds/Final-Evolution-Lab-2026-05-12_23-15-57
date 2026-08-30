# Concept Lock — Dunk Contest

**Benchmark (LOCKED, bible §4.1): optimized current-day NBA Live 08 dunk contest.**
**Mode id:** `dunk` · **Implementation:** `lib/babylon/modes/DunkMode.ts`

Phase 1 of the convergence pass. NBA Live 08 simulates the real NBA Slam Dunk
Contest, so the format criteria below are the real event's rules — that is what
"parity" means here.

This mode matters more than its slot suggests: it is the **guest onboarding
path**. `/try` — the PLAY NOW button on the landing page — mounts this mode, so
it is the first thing every new player ever sees.

---

## A. Contest format

| # | Criterion | Status | Where |
|---|---|---|---|
| A1 | 2 dunks per round | ✅ | `DUNKS_PER_ROUND = 2` |
| A2 | 2 rounds (qualifying → final) | ✅ | `TOTAL_ROUNDS = 2` |
| A3 | Judges score each dunk 6–10 | ✅ | `JudgePanel` clamps 6–10 |
| A4 | **Five judges; a perfect dunk is 50** | ❌ **D1** | 3 judges, perfect = 30 |
| A5 | Head-to-head against a rival | ✅ | `rivalTotal` |
| A6 | Props allowed (alley-oop, obstacle) | ✅ | `PROPS` |

## B. Dunk vocabulary

| # | Criterion | Status |
|---|---|---|
| B1 | Distinct dunk styles with different difficulty | ✅ `STYLE_TIER` power 3 / flashy 5.5 / sig 8 |
| B2 | Props raise difficulty | ✅ `PROP_BONUS` +2 |
| B3 | Repeating a dunk is punished | ✅ variety memory, −20% for a seen combo |
| B4 | Named mid-air tricks the player chooses | ✅ THPS-style d-pad + face button |

## C. Presentation — where NBA Live 08 spends its budget

| # | Criterion | Status |
|---|---|---|
| C1 | Judges revealed one at a time, not all at once | ✅ `ScoreReveal`, 5 beats |
| C2 | Crowd reacts to the score band | ✅ `CrowdEnergy` |
| C3 | Final round shows the score needed to win | ✅ "THE NEED" |
| C4 | Each judge has a personality/voice | ✅ Silk (style), Doc (execution), Prime (difficulty) |

---

## D. Deviations

**D1 — Three judges, so a perfect dunk is 30 instead of 50. → FIX in Phase 2.**
`JUDGES` has three entries (Silk, Doc, Prime) each scoring 6–10, so the ceiling
is 30. The real contest — and NBA Live 08 — uses **five judges, ceiling 50**, and
"**50!**" is the single most recognisable call in the event. A 30-point ceiling
is not a cosmetic difference: it is the number the whole broadcast is built
around, and every player already knows what a perfect dunk should read as.

Blast radius to handle carefully: `CHAIN_THRESHOLD = 24` is expressed against the
30 ceiling and must move with it; `REVEAL_ORDER` and `planReveal()` are built
around three named cards; and `DunkDuelMode` shares the same `JudgePanel`.

**D2 — Four-competitor field. → OUT OF SCOPE for v1.**
The real event runs four dunkers through a semifinal to a final. FEL runs the
player head-to-head against one rival across two rounds. Simulating three AI
dunkers is the same large lift that was ruled out of scope for 3PT (D4), for the
same reason: the head-to-head already gives the score meaning.

**D3 — No dunk-stick gesture input. → RULED IN, already satisfied.**
NBA Live 08's signature control was the right-stick "dunk stick". FEL's
equivalent is the THPS-style d-pad-direction + face-button trick system, which
was deliberately chosen because a right-stick gesture is unreachable on touch and
phone controllers. Different idiom, same design goal, and reachable on every
input path. No change.

---

## E. Exit criteria

Parity when A1–A6, B1–B4, C1–C4 all hold and D1 is fixed, with D2/D3 ruled.

**Currently: 13 of 14 criteria hold. A4 fails on D1.**
