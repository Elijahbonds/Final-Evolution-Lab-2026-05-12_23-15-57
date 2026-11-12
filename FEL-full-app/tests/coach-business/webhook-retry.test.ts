// COACH-FEE-PASSTHROUGH: the follow-up PR #442 found in app/api/stripe/webhook. The book refund path remembers every
// charge.refunded event id in the book store BEFORE the coach store handles it. When the coach store's handler failed
// (500) and Stripe retried, the retry was answered `deduped` by the book path and the coach-store refund was lost.
// Now each handler dedupes for itself: the book path answers only when it revoked a book.
//
// Measured on the route before the fix (this file run against 44f06233's route): the retry answered 200
// { received: true, ok: true, deduped: true } and the booking stayed PAID. After: the retry records the refund.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  event: null as any,
  failBookingWrites: 0,
  bookings: new Map<string, { id: string; status: string }>(),
  bookEvents: new Set<string>(),
  bookRows: new Map<string, { status: string }>(),   // payment intent → a book entitlement
  coachStoreCalls: 0,
}));

vi.mock('next-auth', () => ({ getServerSession: async () => null }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({ webhooks: { constructEvent: () => h.event } }),
  STRIPE_PRODUCTS: {}, PLATFORM_TAKE_RATE: 0.15,
}));
vi.mock('@/lib/books/bookStore', () => ({
  bookTablesReady: () => true,
  prismaBookStore: () => ({
    async hasEvent(id: string) { return h.bookEvents.has(id); },
    async rememberEvent(id: string) { h.bookEvents.add(id); },
    async revokeByPaymentIntent(pi: string) {
      const row = h.bookRows.get(pi);
      if (!row || row.status !== 'ACTIVE') return 0;
      row.status = 'REVOKED';
      return 1;
    },
  }),
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    ledgerTransaction: { findUnique: async () => null },
    booking: {
      async updateMany({ where, data }: any) {
        h.coachStoreCalls += 1;
        if (h.failBookingWrites > 0) { h.failBookingWrites -= 1; throw new Error('db blip'); }
        const b = h.bookings.get(where.id);
        if (!b || b.status !== where.status) return { count: 0 };
        b.status = data.status;
        return { count: 1 };
      },
    },
    programAccess: { updateMany: async () => ({ count: 0 }) },
    coachStoreReferral: { updateMany: async () => ({ count: 0 }) },
  },
}));

import { POST as webhook } from '@/app/api/stripe/webhook/route';

const deliver = async () => {
  const r = await webhook(new Request('https://fel.test/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': 't=1,v1=x' }, body: '{}' }) as any);
  return { status: r.status, json: await r.json() };
};

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';
  h.failBookingWrites = 0; h.coachStoreCalls = 0;
  h.bookings = new Map([['bk_1', { id: 'bk_1', status: 'PAID' }]]);
  h.bookEvents = new Set(); h.bookRows = new Map();
});

describe('charge.refunded: the first attempt fails, the retry records the refund', () => {
  it('a coach-store refund whose handler failed once is recorded on Stripe\'s retry (not answered `deduped`)', async () => {
    h.event = { id: 'evt_refund_1', type: 'charge.refunded', livemode: false, data: { object: { id: 'ch_cs', payment_intent: 'pi_cs', amount_refunded: 5_000, metadata: { product: 'COACH_STORE', rowId: 'bk_1' } } } };
    h.failBookingWrites = 1;
    const first = await deliver();
    expect(first.status).toBe(500);
    expect(h.bookEvents.has('evt_refund_1')).toBe(true);   // the book path did remember it — the trap
    expect(h.bookings.get('bk_1')!.status).toBe('PAID');

    const retry = await deliver();
    expect(retry.status).toBe(200);
    expect(retry.json).not.toHaveProperty('deduped');
    expect(h.bookings.get('bk_1')!.status).toBe('REFUNDED');

    const again = await deliver();                          // a third delivery is harmless: the status CAS moves nothing
    expect(again.status).toBe(200);
    expect(h.bookings.get('bk_1')!.status).toBe('REFUNDED');
  });

  it('a book refund is still answered by the book path, once, and never reaches the coach store', async () => {
    h.bookRows.set('pi_book', { status: 'ACTIVE' });
    h.event = { id: 'evt_book', type: 'charge.refunded', livemode: false, data: { object: { id: 'ch_b', payment_intent: 'pi_book', amount_refunded: 1_999, metadata: {} } } };
    const first = await deliver();
    expect(first).toEqual({ status: 200, json: { received: true, ok: true, revoked: 1 } });
    expect(h.bookRows.get('pi_book')!.status).toBe('REVOKED');
    expect(h.coachStoreCalls).toBe(0);
  });
});
