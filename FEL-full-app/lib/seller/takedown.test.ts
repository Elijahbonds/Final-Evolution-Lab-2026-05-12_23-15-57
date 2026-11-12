// SELLER-18-1 (S-2): a seller later found to be under 18 — listings come down and payouts freeze.
import { describe, expect, it } from 'vitest';
import { reviewRef, takeDownMinorSeller, type TakedownDeps } from './takedown';

function fake(over: Partial<TakedownDeps> = {}) {
  const calls: string[] = [];
  const lines: string[] = [];
  const d: TakedownDeps = {
    unpublishCoachPage: async (id) => { calls.push(`page:${id}`); return 1; },
    deactivateListings: async (id) => { calls.push(`listings:${id}`); return 3; },
    freezePayouts: async (id) => { calls.push(`payouts:${id}`); return 'frozen'; },
    log: (l) => lines.push(l),
    ...over,
  };
  return { d, calls, lines };
}

describe('takeDownMinorSeller', () => {
  it('unpublishes the coach page, takes every listing down and freezes payouts', async () => {
    const { d, calls } = fake();
    expect(await takeDownMinorSeller('user-teen', d)).toEqual({ coachPages: 1, listings: 3, payouts: 'frozen' });
    expect(calls).toEqual(['page:user-teen', 'listings:user-teen', 'payouts:user-teen']);
  });

  it('one failing step does not stop the others, and it never throws', async () => {
    const { d, calls } = fake({ unpublishCoachPage: async () => { throw new Error('db'); }, freezePayouts: async () => { throw new Error('stripe'); } });
    expect(await takeDownMinorSeller('user-teen', d)).toEqual({ coachPages: -1, listings: 3, payouts: 'failed' });
    expect(calls).toEqual(['listings:user-teen']);
  });

  it('no Stripe account: nothing to freeze, the listings still come down', async () => {
    const { d } = fake({ freezePayouts: async () => 'no_account' });
    expect((await takeDownMinorSeller('u', d)).payouts).toBe('no_account');
  });

  it('opens the review with one log line that carries a one-way reference, never the id', async () => {
    const { d, lines } = fake();
    await takeDownMinorSeller('user-teen-123', d);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('review needed');
    expect(lines[0]).toContain(`ref=${reviewRef('user-teen-123')}`);
    expect(lines[0]).not.toContain('user-teen-123');
    expect(reviewRef('user-teen-123')).toMatch(/^[0-9a-f]{12}$/);
    expect(reviewRef('a')).not.toBe(reviewRef('b'));
  });
});
