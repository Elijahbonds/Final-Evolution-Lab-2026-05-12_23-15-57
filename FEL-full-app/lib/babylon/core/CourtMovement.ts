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
import {   // lane/hoops-reverse: the hoops gears' numbers (feel knobs, defaults = these), the reversal fix and #311's H3a helpers
  HOOPS_JOG_TAU, HOOPS_SPRINT_TAU, HOOPS_JOG_ACCEL, HOOPS_SPRINT_ACCEL, HOOPS_LOAD_SCALE, HOOPS_GEAR_DOWN_DECEL, HOOPS_STOP_DECEL_LOW,
  HOOPS_STOP_DECEL_HIGH, HOOPS_PLANT_DECEL, HOOPS_TURN_TRUE_ARC, HOOPS_KICK_SEC, HOOPS_CUT_SEC, HOOPS_JERK, HOOPS_REVERSE_DEG,
  HOOPS_REVERSE_DECEL, liveGears, jerkLimit, turnToward,
  HANDLER_STOP_DECEL_LOW, HANDLER_STOP_DECEL_HIGH, HANDLER_JOG_TAU, HANDLER_JOG_ACCEL, HANDLER_LOAD_SCALE, HANDLER_FIRST_STEP_MPS,
  HANDLER_REVERSE_PLANT_HOLD, HANDLER_REVERSE_LAUNCH_SEC, HOOPS_HANDLER_TURN_DEG,
} from './HoopsStick';

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
  /** lane/hoops-reverse (PR #311's H3a, ported; each read through a feel knob — core/HoopsStick). Each is off / today's when absent. */
  plantDecel?: number;     // m/s² — the plant's bleed (absent: decel × 1.4)
  turnRateDeg?: number;    // °/s — this body's turn rate (absent: turnRateDegAtSpeed)
  trueArc?: number;        // 1 = a turn is a real rotation (slerp), 0 = the lerp-and-normalise
  kickSec?: number;        // s — the sprint kick spread over this (0: one frame)
  cutSec?: number;         // s — the cut cost paid over this, no re-acceleration meanwhile (0: one frame)
  jerk?: number;           // m/s³ — the most the speed's acceleration changes in a second (0: off)
  reverseDeg?: number;     // ° — a stick this far round from the travel is a REVERSAL: brake through zero, push off the new way
  reverseDecel?: number;   // m/s² — the reversal's brake
  /** hoops-p01 (the ball handler's; each off / release when absent — core/HoopsStick). */
  firstStep?: number;        // m/s — a stick pushed from a standstill starts the body at this speed on the press's frame (0: none)
  reversePlantHold?: number; // 1 = a reversal's plant holds its floor speed on the old line (release); 0 = it brakes straight through zero
  reverseLaunchSec?: number; // s — the push-off out of a reversal is a launch for this long (0: a loaded step, release)
}
/** The launch after a move: accel caps ×, for this long (owner: "faster launches"). */
export const LAUNCH_BOOST = 1.7, LAUNCH_SEC = 0.45;
export const GEARS_HOOPS: GearTuning = {
  walkStick: 0.45, walkFactor: 0.38,
  jogTau: HOOPS_JOG_TAU, sprintTau: HOOPS_SPRINT_TAU, jogAccel: HOOPS_JOG_ACCEL, sprintAccel: HOOPS_SPRINT_ACCEL,   // 0.17, 0.15, 15, 24
  loadBelow: 1.2, loadScale: HOOPS_LOAD_SCALE,   // 0.45
  gearDownDecel: HOOPS_GEAR_DOWN_DECEL,   // 9
  stopDecelLow: HOOPS_STOP_DECEL_LOW, stopDecelHigh: HOOPS_STOP_DECEL_HIGH,   // 22, 11
  sprintKick: 0.9, kickAbove: 1.5,
  // lane/hoops-reverse: today's plant (47.6), and #311's H3a switches at today's behaviour (off) — except THE REVERSAL FIX (135°, on)
  plantDecel: HOOPS_PLANT_DECEL, trueArc: HOOPS_TURN_TRUE_ARC, kickSec: HOOPS_KICK_SEC, cutSec: HOOPS_CUT_SEC, jerk: HOOPS_JERK,
  reverseDeg: HOOPS_REVERSE_DEG, reverseDecel: HOOPS_REVERSE_DECEL,
};

