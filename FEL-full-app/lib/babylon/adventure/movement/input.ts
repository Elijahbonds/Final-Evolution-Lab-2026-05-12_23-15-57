/**
 * Reading a MoveInput for movement (lane A1).
 *
 * ONE STICK, THREE DEVICES. A pad's stick, the touch stick and WASD all arrive as `move` in intent space (contracts:
 * +y away from the camera) with the camera's yaw beside it, so everything here is camera-relative and the device does
 * not matter. What differs is the noise: a worn pad drifts and a thumb resting on a touch stick never reads zero, so a
 * radial deadzone is cut and the rest RESCALED (a stick just past the deadzone means "barely", not a 12% jump). WASD is
 * digital: its diagonals are normalised by `wishDir`'s own clamp, and the ground's turn-rate limit turns a key flip into a
 * curve rather than a snap.
 */

import type { MoveInput } from '../contracts';

/** A camera-relative wish on the ground plane, magnitude 0..1. Reused by the caller. */
export interface Wish { x: number; z: number; mag: number }

export const wish = (): Wish => ({ x: 0, z: 0, mag: 0 });

/**
 * contracts.wishDir with a radial deadzone, written into `out` (no allocation: this runs for every actor every tick).
 * With `deadzone` 0 it is exactly wishDir (input.test.ts pins that).
 */
export function wishInto(input: Pick<MoveInput, 'move' | 'camYaw'>, deadzone: number, out: Wish): Wish {
  const mx = input.move.x, my = input.move.y;
  const raw = Math.min(1, Math.hypot(mx, my));
  if (!(raw > deadzone) || raw < 1e-6) { out.x = 0; out.z = 0; out.mag = 0; return out; }
  const mag = deadzone > 0 ? Math.min(1, (raw - deadzone) / (1 - deadzone)) : raw;
  const s = Math.sin(input.camYaw), c = Math.cos(input.camYaw);
  const x = my * s + mx * c;
  const z = my * c - mx * s;
  const len = Math.hypot(x, z) || 1;
  out.x = (x / len) * mag; out.z = (z / len) * mag; out.mag = mag;
  return out;
}

/**
 * The rider's lean, −1..1 (left negative). The mapper's `lean` wins when it says anything; otherwise the stick is read
 * against the rider's own right, so a camera-relative stick leans the right way whichever way the camera looks (a touch
 * player pushing "toward the outside of the curve on screen" leans out, as they meant).
 */
export function leanOf(input: Pick<MoveInput, 'lean'>, w: Wish, facingYaw: number): number {
  if (Math.abs(input.lean) > 0.05) return Math.max(-1, Math.min(1, input.lean));
  // right of yaw θ is (cos θ, −sin θ) (contracts.wishDir: yaw 0 looks +z with +x on the right)
  return Math.max(-1, Math.min(1, w.x * Math.cos(facingYaw) - w.z * Math.sin(facingYaw)));
}

/** How much of the wish points along the rider's forward (−1..1 × magnitude). */
export function forwardOf(w: Wish, facingYaw: number): number {
  return w.x * Math.sin(facingYaw) + w.z * Math.cos(facingYaw);
}
