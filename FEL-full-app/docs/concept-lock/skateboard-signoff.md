# §7 Completion Checklist — Skate Run

Phase 10 of the convergence pass. Benchmark: **Skate 3**, locked in
`PHASE2_BENCHMARK_LOCKS.md` (repo root, commit `d441f29`).

| § | Item | Result |
|---|---|---|
| 7.1 | Gate 0 verified for this mode's animation set | ✅ 58 checks + `board-stance-tests` 19 |
| 7.2 | 10-Phase Convergence Protocol run in full | ⚠️ ten run; **Phase 9 is emulation, not hardware** |
| 7.3 | Benchmark parity against the locked reference | ✅ 21/21 criteria; D1–D3, D6 fixed, D4 fixed, D5 partial, D7–D9 ruled |
| 7.4 | World-Population Protocol applied | ⚠️ L1–L3, L5 pass; **L4 FAIL** — see below |
| 7.5 | Five-tab shell conventions intact | ✅ untouched |
| 7.6 | vitest suite still green | ✅ `npx vitest run` — 4 files, 59 tests |
| 7.7 | No orphaned-mode work smuggled in | ✅ |
| 7.8 | No scope bleed into §6 features | ✅ |

## Verdict: **NOT SIGNED OFF — 6 of 8.**

Sixth mode through the checklist, and the first to fail it. Two items are open
and neither is cosmetic:

- **7.4 — L4 crowd and life is absent.** The skatepark has no other people in
  it. The protocol's rule is "crowd or life is present where the venue implies
  it", and a Venice skatepark implies it about as strongly as any venue in the
  game. This is a real FAIL, not an N-A: the mode has an environment, so it
  cannot record N-A.
- **7.2 — Phase 9 has not run on hardware.** It ran on an emulated 390×844
  viewport driving real touch through CDP, which is a genuinely different code
  path from the keyboard and did find a real defect (below). It is still not a
  phone. Thermals, GPU behaviour and true touch latency remain unmeasured.

Recording the failures rather than rounding them up is the point of the
checklist. Everything else is done and proved.

---

## Phase-by-phase

| Phase | Proof |
|---|---|
| 0 Platform preconditions | `gate0-rig-tests` 58 green |
| 1 Concept Lock | `docs/concept-lock/skateboard.md` — 21 criteria, 9 deviations |
| 2 Core mechanics | `skate-run-tests` 44 green — asserted against Skate 3's rules, not our constants |
| 3 Camera & framing | **0 `[FEL-FRAME]`** on desktop across 6+ runs; `snapTo` at load and again on the first played frame |
| 4 Reachability | registry `skateboard` · `ENABLED_BABYLON_MODES` · `/play/skateboard` · `board-babylon.tsx` · `MODE_VERBS` · **driven through the real route logged in** |
| 5 Input & control schema | verb key `skateboard` aligned (39 green); Controller Link entry added; switch stance reachable |
| 6 World population | L1–L3, L5 below; **L4 fails** |
| 7 Audio | open-air `wind` bed (was a stadium crowd), per-action whoosh/tick/powerUp, and the big bank gets its own sample + camera pulse |
| 8 Polish | combo ticker with the pot at risk, meters, banked/HUGE banners, camera pulse on a 500+ bank |
| 9 Playtest | `/play/skateboard` desktop **0/0/0**; mobile touch runs the mode and the HUD, with **one open framing defect** below |
| 10 This document | — |

---

## World-Population Protocol — Skate Run

```
L1 ground plane .......... PASS   70x70 painted plaza, reads at camera distance
L2 play-critical props ... PASS   bowl, downhill, 5 rails, funboxes, coins,
                                  and the patrol rail NOW HAS A BODY
L3 boundary .............. PASS   fenced on all four sides at PARK_BOUND
L4 crowd and life ........ FAIL   nobody else is in the park
L5 ambience .............. PASS   backdrop, palms, open-air audio bed
budget ................... draws 61  meshes 61  frame 16.7ms (60fps)
legibility ............... nothing competes with L1-L2; the fence is dark and
                           low, the patrol rail is the only gold object
```

**L2 was the bad one.** `MovingRail` had no mesh at all — it was pure maths, a
grind line sliding back and forth on a patrol loop — and one of the four run
goals is *"GRIND THE PATROL RAIL"*. The player was being asked to find,
approach and grind an object that was never drawn. That is the protocol's own
cited failure mode ("if the HUD is the only place a rule is visible, L2 is
incomplete") and worse, because it was not in the HUD either. It now has a body,
it is gold so it reads as the goal object against five white rails, and
`skate-run-tests` E1–E5 assert the drawn rail sits exactly on the grind line so
the two can never drift apart.

**L3** was an invisible wall: the rider clamped at 33 while the ground visibly
continued to 35. The clamp and the fence are now the same exported constant.

---

## What the pass found

- **The mode could not be scored.** `combo.bank()` was called nowhere; only
  `bail()`. A 90-second run ended 0 points, 0 goals, 0 momentum, every time.
- **Only a gamepad could score a trick.** Face buttons drove a dead parallel
  scorer, so on keyboard and touch — every player without a pad — no trick
  reached the combo chain.
- **Grind bonuses were discarded** into that same dead pot.
- **Switch riding was built and unreachable.** `switchStance()` existed, taxed
  speed, flipped the rider, and nothing called it. Now it follows the rotation
  the way the benchmark does: land an odd number of half-turns and you are
  switch.
- **The HUD showed almost none of the mode** — see the board host rebuild.
- **The ambient bed was a stadium crowd** in an empty outdoor plaza.

### Open defect — mobile framing, 1 transient per run

On a 390×844 portrait viewport, roughly two runs in three produce a single
`[FEL-FRAME] hero off-screen`, always with the rider at rest at his settled
spawn (`z ≈ -15.72`) and the camera 0.5–2.5m behind him at y 1.37–1.74 against
a preset height of 2.4. Desktop is clean across every run.

Two fixes landed while chasing it and both are kept, because both are real:

1. **`enforceStandoff` was applied to the camera's TARGET and then discarded by
   the lerp.** At lag 0.12 the camera only travels a fraction of the way each
   frame, so the actual camera could sit far inside `MIN_SAFE_DISTANCE` while
   the target it chased did not. Now enforced on the result, so the guarantee
   is about where the camera *is*.
2. **The mode re-snaps on the first played frame.** The load-time `snapTo` is
   correct when it runs and stale by the time it matters — the rider drops onto
   the park and settles between load and play.

A third attempt — a horizontal follow floor, on the theory that the standoff's
*raise* and `aim()`'s pitch cap fight each other when horizontal separation is
small — made it **worse (1 → 3 per run)** and was reverted. That theory is
therefore unproven and probably wrong; recording it so the next attempt does not
repeat it.

**Not fixed. Not a blocker for desktop, unresolved for phones**, and it is the
first thing to pick up when this mode is next opened.
