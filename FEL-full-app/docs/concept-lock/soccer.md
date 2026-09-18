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
| A7 | Sudden death / shootout structure | ✅ **D1 built** in the depth pass |
| A8 | Keeper reads your *history* | ✅ **D2 built** in the depth pass |
| A9 | Controller Link | ✅ **D3 fixed** |

**This mode is in good shape.** The feint system is a real commitment trade —
each feint shifts the keeper's guess but adds shot wobble — which is exactly the
"high-stakes pressure" the lock names, and it was built before this pass.

## D1 — Fixed rounds, no sudden death. → BUILT (depth pass, 2026-09-01).
A shootout's tension comes from *elimination*: five kicks each, then sudden
death. A fixed count with a clutch final is a good approximation and not the
thing itself. Now the real format: five each with early clinch when a side is
out of reach (the actual Laws), a rival who answers between your kicks
(simulated + staged, the numbers-only rival presentation 3PT's lock ruled
acceptable — and here it IS the format), and level-after-five goes to sudden
death until a round splits. A must-score kick says so ("SCORE OR YOU ARE OUT").
Format logic is pure and headless-proved against the Laws in
`penalty-depth-tests`; measured live both ways — a varied run won 4–2 in
regulation, a same-side run went 4–4 → **sudden death → 5–4**, decided.

## D2 — The keeper has no memory. → BUILT (same pass).
It guesses per kick. In the benchmark the keeper reading your patterns is what
makes varying your placement matter. `keeperReadProb`: a same-side streak is
read harder each time (+0.09 per repeat, clamped), breaking the habit fools
him, feints still move him. And it is VISIBLE pressure — aim where you keep
going and the mode says "HE'S READING THAT SIDE".

## D4 — A weak kick soft-locked the mode. → FIXED (same pass).
The only exit from the flight phase was the ball crossing the goal line;
an under-hit kick died short and the mode never resolved (phase stuck in
'flight' forever). A scuffed pen is now OFF TARGET ("SCUFFED IT — SHORT").
The depth driver found this in four minutes; the cadence bot never had.

## D5 — No kick could physically reach the goal. → FIXED (same pass).
The flight launched at 13–20 m/s aimed flat at the reticle; gravity ate
0.95–1.2m over the trip and the ball landed 3–6m short — the goal was
unreachable, so GOOOAL/SAVED had never once resolved. Now driven at 22–30
m/s with a +1.2m aim lift: centre aims arrive chest-high, top-corner aims
threaten the bar. Found only because D4 made misses resolve.

## D3 — No Controller Link entry. → FIXED.
The feint is a stick *snap*, so the pad's movement axis has to reach the mode or
the mechanic does not exist on a phone at all.
