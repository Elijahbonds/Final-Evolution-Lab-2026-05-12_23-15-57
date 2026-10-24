// LAUNCH-SALES: the 18+ buyer gate on its own (lib/stripe/adult-gate.ts). The per-route proof (every checkout route
// answers 403 adults_only and creates nothing at Stripe) is lib/stripe/launch-sales-matrix.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUYER_AGE_MESSAGES, adultBuyerGate, buyerAgeRefusal, refuseBuyer } from './adult-gate';

const NOW = new Date('2026-10-22T12:00:00Z');

/** A GateDb whose only answer is User.dobYear for the ids it was given (missing id -> no row). */
function dbWith(rows: Record<string, number | null>, opts: { throws?: boolean } = {}): any {
  return {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        if (opts.throws) throw Object.assign(new Error('connection refused'), { code: 'P1001' });
        return where.id in rows ? { dobYear: rows[where.id] } : null;
      }),
    },
    scanSaveOptIn: {},
  };
}

beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

describe('buyerAgeRefusal', () => {
  it('a verified adult (born 1990) may buy', async () => {
    expect(await buyerAgeRefusal(dbWith({ u: 1990 }), 'u', NOW)).toBeNull();
  });

  it('under 18 is refused, including a year gap of exactly 18 (may still be 17)', async () => {
    expect(await buyerAgeRefusal(dbWith({ u: 2011 }), 'u', NOW)).toBe('under_18');
    expect(await buyerAgeRefusal(dbWith({ u: 2008 }), 'u', NOW)).toBe('under_18');
    expect(await buyerAgeRefusal(dbWith({ u: 2007 }), 'u', NOW)).toBeNull();
  });

  it('unknown age is not an adult: no birth year, no row, no user id, a failed read', async () => {
    expect(await buyerAgeRefusal(dbWith({ u: null }), 'u', NOW)).toBe('age_unknown');
    expect(await buyerAgeRefusal(dbWith({}), 'u', NOW)).toBe('age_unknown');
    expect(await buyerAgeRefusal(dbWith({ u: 1990 }), '', NOW)).toBe('age_unknown');
    expect(await buyerAgeRefusal(dbWith({ u: 1990 }, { throws: true }), 'u', NOW)).toBe('age_unknown');
  });
});

describe('refuseBuyer / adultBuyerGate', () => {
  it('answers 403 adults_only with the reason and the message', async () => {
    for (const reason of ['under_18', 'age_unknown'] as const) {
      const res = refuseBuyer(reason);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'adults_only', reason, message: BUYER_AGE_MESSAGES[reason] });
    }
  });

  it('is null for an adult and the 403 for everyone else', async () => {
    expect(await adultBuyerGate(dbWith({ u: 1990 }), 'u')).toBeNull();
    const res = await adultBuyerGate(dbWith({ u: null }), 'u');
    expect(res?.status).toBe(403);
    expect((await res!.json()).reason).toBe('age_unknown');
  });
});
