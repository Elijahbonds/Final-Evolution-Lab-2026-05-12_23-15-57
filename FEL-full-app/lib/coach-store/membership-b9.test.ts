// STORE-READY B9 (memberships, Option B — memberships SELL at launch): two money-path unit suites over a
// mocked prisma + Stripe (the reschedule-slot-check.test.ts harness).
//
//   cancelMembership (B9a + B9 fixes 1-2): the cancel is real in Stripe FIRST — and ONLY. No key, or no
//     subscription id -> 409 store_closed and NOTHING is saved (no silent local cancel); Stripe fails -> 502
//     and the row is UNTOUCHED (a "cancelled" banner with money still coming out is the one answer this route
//     may never give); success -> cancelAtPeriodEnd true + accessUntil = the subscription's period end; an
//     already-ended subscription closes the row outright.
//   setListingPrice (B9c): a price change writes priceUsd ONLY — it never flips `active`, so editing the price
//     is not a back door that re-activates a paused listing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const USER = 'buyer-1';
const COACH = 'coach-1';
const PERIOD_END = Math.floor(new Date('2026-11-08T00:00:00Z').getTime() / 1000);

const h = vi.hoisted(() => ({
  store: {} as Record<string, Record<string, any>[]>,
  subscriptionUpdate: { calls: [] as any[], throws: null as null | Error, result: null as any },
  subscriptionRetrieve: { calls: [] as any[], throws: null as null | Error, result: null as any },
  writes: { update: 0, updateMany: 0 },
}));

vi.mock('@/lib/db', () => ({ get prisma() { return clientFor(h.store); } }));
vi.mock('@/lib/stripe', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/stripe')>();
  return {
    ...real,
    getStripe: () => ({
      subscriptions: {
        update: vi.fn(async (id: string, data: any) => {
          h.subscriptionUpdate.calls.push({ id, data });
          if (h.subscriptionUpdate.throws) throw h.subscriptionUpdate.throws;
          return h.subscriptionUpdate.result ?? { id, status: 'active', cancel_at_period_end: true, items: { data: [{ current_period_end: PERIOD_END }] } };
        }),
        retrieve: vi.fn(async (id: string) => {
          h.subscriptionRetrieve.calls.push({ id });
          if (h.subscriptionRetrieve.throws) throw h.subscriptionRetrieve.throws;
          return h.subscriptionRetrieve.result ?? { id, status: 'active', cancel_at_period_end: true, items: { data: [{ current_period_end: PERIOD_END }] } };
        }),
      },
    }),
  };
});

type Row = Record<string, any>;
function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, cond]) => {
    const v = row[k];
    if (cond === null) return v == null;
    if (cond instanceof Date || typeof cond !== 'object' || Array.isArray(cond)) return v === cond;
    const c = cond as Row;
    if (!Object.keys(c).some((op) => ['not', 'in', 'notIn'].includes(op))) return matches(row, c);
    if ('not' in c && (c.not === null ? v == null : v === c.not)) return false;
    if ('in' in c && !(c.in as unknown[]).includes(v)) return false;
    if ('notIn' in c && (c.notIn as unknown[]).includes(v)) return false;
    return true;
  });
}
function clientFor(store: Record<string, Row[]>): any {
  const table = (model: string): any => {
    const rows = () => (store[model] ??= []);
    return {
      findUnique: async (a: Row = {}) => rows().find((r) => matches(r, a.where)) ?? null,
      findFirst: async (a: Row = {}) => rows().find((r) => matches(r, a.where)) ?? null,
      update: async (a: Row) => {
        h.writes.update++;
        const row = rows().find((r) => matches(r, a.where));
        if (!row) throw Object.assign(new Error('P2025'), { code: 'P2025' });
        Object.assign(row, a.data);
        return row;
      },
      updateMany: async (a: Row) => {
        h.writes.updateMany++;
        const hit = rows().filter((r) => matches(r, a.where));
        for (const r of hit) Object.assign(r, a.data);
        return { count: hit.length };
      },
    };
  };
  return new Proxy({}, { get: (_t, prop) => (prop === 'then' || typeof prop === 'symbol' ? undefined : table(String(prop))) });
}

import { cancelMembership, setListingPrice } from './api';
import { STORE_CLOSED_MESSAGE } from './constants';

