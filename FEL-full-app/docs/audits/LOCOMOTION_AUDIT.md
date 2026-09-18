# LOCOMOTION AUDIT — Phase 0

**Date** 2026-09-12 · **Tree** `FEL-full-app` @ `babylon9-aaa-rendering` · **Code changes: none**

> **Map correction.** The mission targets `/tmp/fel3` with `src/locomotion/`. Neither exists in this
> repository. This app is Next 14 + Babylon 9; movement lives under `lib/babylon/core/` and animation
> under `lib/babylon/anim/`. Every path below is real and was read, not assumed.

**GATE 0: PASS.** Details in §6. The mission may proceed.

---

## 1. Where does movement actually live?

There is no shared locomotion module. **Eight** separate systems write character motion, one per mode
family, with no common core:

| Module | Owns | Used by |
|---|---|---|
| `lib/babylon/core/CourtMovement.ts` | basketball run/plant/sprint, Havok capsule | 1v1, 3v3, 3PT, dunk |
| `lib/babylon/core/BoardMovement.ts` | push/coast/carve/brake momentum | skate, snowboard, surf, big air |
| `lib/babylon/core/GroundRide.ts` | `Rider`: gravity, ground snap, grind rails | the board family |
| `lib/babylon/core/CombatMovement.ts` | fighter step/strafe/knockback | karate, karate_vs, mixedcombat |
| `lib/babylon/core/FreeRunCore.ts` | traceur run/vault/flip | freerun |
| `lib/babylon/core/FieldRun.ts` | carrier run, juke displacement | football |
| `lib/babylon/core/PassRun.ts` | receiver routes | football |
| `lib/babylon/core/MobSteering.ts` | crowd/agent steering | carnival, karate horde |

`git grep` counts **68 files** that write `.position` / `.rotation.y` / `vel.x|z` directly. Modes also
write the root themselves rather than going through their movement module — e.g.
`carnivalEvents.ts:294`, `ShowdownMode.ts:107-108`, `DunkMode.ts:2140`.

**Duplication is the finding.** Accel/decel, turn caps and plant behaviour are re-implemented per family
with independent numbers. A movement fix lands in one family and silently misses seven.

## 2. Velocity-driven or root-motion-driven?

**Velocity-driven. There is no root motion anywhere in the codebase.** `grep` for
`rootMotion|extractRoot|deltaPosition` across `lib/babylon` returns exactly one hit — a comment saying
it does not exist:

> `lib/babylon/anim/FootPlanting.ts:4` — *"(no root motion), so the honest fix for feet sliding under a
> moving root is …"*

Code sets a velocity and plays a pose on top of it. `CourtMovement.update()` integrates speed against
`accel`/`decel` and hands a velocity to the caller, which writes the root. Clips never author displacement.

**Implication for Phase 1:** "root motion is authoritative for displacement" is not a refactor of an
existing path — that path has to be built, and every authored clip in `lib/babylon/anim/authored/` was
written on the assumption that it never moves the root.

## 3. Blend space dimensionality

**1D at best; effectively 0D.** No `localVelX`/`localVelZ`, no blend space, no directional weighting
anywhere (`grep localVel|blendSpace|2D` → no hits).

What exists instead: **nine per-sport state machines** — `boardTree`, `combatTree`, `basketballTree`,
`footballTree`, `freeRunTree`, `netTree`, `tennisTree`, `soccerTree`, `baseballTree` — each an if/else
chain selecting **one** clip, crossfaded by `CharacterAnimator` (`lib/babylon/anim/CharacterAnimator.ts`).

**The locomotion clip set is 7 clips** (`lib/babylon/anim/clipRegistry.ts:32-36`):

| Clip | Source | Duration | Loops |
|---|---|---|---|
| `walk` | imported GLB | from GLB | yes |
| `run` | imported GLB | from GLB | yes |
| `idle_stand` | authored `locomotion.ts:51` | 3.0 s | yes |
| `strafe_left` | authored | ~1 s | yes |
| `strafe_right` | authored | ~1 s | yes |
| `jump_up` | authored `locomotion.ts:73` | 0.45 s | no |
| `jump_land` | authored `locomotion.ts:83` | 0.35 s | no |

**There are zero diagonal clips, no backpedal, and no dedicated defensive slide.** The mission asks for
"minimum 8 directions per speed ring" across four rings — 32 directional states. We have two lateral
strafes and a forward run. This is the single largest content gap in the mission.

## 4. Orientation — facing hard-locked to velocity or target

Yes, in several places, written straight onto the root with no rate limit:

- `lib/babylon/modes/carnivalEvents.ts:294` — `root.rotation.y = Math.atan2(vel.x, vel.z)` — **pure velocity lock**
- `lib/babylon/modes/KarateVSMode.ts:326` and `MixedCombatMode.ts:450` — target lock recomputed per frame
- `lib/babylon/modes/ShowdownMode.ts:107-108` — both fighters snapped to face each other
- `lib/babylon/modes/precisionModes.ts:455` — golfer snapped to the pin
- `lib/babylon/core/GroundRide.ts:176` — rail owns yaw during a grind

