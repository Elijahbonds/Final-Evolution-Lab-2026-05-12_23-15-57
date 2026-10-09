import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { startServiceCheckout } from './creatorCheckout';
import { confirmServiceSession, handleCreatorEvent, type CreatorEvent, type SessionLike } from './creatorWebhook';
import { memoryCreatorStore } from './creatorStore';
import { notifyBooking } from './notify';

vi.mock('./notify', () => ({ notifyBooking: vi.fn(async () => ({ sent: false, reason: 'NOT_IMPLEMENTED' })) }));
beforeEach(() => vi.mocked(notifyBooking).mockClear());

const NOW = new Date('2026-10-05T12:00:00Z');
const SLOT = '2026-10-06T23:00:00.000Z';

async function booked() {
  const db = memoryCreatorStore();
  const create = vi.fn(async () => ({ id: 'cs_test_1', url: 'https://checkout.stripe.test/cs_test_1' }));
  await startServiceCheckout(
    { serviceId: 'elijah-bonds:session-60', slotStart: SLOT },
    {
      store: db.store,
      stripe: () => ({ checkout: { sessions: { create } } }),
      // test changed (2026-10-09): + VIRTUAL_PURCHASES_ENABLED and NEXTAUTH_URL, the release's B10 fence and B3 origin.
      env: { STRIPE_BOOKS_SECRET_KEY: 'sk_test_1', VIRTUAL_PURCHASES_ENABLED: '1', NEXTAUTH_URL: 'http://localhost:3000' } as unknown as NodeJS.ProcessEnv,
      now: NOW,
      newId: () => 'bk_1',
      paymentMethodTypes: ['card'],
    },
  );
  return db;
}

const completed = (id = 'evt_done', over: Record<string, unknown> = {}): CreatorEvent => ({
  id,
  type: 'checkout.session.completed',
  livemode: false,
  data: {
    object: {
      id: 'cs_test_1',
      payment_status: 'paid',
      amount_total: 15000,
      currency: 'usd',
      customer_details: { email: 'Buyer@Example.com' },
      payment_intent: 'pi_1',
      client_reference_id: 'bk_1',
      metadata: { product: 'SERVICE', bookingId: 'bk_1' },
      ...over,
    },
  },
});

const expired = (id = 'evt_exp'): CreatorEvent => ({
  id,
  type: 'checkout.session.expired',
  livemode: false,
  data: { object: { id: 'cs_test_1', payment_status: 'unpaid', metadata: { product: 'SERVICE', bookingId: 'bk_1' } } },
});

const refunded = (id = 'evt_ref', over: Record<string, unknown> = {}): CreatorEvent => ({
  id,
  type: 'charge.refunded',
  livemode: false,
  data: { object: { payment_intent: 'pi_1', refunded: true, amount: 15000, amount_refunded: 15000, metadata: {}, ...over } },
});

