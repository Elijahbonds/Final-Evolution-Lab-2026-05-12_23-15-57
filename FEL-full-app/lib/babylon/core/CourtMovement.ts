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
  /** DRIBBLE PACE (owner, 2026-09-17: "a dribble system built for changing speed and direction with smooth start-ups and
   *  stops … a difference in speed and intensity with the turbo"). Opt-in: with `gears` the speed follows a first-order lag
   *  to a WALK / JOG / SPRINT target with per-gear accel caps, a loaded first step, a speed-scaled stop, and a kick on the
   *  sprint press. Without it the old snap model (accel/decel above) runs untouched (combat, tennis, football). */
  gears?: GearTuning;
}

export type Gear = 'stop' | 'walk' | 'jog' | 'sprint';
export interface GearTuning {
  walkStick: number;       // stick magnitude under this = a walk
  walkFactor: number;      // walk top = maxSpeed * walkFactor (the jog uses jogFactor)
  jogTau: number;          // s — the lag to the jog target
  sprintTau: number;       // s — the lag to the sprint target (shorter: the burst)
  jogAccel: number;        // m/s² cap toward a jog target
  sprintAccel: number;     // m/s² cap toward a sprint target
  loadBelow: number;       // m/s — under this the first step is LOADED (accel scaled from loadScale up to 1)
  loadScale: number;
  gearDownDecel: number;   // m/s² toward a LOWER target with the stick still held (letting off the turbo)
  stopDecelLow: number;    // m/s² at a walk when the stick is released
  stopDecelHigh: number;   // m/s² at top speed when the stick is released (a sprint slides longer)
  sprintKick: number;      // m/s added on the sprint PRESS while already moving
  kickAbove: number;       // m/s — the kick needs this much run already
}
/** The launch after a move: accel caps ×, for this long (owner: "faster launches"). */
export const LAUNCH_BOOST = 1.7, LAUNCH_SEC = 0.45;
export const GEARS_HOOPS: GearTuning = {
  walkStick: 0.45, walkFactor: 0.38,
  jogTau: 0.17, sprintTau: 0.15, jogAccel: 15, sprintAccel: 24,
  loadBelow: 1.2, loadScale: 0.45,
  gearDownDecel: 9,
  stopDecelLow: 22, stopDecelHigh: 11,
  sprintKick: 0.9, kickAbove: 1.5,
};

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
  gear?: Gear;          // gears only
  intensity01?: number; // gears only: how hard the body is working (sprint 1 at top speed, a jog ~0.7, kicks/bursts add)
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
  private sprintWas = false;   // gears: the sprint press edge
  private burst01 = 0;         // gears: intensity from a kick / a burst, decaying
  private gearNow: Gear = 'stop';
  private launchLeft = 0;      // gears: seconds of FASTER LAUNCH after a move (accel caps up, no loaded step)
  private pausedNow = false;   // gears: PAUSIN' — the stick is ignored, the body stops on a dime
  /** gears: the next `sec` seconds accelerate at LAUNCH_BOOST× with no loaded first step (the explode after a move). */
  launchFor(sec: number): void { this.launchLeft = Math.max(this.launchLeft, sec); }
  /** gears: pausin' — while on, the stick is ignored and the body stops hard; off, movement resumes. */
  pause(on: boolean): void { this.pausedNow = on; }
  get paused(): boolean { return this.pausedNow; }
  /** gears: a burst from outside (a crossover, an explode-out) adds to the intensity read. */
  noteBurst(amount01 = 0.35): void { this.burst01 = Math.min(1, this.burst01 + amount01); }
  get gear(): Gear { return this.gearNow; }

  constructor(private tune: MovementTuning = DEFAULT_MOVEMENT) {}

  /** Advance one frame. moveX/moveY are stick-space (-1..1, +Y = up-stick =
   *  forward/away from camera = -Z on court, matching DribbleController's
   *  convention). Returns the state for animation/HUD. */
  update(dt: number, moveX: number, moveY: number, sprint: boolean): MovementState {
    this.plantTimer = Math.max(0, this.plantTimer - dt);
    this.launchLeft = Math.max(0, this.launchLeft - dt);
    const mag = this.pausedNow ? 0 : Math.min(1, Math.hypot(moveX, moveY));   // pausin': the stick is ignored
    const t = this.tune;

    if (mag > 0.05) {
      const wantDir = new Vector3(moveX, 0, -moveY).normalize();
      // gears: a soft stick is a WALK (its own top), a pushed one a jog, the turbo a sprint — three speeds, not one scaled by the stick
      const gearTop = t.gears
        ? (sprint ? t.maxSpeed : mag < t.gears.walkStick ? t.maxSpeed * t.gears.walkFactor * (mag / t.gears.walkStick) : t.maxSpeed * t.jogFactor * (0.85 + 0.15 * (mag - t.gears.walkStick) / (1 - t.gears.walkStick)))
        : t.maxSpeed * (sprint ? 1 : t.jogFactor) * mag;
      const topSpeed = gearTop * this.speedScale;
      if (t.gears) this.gearNow = sprint ? 'sprint' : mag < t.gears.walkStick ? 'walk' : 'jog';
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
        let newSpeed: number;
        if (t.gears) {
          // DRIBBLE PACE: a lag to the gear's target, capped per gear, loaded off the mark; a LOWER target (off the turbo,
          // easing the stick) bleeds at the gear-down rate rather than snapping; the sprint PRESS kicks a moving body.
          const g = t.gears;
          const err = topSpeed - speed;
          if (err >= 0) {
            const launching = this.launchLeft > 0;
            const cap = (sprint ? g.sprintAccel : g.jogAccel) * (launching ? LAUNCH_BOOST : 1), tau = (sprint ? g.sprintTau : g.jogTau) * (launching ? 0.7 : 1);
            const load = !launching && speed < g.loadBelow ? g.loadScale + (1 - g.loadScale) * (speed / g.loadBelow) : 1;   // a launch out of a move has no loaded step
            newSpeed = Math.min(topSpeed, speed + Math.min(cap * load, err / tau) * dt);
          } else newSpeed = Math.max(topSpeed, speed - g.gearDownDecel * dt);
          if (sprint && !this.sprintWas && speed >= g.kickAbove) { newSpeed = Math.min(t.maxSpeed * this.speedScale, newSpeed + g.sprintKick); this.burst01 = Math.min(1, this.burst01 + 0.3); }
        } else {
          // Burst off the mark, slower cruise ramp when sprinting at pace.
          const a = speed < 1.2 ? t.accel : (sprint ? t.sprintAccel : t.accel);
          newSpeed = Math.min(topSpeed, speed + a * dt);
        }
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
      // Stick released: plant to a stop, fast but not instant. gears: the stop scales with pace — a sprint slides longer
      // (stopDecelHigh at top speed) than a walk (stopDecelLow), so a full-speed stop is a visible gather, not a wall.
      const speed = this.vel.length();
      if (t.gears) this.gearNow = 'stop';
      if (speed > 0) {
        const decel = t.gears ? (this.pausedNow ? t.gears.stopDecelLow * 1.5 : t.gears.stopDecelLow + (t.gears.stopDecelHigh - t.gears.stopDecelLow) * Math.min(1, speed / t.maxSpeed)) : t.decel;   // pausin' stops on a dime
        const newSpeed = Math.max(0, speed - decel * dt);
        this.vel.scaleInPlace(speed > 0.001 ? newSpeed / speed : 0);
      }
    }

    this.sprintWas = sprint && mag > 0.05;
    this.burst01 = Math.max(0, this.burst01 - dt / 0.35);
    const speed01 = Math.min(1, this.vel.length() / t.maxSpeed);
    return {
      vel: this.vel,
      speed01,
      planting: this.plantTimer > 0,
      facingRad: this.facing,
      ...(t.gears ? { gear: this.gearNow, intensity01: Math.min(1, speed01 * (this.gearNow === 'sprint' ? 1 : 0.72) + this.burst01 * 0.35) } : {}),
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
