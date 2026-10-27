// 3V3 STEALS LIKE 1V1 (lane/hoops-round2, HOP-01; owner 2026-10-20, HOOPS DEFENSE: "3v3 steals like 1v1 (no 30% coin flip)").
//
// Before: my poke on their 3v3 driver read a FIXED exposure of 0.3 (lifted by a body bump, bumpExposure) and connected when it
// reached 0.5 — or on a 30% coin flip (`roll() < 0.3`, ThreeVThreeMode). So a poke at a driver protecting the ball in his gather
// stole as often as one at a crossover, and a mashed X stole three times in ten whatever the ball was doing.
//
// After: the same READ the 1v1 poke has (OneVOneMode, STEAL poke: "a read, not a dice roll"). The ball is exposed while it CROSSES
// the body (the 3v3 driver's crossover is his carry's move — core/AiBallHand runs it, and the move's shape says how exposed the
// ball is at each point of its path, BallCarry.move.exposed01) and while he moves LATERALLY across his rim line (the 1v1 drive's
// sway exposure: |lateral speed| / EXPOSURE_LATERAL_SPEED). It is protected before the drive starts (the check) and in the gather.
// A hard body contact still opens the strip window (bumpExposure, D2) — but, as in 1v1, not in the check or the gather. A poke
// connects when the exposure reaches STEAL_EXPOSURE_MIN inside STEAL_RANGE; no dice anywhere.
//
// TUNED (the item IS the change): the 3v3 poke's 30% coin → the 1v1 exposure read. Numbers are 1v1's own (STEAL_EXPOSURE_MIN 0.5,
// EXPOSURE_LATERAL_SPEED 2.4 m/s, STEAL_RANGE 1.6 m), so 3v3 and 1v1 steal by one rule. Pure: no Babylon, no scene.
import { STEAL_EXPOSURE_MIN, EXPOSURE_LATERAL_SPEED } from '../core/BasketballCore';
import { bumpExposure, BUMP_STRIP_WINDOW_SEC } from '../core/HoopsDefense';

/** The poke's reach (planar m): 1v1's STEAL_RANGE, and the 3v3 gate's own 1.6 (one number). */
export const STEAL_RANGE_M = 1.6;

/** Where the driver is in his possession: before the drive (the check), driving, or gathering for the finish. */
export type DrivePhase = 'check' | 'drive' | 'gather';

export interface DriveStripInput {
  /** The driver's carry move's exposure now (BallCarry.move?.exposed01; 0 with no move running). */
  moveExposed01: number;
  /** The driver's planar velocity (m/s). */
  velX: number; velZ: number;
  /** His line to the rim (any length; planar). */
  toRimX: number; toRimZ: number;
  phase: DrivePhase;
  /** Seconds since the last hard body contact on him (Infinity = none). */
  bumpAge: number;
  /** Planar gap poker → driver (m). */
  dist: number;
}

/** 0..1 — how exposed the driver's ball is to a poke right now (1v1's AttackerBrain read, on the 3v3 driver's real motion). */
export function driveExposure(i: Pick<DriveStripInput, 'moveExposed01' | 'velX' | 'velZ' | 'toRimX' | 'toRimZ' | 'phase'>): number {
  if (i.phase !== 'drive') return 0;   // the check and the gather: the ball is in the protected hand / the two-hand gather
  const L = Math.hypot(i.toRimX, i.toRimZ);
  const lateral = L > 1e-6 ? Math.abs(i.velX * i.toRimZ - i.velZ * i.toRimX) / L : Math.hypot(i.velX, i.velZ);
  const sway = Math.min(1, lateral / EXPOSURE_LATERAL_SPEED);
  const cross = Math.max(0, Math.min(1, i.moveExposed01 || 0));
  return Math.max(sway, cross);
}

export interface DriveStripRead { exposure: number; connects: boolean; onBump: boolean }

/** The poke's verdict — 1v1's rule: in range, out of the check and the gather, and the ball exposed (or loose off a bump). */
export function driveStrip(i: DriveStripInput): DriveStripRead {
  const base = driveExposure(i);
  const exposure = i.phase === 'drive' ? bumpExposure(base, i.bumpAge) : 0;
  const connects = i.dist < STEAL_RANGE_M && i.phase === 'drive' && exposure >= STEAL_EXPOSURE_MIN;
  return { exposure, connects, onBump: connects && base < STEAL_EXPOSURE_MIN && i.bumpAge <= BUMP_STRIP_WINDOW_SEC };
}
