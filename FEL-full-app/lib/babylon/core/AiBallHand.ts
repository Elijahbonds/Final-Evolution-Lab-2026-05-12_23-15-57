// hoops-handle (owner 2026-10-17: "The model only dribbles right handed, let's fix that"): THE AI HANDLER'S BALL HAND. The 3v3 AI
// handlers (my mates with the ball, their driver) throw no handle moves, so their ball stayed in the right hand the carry's reset() put it
// in, every possession. A handler keeps the ball in the hand AWAY from the man guarding him (the ball-security read the 1v1 rival's brain
// and the player's own protect read already make): when the nearest opponent inside AI_HAND_RANGE_M has been on the ball's side for
// AI_HAND_DWELL_SEC, he crosses it over — a front crossover on his carry (the path the player's crossover runs), and the dribble then
// stays in that hand. No gameplay effect: nothing here reads or writes a roll, a steal, a stun or a speed (3v3's strip odds read the bump,
// not the hand), so an AI crossing changes what is drawn, never what happens. Pure: the mode steps it and runs the crossing.
import type { AthleteSide } from '../anim/athleteSide';
import { feel } from '../../feel-panel/feel';   // feel-panel (owner 10-20): the three numbers below are feel knobs (lib/feel-panel/knobs.ts) — the constant unless the owner's playtest override

/** An opponent inside this decides the hand (m). Outside it the hand stays where it is. assumption: a defender's reach-and-step (1.4 m
 *  protect range + a step); not felt yet. */
export const AI_HAND_RANGE_M = 2.4;
/** The ball on his side for this long before the handler crosses away from him (s) — a defender drifting across the line once does not
 *  make the handler cross on every frame. assumption: not felt yet. */
export const AI_HAND_DWELL_SEC = 0.35;
/** No two AI crossings closer together than this (s; from the end of the last one). assumption: not felt yet. */
export const AI_HAND_GAP_SEC = 0.9;

export interface AiHandState { wrongSec: number; sinceSec: number }
/** No crossing yet: the gap is already served (Infinity, so a tuned gap above the default does not hold back the first crossing; at the
 *  default it behaves as the old `sinceSec: AI_HAND_GAP_SEC` did). */
export const AI_HAND_IDLE: AiHandState = { wrongSec: 0, sinceSec: Infinity };
/** The range as played: AI_HAND_RANGE_M, or the owner's feel-panel override in a playtest run. */
export function aiHandRangeM(): number { return feel('hoops.aiHandRangeM', AI_HAND_RANGE_M); }

export interface AiHandRead {
  /** The athlete's hand the ball is in (the carry's: its destination while a crossing runs). */
  hand: AthleteSide;
  /** The side AWAY from the nearest opponent inside AI_HAND_RANGE_M (athleteSide.sideAwayFrom), or null: nobody close. */
  away: AthleteSide | null;
  /** His live dribble — not a shot, a pass, a gather or a held ball. */
  dribbling: boolean;
  /** A carry path is running (his crossing): it owns the ball and restarts the gap. */
  moveActive: boolean;
}

/** One frame. `cross` true = run the crossing now (the caller's carry.runMove('crossover')). */
export function stepAiHand(st: AiHandState, dt: number, r: AiHandRead): { state: AiHandState; cross: boolean } {
  if (!r.dribbling) return { state: AI_HAND_IDLE, cross: false };
  if (r.moveActive) return { state: { wrongSec: 0, sinceSec: 0 }, cross: false };
  const sinceSec = st.sinceSec + dt;
  if (!r.away || r.away === r.hand) return { state: { wrongSec: 0, sinceSec }, cross: false };
  const wrongSec = st.wrongSec + dt;
  if (wrongSec >= feel('hoops.aiHandDwellSec', AI_HAND_DWELL_SEC) && sinceSec >= feel('hoops.aiHandGapSec', AI_HAND_GAP_SEC)) return { state: { wrongSec: 0, sinceSec: 0 }, cross: true };
  return { state: { wrongSec, sinceSec }, cross: false };
}
