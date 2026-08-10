// PassShoot — Mode 5 Phases 4+5: passing and shooting with real weight on
// the Phase 2 ball. Everything resolves THROUGH SoccerBall physics.
//
//   Pass types — ground (fast, true, sticks to the deck), loft (over a
//     line), through (into space ahead of the runner — leads the target's
//     RUN, not their feet). Power scales with input hold AND distance.
//   Pass reliability — balance (plant vs stretch), pressure (a defender
//     closing), and body orientation (facing vs across body) modify the
//     launch dispersion. Under pressure + off-balance = a real miss chance.
//   Shots — power vs FINESSE are different mechanics: power = pace +
//     dispersion; finesse = curl (Magnus) + placement, less pace. Volleys
//     take the ball's incoming velocity into the strike.

import { Vector3 } from '@babylonjs/core';
import { SoccerBall } from './SoccerBall';

// ── Pass ───────────────────────────────────────────────────────────────────
export type PassType = 'ground' | 'loft' | 'through';

export interface PasserState {
  balance01: number;          // 1 = planted, 0 = stretching/falling
  pressure01: number;         // 1 = defender closing hard
  facingDot: number;          // -1..1: facing the target (1) vs across body
}

export function passAccuracy(s: PasserState): number {
  return Math.max(0.2, s.balance01 * 0.5 + (1 - s.pressure01) * 0.3 + (s.facingDot * 0.5 + 0.5) * 0.2);
}

/** Launch a pass on the physical ball. Power 0..1 (hold) + distance scale. */
export function playPass(
  ball: SoccerBall, type: PassType, from: Vector3, target: Vector3,
  power01: number, passer: PasserState, runnerVel: Vector3 = Vector3.Zero(),
): void {
  const dist = Vector3.Distance(from, target);
  const acc = passAccuracy(passer);
  // dispersion: less accurate = angular error on the launch direction
  const err = (1 - acc) * (Math.random() - 0.5) * 0.5;
  const toDir = target.subtract(from); toDir.y = 0;
  const dir = toDir.normalize();
  const ang = Math.atan2(dir.x, dir.z) + err;
  const out = new Vector3(Math.sin(ang), 0, Math.cos(ang));

  const p = 0.3 + power01 * 0.7;
  if (type === 'ground') {
    const speed = Math.min(26, 8 + dist * 0.5) * p;
    ball.launch(from, out.scale(speed), Vector3.Zero());
    ball.rolling = true;
  } else if (type === 'loft') {
    const speed = Math.min(24, 7 + dist * 0.55) * p;
    const up = 4 + dist * 0.12;
    ball.launch(from, out.scale(speed).add(new Vector3(0, up, 0)), new Vector3(0, 2, 0));
  } else {
    // through ball: lead the runner's line, not their feet
    const lead = target.add(runnerVel.scale(0.6));
    const leadDir = lead.subtract(from); leadDir.y = 0;
    const ld = leadDir.normalize();
    const speed = Math.min(28, 10 + dist * 0.6) * p;
    ball.launch(from, ld.scale(speed), new Vector3(0, 1.5, 0));
    ball.rolling = true;
  }
}

// ── Shot ───────────────────────────────────────────────────────────────────
export type ShotKind = 'power' | 'finesse';

export interface ShotInput {
  kind: ShotKind;
  power01: number;            // hold
  aimX: number;               // -1..1 across goal face
  volleyBallVel?: Vector3;    // present for a first-time/volley strike
  balance01: number;
  pressure01: number;
}

export function strikeBall(ball: SoccerBall, from: Vector3, goalCenter: Vector3, i: ShotInput): void {
  const acc = passAccuracy({ balance01: i.balance01, pressure01: i.pressure01, facingDot: 0.8 });
  const aim = new Vector3(goalCenter.x + i.aimX * 3.2, goalCenter.y + 0.8, goalCenter.z);
  const toGoal = aim.subtract(from);
  const dist = toGoal.length();
  const dir = toGoal.normalize();

  if (i.kind === 'power') {
    // pace + dispersion; harder = flatter + wilder
    const speed = (18 + i.power01 * 14) * (i.volleyBallVel ? 1.1 : 1);
    const dispersion = (1 - acc) * i.power01 * 0.35;
    const ang = Math.atan2(dir.x, dir.z) + (Math.random() - 0.5) * dispersion;
    const v = new Vector3(Math.sin(ang), dir.y * (1 - i.power01 * 0.3), Math.cos(ang)).normalize().scale(speed);
    if (i.volleyBallVel) v.addInPlace(i.volleyBallVel.scale(0.35));   // the incoming ball's pace carries
    ball.launch(from, v, new Vector3(0, (Math.random() - 0.5) * 3, 2));
  } else {
    // finesse: less pace, real curl toward the far post
    const speed = (12 + i.power01 * 8) * 0.9;
    const side = i.aimX >= 0 ? 1 : -1;
    const v = dir.scale(speed).add(new Vector3(0, 2.2 + dist * 0.06, 0));
    ball.launch(from, v, new Vector3(0, side * 14 * (0.5 + i.power01 * 0.5), -3));
  }
}
