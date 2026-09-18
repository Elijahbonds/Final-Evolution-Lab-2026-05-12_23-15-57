# §7 Completion Checklist — Baseball (Home Run Derby)

Benchmark: **MLB The Show — Hitting Mode** (`PHASE2_BENCHMARK_LOCKS.md`, locked;
the justification names the dynamic PCI, so that is what is measured).
Mode id `baseball`, registry key `derby`, route `/play/baseball`.

| § | Item | Result |
|---|---|---|
| 7.1 | Gate 0 verified for this mode's animation set | ✅ `gate0-rig-tests` 58 green |
| 7.2 | 10-Phase Convergence Protocol run in full | ✅ phases below, each with a proof |
| 7.3 | Benchmark parity against the locked reference | ✅ A1–A9: D1 (PCI) and D2 (pitch types) built, D3 accepted as format, D4 fixed |
| 7.4 | World-Population Protocol applied | ✅ L1–L5 below — the ballpark had no wall and no crowd |
| 7.5 | Five-tab shell conventions intact | ✅ untouched |
| 7.6 | vitest suite still green | ✅ 69 tests (`derby-depth-tests` added, 41 checks) |
| 7.7 | No orphaned-mode work smuggled in | ✅ |
| 7.8 | No scope bleed into §6 features | ✅ Controller Link entry predates this pass (D4) |

## Verdict: **SIGNED OFF — 8 of 8.**

Carried into this pass: **4 open frame warnings and no Phase 6** (HANDOFF §5).
Both closed; the frame warnings turned out to be three separate camera faults,
not one (see the lock's D6).

---

## Phase-by-phase, with the proof

| Phase | Proof |
|---|---|
| 0 Platform preconditions | gate0 58 green |
| 1 Concept Lock | `docs/concept-lock/baseball.md` — A1–A9, D1–D8 |
| 2 Core mechanics | `precision-modes-tests` (PCI geometry) + `derby-depth-tests` 41 green — pitch mix deterministic, the slider's break lands at the spec, timing divides by the pitch's own speed |
| 3 Camera & framing | **FEL-FRAME 0 across three consecutive 10-pitch games** (was 20/game) — the fixes are itemised in D6 because they were three different faults |
| 4 Reachability | registry `derby` · `/play/baseball` → `timing-babylon` host (`modeKey: 'derby'`) · `MODE_VERBS.derby` · Controller Link d-pad drives the PCI |
| 5 Input & control schema | `verb-key-alignment-tests` — SWING + MOVE present on touch and Controller Link |
| 6 World population | L1–L5 below |
| 7 Audio | stadium bed; score/whiff SFX; contact-graded crowd (L4 cheer) |
| 8 Polish | the dinger flight is now watchable — follow cam + subject switch + hard cut back |
| 9 Playtest | `pci-drive.mts` covering beats the blind control **263/238 vs 201** (and PURE 3 vs 1); `/play/baseball` FEL-FRAME 0 / errors 0; mobile touch `/play/baseball` 5/10 pitches by touch SWING at 60fps, 0 errors |
| 10 This document | — |

## World-Population Protocol — applied

```
L1 ground plane .......... PASS  70x90 ballpark with painted foul lines
L2 play-critical props ... PASS  plate, mound, ball, PCI reticle, pitcher —
                                 PLUS the outfield wall the mode was missing:
                                 5-segment arc a constant 38m from the plate,
                                 foul poles, distance band. A dinger now has
                                 something to clear.
L3 boundary .............. PASS  bleacher/tree surround box (pre-existing)
L4 crowd and life ........ PASS  12 instanced onlookers down both baselines
                                 (2 draws), cheering by contact quality
L5 ambience .............. PASS  park effects kit, stadium bed
budget ................... draws 20  meshes 20  frame 16.7ms @60fps (mobile leg)
legibility ............... PASS  crowd flanks the infield at |x|≥6.5 — outside
                                 the widest pitch (|x|<1) and the swing cam
```

**Caveat, honestly:** the emulated-touch perf line reads `long 52/120` frames
on this mode's mobile pass — the same telemetry shows on modes untouched by
this pass (1v1 read 57/120), so it is a harness/device-emulation constant,
not a regression. Nothing has ever run on real hardware (project-wide).

## Carry-forwards

1. **The covering driver is still coarse** — it walks the PCI with capped
   holds and a fixed swing lead; coverage beats the blind control but a human
   tracking a slider visually is smoother than the bot. If the mode's feel is
   ever questioned, suspect the driver first (the project has three of those).
2. **Foul poles are scenery, not arbiters** — fair/foul is not judged in a
   derby (D3's all-you-can-hit format); the poles mark the wall's ends.
3. **The pitcher's arm action is identical across pitch types** — the read is
   the ball flight only. A real tell (arm slot) is an animation-suite item.
