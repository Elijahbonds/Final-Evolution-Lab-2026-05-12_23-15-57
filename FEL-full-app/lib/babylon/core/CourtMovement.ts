// CourtMovement — the 2K-weight locomotion model for basketball (Mode 1,
// Phase 2). Pure math, headless-testable; owns planar velocity for one
// player body. Modes feed it stick intent each frame and integrate the
// returned velocity into the character root (or, with Phase 4 contact,
// a Havok capsule via PhysicsBodyBinding below).
//
// THE FEEL TARGET (what makes 2K read heavier than arcade ball):
//   1. ACCEL < top speed instantly? No — acceleration is a ramp (~0.18s to
//      top speed), and SPRINT accel is slower than the first step (burst
//      then cruise), so a sprint feels "wound up", not toggled.
//   2. DECEL IS STRONGER THAN ACCEL and shortest when moving fastest —
//      planting to a stop at full sprint takes ~0.28s, never a glide.
//   3. PLANT-AND-CUT: demanding a direction >110° away from current travel
//      at speed triggers a plant: velocity is bled hard for ~0.12s before
//      the new direction takes over. Cutting at full sprint COSTS speed;
//      cutting from a jog is nearly free. This single rule is most of
//      "movement weight".
//   4. LATERAL G-CAP: mid-speed steering can't turn faster than a fixed
//      turn rate (deg/sec at speed), so sweeping the stick in a circle
//      traces an arc, not a polygon.

import { Vector3 } from '@babylonjs/core';
import {
  PhysicsAggregate, PhysicsMotionType, PhysicsShapeType, Quaternion,
} from '@babylonjs/core';
import type { Scene, TransformNode } from '@babylonjs/core';

export interface MovementTuning {
  maxSpeed: number;        // sprint top speed (m/s)
  jogFactor: number;       // non-sprint speed = maxSpeed * jogFactor
  accel: number;           // m/s^2 from stop toward target
  sprintAccel: number;     // m/s^2 once already moving and sprinting (cruise ramp)
  decel: number;           // m/s^2 when stick released (plant to stop)
  plantDot: number;        // direction dot below this (≈>110°) = plant-and-cut
  plantBleedSec: number;   // how long a plant bleeds speed before redirect
  turnRateDegAtSpeed: number; // max facing/velocity turn at top speed
}

export const DEFAULT_MOVEMENT: MovementTuning = {
  maxSpeed: 6.4,
  jogFactor: 0.68,
  accel: 26,
  sprintAccel: 11,
  decel: 34,
  plantDot: -0.34,
  plantBleedSec: 0.12,
  turnRateDegAtSpeed: 540,
};

export interface MovementState {
  vel: Vector3;
  speed01: number;
  planting: boolean;
  facingRad: number;
}

export class CourtMovement {
  readonly vel: Vector3 = Vector3.Zero();
  facing = 0;
  /** Stance/loadout speed multiplier (combat modes) — scales top speed,
   *  not the stick, so partial-stick control is unaffected. */
  speedScale = 1;
  private plantTimer = 0;
  private plantFloor = 0;
  private cutActive = false;

  constructor(private tune: MovementTuning = DEFAULT_MOVEMENT) {}

