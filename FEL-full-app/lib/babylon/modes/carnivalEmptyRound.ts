// CC75-3 (ALL-MODES-TO-75-2026-10-22 §2 Court Carnival): a round with nothing in it saves nothing. Pure, so the mode and
// its tests read the same lines.
import type { FelInput } from '../core/InputBus';

/** A stick has to leave this radius to count as the player doing something (drift and a resting thumb stay under it). */
export const PLAY_STICK_MIN = 0.35;   //TUNE(elijah)

/** Is this input a player acting on the event (a press, or a stick pushed past PLAY_STICK_MIN)? Releases do not count. */
export function isPlayInput(e: FelInput): boolean {
  if (e.t === 'stick') return Math.hypot(e.x, e.y) >= PLAY_STICK_MIN;
  return 'pressed' in e && (e as { pressed?: boolean }).pressed === true;
}

/** A round is empty when no player put a single input into it (solo: P1's turn; two on one screen: both turns). */
export function roundIsEmpty(players: number, turnInputs: readonly [number, number]): boolean {
  return players > 1 ? turnInputs[0] === 0 && turnInputs[1] === 0 : turnInputs[0] === 0;
}

/** The night's outcome when nothing at all was played in it: NO_PLAY at score 0 (no CHAMPION, no RUNNER_UP). */
export const NO_PLAY_OUTCOME = 'NO_PLAY';
