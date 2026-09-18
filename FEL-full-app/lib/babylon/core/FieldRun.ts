// FieldRun — Mode 6 Phases 6+7: fielding, throwing, and baserunning.
// Physics-driven batted balls resolve into real defensive plays; running
// decisions carry risk tied to the defender/catcher, not fixed odds.

import { Vector3 } from '@babylonjs/core';

// ── Fielding ───────────────────────────────────────────────────────────────
export interface FielderState { pos: Vector3; range: number; armStrength01: number }

/** Time for a fielder to reach the ball's landing/rolling spot. */
export function fielderArrivalSec(f: FielderState, ballPos: Vector3, ballVel: Vector3): number {
  // lead the ball: intercept where it WILL be
  const lead = ballPos.add(ballVel.scale(0.4));
  return Vector3.Distance(f.pos, lead) / (f.range * 4.5);
}

export type CatchResult = 'routine' | 'diving' | 'offWall' | 'drop' | 'noPlay';

export function resolveCatch(f: FielderState, ballPos: Vector3, ballVel: Vector3, ballHeight: number): CatchResult {
  const t = fielderArrivalSec(f, ballPos, ballVel);
  if (ballHeight > 3.2) return 'noPlay';                       // over everyone
  if (t < 0.7 && ballHeight < 2.2) return 'routine';
  if (t < 1.4) return 'diving';
  if (ballHeight > 2.2) return 'offWall';
  return t < 1.6 ? 'drop' : 'noPlay';
}

/** Throw to a base: arm strength + moving (off-balance) set the time. */
export function throwTimeSec(f: FielderState & { moving01: number }, from: Vector3, base: Vector3): number {
  const dist = Vector3.Distance(from, base);
  const velo = 24 + f.armStrength01 * 16;                       // m/s
  return dist / velo * (1 + f.moving01 * 0.35);
}

// ── Baserunning ────────────────────────────────────────────────────────────
export interface RunnerState { pos: Vector3; speed: number; lead01: number }

export type RunDecision = 'hold' | 'advance' | 'steal' | 'tagUp';

/** A steal resolves against the catcher's arm + the runner's jump:
 *  good jump + slow arm = safe; poor jump into a strong arm = out. */
export function resolveSteal(runner: RunnerState, catcherArm01: number, pitchVelo: number): { safe: boolean; margin: number } {
  const runnerTime = 27 / (runner.speed * (1 + runner.lead01 * 0.3));     // 90ft ≈ 27m
  const catcherTime = 1.1 + (1 - catcherArm01) * 0.5 + 43 / pitchVelo;    // pop + flight
  const margin = catcherTime - runnerTime;
  return { safe: margin > 0, margin };
}

/** Tag-up: advance only if the catch is deep enough that the throw home
 *  loses to the runner. */
export function shouldTagUp(runner: RunnerState, catchDepth: number, fielderArm01: number): boolean {
  // tag-up: the runner goes base-to-next (27m), the fielder must throw
  // the FULL depth back (catchDepth) plus the exchange beat
  const runTime = 27 / (runner.speed * (1 + runner.lead01 * 0.2));
  const throwTime = catchDepth / (24 + fielderArm01 * 16) + 0.9;
  return runTime < throwTime;
}

/** Force/tag resolution at a base. */
export function resolvePlayAtBase(runnerArrival: number, ballArrival: number): 'safe' | 'out' {
  return runnerArrival <= ballArrival ? 'safe' : 'out';
}