describe('creator webhook', () => {
  it('confirms the booking and books its cells', async () => {
    const db = await booked();
    const result = await handleCreatorEvent(completed(), db.store, NOW);
    expect(result).toEqual({ ok: true, bookingId: 'bk_1', outcome: 'CONFIRMED' });
    expect(db.bookings.get('bk_1')).toMatchObject({ status: 'CONFIRMED', paymentIntentId: 'pi_1', email: 'buyer@example.com' });
    expect([...db.holds.values()].every((h) => h.status === 'BOOKED' && h.expiresAt === null)).toBe(true);
    expect(notifyBooking).toHaveBeenCalledTimes(1);
  });

  it('a replayed event is a no-op', async () => {
    const db = await booked();
    await handleCreatorEvent(completed(), db.store, NOW);
    const before = structuredClone([...db.bookings.values()]);
    const again = await handleCreatorEvent(completed(), db.store, NOW);
    expect(again).toEqual({ ok: true, deduped: true });
    expect([...db.bookings.values()]).toEqual(before);
    // test changed (2026-10-09): was eventId 'evt_done'. A paid completion is remembered under its SESSION key now
    // (SEC-F4 #200: one payment, one grant across webhook, success page and redelivery).
    expect(db.events.filter((e) => e.eventId === 'stripe-session:cs_test_1')).toHaveLength(1);

    await handleCreatorEvent(refunded(), db.store, NOW);
    const replayRefund = await handleCreatorEvent(refunded(), db.store, NOW);
    expect(replayRefund).toEqual({ ok: true, deduped: true });
  });

  it('an expired session releases the hold', async () => {
    const db = await booked();
    const result = await handleCreatorEvent(expired(), db.store, NOW);
    expect(result).toEqual({ ok: true, bookingId: 'bk_1', outcome: 'RELEASED' });
    expect(db.bookings.get('bk_1')?.status).toBe('EXPIRED');
    expect(db.holds.size).toBe(0);
    // Replaying it changes nothing.
    expect(await handleCreatorEvent(expired(), db.store, NOW)).toEqual({ ok: true, deduped: true });
  });

  it('an expiry never releases a confirmed booking', async () => {
    const db = await booked();
    await handleCreatorEvent(completed(), db.store, NOW);
    const result = await handleCreatorEvent(expired('evt_late_exp'), db.store, NOW);
    expect(result).toMatchObject({ outcome: 'SKIPPED' });
    expect(db.bookings.get('bk_1')?.status).toBe('CONFIRMED');
    expect(db.holds.size).toBe(2);
  });

  it('a refund cancels the booking and frees the slot', async () => {
    const db = await booked();
    await handleCreatorEvent(completed(), db.store, NOW);
    const result = await handleCreatorEvent(refunded(), db.store, NOW);
    expect(result).toEqual({ ok: true, bookingId: 'bk_1', outcome: 'RELEASED' });
    expect(db.bookings.get('bk_1')?.status).toBe('CANCELLED');
    expect(db.holds.size).toBe(0);
  });

  it('a partial refund is recorded but does not cancel', async () => {
    const db = await booked();
    await handleCreatorEvent(completed(), db.store, NOW);
    const result = await handleCreatorEvent(refunded('evt_part', { refunded: false, amount_refunded: 5000 }), db.store, NOW);
    expect(result).toMatchObject({ ignored: true, reason: 'partial-refund' });
    expect(db.bookings.get('bk_1')?.status).toBe('CONFIRMED');
  });

  it('a refund that arrives before the purchase lands the booking cancelled', async () => {
    const db = await booked();
    const early = await handleCreatorEvent(refunded(), db.store, NOW);
    expect(early).toMatchObject({ ignored: true, reason: 'no-matching-booking' });
    const late = await handleCreatorEvent(completed(), db.store, NOW);
    expect(late).toMatchObject({ outcome: 'refunded-before-confirm:RELEASED' });
    expect(db.bookings.get('bk_1')?.status).toBe('CANCELLED');
    expect(db.holds.size).toBe(0);
  });

  it('ignores live-mode events, other products and unpaid sessions', async () => {
    const db = await booked();
    expect(await handleCreatorEvent({ ...completed(), livemode: true }, db.store, NOW)).toMatchObject({ ignored: true, reason: 'livemode' });
    expect(await handleCreatorEvent(completed('evt_book', { metadata: { product: 'BOOK' } }), db.store, NOW)).toMatchObject({ reason: 'not-a-service' });
    expect(await handleCreatorEvent(refunded('evt_book_ref', { metadata: { product: 'BOOK' } }), db.store, NOW)).toMatchObject({ reason: 'not-a-service' });
    expect(await handleCreatorEvent(completed('evt_unpaid', { payment_status: 'unpaid' }), db.store, NOW)).toMatchObject({ reason: 'unpaid' });
    expect(db.bookings.get('bk_1')?.status).toBe('HOLD');
  });

  it('marks a paid booking CONFLICT when its slot was taken after the hold lapsed', async () => {
    const db = await booked();
    // Someone else holds the same cells after the first hold expired without an event.
    const later = new Date(NOW.getTime() + 2 * 60 * 60_000);
    const create = vi.fn(async () => ({ id: 'cs_test_2', url: 'https://checkout.stripe.test/cs_test_2' }));
    await startServiceCheckout(
      { serviceId: 'elijah-bonds:session-60', slotStart: SLOT },
      { store: db.store, stripe: () => ({ checkout: { sessions: { create } } }), env: { STRIPE_BOOKS_SECRET_KEY: 'sk_test_1', VIRTUAL_PURCHASES_ENABLED: '1', NEXTAUTH_URL: 'http://localhost:3000' } as unknown as NodeJS.ProcessEnv, now: later, newId: () => 'bk_2', paymentMethodTypes: ['card'] },
    );
    const result = await handleCreatorEvent(completed(), db.store, later);
    expect(result).toMatchObject({ outcome: 'CONFLICT' });
    expect(db.bookings.get('bk_1')?.status).toBe('CONFLICT');
    expect([...db.holds.values()].every((h) => h.bookingId === 'bk_2')).toBe(true);
  });

  it('webhook, a redelivery under a new event id and the success page confirm once (keyed on the session)', async () => {
    const db = await booked();
    const session = completed().data.object as SessionLike;
    expect(await handleCreatorEvent(completed('evt_a'), db.store, NOW)).toMatchObject({ outcome: 'CONFIRMED' });
    expect(await handleCreatorEvent(completed('evt_b'), db.store, NOW)).toEqual({ ok: true, deduped: true });
    expect(await confirmServiceSession(session, db.store, NOW)).toEqual({ ok: true, deduped: true });
    expect(notifyBooking).toHaveBeenCalledTimes(1);
  });

  it('the success page alone confirms a paid session (no webhook), and an unpaid visit does not block it', async () => {
    const db = await booked();
    const paid = completed().data.object as SessionLike;
    expect(await confirmServiceSession({ ...paid, payment_status: 'unpaid' }, db.store, NOW)).toMatchObject({ reason: 'unpaid' });
    expect(await confirmServiceSession({ ...paid, payment_status: 'no_payment_required' }, db.store, NOW)).toMatchObject({ reason: 'unpaid' });
    expect(db.bookings.get('bk_1')?.status).toBe('HOLD');
    expect(await confirmServiceSession(paid, db.store, NOW)).toMatchObject({ outcome: 'CONFIRMED' });
    expect(db.bookings.get('bk_1')?.status).toBe('CONFIRMED');
  });

  it('the route verifies the creator signing secret', () => {
    const src = readFileSync('app/api/creator/webhook/route.ts', 'utf8');
    expect(src).toContain('STRIPE_CREATOR_WEBHOOK_SECRET');
    expect(src).toContain('constructEvent(');
  });
});
