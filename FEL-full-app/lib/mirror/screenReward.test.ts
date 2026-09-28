import { describe, expect, it } from 'vitest';
import { ENDED_EARLY_LINE, MIN_CHECKS_FOR_REWARD, PROVISIONAL_LINE, decideScreenReward } from './screenReward';
import { NOT_GRADED_LINE } from './screen';

const base = { screenId: 's1', athleteId: 'a1', provisional: false, checksTaken: 6 };

describe('what a screen pays', () => {
  it('a graded screen pays, once, keyed by the screen itself', () => {
    const d = decideScreenReward(base);
    expect(d.pay).toBe(true);
    expect(d.idempotencyKey).toBe('screen:a1:s1');
    expect(decideScreenReward(base).idempotencyKey).toBe(d.idempotencyKey);   // a retry cannot pay twice
  });

  // MIRROR-COACH P3 review (2026-09-26): this line was "Not enough of that was in frame to grade … Step back and run it
  // again." — reachable again since P3 (provisional = under three checks read) and said aloud after a screen whose
  // reasons were "come closer" or "more light". It now says what the camera read and why the rest was not
  // (screenClaims.ts screenReadLine), or, with no such line, that it pays nothing — never a retry prompt.
  it('a screen the camera could not grade pays NOTHING, says why, and never sends the athlete round again', () => {
    const d = decideScreenReward({ ...base, provisional: true });
    expect(d.pay).toBe(false);
    expect(d.message).toBe(PROVISIONAL_LINE);
    expect(d.message).not.toMatch(/step back|run it again|in frame/i);
    const said = 'The camera read 2 checks (Hip level, Shoulder height). Most of the rest: x. Come a little closer to the phone.';
    expect(decideScreenReward({ ...base, provisional: true, readLine: said }).message).toBe(said);
    expect(decideScreenReward({ ...base, provisional: true, checksTaken: 0, readLine: said }).message).toBe(said);
    expect(decideScreenReward({ ...base, provisional: true, checksTaken: 0 }).message).toBe(NOT_GRADED_LINE);
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

// MIRROR-COACH P3 follow-up review (2026-09-28): an ended screen that did not reach every camera station is not paid
describe('an ended screen', () => {
  it('ended early: kept, not paid, and it says why — ahead of the check count, after a provisional screen\'s own reasons', () => {
    const d = decideScreenReward({ ...base, endedEarly: true });
    expect(d).toMatchObject({ pay: false, message: ENDED_EARLY_LINE, idempotencyKey: 'screen:a1:s1' });
    expect(decideScreenReward({ ...base, provisional: true, endedEarly: true, readLine: 'The camera read 1 check.' }).message).toBe('The camera read 1 check.');
    expect(decideScreenReward({ ...base, checksTaken: 0, endedEarly: true }).pay).toBe(false);
    expect(decideScreenReward({ ...base, endedEarly: false }).pay).toBe(true);
    expect(ENDED_EARLY_LINE).not.toMatch(/shards are in your wallet/i);
  });
});
