// GuardHand — THE PLAYER'S OUTSIDE HAND WHEN GUARDED (hoops round 2, owner 2026-10-20: "Auto hand: outside hand when guarded. With a
// defender within reach, the player's ball goes to the hand away from him. In open court the hand stays where the last move left it.").
//
// The rule is the AI handler's (core/AiBallHand, hoops-handle #375), reused whole — the dwell before he crosses, the gap between two
// crossings, the gap restarting at the end of any move — and GATED TO "GUARDED": only a live defender (not stunned, not on the floor)
// inside GUARD_RANGE_M decides the hand. Outside it, or with nobody live, the read is "nobody close" and the hand stays exactly where
// the last move left it (#375's rule, unchanged). The player's own moves always win: a move running holds the clock, and the gap after
// it means the auto hand never undoes a cross the player just threw into him (the in-and-out, a crossing toward the defender).
//
// What it changes is what is drawn: a quiet front crossing on the carry (the path the AI's crossing and H2d's return already run) — no
// clip of its own, no chain link, no roll, no stun, no impulse. Nothing here reads or writes a steal, a strip or an odds number.
// Pure: the mode reads the defender, steps it, and runs the crossing (modes/hoopsFlow.PlayerGuardHand).
import { stepAiHand, AI_HAND_IDLE, type AiHandState } from './AiBallHand';
import type { AthleteSide } from '../anim/athleteSide';

/** A live defender inside this is GUARDING the player (m; new — a feel number, register as `hoops.guardRangeM`). The modes' own
 *  pressure ring: 1v1's and 3v3's stick read call a defender inside 2.0 m `pressured` (StickHandle's `pressured`, moveFromContext's). */
export const GUARD_RANGE_M = 2.0;

export type GuardHandState = AiHandState;
export const GUARD_HAND_IDLE: GuardHandState = AI_HAND_IDLE;

export interface GuardHandRead {
  /** The athlete's hand the ball is in (the carry's: its destination while a move runs). */
  hand: AthleteSide;
  /** The nearest LIVE defender (not stunned, not floored): his distance and the side of me AWAY from him — or null (nobody live). */
  defender: { dist: number; away: AthleteSide } | null;
  /** My live dribble: not a shot, a gather, a spin, a post-up, PAUSIN' or a held ball. */
  dribbling: boolean;
  /** A move's path is running on my carry (mine, or a crossing this rule started). */
  moveActive: boolean;
}

/** Is this defender guarding me? */
export function guarded(d: GuardHandRead['defender']): boolean { return !!d && d.dist < GUARD_RANGE_M; }

/** One frame. `cross` true = cross the ball to the other hand now (the caller's carry.runMove('crossover')). */
export function stepGuardHand(st: GuardHandState, dt: number, r: GuardHandRead): { state: GuardHandState; cross: boolean } {
  return stepAiHand(st, dt, { hand: r.hand, away: guarded(r.defender) ? r.defender!.away : null, dribbling: r.dribbling, moveActive: r.moveActive });
}
