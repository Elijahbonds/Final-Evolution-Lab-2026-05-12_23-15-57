// ONE CONTEST MODEL FOR EVERY SHOOTER (1v1 / 3v3 ten-phase pass, phase 2; owner 2026-10-20 HOOPS DEFENSE: "Contest: one model for all
// shooters. It weighs distance, a hand actually raised toward the ball, a closeout running AT the shooter (not past him) and jump
// timing on a curve. The banner tiers stay as today.")
//
// Before (read in code at the release, four formulas for one idea):
//   · my jumper (1v1, 3v3):   (1 − d3D / 2.2) + 0.3 if his jump is ≤ 0.7 s old + his grounded hand (groundContest);
//   · the 1v1 rival:           (1 − d / 3)     + 0.3 if my jump is ≤ 0.7 s old + my grounded hand + 0.12 more inside his gather;
//   · the 3v3 rival:           (1 − d / 3) to the nearest of my team + my grounded hand (my jump: not counted at all);
//   · my 3v3 teammates:        (1 − d / 3) to the nearest rival, nothing else.
// So the same defender, at the same distance, with the same hand, contested a shot differently depending on whose shot it was, the
// 3-D distance gave a JUMPING defender less contest than a standing one, and a closeout counted only as where it happened to be.
//
// After: contestFrom(one defender) for every shooter, the shot's contest the most any defender put on it (contestOn):
//   distance  — CONTEST_DIST_W × (1 − d / CONTEST_RANGE_M), planar;
//   the hand  — a hand raised toward the shooter (HoopsDefense.groundContest: inside 2.2 m, facing him) OR a contest jump, on its
//               timing curve: JUMP_CONTEST at the top of the jump, JUMP_CONTEST_FLOOR of it as he leaves the floor or comes down,
//               nothing once he has landed (it was a flat +0.3 for 0.7 s, a jump that had landed counting the same as one at the top);
//               the larger of the two — a hand is up or it is not;
//   closeout  — CLOSEOUT_CONTEST × his speed AT the shooter (the velocity along the line to him) / CLOSEOUT_FULL_MPS, inside the
//               contest range; running past him adds nothing.
// What a contest COSTS is still each shooter's own curve (contestedPct for mine, rivalShotPct / rivalReleasePct for theirs, matePct
// for my mates), unchanged; contestCurveTable prints the three side by side (the phase's gate: every one of them monotonic).
// The banner's tiers (HoopsDefense.contestTier) are unchanged.
//
// `hoops.oneContestOn` 0 puts each mode's old formula back exactly. Every weight is a knob (group "Hoops · contest"). Pure.
import { feel } from '../../feel-panel/feel';
import { groundContest } from '../core/HoopsDefense';
import { JUMP_SEC } from './blocks';

/** 1 = one model for every shooter; 0 = each mode's own formula (today). Knob `hoops.oneContestOn`. */
export const ONE_CONTEST_ON = true;
/** The distance term reaches 0 here (m, planar). Between today's 2.2 (my jumper) and 3.0 (theirs, my mates'). Knob `hoops.contestRangeM`. */
export const CONTEST_RANGE_M = 2.6;
/** The distance term's weight. Knob `hoops.contestDistW`. */
export const CONTEST_DIST_W = 1;
/** A contest jump at its top adds this (today's flat HAND_UP_CONTEST 0.3, now on a curve). Knob `hoops.contestJump`. */
export const JUMP_CONTEST = 0.32;
/** …and this share of it as he leaves the floor or comes down. Knob `hoops.contestJumpFloor`. */
export const JUMP_CONTEST_FLOOR = 0.35;
/** A closeout running straight at the shooter at CLOSEOUT_FULL_MPS adds this. Knob `hoops.contestCloseout`. */
export const CLOSEOUT_CONTEST = 0.1;
/** m/s at the shooter for the full closeout. Knob `hoops.contestCloseoutFullMps`. */
export const CLOSEOUT_FULL_MPS = 3;

export const oneContestOn = (): boolean => feel('hoops.oneContestOn', ONE_CONTEST_ON ? 1 : 0) >= 0.5;

/** One defender, as the contest reads him at the release. */
export interface ContestBody {
  /** Planar distance to the shooter (m). Infinity = nobody. */
  dist: number;
  /** cos of the angle between his facing and the line to the shooter (1 = square to him). */
  facingCos: number;
  /** A grounded hand-up is held. */
  handUp: boolean;
  /** His contest jump's age at the release (s; Infinity = on the floor). */
  jumpAge: number;
  /** His planar speed along the line TO the shooter (m/s; + = closing, − = backing off). */
  closeMps: number;
}
export interface ContestParts { contest: number; dist: number; hand: number; jump: number; closeout: number }
const NONE: ContestParts = { contest: 0, dist: 0, hand: 0, jump: 0, closeout: 0 };

/** The contest jump's timing curve: 0 on the floor; JUMP_CONTEST at the top; JUMP_CONTEST_FLOOR of it at take-off and at landing. */
export function jumpContest(age: number, jumpSec = JUMP_SEC): number {
  if (!Number.isFinite(age) || age < 0 || age >= jumpSec) return 0;
  const floor = feel('hoops.contestJumpFloor', JUMP_CONTEST_FLOOR);
  return feel('hoops.contestJump', JUMP_CONTEST) * (floor + (1 - floor) * Math.sin((age / jumpSec) * Math.PI));
}

/** What one defender puts on the shot. */
export function contestFrom(b: ContestBody): ContestParts {
  if (!Number.isFinite(b.dist)) return NONE;
  const range = feel('hoops.contestRangeM', CONTEST_RANGE_M);
  const dist = feel('hoops.contestDistW', CONTEST_DIST_W) * Math.max(0, Math.min(1, 1 - b.dist / range));
  const hand = groundContest(b.dist, b.facingCos, b.handUp);
  const jump = jumpContest(b.jumpAge);
  const closeout = b.dist <= range && b.closeMps > 0
    ? feel('hoops.contestCloseout', CLOSEOUT_CONTEST) * Math.min(1, b.closeMps / feel('hoops.contestCloseoutFullMps', CLOSEOUT_FULL_MPS))
    : 0;
  const contest = Math.max(0, Math.min(1, dist + Math.max(hand, jump) + closeout));
  return { contest, dist, hand, jump, closeout };
}

/** The shot's contest: the most any one defender put on it (two half-contests are not one full one). */
export function contestOn(bodies: readonly ContestBody[]): ContestParts {
  let best = NONE;
  for (const b of bodies) { const c = contestFrom(b); if (c.contest > best.contest) best = c; }
  return best;
}

/** His planar speed along the line to the shooter (m/s, + = closing). */
export function closingSpeed(def: { x: number; z: number }, vel: { x: number; z: number }, shooter: { x: number; z: number }): number {
  const dx = shooter.x - def.x, dz = shooter.z - def.z, L = Math.hypot(dx, dz);
  return L < 1e-4 ? 0 : (vel.x * dx + vel.z * dz) / L;
}
