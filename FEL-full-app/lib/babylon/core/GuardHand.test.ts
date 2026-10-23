// hoops-moves (owner 2026-10-20): the player's OUTSIDE HAND WHEN GUARDED — #375's AI rule (core/AiBallHand) gated to a live defender
// inside GUARD_RANGE_M; in open court the hand stays where the last move left it.
import { describe, expect, it } from 'vitest';
import { stepGuardHand, guarded, GUARD_RANGE_M, GUARD_HAND_IDLE, type GuardHandRead, type GuardHandState } from './GuardHand';
import { AI_HAND_DWELL_SEC, AI_HAND_GAP_SEC } from './AiBallHand';

const DT = 1 / 60;
const R = (o: Partial<GuardHandRead> = {}): GuardHandRead => ({ hand: 'right', defender: { dist: 1.2, away: 'left' }, dribbling: true, moveActive: false, ...o });
function until(read: GuardHandRead, max = 300, st: GuardHandState = GUARD_HAND_IDLE): number {
  for (let f = 1; f <= max; f++) { const s = stepGuardHand(st, DT, read); st = s.state; if (s.cross) return f; }
  return -1;
}

describe('the outside hand when guarded', () => {
  it('a defender within reach on the ball side: after the dwell the ball goes to the hand away from him', () => {
    expect(until(R()) * DT).toBeCloseTo(AI_HAND_DWELL_SEC, 1);
    expect(until(R({ hand: 'left', defender: { dist: 1.0, away: 'right' } })) * DT).toBeCloseTo(AI_HAND_DWELL_SEC, 1);
  });
  it('GATED TO GUARDED: a defender at or beyond the range, or nobody live, and the hand stays where the last move left it', () => {
    expect(guarded({ dist: GUARD_RANGE_M - 0.01, away: 'left' })).toBe(true);
    expect(guarded({ dist: GUARD_RANGE_M, away: 'left' })).toBe(false);
    expect(until(R({ defender: { dist: GUARD_RANGE_M + 0.1, away: 'left' } }))).toBe(-1);
    expect(until(R({ defender: null }))).toBe(-1);
    expect(GUARD_RANGE_M).toBeLessThan(2.4);   // tighter than the AI's reach-and-step: "guarded", not "someone around"
  });
  it('already in the outside hand, not dribbling, or a move running: nothing', () => {
    expect(until(R({ defender: { dist: 1.2, away: 'right' } }))).toBe(-1);
    expect(until(R({ dribbling: false }))).toBe(-1);
    expect(until(R({ moveActive: true }))).toBe(-1);
  });
  it('the player\'s own move wins: after any move ends the gap runs before the auto hand may undo it (a cross thrown into him stays a beat)', () => {
    let st: GuardHandState = GUARD_HAND_IDLE;
    for (let f = 0; f < 20; f++) st = stepGuardHand(st, DT, R({ moveActive: true })).state;   // my move, running
    const f = until(R(), 300, st);
    expect(f * DT).toBeGreaterThanOrEqual(AI_HAND_GAP_SEC - 1e-9);
  });
});
