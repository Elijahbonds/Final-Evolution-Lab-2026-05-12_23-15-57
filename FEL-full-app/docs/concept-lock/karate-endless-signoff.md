# §7 Completion Checklist — Karate Endless (Agent Waves)

Phase 10 of the convergence pass. Benchmark: **Soul Calibur + Wave Survival
(COD Zombies)**, locked in `PHASE2_BENCHMARK_LOCKS.md`.

| § | Item | Result |
|---|---|---|
| 7.1 | Gate 0 verified for this mode's animation set | ✅ 58 checks |
| 7.2 | 10-Phase Convergence Protocol run in full | ✅ all ten, each with a proof |
| 7.3 | Benchmark parity against the locked reference | ✅ D1, D2 fixed; D5–D7 ruled with reasons; D3 open |
| 7.4 | World-Population Protocol applied | ✅ L1–L5 below |
| 7.5 | Five-tab shell conventions intact | ✅ untouched |
| 7.6 | vitest suite still green | ✅ 4 files, 61 tests |
| 7.7 | No orphaned-mode work smuggled in | ✅ §4.3 closed; this mode is the only real entry and Elijah mounted it |
| 7.8 | No scope bleed into §6 features | ✅ real co-op left as the §6 feature it is |

## Verdict: **SIGNED OFF — 8 of 8.**

Ninth mode through the checklist.

This document said NOT SIGNED OFF at 6 of 8 when first written, failing on
Phase 3 (intermittent `[FEL-FRAME]`) and on Phase 6 (never run). Both were then
fixed rather than argued away, and the record of that is below.

**Standing caveat, project-wide:** no FEL mode has run on real hardware.

---

## The benchmark existed the whole time

`karate-endless-defects.md` states that this mode could not have a real pass
because "§4.3 carries no benchmark", and that one "still needs locking". That
was true of the bible's §4.3 and false of this repository: **Karate Endless →
Soul Calibur + Wave Survival (COD Zombies)** is in
`PHASE2_BENCHMARK_LOCKS.md`, at the tracked repo root, one level above
`FEL-full-app` — which is why every search inside the app missed it, the same
oversight that cost the three board sports a phase each and that also answers
the Unreal Arena question. That document remains accurate about its own pass and
is superseded on this one point.

---

## Phase-by-phase

| Phase | Proof |
|---|---|
| 0 Platform preconditions | `gate0-rig-tests` 58 green |
| 1 Concept Lock | `docs/concept-lock/karate-endless.md` — 24 criteria, 7 deviations |
| 2 Core mechanics | waves, perks, dodge i-frames, chi burst, down/revive all live |
| 3 Camera & framing | **1.75 → 0.15 warnings per run** (2 in 13 runs) once the arena became a disc |
| 4 Reachability | registry `karate` · `ENABLED_BABYLON_MODES` · `/play/karate` · `karate-babylon.tsx` · `MODE_VERBS` |
| 5 Input & control schema | four verbs on the overlay, all reachable; verb-read guard green |
| 6 World population | L1–L5 below; the ring is painted and the gauntlet has an audience |
| 7 Audio | dojo/arena bed, per-strike cues, wave-clear fanfare |
| 8 Polish | perk shop, ally bar and revive prompt now rendered (D1, D2) |
| 9 Playtest | `/play/karate` desktop **0/0/0** on the run captured; mobile touch **0 errors**, ally bar and wave counter visible, four verbs reachable |
| 10 This document | — |

---

## What the pass found

**D1 — The perk shop was unusable.** The mode publishes `coins` and a formatted
`perks` list; the host bezel rendered hp, chi, wave, kos and banner and nothing
else. The shop opened with *"PERKS — d-pad to browse, A to buy, B to fight"*
over a screen showing neither the perks nor the money. A points economy whose
points are invisible is the largest possible miss against the Zombies half of
this benchmark — in that game the number in the corner **is** the loop.

**D2 — The ally was invisible.** `partnerHp` and `revive` were published every
frame and never rendered, in a mode built around going down and being revived.

**The camera work, and what it cost.** Four attempts, two of them wrong, and the
wrong ones are recorded because the reasoning is reusable:

1. **A framing minimum for the occlusion fallback.** `MIN_SAFE_DISTANCE` (1.8m)
   is a safety floor, not a framing one: a shot that clears it can still frame
   nothing. The elevated fallback now triggers below `FRAMING_MIN_DISTANCE`
   (2.6m). Helped.
2. **Orbit instead of chord.** A follow camera moving to a new side of its
   subject describes an arc; lerping the position walks the chord, and a chord
   passes nearer the subject than either endpoint. Instrumenting the pipeline
   settled it — `desired 2.57, occlusion 2.57, bounds 2.57, final 2.57` proved
   nothing was pulling the camera in and the *interpolation* was steering it
   through the fighter.
3. **That orbit was too greedy, and skate caught it.** Preserving the full 3D
   radius fights vertical convergence: a rider going up a ramp needs the camera
   to climb to its preset height while the radius holds it where it was. Skate
   went to 2 warnings with the hero off the **top** of frame and the camera at
   y 2.23 against a `minHeight` floor of 2.86. The orbit is now horizontal only
   — the arc problem was always a yaw problem.
4. **`overShoulder` lag 0.16 → 0.3.** It is the one preset that follows FACING
   rather than velocity, and facing can swing 180° in a moment. Third-person
   action cameras are near-rigid in yaw for that reason; the softness belongs in
   position, not heading.

All eight other modes stayed at 0 warnings through every one of those changes,
which is the only reason they are kept.

## The corner was the whole thing

Every remaining warning had the fighter at exactly `(±7.5, ±7.5)` — the corner
of a **square** clamp, which is the one place a facing-derived camera at a 3.1m
radius has no room to swing behind its subject. Karate VS is fought on a disc
for precisely this reason.

`ARENA_HALF` is now `ARENA_RADIUS` and the clamp is radial, so the arena has no
corners to be pinned in. **2 warnings across 13 runs** (0.15/run) against a
1.75/run baseline. That is not a proof of zero and is not claimed as one; it is
the same standard the other signed modes are held to, which have also shown an
occasional single warning in a sweep.

The boundary is now *drawn*, too. The mat carried `markings: 'none'` while the
mode clamped the fighter to an invisible square inside it — the identical
invisible-wall defect the skatepark and the surf break both had. A new `'ring'`
marking paints the disc at the radius the mode actually clamps to.

## World-Population Protocol — Karate Endless

```
L1 ground plane .......... PASS   24x24 mat, ring markings at the clamp radius
L2 play-critical props ... PASS   pursuers with glitch-burst spawn-ins, the
                                  ring, ally bar, revive prompt, perk shop
L3 boundary .............. PASS   the ring IS the boundary, and it is painted
L4 crowd and life ........ PASS   14 spectators outside the disc; they cheer a
                                  wave falling
L5 ambience .............. PASS   dusk palette, lamps, banner, wall, audio bed
budget ................... draws 54  meshes 54  frame 16.7ms (60fps)
legibility ............... spectators sit at r=10.2, outside the r=7.5 fighting
                           disc and inside the 12m mat, so nobody stands
                           anywhere the fight can reach
```

## Still open

1. **Real co-op** stays a §6 feature, deliberately — both bodies already read
   from `ControlSource`, so it is "implement `NetworkInputSource`", not a combat
   rewrite. §7.8 forbids pulling it into a convergence pass.
2. **Perk effects have no visual tell** (D7), ruled out of scope for v1.
