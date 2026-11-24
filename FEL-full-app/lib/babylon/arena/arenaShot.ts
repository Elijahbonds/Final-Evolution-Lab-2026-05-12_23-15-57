// PHYSICS ARENA — the one release every shooter uses (the player, the rival, the headless tests).
//
// It reads the ball where the physics has it (the set point it was carried to), the shooter's body velocity at that instant,
// and the knobs, and throws. Nothing here knows whether the shot will go in.

import { ARENA_RIM, type P3 } from './hoopGeometry';
import { backspinFor, releaseVelocity } from './shotModel';
import { backspinRps, bodyCarry, releaseNoise, runCompensate, shotArcDeg } from './arenaConfig';
import type { ArenaBall } from './arenaPhysics';

export interface ShotRelease { vel: P3; spin: P3 }

/** The velocity and spin for a release from `from` (the ball's centre), the shooter moving at `bodyVel`. */
export function shotRelease(from: Readonly<P3>, bodyVel: Readonly<P3>, normal: () => number, yawErr = 0, arcDeg = shotArcDeg()): ShotRelease {
  const vel = releaseVelocity({
    from: { x: from.x, y: from.y, z: from.z }, rim: { ...ARENA_RIM }, arcDeg,
    bodyVel: { x: bodyVel.x, y: bodyVel.y, z: bodyVel.z }, bodyCarry: bodyCarry(), runCompensate: runCompensate(),
    noiseSd: releaseNoise(), noise: [normal(), normal(), normal()], yawErr,
  });
  return { vel, spin: backspinFor(vel, backspinRps()) };
}

/** Throw the ball: the shot leaves the hand. The shooter's own body passes through it for a moment (his follow-through). */
export function releaseShot(ball: ArenaBall, shooterBit: number, bodyVel: Readonly<P3>, normal: () => number, yawErr = 0, arcDeg?: number): ShotRelease {
  const r = shotRelease(ball.pos, bodyVel, normal, yawErr, arcDeg);
  ball.ignore(shooterBit, 0.35);
  ball.launch(r.vel, r.spin);
  return r;
}

/** The layup's arc: high and soft off a short distance. */
export const LAYUP_ARC_DEG = 66;

/** The dunk: the hand jams the ball from where it is toward a point under the ring's centre (the hand's intent). Whether it goes
 *  through is the iron's call: a ball let go under the ring's plane, or too far out, meets the front or the underside of the rim. */
export function dunkPush(from: Readonly<P3>, maxSpeed = 8): P3 {
  const tx = ARENA_RIM.x - from.x, ty = ARENA_RIM.y - 0.4 - from.y, tz = ARENA_RIM.z - from.z;
  const k = 1 / 0.16;
  let vx = tx * k, vy = ty * k, vz = tz * k;
  const s = Math.hypot(vx, vy, vz);
  if (s > maxSpeed) { vx *= maxSpeed / s; vy *= maxSpeed / s; vz *= maxSpeed / s; }
  return { x: vx, y: vy, z: vz };
}
