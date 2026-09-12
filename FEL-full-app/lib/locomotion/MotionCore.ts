// LOCOMOTION CORE — IntentResolver, MotionSolver, StateMachine (Phase 1, 2026-09-12).

import type { Intent, LocoState, LocomotionProfile, MotionOut } from './types';

// ── IntentResolver ──────────────────────────────────────────────────────────
export interface RawInput { x: number; z: number; sprint?: boolean; lookYaw?: number | null }

/** Deadzone + magnitude curve. A raw stick is not an intent: the deadzone kills drift and the
 *  curve makes small pushes mean small speeds rather than a binary run. */
export function resolveIntent(raw: RawInput, deadzone = 0.18, curve = 1.6): Intent {
  const x = Number.isFinite(raw.x) ? raw.x : 0;
  const z = Number.isFinite(raw.z) ? raw.z : 0;
  const len = Math.hypot(x, z);
  if (len <= deadzone) return { moveX: 0, moveZ: 0, magnitude: 0, sprint: false, lookYaw: raw.lookYaw ?? null };
  const scaled = Math.min(1, (len - deadzone) / (1 - deadzone));
  const mag = Math.pow(scaled, curve);
  return { moveX: (x / len) * mag, moveZ: (z / len) * mag, magnitude: mag, sprint: !!raw.sprint, lookYaw: raw.lookYaw ?? null };
}

// ── MotionSolver ────────────────────────────────────────────────────────────
export interface SolverState { velX: number; velZ: number; headingYaw: number }

const TAU = Math.PI * 2;
/** Shortest signed angle from a to b, in (-pi, pi]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

/**
 * Desired velocity and desired heading, solved SEPARATELY.
 *
 * The turn cap scales inversely with speed: a standing body may pivot freely, a sprinting one
 * may not. Phase 0 found facing written straight from velocity with no cap in carnival, golf
 * and the ride family — one frame could invert a body.
 */
export function solveMotion(
  p: LocomotionProfile, s: SolverState, intent: Intent, dt: number, targetYaw: number | null,
): MotionOut {
  const speed = Math.hypot(s.velX, s.velZ);
  const wantSpeed = intent.magnitude * (intent.sprint ? p.maxSpeed : p.maxSpeed * 0.72);

  let vx = s.velX, vz = s.velZ;
  if (intent.magnitude > 0) {
    const tx = intent.moveX * wantSpeed, tz = intent.moveZ * wantSpeed;
    const step = p.accel * dt;
    const dx = tx - vx, dz = tz - vz;
    const dl = Math.hypot(dx, dz);
    if (dl <= step || dl < 1e-6) { vx = tx; vz = tz; }
    else { vx += (dx / dl) * step; vz += (dz / dl) * step; }
  } else {
    const dec = (speed > p.plantCutSpeed ? p.plantDecel : p.decel) * dt;
    const ns = Math.max(0, speed - dec);
    if (speed > 1e-6) { vx = (vx / speed) * ns; vz = (vz / speed) * ns; } else { vx = 0; vz = 0; }
  }

  // heading: independent of velocity, and rate-capped by current speed
  const newSpeed = Math.hypot(vx, vz);
  let wantYaw = s.headingYaw;
  if (p.facingMode === 'TARGET_LOCK' && targetYaw !== null) wantYaw = targetYaw;
  else if (p.facingMode === 'VELOCITY' && newSpeed > 0.05) wantYaw = Math.atan2(vx, vz);
  else if (p.facingMode === 'HYBRID') {
    if (intent.sprint && newSpeed > 0.05) wantYaw = Math.atan2(vx, vz);
    else if (targetYaw !== null) wantYaw = targetYaw;
    else if (newSpeed > 0.05) wantYaw = Math.atan2(vx, vz);
  }
  if (intent.lookYaw !== null && intent.lookYaw !== undefined) wantYaw = intent.lookYaw;

  const speed01 = p.maxSpeed > 0 ? Math.min(1, newSpeed / p.maxSpeed) : 0;
  // inverse with speed: full cap standing, a third of it at top speed
  const capDeg = p.maxTurnRateDegPerSec * (1 - 0.66 * speed01);
  const cap = (capDeg * Math.PI) / 180 * dt;
  const d = angleDelta(s.headingYaw, wantYaw);
  const headingYaw = s.headingYaw + Math.max(-cap, Math.min(cap, d));

  return { velX: vx, velZ: vz, headingYaw, speed: newSpeed };
}

// ── StateMachine ────────────────────────────────────────────────────────────
export interface MachineState {
  state: LocoState;
  /** Seconds the current state has been held. */
  heldSec: number;
}

export interface StateInput {
  speed: number;
  intentMag: number;
  /** Radians of heading still to cover toward the desired facing. */
  headingErrorRad: number;
  /** Local-space lateral fraction of travel, 0..1. */
  lateral01: number;
  /** An authored cancel window is the only way past the hysteresis guard. */
  cancel?: boolean;
}

/**
 * One state per tick, with the brief's hysteresis guard: no state may be entered and exited
 * inside `minStateSec` unless an authored cancel says otherwise. Without it, a stick hovering
 * on a threshold flips states every frame and each flip restarts a crossfade from zero —
 * the exact stutter ANIM-READABILITY measured as a 0.33 m hand snap per flip.
 */
export function stepState(p: LocomotionProfile, m: MachineState, i: StateInput, dt: number): MachineState {
  const held = m.heldSec + dt;
  const want = desiredState(p, i);
  if (want === m.state) return { state: m.state, heldSec: held };
  if (!i.cancel && held < p.minStateSec) return { state: m.state, heldSec: held };
  return { state: want, heldSec: 0 };
}

function desiredState(p: LocomotionProfile, i: StateInput): LocoState {
  const headingDeg = Math.abs(i.headingErrorRad) * 180 / Math.PI;
  // a 180 at speed routes through plant-and-cut, never a snap
  if (i.speed >= p.plantCutSpeed && headingDeg > 120) return 'plant';
  if (i.speed <= p.turnInPlaceSpeed && headingDeg > p.turnInPlaceThresholdDeg) return 'turn';
  if (i.intentMag <= 0.01 && i.speed < 0.2) return 'idle';
  if (p.slideRing && i.lateral01 > 0.7 && i.speed > 0.15) return 'slide';
  if (i.intentMag > 0.01 && i.speed < 0.2) return 'shuffle';
  const { rings } = p;
  if (i.speed >= rings.sprint.speed * 0.9) return 'sprint';
  if (i.speed >= rings.jog.speed * 0.75) return 'jog';
  if (i.speed >= rings.shuffle.speed * 0.5) return 'shuffle';
  return i.speed < 0.2 ? 'idle' : 'shuffle';
}