  /** Advance one frame. moveX/moveY are stick-space (-1..1, +Y = up-stick =
   *  forward/away from camera = -Z on court, matching DribbleController's
   *  convention). Returns the state for animation/HUD. */
  update(dt: number, moveX: number, moveY: number, sprint: boolean): MovementState {
    this.plantTimer = Math.max(0, this.plantTimer - dt);
    const mag = Math.min(1, Math.hypot(moveX, moveY));
    const t = this.tune;

    if (mag > 0.05) {
      const wantDir = new Vector3(moveX, 0, -moveY).normalize();
      const topSpeed = t.maxSpeed * this.speedScale * (sprint ? 1 : t.jogFactor) * mag;
      const speed = this.vel.length();

      // Plant-and-cut: hard direction reversal at pace bleeds speed first.
      // Cost scales with speed: a full-sprint reversal keeps only ~42% of
      // entry speed; the same cut from a jog keeps ~62% — explosive cuts
      // are a sprint gamble, not a constant tax. Latched per reversal: the
      // recovery frames (speed climbing back while the velocity vector is
      // still rotating around) must not re-trigger the plant.
      const opposed = speed > 0.001 && Vector3.Dot(this.vel.normalize(), wantDir) < t.plantDot;
      if (opposed && speed > t.maxSpeed * 0.45 && this.plantTimer === 0 && !this.cutActive) {
        this.cutActive = true;
        this.plantTimer = t.plantBleedSec;
        this.plantFloor = speed * (1 - 0.55 * Math.min(1, speed / t.maxSpeed));
      }
      if (!opposed) this.cutActive = false;

      if (this.plantTimer > 0) {
        // Mid-plant: strong bleed toward the floor, no new direction yet —
        // the "studs in the hardwood" beat that sells weight.
        const newSpeed = Math.max(this.plantFloor, speed - t.decel * 1.4 * dt);
        if (speed > 0.001) this.vel.copyFrom(this.vel.normalize().scale(newSpeed)); else this.vel.setAll(0);
      } else {
        // Turn-rate cap at speed (lateral G): steer current velocity toward
        // the wanted direction, then accelerate along it.
        const maxTurn = (t.turnRateDegAtSpeed * Math.PI / 180) * dt
          * (1 - 0.55 * Math.min(1, speed / t.maxSpeed)); // slower turn at top speed
        let dir = speed > 0.001 ? this.vel.normalize() : wantDir.clone();
        const angle = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(dir, wantDir))));
        if (angle > 1e-4) {
          const k = Math.min(1, maxTurn / angle);
          dir = Vector3.Lerp(dir, wantDir, k).normalize();
        }
        // Burst off the mark, slower cruise ramp when sprinting at pace.
        const a = speed < 1.2 ? t.accel : (sprint ? t.sprintAccel : t.accel);
        const newSpeed = Math.min(topSpeed, speed + a * dt);
        this.vel.copyFrom(dir.scale(newSpeed));
      }

      // Facing follows travel direction, rate-limited.
      const wantFacing = Math.atan2(this.vel.x, this.vel.z);
      let d = wantFacing - this.facing;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      const step = 10 * dt;
      this.facing += Math.max(-step, Math.min(step, d));
    } else {
      // Stick released: plant to a stop, fast but not instant.
      const speed = this.vel.length();
      if (speed > 0) {
        const newSpeed = Math.max(0, speed - t.decel * dt);
        this.vel.scaleInPlace(speed > 0.001 ? newSpeed / speed : 0);
      }
    }

    return {
      vel: this.vel,
      speed01: Math.min(1, this.vel.length() / t.maxSpeed),
      planting: this.plantTimer > 0,
      facingRad: this.facing,
    };
  }

  /** Hard stop (possession change, whistle). Keeps facing. */
  stop(): void { this.vel.setAll(0); this.plantTimer = 0; }
}

/** Binds a character root to a Havok capsule. KINEMATIC (ANIMATED motion
 *  type) in Phase 2: the CourtMovement-integrated root position drives the
 *  body so other bodies collide with it; Phase 4 flips the pair to dynamic
 *  impulse exchange for real contact weight. */
export class PhysicsBodyBinding {
  readonly agg: PhysicsAggregate;
  constructor(scene: Scene, root: TransformNode, radius = 0.38, height = 1.8) {
    this.agg = new PhysicsAggregate(
      root as never, PhysicsShapeType.CAPSULE,
      { mass: 0, radius, pointA: new Vector3(0, radius, 0), pointB: new Vector3(0, height - radius, 0) } as never,
      scene,
    );
    this.agg.body.setMotionType(PhysicsMotionType.ANIMATED);
    this.agg.body.setCollisionCallbackEnabled(true);
  }
  /** Kinematic sync — call after the mode moves the root. */
  sync(root: TransformNode): void {
    this.agg.body.setTargetTransform(root.absolutePosition, root.absoluteRotationQuaternion ?? Quaternion.Identity());
  }
  dispose(): void { this.agg.dispose(); }
}