/** hoops-p01 (controls that answer): THE BALL HANDLER'S GEARS — the 1v1 / 3v3 DribbleController's. GEARS_HOOPS with the stop and launch a
 *  phase-1 gate needs (H3a's own numbers, #311) and the three new answers (the first step, the reversal's plant and push-off); every one a
 *  feel knob (core/HoopsStick: RELEASE_STICK_PRESET is the release stick). GEARS_HOOPS stays release: the dunk approach runs on it. */
export const GEARS_HANDLER: GearTuning = {
  ...GEARS_HOOPS,
  jogTau: HANDLER_JOG_TAU, jogAccel: HANDLER_JOG_ACCEL, loadScale: HANDLER_LOAD_SCALE,   // TUNED 0.17 → 0.10 s, 15 → 22 m/s², 0.45 → 0.7
  stopDecelLow: HANDLER_STOP_DECEL_LOW, stopDecelHigh: HANDLER_STOP_DECEL_HIGH,          // TUNED 22 → 32, 11 → 26 m/s²
  turnRateDeg: HOOPS_HANDLER_TURN_DEG,                                                     // (the handler's turn-rate knob, as before: 540)
  firstStep: HANDLER_FIRST_STEP_MPS, reversePlantHold: HANDLER_REVERSE_PLANT_HOLD, reverseLaunchSec: HANDLER_REVERSE_LAUNCH_SEC,   // TUNED (new)
};
/** A committed hop (the step-back's ignoreStickFor) glides on the RELEASE stop whatever the gears or the knobs say: its travel is the move's
 *  separation (#311 kept it; hoops-p01 keeps it for the handler's firmer stop too). */
