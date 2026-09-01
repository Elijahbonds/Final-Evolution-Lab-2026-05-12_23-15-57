# Concept Lock — Baseball (Home Run Derby)

**Benchmark (LOCKED): MLB The Show — Hitting Mode.**
`PHASE2_BENCHMARK_LOCKS.md`: *"Contact-based bat mechanics with **dynamic PCI**;
proven single skill focus"*. The justification names the mechanic, so that is
what this lock measures against.

**Mode id:** `derby` · **Implementation:** `lib/babylon/modes/precisionModes.ts`
· **Route:** `/play/derby`

> The registry key is `derby`, not `baseball`; the mode's own `modeId` is
> `'baseball'`. Both are in use.

| # | Criterion | Status |
|---|---|---|
| A1 | A pitch you must time | ✅ `swingQuality` |
| A2 | A single, deep skill rather than a whole sport | ✅ 10 pitches, derby format |
| A3 | **A PCI you move to cover the pitch** | ✅ **D1 built** |
| A4 | **Pitch location varies, so there is something to cover** | ✅ **D1 built** |
| A5 | Contact = timing × coverage | ✅ **D1 built** |
| A6 | Where you meet the ball decides the launch | ✅ **D1 built** |
| A7 | Pitch *types* (breaking balls, change-ups) | ❌ **D2** |
| A8 | Balls and strikes | ❌ **D3** — every pitch is swung at |
| A9 | Controller Link | ✅ **D4 fixed** |

## D1 — There was no PCI, and every pitch was identical. → BUILT.

`ball.position.set(0.2, 1.4, 17.5)` with a fixed velocity, every time. Timing was
the entire game and the stick merely dialled launch angle by fiat. Now: location
varies across the strike zone, the pitch is aimed *at* that location so it
genuinely arrives where the hitter had to guess, and a PCI reticle moves on the
stick. Contact is `timing × (0.25 + 0.75 × coverage)`, so perfect timing with no
coverage is weak contact rather than a home run — and where the PCI meets the
ball decides whether it lifts or is driven into the dirt, which is the job the
stick used to do arbitrarily.

`precision-modes-tests` asserts the shape: a forgiving core, smooth degradation,
a genuine miss distance, and that coverage with fair timing beats perfect timing
with none.

## D2 — One pitch type. → PHASE 2 of a later pass.
Speed rises with the round; there are no breaking balls or change-ups, so the
PCI is a *positioning* read without a *movement* read.

## D3 — No balls and strikes. → ACCEPTED for a derby.
A home-run derby is all-you-can-hit by format. Recorded so it reads as the
format choice it is rather than a missing rule.

## D4 — No Controller Link entry. → FIXED.
A phone could not join. Its d-pad is bound to `move` so it drives the PCI: a
phone that could swing but not *cover* would be playing an easier game.
