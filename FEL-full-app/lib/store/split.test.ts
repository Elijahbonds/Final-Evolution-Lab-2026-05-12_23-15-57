// THE PARTS ADD UP TO THE WHOLE, FOR EVERY PRICE (2026-09-13).
//
// The conservation test is a sweep rather than a handful of cases on purpose: the bug this file exists to
// prevent only appears at specific cent values, where three independent roundings disagree. A test that
// checks $10, $50 and $99 will pass on a broken implementation.

import { describe, it, expect } from 'vitest';
import { splitPayment, coachSharePreview, assertConserved, SplitError } from './split';
import { PLATFORM_TAKE, LEVEL_RATES, ratesAreSolvent, type Payment } from '../marketing/referralTree';

const pay = (over: Partial<Payment> = {}): Payment => ({
  id: 'pay_1', payerId: 'u_buyer', amountCents: 5000, kind: 'coaching_retainer', recurring: false, ...over,
});

describe('CONSERVATION — every cent lands somewhere', () => {
  it('holds for a thousand consecutive prices, with a full upline', () => {
    for (let cents = 1; cents <= 1000; cents++) {
      const s = splitPayment(pay({ amountCents: cents }), ['u_a', 'u_b', 'u_c']);
      expect(s.coachCents + s.platformCents + s.commissionCents, `at ${cents}c`).toBe(cents);
    }
  });

  it('holds across the awkward magnitudes too', () => {
    for (const cents of [1, 2, 3, 7, 99, 101, 333, 999, 1_00, 19_99, 49_99, 99_99, 200_000, 1_234_567]) {
      const s = splitPayment(pay({ amountCents: cents }), ['u_a', 'u_b', 'u_c']);
      expect(s.coachCents + s.platformCents + s.commissionCents, `at ${cents}c`).toBe(cents);
    }
  });

  it('holds with no upline at all', () => {
    for (let cents = 1; cents <= 300; cents++) {
      const s = splitPayment(pay({ amountCents: cents }), []);
      expect(s.coachCents + s.platformCents).toBe(cents);
      expect(s.commissionCents).toBe(0);
    }
  });

  it('NOBODY EVER GOES NEGATIVE', () => {
    for (let cents = 1; cents <= 1000; cents++) {
      const s = splitPayment(pay({ amountCents: cents }), ['u_a', 'u_b', 'u_c']);
      expect(s.coachCents, `coach at ${cents}c`).toBeGreaterThanOrEqual(0);
      expect(s.platformCents, `platform at ${cents}c`).toBeGreaterThanOrEqual(0);
      for (const c of s.commissions) expect(c.amountCents).toBeGreaterThan(0);
    }
  });

  it('the odd cent always falls to the PLATFORM, the direction that cannot invent money', () => {
    // 333c * 0.30 = 99.9 — the platform floors to 99 and the coach takes 234, not 233
    const s = splitPayment(pay({ amountCents: 333 }), []);
    expect(s.coachCents).toBe(234);
    expect(s.platformCents).toBe(99);
    expect(s.coachCents).toBeGreaterThanOrEqual(Math.floor(333 * (1 - PLATFORM_TAKE)));
  });
});

describe('THE COACH IS OWED A RATE THEY CAN PREDICT', () => {
  it('the coach share is the stated rate, not the residual', () => {
    const s = splitPayment(pay({ amountCents: 10_000 }), []);
    expect(s.coachCents).toBe(7_000);
    expect(s.platformCents).toBe(3_000);
  });

  it('and COMMISSIONS COME OUT OF THE PLATFORM, never the coach', () => {
    const alone = splitPayment(pay({ amountCents: 10_000 }), []);
    const referred = splitPayment(pay({ amountCents: 10_000 }), ['u_a', 'u_b', 'u_c']);
    expect(referred.coachCents).toBe(alone.coachCents);          // identical: the tree costs the coach nothing
    expect(referred.platformCents).toBeLessThan(alone.platformCents);
    expect(referred.commissionCents).toBe(Math.floor(10_000 * LEVEL_RATES.reduce((a, b) => a + b, 0)));
  });

  it('the preview a coach sees before listing matches what they are actually paid', () => {
    for (const cents of [500, 4_999, 12_345, 200_000]) {
      const preview = coachSharePreview(cents);
      const actual = splitPayment(pay({ amountCents: cents }), ['u_a']);
      expect(preview.coachCents, `at ${cents}c`).toBe(actual.coachCents);
      expect(preview.ratePct).toBe(30);
    }
  });
});

describe('A PROGRAM SALE IS NOT A QUALIFYING PURCHASE — the boundary is honoured, not widened', () => {
  it('a one-off block purchase pays no commission and says why', () => {
    const s = splitPayment(pay({ kind: 'program_purchase', amountCents: 10_000 }), ['u_a', 'u_b']);
    expect(s.commissions).toEqual([]);
    expect(s.commissionCents).toBe(0);
    expect(s.commissionsRejected).toMatch(/not a qualifying purchase/i);
    expect(s.platformCents).toBe(3_000);                          // the whole take stays with the platform
    expect(s.coachCents + s.platformCents).toBe(10_000);
  });

  it('but a coaching retainer does', () => {
    const s = splitPayment(pay({ kind: 'coaching_retainer', amountCents: 10_000 }), ['u_a']);
    expect(s.commissions).toHaveLength(1);
    expect(s.commissionsRejected).toBeNull();
  });

  it('and the upline rules still apply through this path — no self-referral', () => {
    const s = splitPayment(pay({ payerId: 'u_a', kind: 'coaching_retainer' }), ['u_a']);
    expect(s.commissions).toEqual([]);
    expect(s.commissionsRejected).toMatch(/own upline/i);
    expect(s.coachCents + s.platformCents).toBe(5000);            // still conserves
  });
});

describe('IT FAILS LOUDLY RATHER THAN QUIETLY', () => {
  it('a non-integer or non-positive amount is refused', () => {
    for (const amountCents of [0, -100, 10.5, NaN, Infinity]) {
      expect(() => splitPayment(pay({ amountCents })), String(amountCents)).toThrow(SplitError);
    }
  });

  it('the solvency invariant the whole design rests on actually holds', () => {
    expect(ratesAreSolvent()).toBe(true);
    expect(LEVEL_RATES.reduce((a, b) => a + b, 0)).toBeLessThan(PLATFORM_TAKE);
  });

  it('assertConserved catches a hand-built split that does not add up', () => {
    expect(() => assertConserved({
      grossCents: 1000, coachCents: 700, platformCents: 299, commissions: [], commissionCents: 0,
      commissionsRejected: null,
    })).toThrow(/does not conserve/i);
  });

  it('a split from splitPayment always survives its own re-check', () => {
    for (const cents of [1, 97, 5_000, 199_999]) {
      expect(() => assertConserved(splitPayment(pay({ amountCents: cents }), ['u_a', 'u_b']))).not.toThrow();
    }
  });
});
