// THE FOUR PROPERTIES THAT MAKE THIS AN AFFILIATE PROGRAM (2026-09-13).
//
// A multi-level commission structure is defined by what it refuses to do, and those refusals belong in code
// where they can be tested rather than in a policy page where they can be contradicted by a bug:
//
//   1. nobody earns for RECRUITING — only for product somebody actually bought
//   2. depth is bounded
//   3. the total is bounded, and provably under the platform's own take
//   4. no cycles, no self-referral
//
// Each has a test below, and the solvency one is a property over the rate table rather than an example.

import { describe, it, expect } from 'vitest';
import {
  commissionsFor, walkUpline, ratesAreSolvent, programSummary, isQualifying,
  MAX_DEPTH, LEVEL_RATES, TOTAL_RATE, PLATFORM_TAKE, QUALIFYING_KINDS,
  type Payment,
} from './referralTree';

const pay = (over: Partial<Payment> = {}): Payment => ({
  id: 'pay_1', payerId: 'u_payer', amountCents: 10_000, kind: 'subscription', recurring: false, ...over,
});

describe('1. COMMISSION IS PAID ON PRODUCT REVENUE, NEVER ON RECRUITMENT', () => {
  it('a signup pays nobody', () => {
    const r = commissionsFor(pay({ kind: 'signup' }), ['u_a', 'u_b']);
    expect(r.commissions).toEqual([]);
    expect(r.totalCents).toBe(0);
    expect(r.rejected).toMatch(/product revenue only/i);
  });

  it('nor does any other non-purchase event', () => {
    for (const kind of ['signup', 'referral', 'invite', 'recruitment', 'login', 'profile_complete', '']) {
      expect(commissionsFor(pay({ kind }), ['u_a']).commissions, kind).toEqual([]);
    }
  });

  it('the qualifying list is products, and recruitment is not on it', () => {
    expect(QUALIFYING_KINDS).toEqual(['subscription', 'academy_enrollment', 'coaching_retainer']);
    expect(isQualifying('signup')).toBe(false);
    expect(isQualifying('subscription')).toBe(true);
  });

  it('and a real purchase does pay', () => {
    const r = commissionsFor(pay(), ['u_a', 'u_b', 'u_c']);
    expect(r.commissions.map((c) => c.earnerId)).toEqual(['u_a', 'u_b', 'u_c']);
    expect(r.commissions.map((c) => c.amountCents)).toEqual([2000, 500, 200]);
  });

  it('COMMISSIONS RECUR, which is the whole ask — a renewal pays exactly like the first', () => {
    const first = commissionsFor(pay({ id: 'p1', recurring: false }), ['u_a']);
    const renewal = commissionsFor(pay({ id: 'p2', recurring: true }), ['u_a']);
    expect(renewal.commissions[0].amountCents).toBe(first.commissions[0].amountCents);
  });
});

describe('2. DEPTH IS BOUNDED', () => {
  it('a chain longer than MAX_DEPTH pays only MAX_DEPTH levels', () => {
    const long = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7'];
    const r = commissionsFor(pay(), long);
    expect(r.commissions).toHaveLength(MAX_DEPTH);
    expect(r.commissions.map((c) => c.earnerId)).toEqual(['u1', 'u2', 'u3']);
  });

  it('the bound is small, and the rate table cannot exceed it', () => {
    expect(MAX_DEPTH).toBeLessThanOrEqual(3);
    expect(LEVEL_RATES).toHaveLength(MAX_DEPTH);
  });

  it('a shorter chain simply pays fewer people', () => {
    expect(commissionsFor(pay(), ['u1']).commissions).toHaveLength(1);
    expect(commissionsFor(pay(), []).commissions).toEqual([]);
  });

  it('RATES DECREASE WITH DEPTH — the person who made the sale earns the overwhelming share', () => {
    for (let i = 1; i < LEVEL_RATES.length; i++) {
      expect(LEVEL_RATES[i]).toBeLessThan(LEVEL_RATES[i - 1]);
    }
    expect(LEVEL_RATES[0] / TOTAL_RATE).toBeGreaterThan(0.7);
  });
});

