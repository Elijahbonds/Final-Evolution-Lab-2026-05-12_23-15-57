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
  /** THE CUT COST (2K, Phase 5): a change of direction at pace is paid for ONCE, at the moment the stick asks for it —
   *  a graded bleed between `minDeg` (free) and the plant threshold (the full plant-and-cut above), scaled by how
   *  fast the body is going. A jog cut stays nearly free; a full-sprint 90° cut keeps ~1 − maxCost of its speed.
   *  Opt-in: without it a 90° cut at a sprint is free (only the turn-rate cap slows it), which is the old behaviour. */
  cutCost?: CutCostTuning;
}
export interface CutCostTuning {
  minDeg: number;     // under this angle a redirect is free (a lane change, not a cut)
  maxCost: number;    // fraction of speed paid for a cut at the plant threshold, at top speed
  minSpeed01: number; // under this fraction of top speed there is nothing to pay
}
export const CUT_COST_HOOPS: CutCostTuning = { minDeg: 45, maxCost: 0.3, minSpeed01: 0.45 };

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
  /** H3a (owner 2026-10-17, "acceleration felt off… too twitchy"): the kick and the cut cost are SPREAD over these seconds, not
   *  paid in one frame — a 0.9 m/s jump in one frame (68 m/s²) read as a twitch. */
  kickSec?: number;
  cutSec?: number;
  /** H3a: the most the speed's acceleration may change in a second (m/s³) — a stop right after a full push no longer flips from
   *  +22 to −20 m/s² in one frame. Off when absent. */
  jerk?: number;
  /** H3a: a stick this far round from the travel (deg) is a REVERSAL: the body brakes through zero and pushes off the new way,
   *  instead of steering the velocity round (a lerp-and-normalise never turns a vector that points the other way — an exact
   *  pull-back kept him running forward). Off when absent. */
  reverseDeg?: number;
  /** H3a: the brake on a reversal (m/s²), stronger than the stop's: the plant, then the push back. */
  reverseDecel?: number;
}
/** The launch after a move: accel caps ×, for this long (owner: "faster launches"). */
export const LAUNCH_BOOST = 1.7, LAUNCH_SEC = 0.45;
// H3a (owner 2026-10-17: "acceleration felt off" — too slow to get going, slides on stops, sluggish turns, AND twitchy; measured by
// scripts/probes/_stick-response.mts): quicker lags and a lighter loaded step (90 % of a jog 450 → ~270 ms), firmer stops (a sprint's
// 1.41 m slide → ~0.6 m), a real reversal, and no one-frame snaps (the kick and the cut cost spread, a jerk limit). FEEL NUMBERS:
// jogTau 0.17 → 0.10, sprintTau 0.15 → 0.10, jogAccel 15 → 22, sprintAccel 24 → 26, loadScale 0.45 → 0.7, gearDownDecel 9 → 12,
// stopDecelLow 22 → 32, stopDecelHigh 11 → 26; the plant bleed (gears) 47.6 → reverseDecel 34, jerk-limited; new: kickSec 0.1, cutSec 0.08, jerk 900, reverseDeg 135, reverseDecel 34.
/** H3a: a committed hop's glide (the pre-H3a stop: 22 m/s² at a walk, 11 at top speed) — the step-back keeps its travel. */
export const HOP_GLIDE_LOW = 22, HOP_GLIDE_HIGH = 11;
export const GEARS_HOOPS: GearTuning = {
  walkStick: 0.45, walkFactor: 0.38,
  jogTau: 0.10, sprintTau: 0.10, jogAccel: 22, sprintAccel: 26,
  loadBelow: 1.2, loadScale: 0.7,
  gearDownDecel: 12,
  stopDecelLow: 32, stopDecelHigh: 26,
  sprintKick: 0.9, kickAbove: 1.5,
  kickSec: 0.1, cutSec: 0.08, jerk: 900, reverseDeg: 135, reverseDecel: 34,
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
  private cutTaxed = false;    // cutCost: latched per cut so the recovery frames (velocity swinging round) are not taxed again
  private cutGraceLeft = 0;    // cutCost: seconds a controller-authored redirect is exempt (it wrote the speed it wants)
  /** cutCost, for a dev readout: cuts paid so far, and the last one's cost (fraction of speed) and angle (deg). */
  cutsPaid = 0; lastCut = { cost: 0, deg: 0, speed: 0 };
  private sprintWas = false;   // gears: the sprint press edge
  private burst01 = 0;         // gears: intensity from a kick / a burst, decaying
  private gearNow: Gear = 'stop';
  private launchLeft = 0;      // gears: seconds of FASTER LAUNCH after a move (accel caps up, no loaded step)
  private kickLeft = 0;        // H3a: m/s of the sprint kick still to add (spread over kickSec)
  private cutDebt = 0;         // H3a: m/s of the cut cost still to pay (spread over cutSec), no re-acceleration while paying
  private cutRate = 0;
  private accPrev = 0;         // H3a: last frame's speed acceleration (m/s²), for the jerk limit
  private pausedNow = false;   // gears: PAUSIN' — the stick is ignored, the body stops on a dime
  /** gears: the next `sec` seconds accelerate at LAUNCH_BOOST× with no loaded first step (the explode after a move). */
  launchFor(sec: number): void { this.launchLeft = Math.max(this.launchLeft, sec); }
  /** cutCost: the next `sec` seconds of steering pay no cut cost — a move wrote the velocity on purpose. */
  cutGrace(sec: number): void { this.cutGraceLeft = Math.max(this.cutGraceLeft, sec); }
  /** gears: pausin' — while on, the stick is ignored and the body stops hard; off, movement resumes. */
  pause(on: boolean): void { this.pausedNow = on; }
  /** H2 (the BTB slide's hop): for the next `sec` seconds the velocity a move wrote is KEPT — no stick, no steering, no stop — and the
   *  facing is held: a committed hop is ballistic, not a stick-driven run (released, the stop would bleed a 3 m/s hop in a step).
   *  Nothing calls it but a move that asks; at 0 the update is exactly what it was. */
  holdFor(sec: number): void { this.holdLeft = Math.max(this.holdLeft, sec); }
  /** H2b (the spin's step-out, plan §4.14): turn the facing to `yaw` at `rateRad` per second, the short way, whatever the stick
   *  says — the body comes out of a spin on its exit run with the stick at home too. Cleared on arrival or by stop(). */
  turnTo(yaw: number, rateRad: number): void { this.slew = { yaw, rate: Math.max(0.1, rateRad) }; }
  private slew: { yaw: number; rate: number } | null = null;
  private stepSlew(dt: number): void {
    const s = this.slew; if (!s) return;
    let d = s.yaw - this.facing; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    const step = s.rate * dt;
    if (Math.abs(d) <= step) { this.facing = s.yaw; this.slew = null; } else this.facing += Math.sign(d) * step;
  }
  /** H2b (the step-back, plan §4.12): for the next `sec` seconds the stick reads as HOME — the hop a move wrote plays out exactly as it
   *  does with the thumb off the stick (the stop's own decel, the facing kept), whatever the thumb is doing. Without it a step-back
   *  thrown with the left stick still pushed at the rim never stopped: the stick STEERS the velocity round at the capped turn rate
   *  instead of braking through zero, so the body backpedalled at 3.7 m/s for over a second and turned its back to the rim (measured:
   *  180° by 0.4 s). Cleared by stop(). */
  ignoreStickFor(sec: number): void { this.stickOffLeft = Math.max(this.stickOffLeft, sec); }
  private stickOffLeft = 0;
  get holding(): boolean { return this.holdLeft > 0; }
  private holdLeft = 0;
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
    this.cutGraceLeft = Math.max(0, this.cutGraceLeft - dt);
    this.stickOffLeft = Math.max(0, this.stickOffLeft - dt);
    const mag = this.pausedNow || this.stickOffLeft > 0 ? 0 : Math.min(1, Math.hypot(moveX, moveY));   // pausin' (and a committed step-back, H2b): the stick is ignored
    const t = this.tune;
    this.stepSlew(dt);   // H2b: a pending step-out turn (turnTo)
    if (this.holdLeft > 0) {   // H2: a committed hop (holdFor) — the velocity and the facing as the move wrote them
      this.holdLeft = Math.max(0, this.holdLeft - dt);
      this.sprintWas = sprint && mag > 0.05;
      this.burst01 = Math.max(0, this.burst01 - dt / 0.35);
      const s01 = Math.min(1, this.vel.length() / t.maxSpeed);
      return { vel: this.vel, speed01: s01, planting: false, facingRad: this.facing, ...(t.gears ? { gear: this.gearNow, intensity01: Math.min(1, s01 * 0.72 + this.burst01 * 0.35) } : {}) };
    }

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
        let newSpeed = Math.max(this.plantFloor, speed - (t.gears?.reverseDecel ?? t.decel * 1.4) * dt);   // H3a (gears): the reversal's own brake, not 47.6 m/s²
        if (t.gears?.jerk) {   // H3a: the plant comes on over a few frames too
          const want = (newSpeed - speed) / dt, j = t.gears.jerk * dt;
          const a = Math.max(this.accPrev - j, Math.min(this.accPrev + j, want));
          newSpeed = Math.max(this.plantFloor, Math.max(newSpeed, speed + a * dt)); this.accPrev = (newSpeed - speed) / dt;
        }
        if (speed > 0.001) this.vel.copyFrom(this.vel.normalize().scale(newSpeed)); else this.vel.setAll(0);
      } else {
        // Turn-rate cap at speed (lateral G): steer current velocity toward
        // the wanted direction, then accelerate along it.
        const maxTurn = (t.turnRateDegAtSpeed * Math.PI / 180) * dt
          * (1 - 0.55 * Math.min(1, speed / t.maxSpeed)); // slower turn at top speed
        // THE CUT COST (Phase 5): paid once when the stick first asks for a real change of direction at pace. Graded from
        // free at `minDeg` up to `maxCost` at the plant threshold, and by speed² so a jog cut is nearly free. Latched per
        // cut; released once the velocity has come round to within half the free angle. A discrete cost, not a per-frame
        // drag, so it is the same at 30 fps and 144.
        // NOTE: `vel` is unit length here — the plant check above normalised it in place and the code below steers by
        // `dir` and rebuilds the vector from `newSpeed`. The cut cost therefore takes the CAPTURED `speed` and hands the
        // integrator `speedT`; it never reads `vel.length()` in this branch.
        let speedT = speed;
        const cc = t.cutCost;
        if (cc) {
          // (`Vector3.normalize()` mutates in place — the steering line below relies on that; this block reads a clone)
          const dirNow = speed > 0.001 ? this.vel.clone().normalize() : wantDir.clone();   // (already unit length; the clone keeps this block side-effect free)
          const angle = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(dirNow, wantDir))));
          const minRad = cc.minDeg * Math.PI / 180, plantRad = Math.acos(t.plantDot);
          if (!this.cutTaxed && this.cutGraceLeft <= 0 && angle >= minRad && speed >= t.maxSpeed * cc.minSpeed01) {
            this.cutTaxed = true;
            const grade = Math.min(1, (angle - minRad) / Math.max(1e-3, plantRad - minRad));
            const s01 = Math.min(1, speed / t.maxSpeed);
            const cost = cc.maxCost * grade * s01 * s01;
            if (t.gears?.cutSec) { this.cutDebt = speed * cost; this.cutRate = this.cutDebt / t.gears.cutSec; }   // H3a: paid over cutSec
            else speedT = speed * (1 - cost);
            this.cutsPaid++; this.lastCut = { cost, deg: angle * 180 / Math.PI, speed };
          } else if (this.cutTaxed && angle < minRad * 0.5) this.cutTaxed = false;
        }
        let dir = speed > 0.001 ? this.vel.normalize() : wantDir.clone();
        const angle = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(dir, wantDir))));
        // H3a: A REVERSAL BRAKES THROUGH ZERO (gears). The stick this far round from the travel is a pull back, not a turn: hold the
        // line and brake; once the body is all but stopped the new way is the travel. (Steering it round was the bug: the lerp of
        // a direction and its opposite normalises back to the direction, so an exact pull-back kept him running forward.)
        const reversing = !!t.gears?.reverseDeg && speed > 0.25 && angle >= (t.gears.reverseDeg * Math.PI) / 180;
        if (reversing) {
          /* the line held; the brake below */
        } else if (angle > 1e-4) {
          const k = Math.min(1, maxTurn / angle);
          if (t.gears?.reverseDeg && angle < Math.PI * 0.99) {
            // a real rotation (slerp) in the ground plane — well-conditioned under the reversal threshold
            const so = Math.sin(angle);
            dir = dir.scale(Math.sin((1 - k) * angle) / so).add(wantDir.scale(Math.sin(k * angle) / so)).normalize();
          } else dir = Vector3.Lerp(dir, wantDir, k).normalize();
        }
        if (!reversing && speed <= 0.25 && t.gears?.reverseDeg && angle >= (t.gears.reverseDeg * Math.PI) / 180) dir = wantDir.clone();   // stopped: push off the new way
        let newSpeed: number;
        if (t.gears && reversing) {
          newSpeed = Math.max(0, speedT - (t.gears.reverseDecel ?? t.decel) * dt);
          this.accPrev = (newSpeed - speedT) / dt; this.kickLeft = 0;
        } else if (t.gears) {
          // DRIBBLE PACE: a lag to the gear's target, capped per gear, loaded off the mark; a LOWER target (off the turbo,
          // easing the stick) bleeds at the gear-down rate rather than snapping; the sprint PRESS kicks a moving body.
          const g = t.gears;
          const err = topSpeed - speedT;
          if (this.cutDebt > 0) {
            // H3a: the cut cost, paid over cutSec — no re-acceleration until it is paid
            const pay = Math.min(this.cutDebt, this.cutRate * dt);
            newSpeed = Math.max(0, speedT - pay); this.cutDebt -= pay;
          } else if (err >= 0) {
            const launching = this.launchLeft > 0;
            const cap = (sprint ? g.sprintAccel : g.jogAccel) * (launching ? LAUNCH_BOOST : 1), tau = (sprint ? g.sprintTau : g.jogTau) * (launching ? 0.7 : 1);
            const load = !launching && speedT < g.loadBelow ? g.loadScale + (1 - g.loadScale) * (speedT / g.loadBelow) : 1;   // a launch out of a move has no loaded step
            newSpeed = Math.min(topSpeed, speedT + Math.min(cap * load, err / tau) * dt);
          } else newSpeed = Math.max(topSpeed, speedT - g.gearDownDecel * dt);
          if (g.jerk && this.cutDebt <= 0) {   // H3a: the speed's acceleration changes at most `jerk` m/s³ — never a one-frame flip
            const want = (newSpeed - speedT) / dt, j = g.jerk * dt;
            const a = Math.max(this.accPrev - j, Math.min(this.accPrev + j, want));
            newSpeed = want >= 0 ? Math.min(newSpeed, speedT + a * dt) : Math.max(newSpeed, speedT + a * dt);
            this.accPrev = (newSpeed - speedT) / dt;
          } else this.accPrev = (newSpeed - speedT) / dt;
          if (sprint && !this.sprintWas && speedT >= g.kickAbove) {
            if (g.kickSec) this.kickLeft = g.sprintKick;   // H3a: spread over kickSec
            else newSpeed = Math.min(t.maxSpeed * this.speedScale, newSpeed + g.sprintKick);
            this.burst01 = Math.min(1, this.burst01 + 0.3);
          }
          if (this.kickLeft > 0 && g.kickSec) {
            const add = Math.min(this.kickLeft, (g.sprintKick / g.kickSec) * dt);
            newSpeed = Math.min(t.maxSpeed * this.speedScale, newSpeed + add); this.kickLeft -= add;
          }
        } else {
          // Burst off the mark, slower cruise ramp when sprinting at pace.
          const a = speedT < 1.2 ? t.accel : (sprint ? t.sprintAccel : t.accel);
          newSpeed = Math.min(topSpeed, speedT + a * dt);
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
        // H3a: a COMMITTED HOP (ignoreStickFor: the step-back) glides on the pre-H3a stop — its travel is the move's separation, and
        // the firmer stop cut a step-back's hop from 0.30 m to 0.23 m in its 0.3 s (StepbackCommit pins it)
        const hop = this.stickOffLeft > 0;
        const decel = t.gears ? (this.pausedNow ? t.gears.stopDecelLow * 1.5 : hop ? HOP_GLIDE_LOW + (HOP_GLIDE_HIGH - HOP_GLIDE_LOW) * Math.min(1, speed / t.maxSpeed) : t.gears.stopDecelLow + (t.gears.stopDecelHigh - t.gears.stopDecelLow) * Math.min(1, speed / t.maxSpeed)) : t.decel;   // pausin' stops on a dime
        let newSpeed = Math.max(0, speed - decel * dt);
        if (t.gears?.jerk && !this.pausedNow && !hop) {   // H3a: the brake comes on over a few frames, not one (the full push to the stop was a 42 m/s² flip)
          const want = (newSpeed - speed) / dt, j = t.gears.jerk * dt;
          const a = Math.max(this.accPrev - j, Math.min(this.accPrev + j, want));
          newSpeed = Math.max(0, Math.max(newSpeed, speed + a * dt)); this.accPrev = newSpeed > 0 ? (newSpeed - speed) / dt : 0;
        }
        this.kickLeft = 0; this.cutDebt = 0;
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
  stop(): void { this.vel.setAll(0); this.plantTimer = 0; this.holdLeft = 0; this.slew = null; this.stickOffLeft = 0; this.kickLeft = 0; this.cutDebt = 0; this.accPrev = 0; }
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