**Partially mitigated already.** BIOMECH-WAVE2 (commit `3083e17`) introduced `Biomech.lockOnYaw` with a
9 rad/s cap for the fight modes, and `CourtMovement` has a real cap: `turnRateDegAtSpeed: 540`
(`CourtMovement.ts:47`). So the mission's premise "no angular cap anywhere" is **not accurate for
basketball or the fights** — it is accurate for carnival, golf and the ride family.

540°/s at top speed is nonetheless very permissive: a 180 completes in a third of a second with no
plant-and-cut state, which is the clunk the mission describes.

## 5. Foot contact

**Better than the mission assumes.** `lib/babylon/anim/FootPlanting.ts` is real contact logic, not
unconditional IK:

- `stepContact()` (line 54) takes a clip-driven `ankleHeight` and returns `{planted, pin}`
- Hysteresis is explicit: `downAt` to plant, a higher release threshold to unplant (line 34)
- While `planted`, the caller drives IK to a **world-space pin**, so the foot holds position under a
  moving root

**No clip exports ground-contact events.** Contact is inferred from ankle height at runtime, because the
authored clips carry no event track. That inference is the only contact signal available.

## 6. GATE 0 — rig normalization · **PASS**

`lib/babylon/anim/rigNormalize.ts`:

- `normalizeRigNames(container)` (line 34) strips the Mixamo prefix from every bone **and** its linked
  transform node, and is documented idempotent for already-clean rigs
- `gateContainerRig(container, sourceId)` (line 60) calls the normalizer, then audits, then **throws**:
  - line 64 — `no skeleton — not a rigged character`
  - line 68 — `REJECTED at import: …` when `report.conforms` is false

It is wired into the real load path at `lib/babylon/core/CharacterLibrary.ts:19`. This is a hard gate,
not a warning: a prefixed or non-conformant rig cannot reach runtime — it throws at import.

Prefix handling is defence-in-depth: `lib/babylon/anim/boneLookup.ts` normalizes `mixamorig:Hips` →
`Hips`, `LeftArm_c21` → `LeftArm`, `Hips_p1` → `Hips`, and `lib/anim/rebinder.ts:30` strips
`mixamorig:` / `fel_` / `Armature|` for clip rebinding.

**Evidence of PASS:** the gate throws rather than warns, it is on the load path, and the 3-D modes
demonstrably run — so no prefixed rig is surviving to runtime.

## 7. Ball attachment — **violates the Phase 2 requirement**

**The ball is parented to a hand bone.** `lib/babylon/anim/ballRig.ts:28` — `ball.setParent(node)`, with
`ball.setParent(null)` on release (line 38, relying on Babylon preserving world transform).
`lib/babylon/anim/ballCarry.ts:14` imports `attachBallToHand` and builds the carry on top of it, and
line 99 unparents on release.

The mission requires the inverse: ball as an independent entity on an authored arc, hand solving **to**
the ball. Nothing in that direction exists today.

## 8. Havok usage

**Kinematic capsule, not a character controller and not dynamic.**

- `lib/babylon/core/CourtMovement.ts:153` — `new PhysicsAggregate(…)`, shape `PhysicsShapeType.CAPSULE`
- line 158 — `this.agg.body.setMotionType(PhysicsMotionType.ANIMATED)` — i.e. kinematic: the game owns
  the transform, physics does not push it
- `lib/babylon/core/ContactSystem.ts:90` — a second CAPSULE aggregate for body-on-body contact

Current accel/decel model, real numbers from `MovementTuning` (`CourtMovement.ts:42-47`):

| Field | Value |
|---|---|
| `accel` | 26 m/s² from stop toward target |
| `decel` | 34 m/s² on stick release |
| hard-plant decel | `decel × 1.4` ≈ 47.6 m/s² (line 99) |
| `turnRateDegAtSpeed` | 540 °/s at top speed |
| first-step rule | below 1.2 m/s uses `accel`; above it `sprintAccel` (line 113) |
| ramp to top speed | ~0.18 s (documented, line 8) |

## 9. Frame budget — **NOT MEASURED**

Reporting honestly rather than inventing numbers: I have no captured profile for 1v1 at full player
count on a mid-tier laptop profile, and this session had no budget left to run one.

What exists to do it with: `scripts/probes/` drives real modes headlessly per rendered frame, and the
dev HUD already reports fps/draws/ms (visible in the deploy screenshots: `60 fps, avg 16.7ms, draws 782,
meshes 111` on the skate scene). A per-pass split (animation vs physics vs render) needs
`scene.instrumentation` counters enabled in a probe run — roughly an hour of work, not yet done.

**This is an open Phase 0 item, and the Phase 3 gate "animation pass ≤ 4ms" cannot be judged without it.**

---

## Summary — worse than the brief assumed, in two places

1. **No root motion at all.** Phase 1's "root motion is authoritative" is new construction, and every
   authored clip was written assuming the root never moves.
2. **Seven locomotion clips, zero diagonals.** The 2D blend space has almost no content to blend; 32
   directional states are implied and 3 exist.

**Better than assumed in two places:** foot contact is real and hysteresis-gated, and angular caps
already exist for basketball (540°/s) and the fight modes (9 rad/s).

**Unchanged risk:** eight parallel movement systems mean Phase 1's "single shared module every mode
consumes" is a migration of eight call sites, not a greenfield module — and the board family's
`Rider`/`BoardMovement` split is load-bearing for skate, surf, snowboard and big air simultaneously.
