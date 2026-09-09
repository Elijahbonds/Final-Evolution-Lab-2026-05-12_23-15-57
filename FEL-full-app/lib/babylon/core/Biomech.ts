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

// ── BIOMECH-WAVE2 (2026-09-09): the non-hoops half of the same three lines ──
// Every wave-2 mode had its own copy of "point the root at something" and none of them slewed: Karate VS / Mixed Combat
// wrote `rotation.y = atan2(...)` for BOTH fighters every frame (a 1.5 m knockback in 180 ms swung the yaw in one step,
// and a KO'd body on the floor kept being re-aimed), the endless mode SNAPPED the fighter onto the nearest agent on the
// frame a strike started (measured up to 180° in one frame — the G4 "mid-clip pop that inverts facing"), and FreeRun
// wrote the stick's own heading straight onto the root. These are the shared pieces those modes now call.

/** Lock-on facing: the yaw at `foe`, slewed — a fighter TURNS onto his opponent. `null` foe keeps the heading. */
export function lockOnYaw(pos: { x: number; z: number }, foe: { x: number; z: number } | null, curYaw: number, rate: number, dt: number): number {
  return foe ? slewYaw(curYaw, yawTo(pos, foe), rate, dt) : curYaw;
}
/** The roll a body banks INTO a turn (rad, + = leaning left into a left turn). A carve, a cut and a hard lean are the
 *  same read: the faster you go and the harder you turn, the further inside the arc your mass has to be. Capped, because
 *  past a real lean angle the silhouette breaks rather than reads. */
export function bankRoll(yawRatePerSec: number, speed01: number, maxRad: number, gain = 0.22): number {
  const want = yawRatePerSec * gain * Math.min(1, Math.max(0, speed01));
  return Math.min(maxRad, Math.max(-maxRad, want));
}
/** Ease an angle toward 0 at a time constant (frame-rate independent): a flip's residual pitch/roll SETTLES upright
 *  instead of being written to 0 on the landing frame (FreeRun's land did exactly that — the last quarter of every
 *  somersault was teleported away). */
export function settleAngle(cur: number, dt: number, tau = 0.12): number {
  if (Math.abs(cur) < 1e-4) return 0;
  return cur * Math.exp(-Math.max(0, dt) / Math.max(1e-3, tau));
}
/** The yaw a strafing body's LOCO should read as, relative to its facing: −1 = stepping left, +1 = right, 0 = forward /
 *  back. A lock-on fighter walks sideways for most of a round; a forward step clip on a sideways walk is the G2 fail. */
export function strafeAxis(vel: { x: number; z: number }, yaw: number, minSpeed = 0.35): -1 | 0 | 1 {
  if (vel.x * vel.x + vel.z * vel.z < minSpeed * minSpeed) return 0;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const fwd = vel.x * fx + vel.z * fz;              // along the facing
  const lat = vel.x * fz - vel.z * fx;              // + = the body's RIGHT
  if (Math.abs(lat) <= Math.abs(fwd)) return 0;     // mostly forward / back: the step clip is right
  return lat > 0 ? 1 : -1;
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
