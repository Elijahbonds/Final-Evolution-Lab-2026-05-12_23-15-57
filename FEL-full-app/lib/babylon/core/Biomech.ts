// Biomech — the shared, pure half of the game-wide biomech bar (BIOMECH-HOOPS-WAVE1, 2026-09-08; SPEC-FEL-BIOMECH-GAMEWIDE).
//
// G1 (facing) in every mode used to be a per-mode copy of the same three lines (DunkMode.faceVel / faceToward, DunkDuel's
// mirror, 1v1's `face`, 3v3's raw `rotation.y = atan2`): a yaw toward a point, a slew at a turn rate, a wrap. They live
// here once, headless-testable, with the drive-dunk flight clock the 1v1 / 3v3 drive dunk rides (a 550 ms scripted
// parabola whose SLAM used to resolve on the feet-down frame — the ball let go at floor height — see driveDunk*).
import type { Vector3 } from '@babylonjs/core';

/** Keep a yaw in (−π, π] — slews would otherwise accumulate turns (measured 522° after two strafes on the dunk runway). */
export const wrapYaw = (y: number): number => Math.atan2(Math.sin(y), Math.cos(y));

/** The yaw that faces `from` at `to` (the rig convention: forward = +z at yaw 0, so yaw = atan2(dx, dz)). */
export function yawTo(from: { x: number; z: number }, to: { x: number; z: number }): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}
/** The yaw of a planar velocity, or null when there is no meaningful travel (a still body keeps its heading). */
export function yawOfVel(v: { x: number; z: number }, minSpeed = 0.22): number | null {
  return v.x * v.x + v.z * v.z < minSpeed * minSpeed ? null : Math.atan2(v.x, v.z);
}
/** Slew `cur` toward `want` by at most `rate·dt` (rad), the short way round: a flick is a TURN, not a snap (G3). */
export function slewYaw(cur: number, want: number, rate: number, dt: number): number {
  const d = wrapYaw(want - cur);
  return wrapYaw(cur + Math.sign(d) * Math.min(Math.abs(d), rate * Math.max(0, dt)));
}
/** Ease `cur` toward `want` by the fraction `k` this frame (the dunk's faceToward). */
export function easeYaw(cur: number, want: number, k: number): number {
  return wrapYaw(cur + wrapYaw(want - cur) * Math.min(1, Math.max(0, k)));
}
/** The facing rule shared by every hoops body: face the OBJECTIVE (rim / ball handler) when it is inside `range` and the
 *  body is not sprinting away from it; otherwise face the travel. A defender sliding across the lane keeps his chest on
 *  the handler (the slide clip moves him sideways — a body that faced its travel while sliding read as a sideways-shuffling
 *  run, measured on both 1v1 bodies); a cutter running to a spot faces where he runs. */
export function playFacing(pos: { x: number; z: number }, vel: { x: number; z: number }, objective: { x: number; z: number } | null, range: number, curYaw: number): number {
  const travel = yawOfVel(vel);
  if (objective) {
    const dx = objective.x - pos.x, dz = objective.z - pos.z;
    if (dx * dx + dz * dz <= range * range) return yawTo(pos, objective);
  }
  return travel ?? curYaw;
}

// ── The drive dunk's flight (1v1 / 3v3) ─────────────────────────────────────
/** The scripted drive-dunk parabola: 550 ms from the takeoff point to the rim's front, a 1.15 m apex. The SLAM resolves at
 *  `resolveK` (just past the apex, the hand at the iron) — it used to resolve at k = 1, with the body back on the floor,
 *  the ball let go from a hand at hip height and the make's flush nowhere (G6: a ball floating at the release point until
 *  the reset). Feet-down is k = 1: the land crouch. */
export const DRIVE_DUNK = { flightMs: 550, resolveK: 0.55, apex: 1.15, landAheadZ: 0.5 } as const;
/** Root height on the flight clock 0..1. */
export const driveDunkY = (k: number): number => Math.sin(Math.min(1, Math.max(0, k)) * Math.PI) * DRIVE_DUNK.apex;
export type FlightWindow = 'rise' | 'hang' | 'extend' | 'jam' | 'brace';
/** The posture window on the drive dunk's clock: the rise, the hang under the apex, the extension into the iron, then the
 *  jam (a make) or the brace (a miss) from the resolve to feet-down. `made` is null before the resolve. */
export function driveDunkWindow(k: number, made: boolean | null): FlightWindow {
  if (k < 0.18) return 'rise';
  if (k < 0.42) return 'hang';
  if (k < DRIVE_DUNK.resolveK || made === null) return 'extend';
  return made ? 'jam' : 'brace';
}

/** A planar point (x, z) helper for callers holding Vector3s. */
export const xz = (v: Vector3): { x: number; z: number } => ({ x: v.x, z: v.z });
