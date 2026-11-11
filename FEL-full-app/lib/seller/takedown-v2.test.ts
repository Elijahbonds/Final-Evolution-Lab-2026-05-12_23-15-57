// SELLER-18-1 v2: the takedown runs once (Cyber F1) and opens a durable review record instead of a log line (Cyber F6).
import { describe, expect, it } from 'vitest';
import { reviewRef, takeDownMinorSeller, type PayoutFreeze, type PriorHold, type TakedownDeps, type TakedownResult } from './takedown';

function fake(o: { prior?: PriorHold | null | 'throw'; live?: number | 'throw'; store?: boolean | 'throw'; freeze?: PayoutFreeze } = {}) {
  const calls: string[] = [];
  const lines: string[] = [];
  const records: Array<{ userId: string; result: TakedownResult }> = [];
  const d: TakedownDeps = {
    unpublishCoachPage: async (id) => { calls.push(`page:${id}`); return 1; },
    deactivateListings: async (id) => { calls.push(`listings:${id}`); return 2; },
    freezePayouts: async (id) => { calls.push(`payouts:${id}`); return o.freeze ?? 'frozen'; },
    log: (l) => lines.push(l),
    priorHold: async () => { if (o.prior === 'throw') throw new Error('db'); return o.prior ?? null; },
    liveCount: async () => { if (o.live === 'throw') throw new Error('db'); return o.live ?? 0; },
    recordReview: async (userId, result) => { if (o.store === 'throw') throw new Error('db'); records.push({ userId, result }); return o.store ?? true; },
  };
  return { d, calls, lines, records };
}

describe('F6: the review is a durable record', () => {
  it('a first takedown stores one record with the counts and the payout state, and writes no log line', async () => {
    const { d, calls, lines, records } = fake();
    expect(await takeDownMinorSeller('teen-1', d)).toEqual({ coachPages: 1, listings: 2, payouts: 'frozen' });
    expect(calls).toEqual(['page:teen-1', 'listings:teen-1', 'payouts:teen-1']);
    expect(records).toEqual([{ userId: 'teen-1', result: { coachPages: 1, listings: 2, payouts: 'frozen' } }]);
    expect(lines).toEqual([]);
  });

  it('the record cannot be stored (a throw, or false): the one log line is the fallback, still without the id', async () => {
    for (const store of ['throw', false] as const) {
      const { d, lines } = fake({ store });
      await takeDownMinorSeller('teen-123', d);
      expect(lines, String(store)).toHaveLength(1);
      expect(lines[0]).toContain(`ref=${reviewRef('teen-123')}`);
      expect(lines[0]).not.toContain('teen-123');
    }
  });
});

describe('F1: it runs once', () => {
  it('already held (payouts frozen) and nothing live: skipped — no write, no Stripe call, no new record', async () => {
    const { d, calls, records, lines } = fake({ prior: { payouts: 'frozen' }, live: 0 });
    expect(await takeDownMinorSeller('teen-1', d)).toEqual({ coachPages: 0, listings: 0, payouts: 'frozen', skipped: 'already_held' });
    expect(calls).toEqual([]);
    expect(records).toEqual([]);
    expect(lines).toEqual([]);
  });

  it('held with no Stripe account (no_account) and nothing live: skipped too', async () => {
    const { d, calls } = fake({ prior: { payouts: 'no_account' }, live: 0 });
    expect((await takeDownMinorSeller('teen-1', d)).skipped).toBe('already_held');
    expect(calls).toEqual([]);
  });

  it('held, but something went live again: it comes down again, with no second Stripe call', async () => {
    const { d, calls, records } = fake({ prior: { payouts: 'frozen' }, live: 1 });
    expect(await takeDownMinorSeller('teen-1', d)).toEqual({ coachPages: 1, listings: 2, payouts: 'frozen' });
    expect(calls).toEqual(['page:teen-1', 'listings:teen-1']);
    expect(records).toHaveLength(1);
  });

  it('the live count read fails: treated as live (the DB steps run), still no second Stripe call', async () => {
    const { d, calls } = fake({ prior: { payouts: 'frozen' }, live: 'throw' });
    await takeDownMinorSeller('teen-1', d);
    expect(calls).toEqual(['page:teen-1', 'listings:teen-1']);
  });

  it('the last freeze failed: the whole takedown runs again, Stripe included', async () => {
    const { d, calls } = fake({ prior: { payouts: 'failed' }, live: 0 });
    expect((await takeDownMinorSeller('teen-1', d)).payouts).toBe('frozen');
    expect(calls).toEqual(['page:teen-1', 'listings:teen-1', 'payouts:teen-1']);
  });

  it('the prior-record read fails: the takedown runs (a minor seller is never left up because a read failed)', async () => {
    const { d, calls } = fake({ prior: 'throw' });
    await takeDownMinorSeller('teen-1', d);
    expect(calls).toEqual(['page:teen-1', 'listings:teen-1', 'payouts:teen-1']);
  });
});
