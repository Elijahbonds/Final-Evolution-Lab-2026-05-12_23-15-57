// PHYSICS ARENA — a shot is an impulse from the player's hand, not an outcome (pure; no Babylon).
//
// What the hand does: it throws the ball at the ring at the arc it means (SHOT_ARC_DEG) — the one velocity a projectile needs to
// pass through the ring's centre. What the player's timing does: the ball also carries part of the BODY's own speed at that
// instant. Let go at the top of the jump and the body is still, so the throw is the throw. Let go on the way up and the body's
// rise is added (long); on the way down, subtracted (short). A shot on the move carries the drift the hand did not cancel. Then
// the hand's own scatter. That is the whole model: the outcome is whatever the physics does with that velocity at the iron.
//
// No pct, no verdict, no dice for the result. The scatter is a seeded human tremor (the same seed gives the same game).

import type { P3 } from './hoopGeometry';

export const G = 9.81;

/** The velocity that carries a ball from `from` through `target` leaving at `arcDeg` above flat. Null when the arc cannot reach
 *  (the target is too high for that angle at that distance). */
export function solveLaunch(from: Readonly<P3>, target: Readonly<P3>, arcDeg: number): P3 | null {
  const dx = target.x - from.x, dz = target.z - from.z;
  const d = Math.hypot(dx, dz);
  const h = target.y - from.y;
  const th = (arcDeg * Math.PI) / 180;
  const c = Math.cos(th), t = Math.tan(th);
  const denom = 2 * c * c * (d * t - h);
  if (d < 1e-6 || denom <= 0) return null;
  const v = Math.sqrt((G * d * d) / denom);
  const ux = dx / d, uz = dz / d;
  return { x: ux * v * c, y: v * Math.sin(th), z: uz * v * c };
}

export interface ReleaseInput {
  /** The ball's centre at the release. */
  from: P3;
  /** The ring's centre. */
  rim: P3;
  arcDeg: number;
  /** The shooter's body velocity at the release (y is the jump's). */
  bodyVel: P3;
  /** BODY_CARRY: the share of the body's vertical speed the ball keeps. */
  bodyCarry: number;
  /** RUN_COMPENSATE: the share of the body's horizontal drift the hand cancels. */
  runCompensate: number;
  /** The hand's scatter (m/s, one sd) and three standard normal draws. */
  noiseSd: number;
  noise: [number, number, number];
  /** POV: the aim's yaw error (radians), after the assist. 0 in the follow camera. */
  yawErr?: number;
}

/** The release velocity. Falls back to a flat 45° push if the arc cannot reach (a shot from under the ring). */
export function releaseVelocity(r: ReleaseInput): P3 {
  const aim = solveLaunch(r.from, r.rim, r.arcDeg) ?? solveLaunch(r.from, r.rim, Math.min(80, r.arcDeg + 18)) ?? { x: 0, y: 4, z: 0 };
  let vx = aim.x, vz = aim.z;
  if (r.yawErr) {
    const c = Math.cos(r.yawErr), s = Math.sin(r.yawErr);
    const x = vx * c + vz * s, z = -vx * s + vz * c;
    vx = x; vz = z;
  }
  const drift = 1 - r.runCompensate;
  return {
    x: vx + r.bodyVel.x * drift + r.noise[0] * r.noiseSd,
    y: aim.y + r.bodyVel.y * r.bodyCarry + r.noise[1] * r.noiseSd,
    z: vz + r.bodyVel.z * drift + r.noise[2] * r.noiseSd,
  };
}

/** Backspin about the axis across the flight (right-hand rule: the top of the ball turns back toward the shooter). */
export function backspinFor(vel: Readonly<P3>, rps: number): P3 {
  const h = Math.hypot(vel.x, vel.z);
  if (h < 1e-6 || rps === 0) return { x: 0, y: 0, z: 0 };
  const w = rps * Math.PI * 2;
  // flight direction f = (fx, 0, fz); the spin axis is up × f = (fz, 0, -fx); backspin turns about -(that)
  return { x: (-vel.z / h) * w, y: 0, z: (vel.x / h) * w };
}

/** The release's timing against the top of the jump: ms early (negative) or late (positive), and the words for it. */
export function releaseTiming(releaseSec: number, apexSec: number): { ms: number; label: 'early' | 'on time' | 'late' } {
  const ms = Math.round((releaseSec - apexSec) * 1000);
  return { ms, label: ms < -35 ? 'early' : ms > 35 ? 'late' : 'on time' };
}

/** A pass: a flat throw from `from` to `to` arriving in `flightSec` (a chest pass is quick and flat). */
export function passVelocity(from: Readonly<P3>, to: Readonly<P3>, flightSec: number): P3 {
  const t = Math.max(0.15, flightSec);
  return { x: (to.x - from.x) / t, y: (to.y - from.y) / t + 0.5 * G * t, z: (to.z - from.z) / t };
}

/** Seeded uniform [0, 1) (mulberry32) and standard normals (Box-Muller): the hand's tremor and the rival's choices. */
export function seeded(seed: number): { next: () => number; normal: () => number } {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const normal = (): number => {
    const u = Math.max(1e-9, next()), v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return { next, normal };
}
