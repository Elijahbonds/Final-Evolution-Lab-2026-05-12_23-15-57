# §7 Completion Checklist — Basketball 3v3

Phase 10 of the convergence pass. Benchmark: **NBA 2K** (bible §4.1), specifically
its half-court Park/Blacktop 3v3. The bible's eight-item checklist, run honestly.

| § | Item | Result |
|---|---|---|
| 7.1 | Gate 0 verified for this mode's animation set | ✅ 58 checks — Mixamo 65-bone standard |
| 7.2 | 10-Phase Convergence Protocol run in full | ✅ all ten, each with a runnable proof (below) |
| 7.3 | Benchmark parity against the locked reference | ✅ 19/19 criteria; D1–D5 and D8–D10 fixed, D6 ruled, D7 deferred |
| 7.4 | World-Population Protocol applied | ✅ L1–L5 below; L1 failed on three counts and was fixed |
| 7.5 | Five-tab shell conventions intact | ✅ untouched |
| 7.6 | vitest suite still green | ✅ `npm test` — 4 files, 53 tests |
| 7.7 | No orphaned-mode work smuggled in | ✅ nothing from §4.3 touched |
| 7.8 | No scope bleed into §6 features | ✅ the Controller Link entry is this mode's Phase 5, not new §6 scope |

## Verdict: **SIGNED OFF — 8 of 8.**

Third mode through the full checklist, after Three-Point Shootout and Dunk.

---

## Phase-by-phase, with the proof for each

| Phase | Proof |
|---|---|
| 0 Platform preconditions | `gate0-rig-tests` 58 green |
| 1 Concept Lock | `docs/concept-lock/threevthree.md` — 19 criteria, 10 deviations resolved |
| 2 Core mechanics + tests | `threevthree-core-tests` 18 green — spacing, matchups, the real arc, the scoring scale |
| 3 Camera & framing | ✅ **0 `[FEL-FRAME]` lines**, reproducibly (19 with auto-recentres before the pass). Root-caused — see below |
| 4 Reachability | registry · `ENABLED_BABYLON_MODES` · `/play/threevthree` · `three-v-three-babylon.tsx` · `MODE_VERBS` · venue map · `game-data` |
| 5 Input & control schema | `verb-key-alignment-tests` 39 · `controller-link-tests` 35 · forward direction fixed (D9) |
| 6 World population | L1–L5 below; half court, one basket, stands repositioned |
| 7 Audio | stadium bed; a three and a posterize are audibly bigger than a layup |
| 8 Polish | camera pulse + sparks on a three and on a posterize — the mode had **no** `camDirector.pulse` at all |
| 9 Playtest | 8 possessions driven through the runner at 60fps: clock ran, both teams scored, turbo drained, shots classified. **0 frame errors, 0 missing clips, 0 errors** |
| 10 This document | — |

![3v3 in play](../shots/ref/3v3-play.jpg)

---

## What the pass actually found

This mode was in the bible's **"Shipped-Standard — validate/polish, don't
rebuild"** tier. It did not render.

- **It drew an empty void.** draws 5, meshes 5, while the HUD reported "playing".
  `mountVenue` ran twice — the StrictMode double-mount. 5 meshes → 57.
- **It shot at a rim that was not there**, ~12m from its own hoop. So did
  Streetball 1v1, the bible's *validated reference / gold standard*.
- **The rim was a foot low** — 2.70m against a regulation 3.05m — in every
  basketball mode in the game.
- **All six players converged into a heap**: no defensive matchups, and both
  teammates cutting to the same point.
- **A dunk scored one point** while jump shots scored two or three.
- **Pressing forward walked you away from the basket.**
- **The three-point line was a circle**, repeating 3PT's own D1 because the real
  arc lived in `ThreePointMode` instead of the shared core.

None of it threw. Every one of these is two halves that are each internally
consistent and were never diffed against one another.

## World-Population Protocol — applied