function seedAccess(over: Row = {}) {
  const rows = (h.store.programAccess ??= []);
  const row = {
    id: `pa_${rows.length + 1}`, userId: USER, instructorId: 'ins-1', listingId: 'l', lane: 'dunking',
    billing: 'month', scope: 'lane', beneficiary: 'self', status: 'ACTIVE', priceCents: 7900,
    codeActive: true, cancelAtPeriodEnd: false, accessUntil: null, stripeSubscriptionId: 'sub_1', ...over,
  };
  rows.push(row); return row;
}
function seedListing(over: Row = {}) {
  const rows = (h.store.marketplaceListing ??= []);
  const row = {
    id: `lst_${rows.length + 1}`, creatorId: COACH, listingType: 'COACH_STORE', title: 'Dunk program',
    priceUsd: 7900, active: false, manifest: JSON.stringify({ kind: 'program', lane: 'dunking', billing: 'one_time' }), ...over,
  };
  rows.push(row); return row;
}

beforeEach(() => {
  h.store = {};
  h.subscriptionUpdate = { calls: [], throws: null, result: null };
  h.subscriptionRetrieve = { calls: [], throws: null, result: null };
  h.writes = { update: 0, updateMany: 0 };
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
  process.env.COACH_STORE_COACH_USER_IDS = COACH;
});
afterEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.COACH_STORE_COACH_USER_IDS;
});

