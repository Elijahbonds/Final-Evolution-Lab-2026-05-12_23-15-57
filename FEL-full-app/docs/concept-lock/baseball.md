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
| A7 | Pitch *types* (breaking balls, change-ups) | ✅ **D2 built** in the depth pass |
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

## D2 — One pitch type. → BUILT (depth pass, 2026-09-01).
Speed rises with the round; there are no breaking balls or change-ups, so the
PCI is a *positioning* read without a *movement* read. Now a real mix:
fastball (speeds up with the round), slider (aims at one spot, breaks late
in the last 45% of flight — the PCI must track it), change-up (same look,
0.78× speed — the timing read). Nothing announces the pitch; the ball flight
is the tell, as at a real plate. All of it lives in an exported `pitchSpec()`
that the mode, the PCI driver, and the headless suite all read — the driver
had been mirroring the formula and would have missed the break entirely.

Found underneath, all measured and fixed in the same pass:

- **D5 — The timing window divided by a hardcoded 14 m/s.** With real pitch
  speeds (10.9–19 m/s), `swingQuality(…, 14, …)` mistimed every non-14 pitch.
  Now uses the actual pitch's speed.
- **D6 — The camera lost the subject on every real hit.** The parked swing
  camera panned with a 40m fly ball and the batter left the frame (the "4
  open frame warnings" the handoff carried — 20 measured on a full game).
  After contact the ball is the subject with the follow camera (golf's fix);
  at the next pitch the camera CUTS to the swing spot (a new `snap` on
  `setFixedBehind` — easing home spent ~2s with the batter behind the lens);
  and during the pitch the aim is the STRIKE ZONE, not the moving ball (a 0.4
  lerp onto a 17 m/s pitch dragged the aim past the camera's own shoulder).
  Three full 10-pitch games since: **FEL-FRAME 0**.
- **D7 — The contact grade never rendered on the shipping bezel.** The mode
  published `contact` (the PCI grade — the mechanic the benchmark is named
  for) and `timing-babylon.tsx` drew round/score/banner only. The file's own
  comment memorialises this trap for the energy gauge. The grade (and the
  pitch label) render now.
- **D8 — Phase 6, the ballpark was a plain with a mound.** A home-run derby
  had no wall to clear and no crowd to clear it in front of. Now: a 5-segment
  outfield wall a constant 38m from the plate, foul poles, a distance band,
  and a 12-strong baseline crowd that cheers contact by quality.

## D3 — No balls and strikes. → ACCEPTED for a derby (unchanged).
A home-run derby is all-you-can-hit by format. Recorded so it reads as the
format choice it is rather than a missing rule.

## D4 — No Controller Link entry. → FIXED.
A phone could not join. Its d-pad is bound to `move` so it drives the PCI: a
phone that could swing but not *cover* would be playing an easier game.
