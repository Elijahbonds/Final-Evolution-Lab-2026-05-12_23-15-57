import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newSpyDb, type SpyDb } from '@/tests/helpers/writeSpyDb';
import {
  ADULT, PERIOD_END_UNIX, checkoutSessionFixture, eventFixture, fakeStripe, guardedPrisma, invoiceFixture,
  seedBuyers, subscriptionFixture, webhookRequest, type FakeStripe,
} from '@/tests/helpers/stripeSales';

/**
 * The two gaps the coach-store lane found and left skipped here (docs/coach-store-NOTES.md), fixed by LAUNCH-SALES
 * (2026-10-20) and now real tests. test changed: both were `it.skip(..., () => {})` with empty bodies.
 *   B-W2: FEL_COACH / FEL_FACILITY checkout wrote no Subscription row (lib/stripe/checkout-fulfil.ts only took FEL_PRO
 *         and STUDIO_CREATOR, so isCoachUser / isFacilityUser never saw a purchase).
 *   B-W3: basil removed invoice.subscription and subscription.current_period_end; the existing FEL handlers in
 *         app/api/stripe/webhook/route.ts read both. They now read basil's fields (lib/stripe/basil-shapes.ts).
 * The fuller B-W3 coverage, event by event, is lib/stripe/webhook-basil.test.ts.
 */

const h = vi.hoisted(() => ({ db: null as unknown as SpyDb, stripe: null as unknown as FakeStripe }));
vi.mock('@/lib/db', () => ({ get prisma() { return guardedPrisma(h.db); } }));
vi.mock('@/lib/stripe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/stripe')>()),
  getStripe: () => h.stripe.client,
}));

const { POST: webhook } = await import('@/app/api/stripe/webhook/route');

beforeEach(() => {
  h.db = newSpyDb();
  h.stripe = fakeStripe();
  seedBuyers(h.db);
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_fake';
});

describe('formerly out of lane (now fixed)', () => {
  it('B-W2 FEL_COACH checkout writes a Subscription row', async () => {
    for (const product of ['FEL_COACH', 'FEL_FACILITY'] as const) {
      const subId = `sub_${product}`;
      h.stripe.subscriptions[subId] = subscriptionFixture({ id: subId });
      const session = checkoutSessionFixture({
        id: `cs_${product}`, mode: 'subscription', amountTotal: 3900, subscription: subId,
        metadata: { userId: ADULT, product, plan: product },
      });
      const res = await webhook(webhookRequest(eventFixture('checkout.session.completed', session)));
      expect(res.status).toBe(200);
      const row = (h.db.tables.subscription ?? []).find((r) => r.stripeSubscriptionId === subId);
      expect(row, product).toMatchObject({ userId: ADULT, product, status: 'ACTIVE' });
      expect((row!.currentPeriodEnd as Date).getTime()).toBe(PERIOD_END_UNIX * 1000);
      expect((h.db.tables.order ?? []).find((o) => o.stripeSessionId === `cs_${product}`)).toMatchObject({ type: 'SUBSCRIPTION', status: 'PAID' });
    }
  });

  it('B-W3 existing invoice handler reads parent.subscription_details', async () => {
    (h.db.tables.subscription ??= []).push({
      id: 'subrow-1', userId: ADULT, stripeSubscriptionId: 'sub_pro', stripePriceId: 'price_sub_pro',
      product: 'FEL_PRO', status: 'PAST_DUE', currentPeriodEnd: new Date((PERIOD_END_UNIX - 7 * 86_400) * 1000),
    });
    const nextEnd = PERIOD_END_UNIX + 7 * 86_400;
    h.stripe.subscriptions.sub_pro = subscriptionFixture({ id: 'sub_pro', periodEnd: nextEnd });
    const invoice = invoiceFixture({ id: 'in_renew', subscription: 'sub_pro', paymentIntent: 'pi_renew', amountPaid: 600 });
    expect('subscription' in invoice).toBe(false); // the field the old handler read is gone in this shape

    const res = await webhook(webhookRequest(eventFixture('invoice.paid', invoice)));
    expect(res.status).toBe(200);
    const row = h.db.tables.subscription[0];
    expect(row.status).toBe('ACTIVE');
    expect((row.currentPeriodEnd as Date).getTime()).toBe(nextEnd * 1000);
    const ledger = (h.db.tables.ledgerTransaction ?? []).filter((t) => t.idempotencyKey === 'stripe-invoice:in_renew');
    expect(ledger).toHaveLength(1);
    expect(ledger[0].kind).toBe('SUBSCRIPTION_PAYMENT_FEL_PRO');
  });
});
