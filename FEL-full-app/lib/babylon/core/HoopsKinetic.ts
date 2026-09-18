// HOOPS KINETIC — the parkour DNA in a game of one-on-one (owner brief, 2026-09-18: "Kinetic Duel & Ankle-Breaker Combat").
//
// Four reads, all pure, all on the geometry the modes already track:
//   · THE PARRY-VAULT. The driver is arriving — inside the window, closing fast — and the steal press lands in it: the
//     defender vaults OVER the driver, strips the ball on the way, and lands running the other way.
//   · THE MOMENTUM DRIFT. LT held while sprinting turns a sharp stick cut into a slide-drift: the turn is taken with
//     the dribble speed kept, and a defender inside reach on the cut is left on the wrong foot (the ankle-breaker).
//   · THE FOOTSTOOL. On a loose ball, a jump with the rival between you and it goes off his shoulders: extra reach.
//   · THE DRIVE-BY STEAL. Running parallel at speed, the poke is a lateral strike that takes the ball without stopping.

export const PARRY = {
  /** The driver's distance band and closing speed that make a press a parry rather than a reach. */
  minDist: 0.8, maxDist: 1.9, minClosing: 2.2,
  /** The vault: seconds in the air, height, metres carried past the driver. */
  sec: 0.5, up: 1.0, forward: 1.7,
  /** The driver is left stumbling this long. */
  stunSec: 0.9,
} as const;

/** Is this steal press a PARRY-VAULT? `closing` = the driver's speed toward the defender (m/s). */
export function parryVaultRead(dist: number, closing: number, phase: string): boolean {
  if (phase !== 'drive' && phase !== 'blowby') return false;
  return dist >= PARRY.minDist && dist <= PARRY.maxDist && closing >= PARRY.minClosing;
}

/** Where the vault puts the body `u` (0..1) of the way through: an arc up and forward along `dir` from `from`. */
export function vaultAt(from: { x: number; y: number; z: number }, dir: { x: number; z: number }, u: number): { x: number; y: number; z: number } {
  const l = Math.hypot(dir.x, dir.z) || 1;
  return { x: from.x + (dir.x / l) * PARRY.forward * u, y: from.y + Math.sin(u * Math.PI) * PARRY.up, z: from.z + (dir.z / l) * PARRY.forward * u };
}

export const DRIFT = {
  /** The cut must turn at least this far, at least this fast, on the turbo, with LT held. */
  minTurnDeg: 45, minSpeed: 3.5,
  /** The defender inside this of the cut, on the side the cut leaves, breaks his ankles. */
  ankleM: 1.5, stunSec: 0.9,
  /** Seconds between drifts (a drift is a commitment, not a hold). */
  cooldownSec: 0.6,
} as const;

/** The angle (deg) between the current velocity and the wished direction. */
export function turnDeg(vel: { x: number; z: number }, wish: { x: number; z: number }): number {
  const a = Math.hypot(vel.x, vel.z), b = Math.hypot(wish.x, wish.z);
  if (a < 1e-3 || b < 1e-3) return 0;
  const c = Math.max(-1, Math.min(1, (vel.x * wish.x + vel.z * wish.z) / (a * b)));
  return (Math.acos(c) * 180) / Math.PI;
}

/** Is this frame a DRIFT? */
export function driftRead(ltHeld: boolean, sprint: boolean, vel: { x: number; z: number }, wish: { x: number; z: number }): boolean {
  if (!ltHeld || !sprint) return false;
  if (Math.hypot(vel.x, vel.z) < DRIFT.minSpeed) return false;
  return turnDeg(vel, wish) >= DRIFT.minTurnDeg;
}

/** Does the cut leave the defender on the wrong foot? He is inside reach and on the side the old line was headed. */
export function ankleBreak(me: { x: number; z: number }, velBefore: { x: number; z: number }, foe: { x: number; z: number }): boolean {
  const dx = foe.x - me.x, dz = foe.z - me.z, d = Math.hypot(dx, dz);
  if (d > DRIFT.ankleM || d < 1e-3) return false;
  const v = Math.hypot(velBefore.x, velBefore.z) || 1;
  const ahead = (dx * velBefore.x + dz * velBefore.z) / (d * v);
  return ahead > 0.3;   // he was in front of the old line — the cut goes past him
}

export const FOOTSTOOL = { withinM: 1.2, reachAdd: 0.6, hopVy: 5.5, holdSec: 0.7 } as const;

/** On a loose ball: is the rival between me and the ball, close enough to go off? */
export function footstoolRead(me: { x: number; z: number }, foe: { x: number; z: number }, ball: { x: number; z: number }): boolean {
  const dx = foe.x - me.x, dz = foe.z - me.z, d = Math.hypot(dx, dz);
  if (d > FOOTSTOOL.withinM || d < 1e-3) return false;
  const bx = ball.x - me.x, bz = ball.z - me.z, b = Math.hypot(bx, bz) || 1;
  return (dx * bx + dz * bz) / (d * b) > 0.3;
}

export const DRIVE_BY = { minSpeed: 3.6, alongM: 1.2, lateralMin: 0.45, lateralMax: 1.7, knockM: 1.6, stunSec: 0.8 } as const;

/** Running parallel to the handler at speed: the poke is a DRIVE-BY. */
export function driveByRead(myVel: { x: number; z: number }, me: { x: number; z: number }, foe: { x: number; z: number }): boolean {
  const s = Math.hypot(myVel.x, myVel.z);
  if (s < DRIVE_BY.minSpeed) return false;
  const fx = myVel.x / s, fz = myVel.z / s;
  const dx = foe.x - me.x, dz = foe.z - me.z;
  const along = dx * fx + dz * fz, lateral = Math.abs(dx * fz - dz * fx);
  return Math.abs(along) <= DRIVE_BY.alongM && lateral >= DRIVE_BY.lateralMin && lateral <= DRIVE_BY.lateralMax;
}