const HOP_STOP = { low: HOOPS_STOP_DECEL_LOW, high: HOOPS_STOP_DECEL_HIGH } as const;

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
  private pausedNow = false;   // gears: PAUSIN' — the stick is ignored, the body stops on a dime
  private kickLeft = 0;        // hoops-reverse (H3a): m/s of the sprint kick still to add (spread over kickSec)
  private cutDebt = 0;         // hoops-reverse (H3a): m/s of the cut cost still to pay (spread over cutSec)
  private cutRate = 0;
  private accPrev = 0;         // hoops-reverse (H3a): last frame's speed acceleration (m/s²), for the jerk limit
  private plantRev = false;    // hoops-p01: this plant is a reversal's, and brakes straight through (reversePlantHold 0)
  /** hoops-reverse (owner 2026-10-24): this frame's retreat cap, a share of jog speed (DribbleController sets it from the stick; 1 = none). */
  retreatK = 1;
  private live: MovementTuning | null = null;   // hoops-reverse: this frame's tuning, the gears through the feel panel (built once)
  private liveTune(): MovementTuning {
    const g = this.tune.gears; if (!g) return this.tune;
    const l = (this.live ??= { ...this.tune, gears: { ...g } });
    liveGears(g, l.gears!);
    return l;
  }
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
    // hoops-reverse (#311's zero-dt fix): a frame with no time divides the jerk limit by nothing and keeps the acceleration memory
    const idt = dt > 1e-9 ? 1 / dt : 0, accKeep = this.accPrev;
    this.plantTimer = Math.max(0, this.plantTimer - dt);
    this.launchLeft = Math.max(0, this.launchLeft - dt);
    this.cutGraceLeft = Math.max(0, this.cutGraceLeft - dt);
    this.stickOffLeft = Math.max(0, this.stickOffLeft - dt);
    const mag = this.pausedNow || this.stickOffLeft > 0 ? 0 : Math.min(1, Math.hypot(moveX, moveY));   // pausin' (and a committed step-back, H2b): the stick is ignored
    const t = this.liveTune();   // hoops-reverse: with gears, the hoops numbers through the feel panel (the defaults are GEARS_HOOPS exactly)
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
      let topSpeed = gearTop * this.speedScale;
      if (this.retreatK < 1) topSpeed = Math.min(topSpeed, t.maxSpeed * t.jogFactor * this.speedScale * this.retreatK);   // hoops-reverse: a backpedal is slower
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
        // hoops-p01: a REVERSAL's plant (the stick reverseDeg+ round) with reversePlantHold 0 brakes through zero instead of holding its floor
        const g = t.gears;
        this.plantRev = !!g && g.reversePlantHold === 0 && !!g.reverseDeg && Vector3.Dot(this.vel, wantDir) <= Math.cos((g.reverseDeg * Math.PI) / 180);   // (vel is unit length here)
        if (this.plantRev) this.plantFloor = 0;
      }
      if (!opposed) this.cutActive = false;

      if (this.plantTimer > 0) {
        // Mid-plant: strong bleed toward the floor, no new direction yet —
        // the "studs in the hardwood" beat that sells weight.
        let newSpeed = Math.max(this.plantFloor, speed - (t.gears?.plantDecel ?? t.decel * 1.4) * dt);
        if (t.gears?.jerk) newSpeed = Math.max(this.plantFloor, jerkLimit(speed, newSpeed, this.accPrev, t.gears.jerk, dt, idt));   // H3a: the plant comes on over a few frames
        if (t.gears) this.accPrev = (newSpeed - speed) * idt;
        if (speed > 0.001) this.vel.copyFrom(this.vel.normalize().scale(newSpeed)); else this.vel.setAll(0);
        if (this.plantRev && newSpeed <= 0.25) {   // hoops-p01: through zero the reversal's plant is done — the push-off, a launch
          this.plantTimer = 0; this.plantRev = false;
          if (t.gears?.reverseLaunchSec) this.launchFor(t.gears.reverseLaunchSec);
        }
      } else {
        // Turn-rate cap at speed (lateral G): steer current velocity toward
        // the wanted direction, then accelerate along it.
        const maxTurn = ((t.gears?.turnRateDeg ?? t.turnRateDegAtSpeed) * Math.PI / 180) * dt
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
        // hoops-reverse — THE REVERSAL FIX (#311, gears only): a stick `reverseDeg` or more round from the travel is a pull BACK, not a turn:
        // hold the line and brake through zero, then push off the new way. Steering it round was the bug: the lerp of a direction and its
        // opposite normalises back to the direction, so an exact pull-back put the handler back on the OLD line after the plant.
        const revRad = t.gears?.reverseDeg ? (t.gears.reverseDeg * Math.PI) / 180 : Infinity;
        const reversing = speed > 0.25 && angle >= revRad;
        if (!reversing && angle > 1e-4) {
          const k = Math.min(1, maxTurn / angle);
          dir = turnToward(dir, wantDir, angle, k, !!t.gears?.trueArc);   // (trueArc 0: exactly the old Vector3.Lerp(dir, wantDir, k).normalize())
        }
        if (!reversing && angle >= revRad) {   // all but stopped: push off the new way
          dir = wantDir.clone();
          if (t.gears?.reverseLaunchSec && speed > 0.001) this.launchFor(t.gears.reverseLaunchSec);   // hoops-p01: the push-off is a launch
        }
        let newSpeed: number;
        if (t.gears && reversing) {
          newSpeed = Math.max(0, speedT - (t.gears.reverseDecel ?? t.decel) * dt);
          this.accPrev = (newSpeed - speedT) * idt; this.kickLeft = 0;
        } else if (t.gears) {
          // DRIBBLE PACE: a lag to the gear's target, capped per gear, loaded off the mark; a LOWER target (off the turbo,
          // easing the stick) bleeds at the gear-down rate rather than snapping; the sprint PRESS kicks a moving body.
          const g = t.gears;
          const err = topSpeed - speedT;
          if (this.cutDebt > 0) {   // H3a: the cut cost, paid over cutSec — no re-acceleration until it is paid
            const pay = Math.min(this.cutDebt, this.cutRate * dt);
            newSpeed = Math.max(0, speedT - pay); this.cutDebt -= pay;
          } else if (err >= 0) {
            const launching = this.launchLeft > 0;
            const cap = (sprint ? g.sprintAccel : g.jogAccel) * (launching ? LAUNCH_BOOST : 1), tau = (sprint ? g.sprintTau : g.jogTau) * (launching ? 0.7 : 1);
            const load = !launching && speedT < g.loadBelow ? g.loadScale + (1 - g.loadScale) * (speedT / g.loadBelow) : 1;   // a launch out of a move has no loaded step
            newSpeed = Math.min(topSpeed, speedT + Math.min(cap * load, err / tau) * dt);
          } else newSpeed = Math.max(topSpeed, speedT - g.gearDownDecel * dt);
          if (g.jerk && this.cutDebt <= 0) newSpeed = jerkLimit(speedT, newSpeed, this.accPrev, g.jerk, dt, idt);   // H3a: never a one-frame flip
          this.accPrev = (newSpeed - speedT) * idt;
          if (sprint && !this.sprintWas && speedT >= g.kickAbove) {
            if (g.kickSec) this.kickLeft = g.sprintKick;   // H3a: spread over kickSec
            else newSpeed = Math.min(t.maxSpeed * this.speedScale, newSpeed + g.sprintKick);
            this.burst01 = Math.min(1, this.burst01 + 0.3);
          }
          if (this.kickLeft > 0 && g.kickSec) {
            const add = Math.min(this.kickLeft, (g.sprintKick / g.kickSec) * dt);
            newSpeed = Math.min(t.maxSpeed * this.speedScale, newSpeed + add); this.kickLeft -= add;
          }
          // hoops-p01 THE FIRST STEP: pushed from a standstill, the body leaves at `firstStep` on this frame (after the jerk limit — it is the
          // answer to the press, not a ramp), then the loaded ramp carries on from there
          if (g.firstStep && idt > 0 && speedT < 0.05 && err > 0) { const f = Math.min(topSpeed, g.firstStep + Math.max(0, newSpeed - speedT)); if (f > newSpeed) { newSpeed = f; this.accPrev = (newSpeed - speedT) * idt; } }
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
        // hoops-reverse (H3a): a COMMITTED HOP (ignoreStickFor: the step-back) glides on the shipped gears, whatever the stop knobs say — its
        // travel is the move's separation (#311: the firmer stop cut a step-back's hop from 0.30 m to 0.23 m)
        const hop = this.stickOffLeft > 0 && !this.pausedNow, g = t.gears;
        const lo = hop ? HOP_STOP.low : g?.stopDecelLow ?? 0, hi = hop ? HOP_STOP.high : g?.stopDecelHigh ?? 0;   // hoops-p01: the hop's glide is release's, by name
        const decel = g ? (this.pausedNow ? g.stopDecelLow * 1.5 : lo + (hi - lo) * Math.min(1, speed / t.maxSpeed)) : t.decel;   // pausin' stops on a dime
        let newSpeed = Math.max(0, speed - decel * dt);
        if (t.gears?.jerk && !this.pausedNow && !hop) newSpeed = Math.max(0, jerkLimit(speed, newSpeed, this.accPrev, t.gears.jerk, dt, idt));   // H3a: the brake comes on over a few frames
        if (t.gears) { this.accPrev = newSpeed > 0 ? (newSpeed - speed) * idt : 0; this.kickLeft = 0; this.cutDebt = 0; }
        this.vel.scaleInPlace(speed > 0.001 ? newSpeed / speed : 0);
      }
    }

    if (!idt) this.accPrev = accKeep;   // (hoops-reverse: see idt)
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
  stop(): void { this.vel.setAll(0); this.plantTimer = 0; this.plantRev = false; this.holdLeft = 0; this.slew = null; this.stickOffLeft = 0; this.kickLeft = 0; this.cutDebt = 0; this.accPrev = 0; }
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
