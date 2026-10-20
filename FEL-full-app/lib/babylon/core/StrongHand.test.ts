// H2d (hoops-motion plan §3.8, owner Q8): the ball goes back to the right hand on a stop or after 1.2 s in the left — never while
// protecting, never during a move, and never counted as one.
import { describe, expect, it } from 'vitest';
import { stepStrongHand, STRONG_HAND_IDLE, STOP_SEC, STOP_SPEED01, LEFT_DRIBBLE_MAX_SEC, PROTECT_RANGE_M, type StrongHandRead, type StrongHandState } from './StrongHand';

const DT = 1 / 60;
const R = (o: Partial<StrongHandRead> = {}): StrongHandRead => ({ hand: 'left', speed01: 0.5, moveActive: false, dribbling: true, defenderDist: 3, ...o });
/** Frames until `back`, or -1. */
function until(read: StrongHandRead, max = 200, st: StrongHandState = STRONG_HAND_IDLE): { frames: number; why: string | null } {
  for (let f = 1; f <= max; f++) { const s = stepStrongHand(st, DT, read); st = s.state; if (s.back) return { frames: f, why: s.back }; }
  return { frames: -1, why: null };
}

describe('the strong hand (§3.8)', () => {
  it('a stop brings it back after STOP_SEC under STOP_SPEED01', () => {
    const u = until(R({ speed01: STOP_SPEED01 - 0.05 }));
    expect(u.why).toBe('stop'); expect(u.frames * DT).toBeCloseTo(STOP_SEC, 1);
  });
  it('moving, it comes back after LEFT_DRIBBLE_MAX_SEC in the left hand', () => {
    const u = until(R({ speed01: 0.6 }));
    expect(u.why).toBe('time'); expect(u.frames * DT).toBeCloseTo(LEFT_DRIBBLE_MAX_SEC, 1);
  });
  it('nothing to do with the ball in the right hand, out of a dribble, or under a move (a move resets the clock)', () => {
    expect(until(R({ hand: 'right', speed01: 0 })).why).toBeNull();
    expect(until(R({ dribbling: false, speed01: 0 })).why).toBeNull();
    expect(until(R({ moveActive: true, speed01: 0 })).why).toBeNull();
    let st: StrongHandState = STRONG_HAND_IDLE;
    for (let f = 0; f < 60; f++) st = stepStrongHand(st, DT, R({ speed01: 0.6 })).state;   // 1.0 s in the left…
    st = stepStrongHand(st, DT, R({ moveActive: true })).state;                            // …a new move…
    expect(st).toEqual(STRONG_HAND_IDLE);                                                  // …starts it over
  });
  it('protecting (a defender inside PROTECT_RANGE_M) keeps the hand away from him — and it comes back once he is off', () => {
    expect(until(R({ speed01: 0, defenderDist: PROTECT_RANGE_M - 0.2 }), 150).why).toBeNull();
    let st: StrongHandState = STRONG_HAND_IDLE;
    for (let f = 0; f < 90; f++) st = stepStrongHand(st, DT, R({ speed01: 0.6, defenderDist: 1.0 })).state;   // 1.5 s protecting
    expect(stepStrongHand(st, DT, R({ speed01: 0.6, defenderDist: 3 })).back).toBe('time');
  });
});