```
L1 ground plane .......... PASS  18x20 half court, offset so the baseline sits
                                 1.575m behind the rim; halfcourt markings;
                                 regulation 3.05m rim; real 6.71-7.24m arc
L2 play-critical props ... PASS  one basket with backboard and net, live ball
L3 boundary .............. PASS  court edges + stands + skyline; no void
L4 crowd and life ........ PASS  two stands, behind the basket and behind play
L5 ambience .............. PASS  night skyline, lamps, stadium bed
budget ................... draws 49  meshes 49  frame 16.7ms @ 60fps
legibility ............... PASS  stands moved from 6m to 10m behind the basket,
                                 where they no longer loom over the rim
```

**L1 failed on three separate counts** — wrong basket position, wrong rim
height, wrong markings — on a mode listed as shipped-standard. L1 is the layer
the protocol says to check against the real sport rather than eyeball, and this
is the clearest case yet of why.

## Correction history for Phase 3 — and the real cause

This section has been wrong twice, so here is the whole of it.

**First version:** recorded **0 `[FEL-FRAME]` lines**. That was measured with a
hand-written script whose timing happened to miss the transient.

**Second version:** re-measured with the standard `capture-mode-play` harness,
found **1–2 lines at spawn**, and attributed them to `CameraDirector` adding a
flat `cfg.height` regardless of distance — a pitch-cap violation. That
attribution was **wrong**. It was the symptom, not the cause.

**The actual cause was mine, introduced by this very pass.** `mountVenue` hands
the camera a footprint to clamp against, computed from `spec.ground.size`
**alone**. That was the whole story while every ground was centred on the
origin — and became wrong the moment this pass gave 3v3 a `ground.offset` so the
painted key would land under the basket.

3v3's ground is 18×20 offset +7.8, spanning z −2.2..17.8. The bounds still said
z −10..10, so the camera was pinned at **z 8.8** (10 minus the 1.2 margin) while
asking to sit at 17.8. Pinned 2.8m behind the hero while still holding the
preset's full height *is* a ~60° pitch against a preset declaring 28 — which is
why the pitch looked like the problem. The hero dropped out of the bottom of
frame.

Two numbers describing one rectangle, never compared. `venueBounds()` is now
exported and `venue-bounds-tests` asserts the camera's box **is** the court's
box for every venue — 67 checks, 8 of which fail if the offset is dropped again.

With that fixed, Phase 3 measures **0 lines across repeated runs**, and 1v1
(which carries the same kind of offset) measures 0 as well.

The `team` preset retune (11/5.2 → 9.5/3.4) is kept, but for the honest reason:
it was written for "full-court flow" and 3v3 is half-court, and 9.5 keeps the
camera comfortably inside the now-correct box where 11 would graze it.

## Carry-forwards — recorded, not hidden

1. **`CourtMovement`'s stick convention disagrees with every input source in the
   game.** It documents `+Y = up-stick` and maps `-moveY`; the Gamepad API,
   `InputBus` and the touch stick all report up as **negative**. 3v3 negates at
   its own boundary because that file is shared by roughly a dozen others
   (tennis, combat, story hub, carrier control) which this pass has not verified.
   **Any of them driven through `CourtMovement` may have the same inverted
   forward.** This deserves a platform-level pass, not a per-mode patch.
2. **Streetball 1v1's venue was corrected alongside 3v3's** (same one-line
   half-court fix, no gameplay logic touched) because shipping a guard that
   knowingly left the reference mode broken would have been worse. 1v1 has NOT
   otherwise been through this pass — its own convergence run is still owed, and
   it is the mode the bible tells everyone to diff against.
3. **Phase 9 ran through `/dev/mode/threevthree`**, not `/play/threevthree`,
   which needs an account. Same limitation 3PT recorded. Dunk is still the only
   mode with a genuine guest route.
4. **`game-data` calls this venue "Venice Beach Court"** while the venue spec is
   "Streetball Arena" (night city). Cosmetic, but they should agree.
5. **D7 alley-oops** deferred to a later polish pass.
