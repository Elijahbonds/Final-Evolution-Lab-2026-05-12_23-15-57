import { describe, expect, it } from 'vitest';
import { MIN_CHECKS_FOR_REWARD, decideScreenReward } from './screenReward';
import { NOT_GRADED_LINE } from './screen';

const base = { screenId: 's1', athleteId: 'a1', provisional: false, checksTaken: 6 };

describe('what a screen pays', () => {
  it('a graded screen pays, once, keyed by the screen itself', () => {
    const d = decideScreenReward(base);
    expect(d.pay).toBe(true);
    expect(d.idempotencyKey).toBe('screen:a1:s1');
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

describe('the key cannot collide between two athletes', () => {
  // Ledger keys are unique across the whole table. A key built from the screen id alone would hand the second
  // athlete to generate that id the FIRST one's ledger entry, instead of paying them.
  it('puts the athlete in the key', () => {
    const a = decideScreenReward({ screenId: 'same', athleteId: 'alice', provisional: false, checksTaken: 6 });
    const b = decideScreenReward({ screenId: 'same', athleteId: 'bob', provisional: false, checksTaken: 6 });
    expect(a.idempotencyKey).not.toBe(b.idempotencyKey);
    expect(a.idempotencyKey).toContain('alice');
  });

  it('still pays one athlete only once for one screen', () => {
    const once = { screenId: 's9', athleteId: 'alice', provisional: false, checksTaken: 6 };
    expect(decideScreenReward(once).idempotencyKey).toBe(decideScreenReward(once).idempotencyKey);
  });
});

// MIRROR-COACH P1 (2026-09-25): every screen so far arrived with zero checks (no grader exists yet), was marked
// provisional, and was told "Not enough of that was in frame … Step back and run it again" — a retry that can never
// succeed. Zero checks is its own answer now, decided before the framing one.
describe('a screen nothing graded', () => {
  it('pays nothing and says it was not graded — no retry prompt', () => {
    const d = decideScreenReward({ ...base, checksTaken: 0 });
    expect(d.pay).toBe(false);
    expect(d.message).toBe(NOT_GRADED_LINE);
    expect(d.message).not.toMatch(/step back|run it again|in frame/i);
  });

  it('is answered as ungraded even when the client also marked it provisional', () => {
    const d = decideScreenReward({ ...base, checksTaken: 0, provisional: true });
    expect(d.message).toBe(NOT_GRADED_LINE);
    expect(d.pay).toBe(false);
  });
});
