// TennisShots — Mode 7 Phases 4+5: shot types, serves, and net play — all
// through ONE spin-physics system (SoccerBall with a felt-court tune).
//
//   Shot types — topspin (dips hard, kicks up), slice (floats, skids LOW),
//     flat (fast, honest), drop (soft, dies), lob (high, punishable at net).
//     Each is a different spin+launch state, NOT a scripted arc.
//   Serves — flat (pace), kick (topspin jump), slice (curve wide); first
//     serves are bigger with real fault risk; second serves safer.
//   Volleys — reduced window at net, touch/drop volleys, overhead smash
//     off a lob.
//
// Every ball in the game resolves through SoccerBall (Phase 7's contract).

import { Vector3 } from '@babylonjs/core';
import { SoccerBall } from './SoccerBall';

// felt/hard-court tune: livelier than grass, less roll
export const TENNIS_BALL = {
  radius: 0.067, mass: 0.057, dragK: 0.016, magnusK: 0.008,
  grassFriction: 4.2, restitution: 0.72, skidFactor: 0.86,
};

export type ShotType = 'topspin' | 'slice' | 'flat' | 'drop' | 'lob';

export interface ShotLaunch { vel: Vector3; spin: Vector3; risk01: number }

/** Build the launch for a shot type toward a target. power01 from timing. */
export function shotLaunch(type: ShotType, from: Vector3, to: Vector3, power01: number): ShotLaunch {
  const dir = to.subtract(from); dir.y = 0;
  const d = dir.length();
  const fwd = dir.normalize();
  switch (type) {
    case 'topspin':
      return { vel: fwd.scale(16 + power01 * 8).add(new Vector3(0, 3.4, 0)), spin: new Vector3(-30 - power01 * 14, 0, 240), risk01: 0.35 };
    case 'slice':
      return { vel: fwd.scale(12 + power01 * 5).add(new Vector3(0, 2.0, 0)), spin: new Vector3(26, 0, 150), risk01: 0.2 };
    case 'flat':
      return { vel: fwd.scale(21 + power01 * 9).add(new Vector3(0, 1.6, 0)), spin: new Vector3(2, 0, 40), risk01: 0.55 };
    case 'drop':
      return { vel: fwd.scale(Math.max(4, d * 0.8)).add(new Vector3(0, 2.6, 0)), spin: new Vector3(30, 0, 120), risk01: 0.7 };
    case 'lob':
      return { vel: fwd.scale(Math.max(9, d * 0.7)).add(new Vector3(0, 8.5, 0)), spin: new Vector3(-8, 0, 100), risk01: 0.8 };
  }
}

// ── Serves ─────────────────────────────────────────────────────────────────
export type ServeType = 'flat' | 'kick' | 'slice';

export function serveLaunch(type: ServeType, from: Vector3, to: Vector3, first: boolean, tossQ01: number): ShotLaunch & { faultRisk01: number } {
  const dir = to.subtract(from); dir.y = 0;
  const fwd = dir.normalize();
  const big = first ? 1 : 0.78;
  const tossTax = 1 - (1 - tossQ01) * 0.3;
  switch (type) {
    case 'flat':
      return { vel: fwd.scale(38 * big * tossTax).add(new Vector3(0, -1, 0)), spin: new Vector3(4, 0, 60), risk01: 0.3, faultRisk01: first ? 0.42 : 0.1 };
    case 'kick':
      return { vel: fwd.scale(30 * big * tossTax).add(new Vector3(0, 3.2, 0)), spin: new Vector3(-34, 6, 300), risk01: 0.2, faultRisk01: first ? 0.3 : 0.05 };
    case 'slice':
      return { vel: fwd.scale(33 * big * tossTax).add(new Vector3(0, 0.6, 0)), spin: new Vector3(6, 26, 180), risk01: 0.25, faultRisk01: first ? 0.34 : 0.07 };
  }
}

// ── Volleys & overheads ────────────────────────────────────────────────────
export function volleyLaunch(from: Vector3, to: Vector3, touch: boolean): ShotLaunch {
  const dir = to.subtract(from); dir.y = 0;
  const fwd = dir.normalize();
  if (touch) return { vel: fwd.scale(5).add(new Vector3(0, 1.2, 0)), spin: new Vector3(22, 0, 110), risk01: 0.5 };
  return { vel: fwd.scale(19).add(new Vector3(0, 0.8, 0)), spin: new Vector3(6, 0, 90), risk01: 0.3 };
}

/** Overhead smash off a lob: only when the ball is high and falling. */
export function canSmash(ballPos: Vector3, ballVel: Vector3, playerPos: Vector3): boolean {
  return ballPos.y > 2.4 && ballVel.y < 0 && Vector3.Distance(
    new Vector3(ballPos.x, 0, ballPos.z), new Vector3(playerPos.x, 0, playerPos.z)) < 1.4;
}

export function smashLaunch(from: Vector3, to: Vector3): ShotLaunch {
  const dir = to.subtract(from); dir.y = 0;
  return { vel: dir.normalize().scale(30).add(new Vector3(0, -4, 0)), spin: new Vector3(-6, 0, 80), risk01: 0.15 };
}

/** A lob is punishable: low lobs over a net player get smashed. */
export function lobIsPunishable(ballPos: Vector3, netPlayerPos: Vector3, netZ: number): boolean {
  const overNet = (ballPos.z - netZ) !== 0;
  return overNet && ballPos.y < 3.4 && Math.abs(ballPos.x - netPlayerPos.x) < 2 && Math.abs(ballPos.z - netPlayerPos.z) < 2.5;
}
