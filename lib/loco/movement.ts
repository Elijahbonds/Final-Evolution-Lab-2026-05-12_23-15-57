/**
 * lib/loco/movement.ts
 * ====================
 * M7a — analog-feel 3D locomotion shared by every mode.
 *
 * Two pieces:
 *  1. arcadeParamsFromPRQ() — direct port of donor ArcadePhysics::fromPRQ
 *     (gameplay__arcade_physics.cpp). Maps a player's PRQ + neural drive into
 *     the arcade feel params (hang time, first-step, combo decay, crit,
 *     movementSpeedScale, flight/grind). Low PRQ = KH1-Sora base; high PRQ
 *     approaches Sonic-tier speed.
 *  2. LocomotionController — a deterministic analog stepper: acceleration,
 *     turn rate, camera-relative stick input, max speed derived from
 *     movementSpeedScale. No grid-stepping. Emits normalized speed01 the
 *     AnimDirectorFSM consumes so the locomotion clip always matches velocity.
 *
 * Pure math, no THREE / DOM. New feel constants are marked // TUNE(elijah);
 * none of the ported donor coefficients are altered.
 */

export interface ArcadePhysicsParams {
  hangTimeMultiplier: number;
  explosiveFirstStep: number;
  comboDecayRateSeconds: number;
  maxComboMultiplier: number;
  criticalHitChance: number;
  neuralBurstActive: boolean;
  neuralBurstMultiplier: number;
  movementSpeedScale: number;
  flightSpeedScale: number;
  grindAcceleration: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Direct port of ArcadePhysics::fromPRQ — coefficients unchanged from donor. */
export function arcadeParamsFromPRQ(prq: number, neuralDrive: number): ArcadePhysicsParams {
  const norm = clamp(prq / 100.0, 0.0, 1.0);
  const neural = clamp(neuralDrive / 100.0, 0.0, 1.0);

  const neuralBurstActive = neuralDrive >= 80.0;
  return {
    hangTimeMultiplier: 1.0 + norm * 1.8 + neural * 0.4,
    explosiveFirstStep: 0.3 + norm * 0.7,
    comboDecayRateSeconds: 5.0 - norm * 3.0,
    maxComboMultiplier: 2.0 + norm * 3.0,
    criticalHitChance: 0.05 + norm * 0.2 + neural * 0.1,
    neuralBurstActive,
    neuralBurstMultiplier: neuralBurstActive ? 1.15 : 1.0,
    movementSpeedScale: 0.6 + norm * 2.2,
    flightSpeedScale: 0.8 + norm * 1.2,
    grindAcceleration: 0.6 + norm * 1.4,
  };
}

export interface Vec2 {
  x: number;
  z: number;
}

export interface LocoConfig {
  /** World units/sec at speed01 = 1, before arcade scale. // TUNE(elijah) */
  baseMaxSpeed: number;
  /** Accel toward target velocity (units/sec^2). // TUNE(elijah) */
  acceleration: number;
  /** Decel when no input (units/sec^2). // TUNE(elijah) */
  deceleration: number;
  /** Turn rate (radians/sec) toward the movement heading. // TUNE(elijah) */
  turnRate: number;
  /** Arcade movementSpeedScale applied on top of baseMaxSpeed. */
  speedScale: number;
}

export const DEFAULT_LOCO: LocoConfig = {
  baseMaxSpeed: 4.2, // TUNE(elijah) — matches legacy karate mv base
  acceleration: 26.0, // TUNE(elijah)
  deceleration: 32.0, // TUNE(elijah)
  turnRate: 12.0, // TUNE(elijah)
  speedScale: 1.0,
};

export interface LocoInput {
  /** Raw stick / key vector in screen space, each component in [-1,1]. */
  moveX: number;
  moveY: number;
  /** Camera yaw (radians) so input is interpreted camera-relative. */
  camYaw: number;
}

export interface LocoState {
  pos: Vec2;
  vel: Vec2;
  /** Facing yaw in radians. */
  facing: number;
  /** Normalized planar speed 0..1 (relative to effective max). */
  speed01: number;
}

function len2(x: number, z: number): number {
  return Math.hypot(x, z);
}

/**
 * Deterministic analog locomotion stepper. Camera-relative input, smooth
 * acceleration and turning, normalized speed output. No grid-stepping: every
 * call integrates continuous velocity.
 */
export class LocomotionController {
  cfg: LocoConfig;
  state: LocoState;

