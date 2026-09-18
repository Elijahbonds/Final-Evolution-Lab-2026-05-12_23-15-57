# §7 Completion Checklist — Skate Run

Phase 10 of the convergence pass. Benchmark: **Skate 3**, locked in
`PHASE2_BENCHMARK_LOCKS.md` (repo root, commit `d441f29`).

| § | Item | Result |
|---|---|---|
| 7.1 | Gate 0 verified for this mode's animation set | ✅ 58 checks + `board-stance-tests` 19 |
| 7.2 | 10-Phase Convergence Protocol run in full | ✅ all ten, each with a proof |
| 7.3 | Benchmark parity against the locked reference | ✅ 21/21 criteria; D1–D3, D6 fixed, D4 fixed, D5 partial, D7–D9 ruled |
| 7.4 | World-Population Protocol applied | ✅ L1–L5 below |
| 7.5 | Five-tab shell conventions intact | ✅ untouched |
| 7.6 | vitest suite still green | ✅ `npx vitest run` — 4 files, 59 tests |
| 7.7 | No orphaned-mode work smuggled in | ✅ |
| 7.8 | No scope bleed into §6 features | ✅ |

## Verdict: **SIGNED OFF — 8 of 8.**

Sixth mode through the checklist, after 3PT, Dunk, 3v3, 1v1 and Karate VS.

This document said NOT SIGNED OFF at 6 of 8 when it was first written, on L4
(nobody in the park) and on an unresolved mobile framing defect. Both were then
fixed rather than argued away, and the record of that is below.

**Standing caveat, project-wide and not specific to this mode:** no FEL mode has
been run on real hardware. Phase 9 here is a desktop pass and a 390×844 touch
pass, both through the shipping route — the same standard the five earlier
sign-offs were held to, and one pass more than any of them. Thermals, GPU
behaviour and true touch latency remain unmeasured for the whole product.

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
L4 crowd and life ........ PASS   10 onlookers on the ledges; they cheer a
                                  500+ bank and a completed goal, and decay
L5 ambience .............. PASS   backdrop, palms, open-air audio bed
budget ................... draws 75  meshes 75  frame 16.6ms (60fps)
                           crowd cost: +14 meshes, 2 masters + instances,
                           no rig / skeleton / animation group
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

**L4** was the reason this document first failed. The park had nobody in it, and
the protocol's rule is that a venue records N-A only when it genuinely implies
no life — a Venice plaza does not qualify. `Onlookers` (`lib/babylon/visual/`)
is two master meshes and hardware instances of them: a figure costs a transform,
not a draw call, and never a rig, a skeleton or an animation group. They idle
out of phase with each other, they **cheer** a 500+ bank and a completed goal,
and the cheer decays so they settle instead of hopping for the whole run. All of
that is asserted in `skate-run-tests` F1–F8, including that no onlooker is
pickable — a crowd standing between the rider and the camera would otherwise be
dragged into `resolveOcclusion` and yank the camera onto the player every time
he rode past one. The venue owns the positions (`RideWorld.crowdSpots`), because
where the people of a place stand is knowledge the venue has and a mode does
not; surf and snowboard populate from the same seam.

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

### Mobile framing — FOUND AND FIXED

On a 390×844 portrait viewport, roughly two runs in three produced a single
`[FEL-FRAME] hero off-screen`, always with the rider at rest at his settled
spawn. Desktop was clean across every run. It took four attempts, and the first
three are worth recording because two of them were wrong.

The break was teaching `FrameGuard` to say **which way** the hero left the
frame. "Off-screen" plus two world positions had cost hours across this project;
behind the camera, past the left edge and below the bottom edge are three
different bugs with three different fixes. The moment it printed
`(BEHIND camera) … proj -6705,5383,-12.955` the answer was immediate: the hero
was inside the near plane, with the camera sitting *on* him — on one side in one
run and the other side in the next.

**Root cause:** `back = velocity.normalizeToNew()` was gated on
`velocity.lengthSquared() > 0.01` — a speed of **0.1 m/s**, which is standing
still. A settled rider jitters above that, so the follow direction flipped frame
to frame, and each flip teleports the desired camera position to the opposite
side of the subject — two full follow distances, about 13m on the board preset.
The camera then lerped across that gap and passed straight **through** the
rider. Below `FOLLOW_VEL_MIN` (0.8 m/s) the direction is now held, which is the
stable answer for a subject that is not going anywhere. Four consecutive clean
mobile runs.

Two other fixes were kept because they are independently right:

1. **`enforceStandoff` was applied to the camera's TARGET and discarded by the
   lerp.** At lag 0.12 the camera travels a fraction of the way each frame, so
   the actual camera could sit far inside `MIN_SAFE_DISTANCE` while the target
   it chased did not. Now enforced on the result.
2. **`FrameGuard` judged frames mid-resize.** Karate Endless's warnings included
   a hero projected to y 891 in a view reported as **1833×114** — a frame no
   layout intends. The tick where the render dimensions move is now skipped.

One attempt was **wrong and is recorded as wrong**: a horizontal follow floor,
on the theory that the standoff's *raise* and `aim()`'s pitch cap fight when
horizontal separation is small. It made the defect worse — 1 warning per run to
3 — and was reverted.

### A correction to an earlier claim in this pass

I reported Karate Endless as "1 frame warning per run, pre-existing". Measured
properly at four runs against the unchanged camera it is **1, 0, 5, 1** — the
mode is noisy, not steady, and my three-run sample was too small to say what I
said. My changes neither fixed nor worsened it. It remains unsigned, with its
own defects document.
