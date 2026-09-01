# Concept Lock — Soccer (Penalty Shootout)

**Benchmark (LOCKED): Pro Evolution Soccer — Penalty Mode.**
`PHASE2_BENCHMARK_LOCKS.md`: *"Penalty shootouts capture high-stakes pressure;
full 11v11 out of scope for v1"* — the scope boundary is part of the lock.

**Mode id:** `penalty` · **Implementation:** `lib/babylon/modes/precisionModes.ts`
· **Route:** `/play/penalty`

| # | Criterion | Status |
|---|---|---|
| A1 | Aim the shot yourself | ✅ `Reticle` |
| A2 | Power is a decision | ✅ `PowerMeter` |
| A3 | A keeper who guesses rather than reacts perfectly | ✅ `keeperTargetX` |
| A4 | Mind games with the keeper | ✅ feints, max 2 |
| A5 | Feinting has a cost, not just a reward | ✅ style bonus vs added wobble |
| A6 | High-stakes closing kick | ✅ CLUTCH final |
| A7 | Sudden death / shootout structure | ❌ **D1** — fixed round count |
| A8 | Keeper reads your *history* | ❌ **D2** |
| A9 | Controller Link | ✅ **D3 fixed** |

**This mode is in good shape.** The feint system is a real commitment trade —
each feint shifts the keeper's guess but adds shot wobble — which is exactly the
"high-stakes pressure" the lock names, and it was built before this pass.

## D1 — Fixed rounds, no sudden death. → PHASE 2 of a later pass.
A shootout's tension comes from *elimination*: five kicks each, then sudden
death. A fixed count with a clutch final is a good approximation and not the
thing itself.

## D2 — The keeper has no memory. → PHASE 2, after D1.
It guesses per kick. In the benchmark the keeper reading your patterns is what
makes varying your placement matter.

## D3 — No Controller Link entry. → FIXED.
The feint is a stick *snap*, so the pad's movement axis has to reach the mode or
the mechanic does not exist on a phone at all.
