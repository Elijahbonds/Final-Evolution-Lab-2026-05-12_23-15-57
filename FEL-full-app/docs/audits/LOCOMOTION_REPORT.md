# LOCOMOTION CORE — mission report

**Date** 2026-09-12 · Commits `91f386c` → `be7b40a` · Suite **92 files / 764 tests green**

## Audit findings (Phase 0 — full detail in `LOCOMOTION_AUDIT.md`)

**GATE 0: PASS.** `gateContainerRig` normalizes then *throws* on a non-conformant rig, on the real
load path at `CharacterLibrary.ts:19`. No `mixamorig:` name can reach runtime.

Worse than the brief assumed:
- **No root motion exists anywhere.** The only match in the tree is a comment saying so
  (`FootPlanting.ts:4`). Every authored clip was written assuming the root never moves.
- **7 locomotion clips, 0 diagonals.** `walk`, `run`, `idle_stand`, `strafe_left`, `strafe_right`,
  `jump_up`, `jump_land`. The brief implies 32 directional states; 3 exist.

Better than assumed:
- Foot contact is real hysteresis-gated logic driving a world-space pin, not unconditional IK.
- Angular caps already existed for basketball (540°/s) and the fights (9 rad/s via `lockOnYaw`).

Structural: **8 parallel movement systems**, 68 files writing position/rotation/velocity directly,
and modes bypassing their own movement module.

## What changed, by file

| File | Change |
|---|---|
| `lib/locomotion/types.ts` | new — profile/intent/state contracts; facing decoupled from movement |
| `lib/locomotion/profiles.ts` | new — 8 mode profiles, data only, carrying today's measured numbers |
| `lib/locomotion/BlendSpace2D.ts` | new — 2D blend from local velocity, 8 compass points × 4 rings, slide ring, `smoothWeights` rate limiter |
| `lib/locomotion/MotionCore.ts` | new — `resolveIntent`, `solveMotion` (velocity and heading solved separately, speed-scaled turn cap), `stepState` (120ms hysteresis guard) |
| `lib/locomotion/moves/MoveGraph.ts` | new — 6 moves as records with entry states, cancel windows, authored chains, momentum cost |
| `lib/babylon/core/CameraDirector.ts` | `fovGain`/`fovAtSpeed` config + `applyDynamicFov`; `court` and `hoops` opted in |
| `tests/locomotion/*.test.ts` | new — 36 tests: the Phase 3 gates, move-graph rules, FOV curve |
| `vitest.config.ts` | collect `tests/**/*.test.ts` so the brief's directory runs |
| `docs/audits/LOCOMOTION_AUDIT.md` | new — Phase 0 |

## Gate table — measured numbers

| Gate | Threshold | Measured | Status |
|---|---|---|---|
| Heading change per frame | ≤ `maxTurnRateDegPerSec / 60` | never exceeded across all 8 profiles, 240 frames each, under a demanded 180° every frame | **PASS** |
| Time in any locomotion state | ≥ 120 ms | every transition ≥ 120 ms with input flapping every frame | **PASS** |
| Blend weight discontinuity | < 0.25 | **0.208** worst frame-to-frame (raw space peaks 0.496; rate limiter caps it) | **PASS** |
| Clip entering at weight 1.0, no blend | 0 occurrences | 0 — a 0→1 transition cannot complete faster than `minBlendSec` (80 ms) | **PASS** |
| Move fires only from entry states | no move interrupts a plant | asserted across all 6 records | **PASS** |
| Chained moves cost momentum | visible cost | 3 crossovers → **< 60%** of starting speed | **PASS** |
| Foot slide during ground contact | < 2 cm/frame | **NOT MEASURED** — needs a live scene | **OPEN** |
| Hand-to-ball IK error | < 4 cm | **NOT MEASURED** — ball is still hand-parented | **OPEN** |
| Root motion vs physics divergence | < 5 cm | **N/A** — no root motion exists to diverge | **OPEN** |
| Frame budget, 1v1 mid-tier | ≥ 60fps, anim ≤ 4ms | **NOT MEASURED** — no profile captured | **OPEN** |

## What did not get done, and why

1. **RootMotionExtract / PhysicsReconcile — not built.** Phase 0 found no root motion anywhere, so
   this is new construction plus re-authoring every clip to carry displacement. It is the single
   largest item in the mission and cannot be honestly compressed.
2. **No mode consumes the core yet.** The eight call sites are a migration with real regression
   surface on modes that currently pass their own A+ passes. Wiring one mode belongs in its own pass
   with the pad probes running.
3. **Ball not decoupled.** Still `ball.setParent(handNode)` (`ballRig.ts:28`). Inverting it to
   ball-on-arc + hand-solves-to-ball touches every dunk and hoops release path.
4. **29 directional clips unauthored.** The blend space falls back to the nearest authored neighbour,
   so it is correct today and improves as clips land — but the content is the real gap.
5. **Turntable harness — not built.** Needs the core driving a live character first.
6. **Frame budget unmeasured.** Needs `scene.instrumentation` in a probe run (~1 hour).
7. **Phase 4 items 4–7** (materials, skin/hair, contact feedback, crowd) — surveyed as largely
   already present (PBR + IBL, `gameFeel.ts`, `Onlookers`); no work was done and none is claimed.

## Remaining risk

- **Migration risk is the dominant one.** Eight systems, each load-bearing for shipped modes. The
  board family's `Rider`/`BoardMovement` split serves skate, surf, snowboard and big air at once —
  one regression there is four broken modes.
- **The core is unproven in motion.** Every gate above is a unit test. Nothing has driven a character
  on screen, so feel is unvalidated.
- **Profiles reproduce today's numbers deliberately.** They are not retuned. Switching a mode to the
  core should feel identical; if it does not, the migration changed something it should not have.
- **`smoothWeights` deliberately does not renormalise.** Sum can dip below 1 mid-blend. That is a
  partial blend, but any consumer assuming weights sum to 1 must be checked.
