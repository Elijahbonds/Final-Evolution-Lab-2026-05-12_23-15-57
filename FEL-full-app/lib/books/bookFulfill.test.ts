import { describe, expect, it } from 'vitest';
import { hasBookAccess } from './bookEntitlements';
import {
  recordBookCheckout,
  revokeBookCharge,
  type BookEntitlementWrite,
  type BookFulfillStore,
  type PaidBookSession,
} from './bookFulfill';

interface EventRow { eventId: string; type: string; paymentIntentId: string | null }

function memory() {
  const events: EventRow[] = [];
  const rows = new Map<string, BookEntitlementWrite>();
  const users = new Map<string, string>();
  let upserts = 0;
  let revokes = 0;
  const store: BookFulfillStore = {
    async hasEvent(eventId) { return events.some((e) => e.eventId === eventId); },
    async rememberEvent(eventId, type, paymentIntentId) { events.push({ eventId, type, paymentIntentId }); },
    async isPaymentIntentRevoked(paymentIntentId) {
      return events.some((e) => e.type === 'charge.refunded' && e.paymentIntentId === paymentIntentId);
    },
    async findByEmailOffer(email, offerId) {
      const row = rows.get(`${email}:${offerId}`);
      return row ? { userId: row.userId } : null;
    },
    async findUserIdByEmail(email) { return users.get(email) ?? null; },
    async upsertEntitlement(row) { upserts += 1; rows.set(`${row.email}:${row.offerId}`, row); },
    async revokeByPaymentIntent(paymentIntentId) {
      revokes += 1;
      let n = 0;
      for (const row of rows.values()) {
        if (row.stripePaymentIntentId === paymentIntentId && row.status === 'ACTIVE') {
          row.status = 'REVOKED';
          row.revokedAt = new Date();
          n += 1;
        }
      }
      return n;
    },
  };
  return { store, rows, users, events, upserts: () => upserts, revokes: () => revokes };
}

function session(over: Partial<PaidBookSession> = {}): PaidBookSession {
  return {
    id: 'cs_test_1',
    payment_status: 'paid',
    amount_total: 999,
    currency: 'usd',
    customer_details: { email: 'Buyer@Example.com' },
    payment_intent: 'pi_1',
    metadata: { product: 'BOOK', offerId: 'blueprint:ebook' },
    ...over,
  };
}

describe('book webhook idempotency', () => {
  it('records one entitlement when the same event is delivered twice', async () => {
    const db = memory();
    const first = await recordBookCheckout('evt_1', session(), db.store);
    const second = await recordBookCheckout('evt_1', session(), db.store);
    expect(first).toEqual({ ok: true, granted: true });
    expect(second).toEqual({ ok: true, deduped: true });
    expect(db.upserts()).toBe(1);
    expect(db.rows.size).toBe(1);
    expect(hasBookAccess([...db.rows.values()], 'blueprint', 'ebook')).toBe(true);
    expect(hasBookAccess([...db.rows.values()], 'blueprint', 'audiobook')).toBe(false);
  });

  it('a second paid event for the same offer updates the row instead of adding one', async () => {
    const db = memory();
    db.users.set('buyer@example.com', 'user_9');
    await recordBookCheckout('evt_1', session(), db.store);
    await recordBookCheckout('evt_2', session({ id: 'cs_test_2', payment_intent: 'pi_2' }), db.store);
    expect(db.rows.size).toBe(1);
    expect(db.upserts()).toBe(2);
    const row = [...db.rows.values()][0];
    expect(row.userId).toBe('user_9');
    expect(row.stripeSessionId).toBe('cs_test_2');
    expect(row.email).toBe('buyer@example.com');
  });

  it('keeps an existing user id when the replay has no matching account', async () => {
    const db = memory();
    await recordBookCheckout('evt_1', session(), db.store);
    const row = [...db.rows.values()][0];
    row.userId = 'user_kept';
    await recordBookCheckout('evt_2', session({ id: 'cs_test_2' }), db.store);
    expect([...db.rows.values()][0].userId).toBe('user_kept');
  });

  it('does not grant an unpaid session or a non-book event', async () => {
    const db = memory();
    const unpaid = await recordBookCheckout('evt_unpaid', session({ payment_status: 'unpaid' }), db.store);
    expect(unpaid).toMatchObject({ ignored: true, reason: 'unpaid' });
    expect(db.upserts()).toBe(0);
    const other = await recordBookCheckout('evt_other', session({ metadata: { product: 'COSMETIC' } }), db.store);
    expect(other).toMatchObject({ ignored: true, reason: 'not-a-book' });
    expect(db.events).toHaveLength(1);
  });

  it('refuses a paid book event that has no email', async () => {
    const db = memory();
    await expect(recordBookCheckout('evt_1', session({ customer_details: { email: '' }, customer_email: null }), db.store)).rejects.toThrow(/email/);
    expect(db.upserts()).toBe(0);
  });

  it('a refund revokes once, and a second delivery does not revoke again', async () => {
    const db = memory();
    await recordBookCheckout('evt_paid', session(), db.store);
    const first = await revokeBookCharge('evt_refund', { payment_intent: 'pi_1' }, db.store);
    const second = await revokeBookCharge('evt_refund', { payment_intent: 'pi_1' }, db.store);
    expect(first).toEqual({ ok: true, revoked: 1 });
    expect(second).toEqual({ ok: true, deduped: true });
    expect(db.revokes()).toBe(1);
    expect(hasBookAccess([...db.rows.values()], 'blueprint', 'ebook')).toBe(false);
  });

  it('a refund that arrives before the purchase is applied when the purchase lands', async () => {
    const db = memory();
    const early = await revokeBookCharge('evt_refund', { payment_intent: 'pi_1' }, db.store);
    expect(early).toMatchObject({ ignored: true, reason: 'no-matching-purchase' });
    await recordBookCheckout('evt_paid', session(), db.store);
    const row = [...db.rows.values()][0];
    expect(row.status).toBe('REVOKED');
    expect(hasBookAccess([...db.rows.values()], 'blueprint', 'ebook')).toBe(false);
  });
});
