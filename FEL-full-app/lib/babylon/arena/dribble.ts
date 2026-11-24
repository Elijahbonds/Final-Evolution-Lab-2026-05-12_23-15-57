// PHYSICS ARENA — the dribble as pushes, not a ball glued to a palm (pure; no Babylon).
//
// The hand pushes the ball down so that, after one bounce off the floor, it comes back up to the hand — where the hand WILL be,
// given how the player is moving. Between pushes the ball is the physics engine's: it falls, bounces with the floor's own
// bounce, and anything in the way (the defender's body, his hand) changes where it goes. If it does not come back to the hand
// (a hard cut the push could not follow, a body in its path, a poke), the handle is lost and the ball is loose.

import { G } from './shotModel';
import type { P3 } from './hoopGeometry';

/** How far the hand reaches for a returning ball (m). */
export const CATCH_R = 0.34;
/** The most the hand can redirect the ball sideways on one push (m/s off the body's own velocity). */
export const STEER_MAX = 3.2;

/** The downward speed a push needs so a ball let go at `fromY` (centre height) comes back up to `handY` after a bounce that keeps
 *  `e` of its speed. Ball radius `r`. A ball taken low (a quick hand on a cut) is pushed harder, so it still comes back to the hand.
 *  `fromY` defaults to the hand's own height (the plain dribble). */
export function pushSpeed(handY: number, r: number, e: number, fromY = handY): number {
  const hT = Math.max(0.05, handY - r), h0 = Math.max(0.05, fromY - r);
  const ee = Math.min(0.98, Math.max(0.3, e));
  return Math.sqrt(Math.max(0.25, (2 * G * hT) / (ee * ee) - 2 * G * h0));
}

/** Time from the push (let go at `fromY`, down at `u`) to the ball being back at the hand's height. */
export function dribblePeriod(handY: number, r: number, e: number, u: number, fromY = handY): number {
  const hT = Math.max(0.05, handY - r), h0 = Math.max(0.05, fromY - r);
  const vi = Math.sqrt(u * u + 2 * G * h0);
  const tFall = (vi - u) / G;
  const vr = e * vi;
  const disc = Math.max(0, vr * vr - 2 * G * hT);
  const tRise = (vr - Math.sqrt(disc)) / G;
  return tFall + tRise;
}

export interface Push { vel: P3; spin: P3; period: number }

/** Where a body moving at `v` and driving toward `wish` with an acceleration cap `accel` will be `T` seconds from now (the change
 *  of pace runs at the cap until the wish is reached, then holds). Flat (x, z). */
export function bodyTravel(v: { x: number; z: number }, wish: { x: number; z: number }, accel: number, T: number): { x: number; z: number } {
  const dx = wish.x - v.x, dz = wish.z - v.z, d = Math.hypot(dx, dz);
  if (d < 1e-6 || accel <= 0) return { x: v.x * T, z: v.z * T };
  const ux = dx / d, uz = dz / d, tA = Math.min(T, d / accel);
  const ax = v.x * tA + 0.5 * accel * ux * tA * tA, az = v.z * tA + 0.5 * accel * uz * tA * tA;
  const vx = v.x + accel * ux * tA, vz = v.z + accel * uz * tA;
  return { x: ax + vx * (T - tA), z: az + vz * (T - tA) };
}

/**
 * The push: down hard enough to come back to the hand's height, sideways so it meets the hand where the hand will be after one
 * period (the body's own travel to its wish at its acceleration, plus a correction toward the hand capped at STEER_MAX), and turning
 * as if it were rolling with that sideways speed so the floor's grip does not brake it at the bounce. Without a wish the body is
 * taken to hold its velocity.
 */
export function dribblePush(ball: Readonly<P3>, hand: Readonly<P3>, bodyVel: Readonly<P3>, r: number, e: number,
  wish: { x: number; z: number } = bodyVel, accel = 30): Push {
  const u = pushSpeed(hand.y, r, e, ball.y);
  const T = dribblePeriod(hand.y, r, e, u, ball.y);
  const tr = bodyTravel(bodyVel, wish, accel, T);
  const carryX = tr.x / T, carryZ = tr.z / T;   // the body's mean velocity over the bounce
  let sx = (hand.x - ball.x) / T, sz = (hand.z - ball.z) / T;
  const s = Math.hypot(sx, sz);
  if (s > STEER_MAX) { sx *= STEER_MAX / s; sz *= STEER_MAX / s; }
  const vx = carryX + sx, vz = carryZ + sz;
  return { vel: { x: vx, y: -u, z: vz }, spin: { x: vz / r, y: 0, z: -vx / r }, period: T };
}

/** How far the hand reaches for the ball, measured flat from the body's axis (m), and the heights it reaches it at. */
export const REACH_FLAT_M = 0.85, REACH_LOW_M = 0.45, REACH_HIGH_M = 1.3;
/** A wish this far off the committed run (m/s, as a vector) is a change of direction or pace: it waits for the hand. */
export const CHANGE_MPS = 1.6;

/** A change asked for while the ball is out of the hand: the body keeps the run the last push committed to until the hand has the
 *  ball again (a dribbler cuts on the push, not in the air), so the ball is never left behind by the body it belongs to. */
export function dribbleCommit(committed: { x: number; z: number }, wish: { x: number; z: number }): { changing: boolean } {
  return { changing: Math.hypot(wish.x - committed.x, wish.z - committed.z) > CHANGE_MPS };
}

/** Can the hand take the ball now? Near the top of its bounce within arm's reach (the plain dribble), or — when a change is waiting — anywhere it
 *  can reach (a quick hand: the cut happens the moment the ball is in reach, not a whole bounce later). */
export function dribbleCatch(ball: Readonly<P3>, ballVel: Readonly<P3>, feet: Readonly<P3>, hand: Readonly<P3>, changing: boolean): boolean {
  const flat = Math.hypot(ball.x - feet.x, ball.z - feet.z);
  const y = ball.y - feet.y;
  if (flat > REACH_FLAT_M || y < REACH_LOW_M || y > REACH_HIGH_M) return false;
  if (changing) return true;
  // the arm meets it near the top of its bounce, wherever round the body it is (the body turns under a dribble)
  return ballVel.y > -0.6 && ball.y > hand.y - 0.3;
}

/** The hand's point for a dribble: beside and a little ahead of the body, at the hand's height. `side` +1 = the right hand. */
export function dribbleHand(feet: Readonly<P3>, yaw: number, side: 1 | -1, height = 0.92): P3 {
  const fx = Math.sin(yaw), fz = Math.cos(yaw);   // facing
  const rx = fz, rz = -fx;                          // right of facing
  return { x: feet.x + rx * 0.4 * side + fx * 0.22, y: feet.y + height, z: feet.z + rz * 0.4 * side + fz * 0.22 };
}

/** The hold for a shot: over the head, a little in front (the set point), at this height above the feet. */
export function setPoint(feet: Readonly<P3>, yaw: number, height = 2.3): P3 {
  return { x: feet.x + Math.sin(yaw) * 0.28, y: feet.y + height, z: feet.z + Math.cos(yaw) * 0.28 };
}

/** The chest, for a catch and a pass. */
export function chestPoint(feet: Readonly<P3>, yaw: number): P3 {
  return { x: feet.x + Math.sin(yaw) * 0.48, y: feet.y + 1.3, z: feet.z + Math.cos(yaw) * 0.48 };
}