describe('B9a cancelMembership — Stripe-first real cancel', () => {
  it('test key: cancels in Stripe and records cancelAtPeriodEnd + accessUntil = period end', async () => {
    const pa = seedAccess();
    const res = await cancelMembership(USER, pa.id);
    expect(res.status).toBe(200);
    expect(h.subscriptionUpdate.calls).toEqual([{ id: 'sub_1', data: { cancel_at_period_end: true } }]);
    const row = h.store.programAccess.find((a) => a.id === pa.id)!;
    expect(row.cancelAtPeriodEnd).toBe(true);
    expect(row.accessUntil).toEqual(new Date(PERIOD_END * 1000));
    expect(row.status).toBe('ACTIVE'); // still active until the period ends
    const json = await res.json();
    expect(json.accessUntil).toBe(new Date(PERIOD_END * 1000).toISOString());
  });

  it('live key with COACH_STORE_LIVE on: cancels in Stripe too (cancel is not gated off)', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_x';
    process.env.COACH_STORE_LIVE = '1';
    const pa = seedAccess();
    const res = await cancelMembership(USER, pa.id);
    expect(res.status).toBe(200);
    expect(h.subscriptionUpdate.calls).toHaveLength(1);
    delete process.env.COACH_STORE_LIVE;
  });

  it('Stripe failure -> 502 and the row is UNTOUCHED', async () => {
    h.subscriptionUpdate.throws = new Error('stripe down');
    const pa = seedAccess();
    const res = await cancelMembership(USER, pa.id);
    expect(res.status).toBe(502);
    const row = h.store.programAccess.find((a) => a.id === pa.id)!;
    expect(row.cancelAtPeriodEnd).toBe(false);
    expect(row.status).toBe('ACTIVE');
    expect(row.accessUntil).toBe(null);
  });

  it('an already-ended subscription closes the row outright', async () => {
    h.subscriptionUpdate.result = { id: 'sub_1', status: 'canceled', cancel_at_period_end: true, items: { data: [{ current_period_end: PERIOD_END }] } };
    const pa = seedAccess();
    const res = await cancelMembership(USER, pa.id);
    expect(res.status).toBe(200);
    const row = h.store.programAccess.find((a) => a.id === pa.id)!;
    expect(row.status).toBe('CANCELED');
    expect(row.codeActive).toBe(false);
    expect(row.cancelAtPeriodEnd).toBe(true);
  });

  // B9 fix 1 (rewritten to the STRICTER contract): no subscription id -> 409 store_closed, NOTHING saved.
  it('no subscription id (a one-time row) -> 409 store_closed and the row is saved as it was', async () => {
    const pa = seedAccess({ billing: 'one_time', stripeSubscriptionId: null });
    const before = JSON.stringify(h.store.programAccess.find((a) => a.id === pa.id));
    const res = await cancelMembership(USER, pa.id);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('store_closed');
    expect(json.reason).toBe('payments_not_set_up');
    expect(json.message).toBe(STORE_CLOSED_MESSAGE);
    expect(h.subscriptionUpdate.calls).toHaveLength(0);
    expect(h.subscriptionRetrieve.calls).toHaveLength(0);
    expect(h.writes).toEqual({ update: 0, updateMany: 0 });
    expect(JSON.stringify(h.store.programAccess.find((a) => a.id === pa.id))).toBe(before);
  });

  // B9 fix 1 (rewritten to the STRICTER contract): no key -> 409 store_closed, NOTHING saved.
  it('no Stripe key -> 409 store_closed and the row is saved as it was', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const pa = seedAccess();
    const before = JSON.stringify(h.store.programAccess.find((a) => a.id === pa.id));
    const res = await cancelMembership(USER, pa.id);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('store_closed');
    expect(json.reason).toBe('payments_not_set_up');
    expect(json.message).toBe(STORE_CLOSED_MESSAGE);
    expect(h.subscriptionUpdate.calls).toHaveLength(0);
    expect(h.subscriptionRetrieve.calls).toHaveLength(0);
    expect(h.writes).toEqual({ update: 0, updateMany: 0 });
    expect(JSON.stringify(h.store.programAccess.find((a) => a.id === pa.id))).toBe(before);
  });

  it('a month row with stripeSubscriptionId null and a key set -> 409 store_closed, nothing saved', async () => {
    const pa = seedAccess({ billing: 'month', stripeSubscriptionId: null });
    const before = JSON.stringify(h.store.programAccess.find((a) => a.id === pa.id));
    const res = await cancelMembership(USER, pa.id);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('store_closed');
    expect(json.reason).toBe('payments_not_set_up');
    expect(json.message).toBe(STORE_CLOSED_MESSAGE);
    expect(h.subscriptionUpdate.calls).toHaveLength(0);
    expect(h.subscriptionRetrieve.calls).toHaveLength(0);
    expect(h.writes).toEqual({ update: 0, updateMany: 0 });
    expect(JSON.stringify(h.store.programAccess.find((a) => a.id === pa.id))).toBe(before);
  });

  // B9 fix 2: a 502 changes nothing — proven for an update throw AND a retrieve throw, body name kept
  // 'stripe_unavailable' (PM ruling 5:48 PM PT), zero prisma writes, the row deep-equal to its seed.
  it.each([
    ['update throws', { update: new Error('stripe down') }, null],
    ['update returns no period end, retrieve throws', null, new Error('stripe down on retrieve')],
  ] as const)('Stripe failure (%s) -> 502 stripe_unavailable, zero prisma writes, row deep-equal', async (_name, updErr, retrErr) => {
    if (updErr) h.subscriptionUpdate.throws = updErr as Error;
    if (retrErr) {
      h.subscriptionUpdate.result = { id: 'sub_1', status: 'active', cancel_at_period_end: true, items: { data: [{}] } };
      h.subscriptionRetrieve.throws = retrErr as Error;
    }
    const pa = seedAccess();
    const before = JSON.stringify(h.store.programAccess.find((a) => a.id === pa.id));
    const res = await cancelMembership(USER, pa.id);
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toBe('stripe_unavailable');
    expect(h.writes).toEqual({ update: 0, updateMany: 0 });
    expect(JSON.stringify(h.store.programAccess.find((a) => a.id === pa.id))).toBe(before);
  });

  it('a row owned by someone else -> 404', async () => {
    const pa = seedAccess({ userId: 'someone-else' });
    const res = await cancelMembership(USER, pa.id);
    expect(res.status).toBe(404);
    expect(h.subscriptionUpdate.calls).toHaveLength(0);
  });
});

describe('B9c setListingPrice — writes priceUsd only', () => {
  it('a paused (inactive) listing keeps active=false after a price change', async () => {
    const lst = seedListing({ active: false });
    const res = await setListingPrice(COACH, lst.id, 9900);
    expect(res.status).toBe(200);
    const row = h.store.marketplaceListing.find((l) => l.id === lst.id)!;
    expect(row.priceUsd).toBe(9900);
    expect(row.active).toBe(false); // never re-activated by a price edit
  });

  it('an active listing stays active with the new price', async () => {
    const lst = seedListing({ active: true });
    const res = await setListingPrice(COACH, lst.id, 4900);
    expect(res.status).toBe(200);
    const row = h.store.marketplaceListing.find((l) => l.id === lst.id)!;
    expect(row.priceUsd).toBe(4900);
    expect(row.active).toBe(true);
  });

  it('rejects an out-of-bounds price and a listing owned by someone else', async () => {
    const lst = seedListing();
    expect((await setListingPrice(COACH, lst.id, 5)).status).toBe(400);
    expect((await setListingPrice('someone-else', lst.id, 4900)).status).toBe(404);
    expect(h.store.marketplaceListing.find((l) => l.id === lst.id)!.priceUsd).toBe(7900);
  });
});
