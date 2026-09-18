/**
 * lib/anim/facing.ts
 * ==================
 * M13 game-feel — the ONE shared character-facing system for every 3D mode.
 *
 * The donor scenes each rolled their own (often absent) orientation logic,
 * which is why fighters faced away from each other, the dunker showed his
 * chest to the sideline at the rim, and the football runner back-pedalled
 * down-field. This module centralises the rule:
 *
 *     characterYaw = f(velocity, target)
 *       - ENGAGED (has an active target, e.g. opponent / rim / ball):
 *           face the target.
 *       - MOVING (planar speed above a small threshold):
 *           face the velocity vector.
 *       - otherwise: hold the last yaw.
 *
 * plus a turn-rate limiter so orientation slews smoothly instead of snapping
 * (default ~540°/s, the value called out in the M13 facing spec).
 *
 * THREE convention: yaw is rotation about +Y. A yaw of 0 points along +Z.
 * `faceYaw(dx, dz) = atan2(dx, dz)` yields the yaw that points a +Z-forward
 * model along the (dx,dz) direction. Models whose art faces a different axis
 * pass a `modelYawOffset` (e.g. Math.PI for a -Z-forward mesh).
 *
 * Pure math — no THREE, no DOM. Fully unit-testable.
 */

export const TWO_PI = Math.PI * 2;

/** Default maximum turn rate in radians/second (~540°/s). */
export const DEFAULT_TURN_RATE = (540 * Math.PI) / 180;

/** Planar speed (units/sec) below which we treat the character as stationary. */
export const MOVE_EPSILON = 0.05;

/** Yaw (radians) that orients a +Z-forward model along direction (dx, dz). */
export function faceYaw(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

/** Wrap any angle into (-PI, PI]. */
export function wrapAngle(a: number): number {
  let x = ((a + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
  // Keep PI (not -PI) as the canonical half-turn for stable comparisons.
  if (x <= -Math.PI) x += TWO_PI;
  return x;
}

/** Shortest signed delta to rotate `from` onto `to`, in (-PI, PI]. */
export function shortestAngleDelta(from: number, to: number): number {
  return wrapAngle(to - from);
}

/**
 * Slew `current` toward `target` by at most `maxRate * dt` radians,
 * taking the shortest path around the circle. Returns the new yaw.
 */
export function slewToward(
  current: number,
  target: number,
  maxRate: number,
  dt: number,
): number {
  const delta = shortestAngleDelta(current, target);
  const maxStep = Math.max(0, maxRate) * Math.max(0, dt);
  if (Math.abs(delta) <= maxStep || maxStep === 0 && Math.abs(delta) < 1e-6) {
    return wrapAngle(target);
  }
  if (Math.abs(delta) <= maxStep) return wrapAngle(target);
  return wrapAngle(current + Math.sign(delta) * maxStep);
}

export interface FacingInput {
  /** Current facing yaw (radians), typically the mesh's rotation.y minus offset. */
  current: number;
  /** Planar velocity components (world units/sec). */
  velX?: number;
  velZ?: number;
  /** Active target world position (opponent / rim / ball). */
  targetX?: number;
  targetZ?: number;
  /** Self world position (needed when a target is supplied). */
  selfX?: number;
  selfZ?: number;
  /** When true, prefer facing the target over the velocity vector. */
  engaged?: boolean;
  /** Timestep (seconds). */
  dt: number;
  /** Max turn rate (rad/s). Defaults to DEFAULT_TURN_RATE. */
  turnRate?: number;
  /** Planar-speed threshold below which velocity is ignored. */
  moveEpsilon?: number;
}

/**
 * Compute the desired yaw for this frame (target-facing when engaged, else
 * velocity-facing, else hold), WITHOUT the slew limit. Returns null when there
 * is nothing to face (stationary + not engaged) so the caller can hold.
 */
export function desiredFacingYaw(inp: FacingInput): number | null {
  const eps = inp.moveEpsilon ?? MOVE_EPSILON;
  const engaged =
    inp.engaged &&
    inp.targetX != null && inp.targetZ != null &&
    inp.selfX != null && inp.selfZ != null;

  if (engaged) {
    const dx = (inp.targetX as number) - (inp.selfX as number);
    const dz = (inp.targetZ as number) - (inp.selfZ as number);
    if (dx * dx + dz * dz > 1e-8) return faceYaw(dx, dz);
  }

  const vx = inp.velX ?? 0;
  const vz = inp.velZ ?? 0;
  const speed = Math.hypot(vx, vz);
  if (speed > eps) return faceYaw(vx, vz);

  return null;
}

/**
 * Full facing update: pick the desired yaw (target/velocity/hold) and slew the
 * current yaw toward it at the turn-rate limit. Returns the new yaw to apply.
 *
 * The returned value is the LOGICAL forward yaw. For a mesh whose art faces a
 * non-+Z axis, add the model's yaw offset when writing rotation.y:
 *   mesh.rotation.y = updateFacing({... current: mesh.rotation.y - offset}) + offset
 */
export function updateFacing(inp: FacingInput): number {
  const target = desiredFacingYaw(inp);
  if (target == null) return wrapAngle(inp.current);
  return slewToward(
    inp.current,
    target,
    inp.turnRate ?? DEFAULT_TURN_RATE,
    inp.dt,
  );
}