  constructor(cfg: Partial<LocoConfig> = {}, start: Partial<Vec2> = {}) {
    this.cfg = { ...DEFAULT_LOCO, ...cfg };
    this.state = {
      pos: { x: start.x ?? 0, z: start.z ?? 0 },
      vel: { x: 0, z: 0 },
      facing: 0,
      speed01: 0,
    };
  }

  get effectiveMaxSpeed(): number {
    return this.cfg.baseMaxSpeed * this.cfg.speedScale;
  }

  /** Advance one tick. Returns the updated state (also stored on this.state). */
  step(dt: number, input: LocoInput): LocoState {
    const d = clamp(dt, 0, 0.05); // clamp for stability like the game loops
    const s = this.state;
    const maxSpeed = this.effectiveMaxSpeed;

    // Camera-relative input: rotate the raw stick vector by camera yaw.
    // Screen up (moveY<0) should drive "forward" (−Z) relative to camera.
    const rawMag = clamp(len2(input.moveX, input.moveY), 0, 1);
    let desiredX = 0;
    let desiredZ = 0;
    if (rawMag > 1e-4) {
      const cos = Math.cos(input.camYaw);
      const sin = Math.sin(input.camYaw);
      // forward vector (camera looks toward -Z): fwd = (sin, -cos)
      const fwdX = sin;
      const fwdZ = -cos;
      const rightX = cos;
      const rightZ = sin;
      // moveY up = forward
      const fwdAmount = -input.moveY;
      const rightAmount = input.moveX;
      const dirX = rightX * rightAmount + fwdX * fwdAmount;
      const dirZ = rightZ * rightAmount + fwdZ * fwdAmount;
      const dl = len2(dirX, dirZ) || 1;
      desiredX = (dirX / dl) * rawMag * maxSpeed;
      desiredZ = (dirZ / dl) * rawMag * maxSpeed;
    }

    // Accelerate / decelerate toward desired velocity.
    const hasInput = rawMag > 1e-4;
    const rate = hasInput ? this.cfg.acceleration : this.cfg.deceleration;
    const dvx = desiredX - s.vel.x;
    const dvz = desiredZ - s.vel.z;
    const dvLen = len2(dvx, dvz);
    const maxStep = rate * d;
    if (dvLen <= maxStep || dvLen < 1e-6) {
      s.vel.x = desiredX;
      s.vel.z = desiredZ;
    } else {
      s.vel.x += (dvx / dvLen) * maxStep;
      s.vel.z += (dvz / dvLen) * maxStep;
    }

    // Integrate position.
    s.pos.x += s.vel.x * d;
    s.pos.z += s.vel.z * d;

    // Speed / facing.
    const spd = len2(s.vel.x, s.vel.z);
    s.speed01 = maxSpeed > 1e-6 ? clamp(spd / maxSpeed, 0, 1) : 0;

    if (spd > 0.05) {
      const targetFacing = Math.atan2(s.vel.x, -s.vel.z);
      s.facing = turnToward(s.facing, targetFacing, this.cfg.turnRate * d);
    }

    return s;
  }

  /** Hard-set position (e.g. clamp to arena bounds); keeps velocity. */
  clampPos(minX: number, maxX: number, minZ: number, maxZ: number): void {
    this.state.pos.x = clamp(this.state.pos.x, minX, maxX);
    this.state.pos.z = clamp(this.state.pos.z, minZ, maxZ);
  }
}

/** Shortest-arc angular interpolation toward a target by at most `maxDelta`. */
export function turnToward(current: number, target: number, maxDelta: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}
