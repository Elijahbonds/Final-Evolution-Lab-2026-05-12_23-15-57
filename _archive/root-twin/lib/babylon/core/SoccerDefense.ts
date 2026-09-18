// SoccerDefense — Mode 5 Phase 7: defensive shape, pressing, tackling,
// jockeying, and offside. Pure logic, headless-tested.

import { Vector3 } from '@babylonjs/core';

// ── Shape & press ──────────────────────────────────────────────────────────
export type DefAction = 'hold' | 'press' | 'jockey' | 'recover';

export interface DefDecision { action: DefAction; target: Vector3; urgency: number }

/** Press when: the carrier is slow/cornered, we have cover behind, or the
 *  ball is near our box (no time to hold). Otherwise hold shape. */
export function decideDefense(
  self: Vector3, homeSpot: Vector3, ballPos: Vector3, carrierSpeed: number,
  coverBehind: boolean, ownGoalZ: number,
): DefDecision {
  const distBall = Vector3.Distance(self, ballPos);
  const nearBox = Math.abs(ballPos.z - ownGoalZ) < 14;
  // pressing triggers: stationary carrier, cornered near touchline, or
  // protecting the box late
  const trigger = carrierSpeed < 1.2 || Math.abs(ballPos.x) > 26 || (nearBox && distBall < 8);
  if (trigger && distBall < 7) {
    return { action: 'press', target: ballPos.clone(), urgency: 0.9 };
  }
  if (distBall < 4) {
    // jockey: controlled backpedal between ball and goal, facing the carrier
    const toGoal = new Vector3(0, 0, ownGoalZ).subtract(ballPos).normalize();
    return { action: 'jockey', target: ballPos.add(toGoal.scale(1.6)), urgency: 0.4 };
  }
  if (Vector3.Distance(self, homeSpot) > 4) {
    return { action: 'recover', target: homeSpot.clone(), urgency: 0.7 };
  }
  return { action: 'hold', target: homeSpot.clone(), urgency: 0.2 };
}

// ── Tackling ───────────────────────────────────────────────────────────────
export type TackleKind = 'standing' | 'slide';
export type TackleResult = 'won' | 'missed' | 'foul';

export interface TackleInput {
  kind: TackleKind;
  distToBall: number;         // m at the challenge
  fromBehind: boolean;        // tackling through the man
  ballMoved: boolean;         // carrier already played it away
}

/** Standing is safe within range; slide covers more ground but a miss or
 *  a from-behind slide is a FOUL (real risk). */
export function resolveTackle(i: TackleInput): TackleResult {
  if (i.ballMoved) return i.kind === 'slide' && i.fromBehind ? 'foul' : 'missed';
  if (i.kind === 'standing') {
    if (i.fromBehind) return 'foul';
    return i.distToBall < 0.9 ? 'won' : 'missed';
  }
  // slide: longer reach, foul risk from behind or when wild
  if (i.fromBehind) return 'foul';
  return i.distToBall < 1.7 ? 'won' : 'missed';
}

// ── Offside ────────────────────────────────────────────────────────────────
/** Offside at the MOMENT of the pass: an attacker beyond the second-last
 *  defender (or the ball) in the attacking half. Keeper counts. */
export function isOffside(
  receiverPos: Vector3, ballPosAtPass: Vector3, defenders: Vector3[],
  goalZ: number,
): boolean {
  if (receiverPos.z < goalZ / 2) return false;                 // own half
  if (receiverPos.z <= ballPosAtPass.z) return false;          // level with ball
  const sorted = [...defenders].sort((a, b) => b.z - a.z);
  const secondLast = sorted[1] ?? sorted[0];
  if (!secondLast) return false;
  return receiverPos.z > secondLast.z + 0.01;
}
