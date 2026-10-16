// H2d (hoops-motion plan §3.8, owner Q8: yes): THE STRONG HAND. With real crossings, every crossover left the ball in the left hand until
// the next crossing or the next possession — the owner's "right-handed everywhere" was met only by excluding those frames. The ball now
// goes back to the right hand by itself:
//   - on a STOP: the body under STOP_SPEED01 of top speed for STOP_SEC;
//   - after LEFT_DRIBBLE_MAX_SEC of left-hand dribble with no new move.
// Not while PROTECTING: a defender inside PROTECT_RANGE_M keeps the ball in the hand away from him (the ball-security read; the shield is
// phase 9's). A gather already takes the ball to the right hand (U14). The return is a quiet front crossing on the carry — a path, not a
// chain move: it reads no defender, rolls nothing and is never counted as a move. Pure: the modes step it and run the crossing.

/** Under this share of top speed the body has stopped (the plan's 0.15). */
export const STOP_SPEED01 = 0.15;
/** …for this long (s). */
export const STOP_SEC = 0.3;
/** The longest the ball stays in the left hand with no new move (s; the plan's 1.2). */
export const LEFT_DRIBBLE_MAX_SEC = 1.2;
/** A defender inside this is a protect read (the tree's PROTECT_RANGE). */
export const PROTECT_RANGE_M = 1.4;

export interface StrongHandState { stillSec: number; leftSec: number }
export const STRONG_HAND_IDLE: StrongHandState = { stillSec: 0, leftSec: 0 };

export interface StrongHandRead {
  /** The athlete's hand the ball is in (the carry's: its destination while a crossing is pending). */
  hand: 'left' | 'right';
  speed01: number;
  /** A handle move (or any carry path) is running: it owns the ball, and it resets the clock. */
  moveActive: boolean;
  /** Live dribble in my hands — not a shot, a gather, a spin, PAUSIN' or a held ball. */
  dribbling: boolean;
  /** Metres to the nearest live defender (Infinity: none). */
  defenderDist: number;
}

export type StrongHandStep = { state: StrongHandState; back: 'stop' | 'time' | null };

/** One frame. `back` names why the ball goes back to the right hand now (the caller runs the crossing), or null. */
export function stepStrongHand(st: StrongHandState, dt: number, r: StrongHandRead): StrongHandStep {
  if (!r.dribbling || r.hand === 'right' || r.moveActive) return { state: STRONG_HAND_IDLE, back: null };
  if (r.defenderDist < PROTECT_RANGE_M) return { state: { stillSec: 0, leftSec: st.leftSec + dt }, back: null };   // protecting: the hand stays away from him (the left-hand clock still runs: off him, it comes back)
  const stillSec = r.speed01 < STOP_SPEED01 ? st.stillSec + dt : 0;
  const leftSec = st.leftSec + dt;
  if (stillSec >= STOP_SEC) return { state: STRONG_HAND_IDLE, back: 'stop' };
  if (leftSec >= LEFT_DRIBBLE_MAX_SEC) return { state: STRONG_HAND_IDLE, back: 'time' };
  return { state: { stillSec, leftSec }, back: null };
}