describe('3. THE TOTAL IS BOUNDED AND SOLVENT', () => {
  it('the tree can never pay out more than the platform takes', () => {
    expect(ratesAreSolvent()).toBe(true);
    expect(TOTAL_RATE).toBeLessThan(PLATFORM_TAKE);
  });

  it('no payment can pay out more than TOTAL_RATE of itself, at any chain length', () => {
    for (const len of [0, 1, 2, 3, 6, 20]) {
      const chain = Array.from({ length: len }, (_, i) => `u${i}`);
      const r = commissionsFor(pay({ amountCents: 99_999 }), chain);
      expect(r.totalCents / 99_999, `len ${len}`).toBeLessThanOrEqual(TOTAL_RATE + 1e-9);
    }
  });

  it('rounding favours solvency — it floors, so the tree is never overpaid by a cent', () => {
    const r = commissionsFor(pay({ amountCents: 999 }), ['u1', 'u2', 'u3']);
    for (const c of r.commissions) {
      expect(Number.isInteger(c.amountCents)).toBe(true);
    }
    expect(r.totalCents).toBeLessThanOrEqual(Math.floor(999 * TOTAL_RATE));
  });

  it('a payment too small to pay a level pays nothing at that level rather than zero rows', () => {
    const r = commissionsFor(pay({ amountCents: 10 }), ['u1', 'u2', 'u3']);
    expect(r.commissions.every((c) => c.amountCents > 0)).toBe(true);
  });

  it('a zero or negative payment pays nobody', () => {
    for (const amountCents of [0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(commissionsFor(pay({ amountCents }), ['u1']).commissions, String(amountCents)).toEqual([]);
    }
  });
});

describe('4. NO CYCLES, NO SELF-REFERRAL', () => {
  it('a payer in their own upline pays nobody', () => {
    const r = commissionsFor(pay({ payerId: 'u_a' }), ['u_b', 'u_a']);
    expect(r.commissions).toEqual([]);
    expect(r.rejected).toMatch(/own upline/i);
  });

  it('a direct self-referral pays nobody', () => {
    expect(commissionsFor(pay({ payerId: 'u_a' }), ['u_a']).commissions).toEqual([]);
  });

  it('a repeated account anywhere in the chain pays nobody', () => {
    expect(commissionsFor(pay(), ['u_a', 'u_b', 'u_a']).commissions).toEqual([]);
  });

  it('WALKING AN UPLINE TERMINATES, even on a graph with a loop in it', () => {
    // a referral graph built from user input WILL contain a cycle eventually, and a naive walk hangs
    const loop: Record<string, string> = { a: 'b', b: 'c', c: 'a' };
    const chain = walkUpline('a', (id) => loop[id]);
    expect(chain.length).toBeLessThanOrEqual(MAX_DEPTH);
    expect(new Set(chain).size).toBe(chain.length);
    expect(chain).not.toContain('a');
  });

  it('and on a self-parent', () => {
    expect(walkUpline('a', () => 'a')).toEqual([]);
  });

  it('stops at a missing parent', () => {
    expect(walkUpline('a', (id) => (id === 'a' ? 'b' : null))).toEqual(['b']);
    expect(walkUpline('a', () => null)).toEqual([]);
  });
});

describe('one payment can never pay a level twice', () => {
  it('commission ids are derived from the payment, so a replay is idempotent', () => {
    const a = commissionsFor(pay({ id: 'p_42' }), ['u1', 'u2']);
    const b = commissionsFor(pay({ id: 'p_42' }), ['u1', 'u2']);
    expect(a.commissions.map((c) => c.id)).toEqual(b.commissions.map((c) => c.id));
    expect(a.commissions.map((c) => c.id)).toEqual(['p_42:1', 'p_42:2']);
    expect(new Set(a.commissions.map((c) => c.id)).size).toBe(a.commissions.length);
  });
});

describe('what an affiliate is actually told', () => {
  it('names what earns, what does not, and where it stops', () => {
    const lines = programSummary().join(' ').toLowerCase();
    expect(lines).toMatch(/actually buy|actually buys/);
    expect(lines).toMatch(/earns nothing on its own/);
    expect(lines).toMatch(/no buy-in/);
    expect(lines).toMatch(/stops there/);
  });

  it('MAKES NO EARNINGS CLAIM — no projections, no income examples', () => {
    const lines = programSummary().join(' ').toLowerCase();
    for (const bad of ['up to $', 'earn $', 'per month', 'passive income', 'financial freedom', 'guaranteed', 'unlimited']) {
      expect(lines, bad).not.toContain(bad);
    }
  });
});
