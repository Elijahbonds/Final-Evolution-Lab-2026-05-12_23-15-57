// COACH-BUSINESS: the 5% fee and its refund math (owner, 2026-10-25: a 5% revenue share through Stripe Connect).
import { describe, expect, it } from 'vitest';
import { CONNECT_FEE_BPS } from '@/lib/coach-business/config';
import { applicationFeeCents, coachGrossCents, feePostings, feeRefundPostings, feeReturnedCents, refundStep } from '@/lib/coach-business/fees';

describe('the 5% application fee', () => {
  it('is 5%, in basis points, the owner\'s number', () => {
    expect(CONNECT_FEE_BPS).toBe(500);
    expect(applicationFeeCents(10_000)).toBe(500);
    expect(applicationFeeCents(12_000)).toBe(600);
  });

  it('rounds DOWN to the cent: the coach keeps the fraction', () => {
    expect(applicationFeeCents(19_999)).toBe(999);   // 999.95
    expect(applicationFeeCents(1_010)).toBe(50);     // 50.5
    expect(applicationFeeCents(1_030)).toBe(51);     // 51.5
    expect(applicationFeeCents(19)).toBe(0);         // 0.95
    expect(applicationFeeCents(20)).toBe(1);
    expect(applicationFeeCents(0)).toBe(0);
  });

  it('never exceeds 5% and never under-takes by a whole cent, across every price up to $500', () => {
    const bad: number[] = [];
    for (let p = 0; p <= 50_000; p += 1) {
      const fee = applicationFeeCents(p);
      if (fee * 20 > p || (fee + 1) * 20 <= p || coachGrossCents(p) !== p - fee) bad.push(p);
    }
    expect(bad).toEqual([]);
  });

  it('refuses a fractional or negative amount (no float reaches Stripe)', () => {
    expect(() => applicationFeeCents(10.5)).toThrow();
    expect(() => applicationFeeCents(-1)).toThrow();
    expect(() => applicationFeeCents(1_000, 10_001)).toThrow();
  });
});

describe('refunds hand back the fee in proportion', () => {
  it('a full refund returns the whole fee exactly', () => {
    expect(feeReturnedCents(999, 19_999, 19_999)).toBe(999);
    expect(feeReturnedCents(50, 1_010, 1_010)).toBe(50);
  });

  it('a partial refund returns the same share, rounded down (FEL never returns more fee than it took)', () => {
    expect(feeReturnedCents(500, 10_000, 5_000)).toBe(250);
    expect(feeReturnedCents(999, 19_999, 10_000)).toBe(499);   // 499.52…
    expect(feeReturnedCents(999, 19_999, 1)).toBe(0);
    expect(feeReturnedCents(999, 19_999, 50_000)).toBe(999);    // capped at the sale
  });

  it('several partial refunds add up to exactly one refund of the same size (no rounding drift)', () => {
    const fee = applicationFeeCents(19_999);
    const steps = [3_333, 3_333, 3_333, 10_000];
    let before = 0;
    let returned = 0;
    for (const s of steps) {
      const after = before + s;
      returned += refundStep(fee, 19_999, before, after).feeDelta;
      before = after;
    }
    expect(before).toBe(19_999);
    expect(returned).toBe(fee);
    expect(refundStep(fee, 19_999, 0, 9_999).feeDelta + refundStep(fee, 19_999, 9_999, 19_999).feeDelta).toBe(fee);
  });

  it('a step that does not move forward (a redelivered or older event) is a no-op', () => {
    expect(refundStep(500, 10_000, 5_000, 5_000)).toEqual({ feeDelta: 0, refundDelta: 0 });
    expect(refundStep(500, 10_000, 5_000, 2_000)).toEqual({ feeDelta: 0, refundDelta: 0 });
  });
});

describe('ledger postings', () => {
  it('book the fee as platform revenue and balance to zero', () => {
    const p = feePostings(999);
    expect(p).toEqual([{ type: 'EXTERNAL', amount: 999 }, { type: 'PLATFORM_REVENUE', amount: -999 }]);
    expect(p.reduce((n, x) => n + x.amount, 0)).toBe(0);
    const r = feeRefundPostings(499);
    expect(r.reduce((n, x) => n + x.amount, 0)).toBe(0);
    expect(r.find((x) => x.type === 'PLATFORM_REVENUE')?.amount).toBe(499);
  });

  it('a zero fee posts nothing (the ledger rejects a zero posting)', () => {
    expect(feePostings(0)).toEqual([]);
    expect(feeRefundPostings(0)).toEqual([]);
  });
});
