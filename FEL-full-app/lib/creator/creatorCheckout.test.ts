import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { CHECKOUT_TTL_SECONDS, CreatorCheckoutError, startServiceCheckout } from './creatorCheckout';
import { memoryCreatorStore } from './creatorStore';

const NOW = new Date('2026-10-05T12:00:00Z');
const SLOT = '2026-10-06T23:00:00.000Z';
const TEST_ENV = { STRIPE_BOOKS_SECRET_KEY: 'sk_test_123' } as unknown as NodeJS.ProcessEnv;

function fakeStripe() {
  let n = 0;
  const create = vi.fn(async () => {
    n += 1;
    return { id: `cs_test_${n}`, url: `https://checkout.stripe.test/cs_test_${n}` };
  });
  return { create, client: () => ({ checkout: { sessions: { create } } }) };
}

function deps(db = memoryCreatorStore(), stripe = fakeStripe(), env = TEST_ENV) {
  let id = 0;
  return {
    db,
    stripe,
    deps: { store: db.store, stripe: stripe.client, env, now: NOW, newId: () => `bk_${++id}`, paymentMethodTypes: ['card'] },
  };
}

const input = (over: Record<string, unknown> = {}) => ({
  serviceId: 'elijah-bonds:session-60',
  slotStart: SLOT,
  origin: 'http://localhost:3000',
  ...over,
});

describe('creator checkout', () => {
  it('refuses a live key before holding a slot or calling Stripe', async () => {
    for (const env of [
      { STRIPE_BOOKS_SECRET_KEY: 'sk_live_123' },
      { STRIPE_SECRET_KEY: 'sk_live_456' },
      {},
    ]) {
      const t = deps(undefined, undefined, env as unknown as NodeJS.ProcessEnv);
      const err = await startServiceCheckout(input(), t.deps).catch((e) => e);
      expect(err).toBeInstanceOf(CreatorCheckoutError);
      expect(err).toMatchObject({ status: 503, code: 'test_mode_only' });
      expect(t.stripe.create).not.toHaveBeenCalled();
      expect(t.db.bookings.size).toBe(0);
      expect(t.db.holds.size).toBe(0);
    }
  });

  it('holds the slot and creates a test-mode session priced from the catalog', async () => {
    const t = deps();
    const result = await startServiceCheckout(input({ email: 'Guest@Example.com', priceCents: 1 }), t.deps);
    expect(result).toEqual({ url: 'https://checkout.stripe.test/cs_test_1', bookingId: 'bk_1', sessionId: 'cs_test_1' });

    const [params, opts] = t.stripe.create.mock.calls[0] as unknown as [Record<string, any>, { idempotencyKey: string }];
    expect(params.metadata).toMatchObject({ product: 'SERVICE', bookingId: 'bk_1', serviceId: 'elijah-bonds:session-60', slotStart: SLOT });
    expect(params.payment_intent_data.metadata.bookingId).toBe('bk_1');
    expect(params.line_items[0].price_data.unit_amount).toBe(15000);
    expect(params.line_items[0].price_data.product_data.description).toMatch(/EXAMPLE/);
    expect(params.expires_at).toBe(Math.floor(NOW.getTime() / 1000) + CHECKOUT_TTL_SECONDS);
    expect(params.expires_at - Math.floor(NOW.getTime() / 1000)).toBeGreaterThanOrEqual(30 * 60);
    expect(params.customer_email).toBe('guest@example.com');
    expect(params.success_url).toBe('http://localhost:3000/bookings/success?session_id={CHECKOUT_SESSION_ID}');
    expect(opts.idempotencyKey).toBe('creator-booking:bk_1');

    const booking = t.db.bookings.get('bk_1')!;
    expect(booking).toMatchObject({ status: 'HOLD', checkoutSessionId: 'cs_test_1', amountCents: 15000, priceIsExample: true });
    expect([...t.db.holds.values()].every((h) => h.bookingId === 'bk_1' && h.status === 'HELD')).toBe(true);
    expect(t.db.holds.size).toBe(2);
  });

  it('rejects a double-booked slot, including an overlapping shorter service', async () => {
    const t = deps();
    await startServiceCheckout(input(), t.deps);
    await expect(startServiceCheckout(input(), t.deps)).rejects.toMatchObject({ status: 409, code: 'slot_taken' });
    await expect(startServiceCheckout(input({ serviceId: 'elijah-bonds:consult-30', slotStart: '2026-10-06T23:30:00.000Z' }), t.deps))
      .rejects.toMatchObject({ status: 409, code: 'slot_taken' });
    expect(t.stripe.create).toHaveBeenCalledTimes(1);
    // The next free slot is still bookable.
    await expect(startServiceCheckout(input({ slotStart: '2026-10-07T00:00:00.000Z' }), t.deps)).resolves.toMatchObject({ bookingId: 'bk_4' });
  });

  it('lets a slot go again once a stale hold is past its expiry', async () => {
    const t = deps();
    await startServiceCheckout(input(), t.deps);
    const later = { ...t.deps, now: new Date(NOW.getTime() + 2 * 60 * 60_000) };
    // Two hours later the 12-hour lead still allows the Tuesday slot, and the first hold has lapsed.
    await expect(startServiceCheckout(input(), later)).resolves.toMatchObject({ bookingId: 'bk_2' });
  });

  it('refuses a time the server did not offer, an unknown service and an unapproved one', async () => {
    const t = deps();
    await expect(startServiceCheckout(input({ slotStart: '2026-10-06T23:10:00Z' }), t.deps)).rejects.toMatchObject({ status: 400 });
    await expect(startServiceCheckout(input({ serviceId: 'nope' }), t.deps)).rejects.toMatchObject({ status: 404 });
    await expect(startServiceCheckout(input({ serviceId: 'example-teammate:session-60' }), t.deps)).rejects.toMatchObject({ status: 404 });
    expect(t.db.bookings.size).toBe(0);
  });

  it('releases the hold when Stripe fails', async () => {
    const t = deps();
    t.stripe.create.mockRejectedValueOnce(new Error('stripe down'));
    await expect(startServiceCheckout(input(), t.deps)).rejects.toMatchObject({ status: 502 });
    expect(t.db.bookings.get('bk_1')?.status).toBe('FAILED');
    expect(t.db.holds.size).toBe(0);
    await expect(startServiceCheckout(input(), t.deps)).resolves.toMatchObject({ bookingId: 'bk_2' });
  });

  it('answers 503 when the store is not configured, after the key check', async () => {
    const t = deps();
    await expect(startServiceCheckout(input(), { ...t.deps, store: null })).rejects.toMatchObject({ status: 503, code: 'store_not_configured' });
  });

  it('the route asserts test mode before it can create a session', () => {
    const src = readFileSync('app/api/creator/checkout/route.ts', 'utf8');
    expect(src).toContain('assertStripeTestKey(');
    expect(src.indexOf('assertStripeTestKey(')).toBeLessThan(src.indexOf('startServiceCheckout('));
  });
});
