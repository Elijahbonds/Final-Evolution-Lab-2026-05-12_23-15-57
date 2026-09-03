import { describe, expect, it } from 'vitest';
import { DEFAULT_DRIBBLE as P, advancePhase, dribbleAt } from './Dribble';

describe('dribble cycle', () => {
  it('has the ball at the palm at phase 0 and on the floor at phase 0.5', () => {
    expect(dribbleAt(0).ballY).toBeCloseTo(P.palmY, 6);
    expect(dribbleAt(0.5).ballY).toBeCloseTo(P.ballR, 6);
    expect(dribbleAt(1).ballY).toBeCloseTo(P.palmY, 6);
  });
  it('keeps the hand on the ball through the push, then waits above the floor', () => {
    const push = dribbleAt(0.1);
    expect(push.hand.y).toBeCloseTo(push.ballY + P.ballR, 6);
    expect(push.handWeight).toBe(1);
    const low = dribbleAt(0.5);
    expect(low.hand.y).toBeCloseTo(P.palmY - P.followDepth, 6);
    expect(low.handWeight).toBeLessThan(1);
    expect(low.handWeight).toBeGreaterThanOrEqual(0.6);
  });
  it('is continuous across the wrap and never below the floor', () => {
    let prev = dribbleAt(0);
    for (let i = 1; i <= 200; i++) {
      const s = dribbleAt(i / 200);
      expect(Math.abs(s.ballY - prev.ballY)).toBeLessThan(0.03);
      expect(s.ballY).toBeGreaterThanOrEqual(P.ballR - 1e-9);
      prev = s;
    }
  });
  it('bounces faster at speed', () => {
    const slow = advancePhase(0, 0.1, 0), fast = advancePhase(0, 0.1, 1);
    expect(fast).toBeGreaterThan(slow);
    expect(slow).toBeCloseTo(0.1 * P.hzIdle, 6);
  });
});
