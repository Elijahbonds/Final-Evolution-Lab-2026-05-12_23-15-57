# §7 Completion Checklist — Snowboard Slalom

Phase 10 of the convergence pass. Benchmark: **SSX**, locked in
`PHASE2_BENCHMARK_LOCKS.md` (repo root, commit `d441f29`), and corroborated
in-code at `SnowboardSlalomMode.ts:49`. This is the one board mode whose
benchmark and subject actually match, so it is held to SSX on both.

**Mode id `snowboard_slalom`** — not `snowboard`. A request to the wrong key
renders a page reporting `FEL-FRAME 0 / MISSING CLIP 0 / errors 0` while loading
nothing at all, which cost two invalid measurements during this pass.

| § | Item | Result |
|---|---|---|
| 7.1 | Gate 0 verified for this mode's animation set | ✅ 58 checks + `board-stance-tests` 19 |
| 7.2 | 10-Phase Convergence Protocol run in full | ✅ all ten, each with a proof |
| 7.3 | Benchmark parity against the locked reference | ✅ D1–D6, D9 fixed; D7, D8 accepted; D10 ruled out of scope |
| 7.4 | World-Population Protocol applied | ✅ L1–L5 below |
| 7.5 | Five-tab shell conventions intact | ✅ untouched |
| 7.6 | vitest suite still green | ✅ `npx vitest run` — 4 files, 61 tests |
| 7.7 | No orphaned-mode work smuggled in | ✅ |
| 7.8 | No scope bleed into §6 features | ✅ |

## Verdict: **SIGNED OFF — 8 of 8.**

Eighth mode through the checklist, and the third board sport. All three now
share one animation suite, one camera, one HUD host and one economy idiom.

**Standing caveat, project-wide:** no FEL mode has run on real hardware. Phase 9
here is a gate-aiming desktop driver and a 390×844 touch pass through
`/play/snowboard`.

---

## Phase-by-phase

| Phase | Proof |
|---|---|
| 0 Platform preconditions | `gate0-rig-tests` 58 green |
| 1 Concept Lock | `docs/concept-lock/snowboard.md` — 20 criteria, 10 deviations |
| 2 Core mechanics | `snowboard-run-tests` 33 green — the boost is spendable and every gate is reachable |
| 3 Camera & framing | **0 `[FEL-FRAME]`** across runs, desktop and mobile |
| 4 Reachability | registry `snowboard_slalom` · `ENABLED_BABYLON_MODES` · `/play/snowboard` · `board-babylon.tsx` · `MODE_VERBS` · Controller Link |
| 5 Input & control schema | B relabelled SPIN (it never was a grab), X GRAB added, phone schema added |
| 6 World population | L1–L5 below |
| 7 Audio | wind bed, gate/miss language, and the cable grind and the Yeti clear each get their own cue **and** a camera beat |
| 8 Polish | GATES and BOOST on the bezel, BOOST banner, camera beats on the two biggest moments |
| 9 Playtest | `scripts/slalom-drive.mts` 4/12 gates, 400 pts, boost earned and spent, **0/0/0**; mobile touch 0 errors with GATES and BOOST visible |
| 10 This document | — |

---

## World-Population Protocol — Snowboard Slalom

```
L1 ground plane .......... PASS   34x220 piste, pitched, painted
L2 play-critical props ... PASS   gate poles, rocks, rails, kickers, the lift
                                  cable, the Yeti — every rule has an object
L3 boundary .............. PASS   the rider clamps at PISTE_HALF_WIDTH; treeline
                                  reads the edge from the gameplay camera
L4 crowd and life ........ PASS   8 spectators at three points down the course,
                                  well outside the gate corridor; they cheer a
                                  gate and a cleared Yeti
L5 ambience .............. PASS   snowfall, treeline, sky, wind bed
budget ................... draws 38  meshes 38  frame 16.7ms (60fps)
legibility ............... spectators sit at +-13m against a +-5m gate corridor,
                           so they never read as something on the line
```

---

## What the pass found

- **The tuck was never connected to the momentum model.** `move.update(dt,
  stickX, 0, …)` passed a hard-coded `0` directly under a comment reading "tuck
  adds". With `pushAccel: 0` on snow that left slope gravity as the only
  propulsion: measured at **0.75 m/s of descent on a 205m course**. The rider
  was not missing gates — in ninety seconds he only ever reached the first one.
- **The mode never set `root.rotation.y` anywhere**, so the rider and the board
  came down the mountain broadside.
- **The course was not a slalom.** `sin(i * 1.7) * 9` aliases into a near-random
  sequence with consecutive gates up to 12.8m apart across 15m of slope.
- **The boost meter could not be spent.** `boosting` was never assigned `true`
  anywhere in the codebase. Everything else was present — the acceleration, the
  drain, the HUD publish — which is exactly why it read as a working feature,
  and SSX Tricky is *named* after its boost state.
- **The touch overlay called a spin a grab**, and omitted the real grab entirely.
- **The rider rode in a karate guard**, because `SPORT_CLIP.boardIdle` resolved
  to `'guard'`.

### The rebuilt course was still wrong, and a test caught it

Sizing the new gates by eye gave a ramp of 3.2 → 5.0m a side, which asks **9.8m
of lateral travel from the last three gates against the 9.2m a rider can
actually cover** — the same unreachable-tail defect the rebuild existed to
remove, reintroduced at a smaller scale and invisible to play-testing, because a
bot that misses gates looks identical whether the course is hard or impossible.

`snowboard-run-tests` C1 checks every gate transition against **measured**
descent and carve speed rather than against our own constants, and failed on
exactly those three. The ramp is now 3.1 → 4.1, putting the hardest gate at
~8.2m, about 90% of what is available — demanding at the bottom without asking
for more than the rider has, with the remainder left for boost, which shortens
the window by making the descent faster.

That is the phase-2 rule doing its job: assert against reality, not against
yourself.
