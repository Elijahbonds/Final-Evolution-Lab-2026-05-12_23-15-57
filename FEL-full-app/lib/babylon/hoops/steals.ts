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
import { feel } from '../../feel-panel/feel';   // hoops-p02: the AI strip's knobs (group "Hoops · defense")

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
  /** hoops-p03: the driver's BRAIN says how exposed his ball is (the team offence's move windows, as the 1v1 AttackerBrain's exposure does):
   *  it replaces the sway read off his lateral speed. Absent = the sway read, as before. */
  brainExposure01?: number;
}

/** 0..1 — how exposed the driver's ball is to a poke right now (1v1's AttackerBrain read, on the 3v3 driver's real motion). */
export function driveExposure(i: Pick<DriveStripInput, 'moveExposed01' | 'velX' | 'velZ' | 'toRimX' | 'toRimZ' | 'phase' | 'brainExposure01'>): number {
  if (i.phase !== 'drive') return 0;   // the check and the gather: the ball is in the protected hand / the two-hand gather
  if (i.brainExposure01 !== undefined) return Math.max(Math.max(0, Math.min(1, i.brainExposure01)), Math.max(0, Math.min(1, i.moveExposed01 || 0)));
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

// ── THE AI'S STRIP IS A HAND ON THE BALL (1v1 / 3v3 ten-phase pass, phase 2 "defence is skill, not dice") ────────────────────────
// Before: an AI reach that survived its tell (core/ReachTell — the handler did not move the ball) took it on `roll() < 0.22` (0.6 inside
// the bump window), and a hard bump into a set AI defender stripped on `roll() < 0.18` (HoopsDefense.aiBumpStrips). The ball's place
// never entered into it: a ball dribbled on the far side of the handler's body was as stealable as one bounced into the reacher's lap.
// After: the strip lands when the reacher's hand can GET to the ball at the moment it resolves —
//   · within his reach (STRIP_REACH_M, planar, his root to the ball);
//   · not behind the handler's body (the line from the reacher to the ball clears the handler's root by STRIP_SHIELD_M: the off hand
//     and the hip are the shield, which is why you dribble with the hand away from him);
//   · off the palm (below STRIP_BALL_MAX_Y: on its way to the floor or back) — a ball in the palm at the top of the dribble is held.
//     Inside the bump window the ball is jarred loose in the hands and the palm does not hold it (the height test is off).
// The gate that STARTS a reach (the poke intent, aiReachGate) is the AI's choice, not an outcome, and is unchanged; so are the tell,
// the whiff stun and the reach-in foul. `hoops.stealDiceOn` 1 puts the rolls back exactly. Knobs: group "Hoops · defense".

/** 1 = today's strip rolls (aiStealChance / aiStealOnBump / AI_BUMP_STRIP_CHANCE); 0 = the hand on the ball. Knob `hoops.stealDiceOn`. */
export const STEAL_DICE_ON = false;
/** The reacher's hand gets this far from his root to the ball (m, planar): an arm and a lean — the poke's own reach (ReachTell POKE_RANGE).
 *  TUNED 0.95 → 1.2 (hoops-p02: at 0.95 a reach from the standoff almost never got to a ball in the outside hand — 0 % of reads in the
 *  possession model against the dice's 22 %; 14 % at 1.2). Knob `hoops.stripReachM`. */
export const STRIP_REACH_M = 1.2;
/** The handler's body shields a ball this close to the reacher's line through him (m). Knob `hoops.stripShieldM`. */
export const STRIP_SHIELD_M = 0.25;
/** A ball above this is in the palm at the top of the dribble (m). Knob `hoops.stripBallMaxY`. */
export const STRIP_BALL_MAX_Y = 0.85;

export const stealDiceOn = (): boolean => feel('hoops.stealDiceOn', STEAL_DICE_ON ? 1 : 0) >= 0.5;

export interface StripRead { lands: boolean; reach: number; clear: number; ballY: number }

/** Can the reacher's hand get to the ball now? `onBump`: inside the bump window (the ball loose in the hands: the palm does not hold it). */
export function aiStripLands(reacher: { x: number; z: number }, handler: { x: number; z: number }, ball: { x: number; y: number; z: number }, onBump = false): StripRead {
  const reach = Math.hypot(ball.x - reacher.x, ball.z - reacher.z);
  // the handler's root against the segment reacher → ball (how far his body is off the line the hand travels)
  const sx = ball.x - reacher.x, sz = ball.z - reacher.z, L2 = sx * sx + sz * sz;
  const u = L2 > 1e-8 ? Math.max(0, Math.min(1, ((handler.x - reacher.x) * sx + (handler.z - reacher.z) * sz) / L2)) : 0;
  const clear = Math.hypot(reacher.x + sx * u - handler.x, reacher.z + sz * u - handler.z);
  const lands = reach <= feel('hoops.stripReachM', STRIP_REACH_M)
    && clear >= feel('hoops.stripShieldM', STRIP_SHIELD_M)
    && (onBump || ball.y <= feel('hoops.stripBallMaxY', STRIP_BALL_MAX_Y));
  return { lands, reach, clear, ballY: ball.y };
}
