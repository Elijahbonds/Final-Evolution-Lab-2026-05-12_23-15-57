import { describe, expect, it } from 'vitest';
import { MIN_CHECKS_FOR_REWARD, decideScreenReward } from './screenReward';

const base = { screenId: 's1', athleteId: 'a1', provisional: false, checksTaken: 6 };

describe('what a screen pays', () => {
  it('a graded screen pays, once, keyed by the screen itself', () => {
    const d = decideScreenReward(base);
    expect(d.pay).toBe(true);
    expect(d.idempotencyKey).toBe('screen:s1');
    expect(decideScreenReward(base).idempotencyKey).toBe(d.idempotencyKey);   // a retry cannot pay twice
  });

  it('a screen the camera could not grade pays NOTHING, and says why', () => {
    const d = decideScreenReward({ ...base, provisional: true });
    expect(d.pay).toBe(false);
    expect(d.message).toMatch(/in frame/i);
    expect(d.message).toMatch(/run it again/i);
  });

  it('a couple of stations is not a screen', () => {
    expect(decideScreenReward({ ...base, checksTaken: MIN_CHECKS_FOR_REWARD - 1 }).pay).toBe(false);
    expect(decideScreenReward({ ...base, checksTaken: MIN_CHECKS_FOR_REWARD }).pay).toBe(true);
  });

  it('different screens have different keys, so tomorrow pays again', () => {
    expect(decideScreenReward({ ...base, screenId: 's2' }).idempotencyKey).not.toBe(decideScreenReward(base).idempotencyKey);
  });
});
