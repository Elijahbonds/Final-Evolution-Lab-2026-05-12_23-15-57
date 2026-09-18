// FirstTouch + SoccerMovement — Mode 5 Phase 3: receiving and dribbling
// with real weight.
//
//   First touch is a SKILL READ, not a magnet:
//     touchQuality = f(incoming pace, approach angle, input timing,
//                    body orientation). A hot pass into a tight touch or a
//     mistimed cushion KNOCKS THE BALL LOOSE — visibly, physically (the
//     SoccerBall gets a real deflection, not a scripted fumble).
//   Dribble — the ball runs slightly AHEAD at speed (push-and-run),
//     touches tighten at walking pace; a sprint dribble has a looser
//     touch (real football tradeoff).
//
// Movement reuses CourtMovement (weight model), tuned for grass.

import { Vector3 } from '@babylonjs/core';
import { CourtMovement, DEFAULT_MOVEMENT } from './CourtMovement';
import { SoccerBall } from './SoccerBall';

export const SOCCER_MOVE = {
  ...DEFAULT_MOVEMENT, maxSpeed: 7.8, accel: 22, decel: 30, plantBleedSec: 0.1,
};

// ── First touch ────────────────────────────────────────────────────────────
export type TouchGrade = 'cushioned' | 'controlled' | 'loose' | 'knocked';

export interface TouchInput {
  incomingSpeed: number;      // ball pace at receipt (m/s)
  touchTiming01: number;      // 1 = pressed as the ball arrived, 0 = way off
  facingBall: boolean;        // body shape toward the ball
  movingAway: boolean;        // receiving on the back foot at pace
}

export function gradeTouch(i: TouchInput): TouchGrade {
  let q = i.touchTiming01;
  if (!i.facingBall) q -= 0.25;
  if (i.movingAway) q -= 0.15;
  q -= Math.min(0.35, Math.max(0, (i.incomingSpeed - 12) / 40));  // hot passes are harder
  if (q > 0.75) return 'cushioned';
  if (q > 0.5) return 'controlled';
  if (q > 0.25) return 'loose';
  return 'knocked';
}

/** Apply the touch to the physical ball. Cushioned kills pace dead at the
 *  feet; knocked deflects it away (a real loose ball, winnable by anyone). */
export function applyTouch(ball: SoccerBall, grade: TouchGrade, playerPos: Vector3, facingYaw: number): void {
  const fwd = new Vector3(Math.sin(facingYaw), 0, Math.cos(facingYaw));
  switch (grade) {
    case 'cushioned':
      ball.vel.scaleInPlace(0.08);
      ball.spin.setAll(0);
      break;
    case 'controlled':
      ball.vel.scaleInPlace(0.3);
      ball.vel.addInPlace(fwd.scale(0.8));
      break;
    case 'loose':
      ball.vel.scaleInPlace(0.55);
      ball.vel.addInPlace(fwd.scale(1.8));
      break;
    case 'knocked': {
      // visibly bad: the ball squirts away at an angle — a 50/50 ball
      const side = Math.random() > 0.5 ? 1 : -1;
      const away = fwd.scale(2.4).add(new Vector3(fwd.z * side, 0, -fwd.x * side).scale(1.6));
      ball.vel.copyFrom(away);
      ball.rolling = true;
      break;
    }
  }
  if (grade !== 'knocked') {
    ball.pos.copyFrom(playerPos.add(fwd.scale(0.4)));
    ball.pos.y = ball.pos.y || 0.11;
  }
}

// ── Dribbling ──────────────────────────────────────────────────────────────
export class DribbleTouch {
  /** How far ahead of the player the ball runs (m) — loose at speed. */
  leadDistance(speed01: number): number {
    return 0.3 + speed01 * 0.9;
  }

  /** Push the ball ahead while dribbling (keeps the ball physical). */
  update(ball: SoccerBall, playerPos: Vector3, yaw: number, speed01: number): void {
    const fwd = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const target = playerPos.add(fwd.scale(this.leadDistance(speed01)));
    target.y = 0.11;
    // the ball chases its lead point with a light spring (feels attached
    // but physical — a hard cut leaves it behind a beat)
    const to = target.subtract(ball.pos); to.y = 0;
    ball.vel.x += to.x * 18 * (1 / 60);
    ball.vel.z += to.z * 18 * (1 / 60);
    ball.rolling = true;
    ball.active = true;
    ball.step(1 / 60);                     // the spring actually moves it
  }
}
