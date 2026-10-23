// LAUNCH-SALES B-W3 (2026-10-20): the FEL subscription handlers in app/api/stripe/webhook/route.ts and
// lib/stripe/checkout-fulfil.ts, driven by fixture events in the CURRENT Stripe API shape (tests/helpers/stripeSales.ts:
// each fixture is type-checked against the SDK, so none carries a field basil removed).
//
// Before the fix, measured by running this suite on the old handlers:
//   - checkout.session.completed FEL_PRO: Order written, then `new Date(undefined * 1000)` -> Prisma refuses the
//     Invalid Date -> 500 on every retry. FEL Pro could not be bought.
//   - invoice.paid / invoice.payment_failed: invoice.subscription is undefined -> early return. Renewals booked no
//     ledger row and moved no period; a failed payment never marked PAST_DUE.
//   - customer.subscription.updated: Invalid Date again -> 500 on every retry.
// The real route runs; Prisma is the write-spy client behind the same Invalid Date check Prisma's runtime makes.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newSpyDb, type SpyDb } from '@/tests/helpers/writeSpyDb';
import {
  ADULT, PERIOD_END_UNIX, checkoutSessionFixture, eventFixture, fakeStripe, guardedPrisma, invoiceFixture,
  seedBuyers, subscriptionFixture, webhookRequest, type FakeStripe,
} from '@/tests/helpers/stripeSales';

const h = vi.hoisted(() => ({ db: null as unknown as SpyDb, stripe: null as unknown as FakeStripe }));
vi.mock('@/lib/db', () => ({ get prisma() { return guardedPrisma(h.db); } }));
vi.mock('@/lib/stripe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/stripe')>()),
  getStripe: () => h.stripe.client,
}));

const { POST: webhook } = await import('@/app/api/stripe/webhook/route');
const shapes = await import('./basil-shapes');

const at = (unix: number) => new Date(unix * 1000);
const subs = () => h.db.tables.subscription ?? [];
const ledger = () => h.db.tables.ledgerTransaction ?? [];

async function deliver(type: string, object: unknown, id?: string) {
  const res = await webhook(webhookRequest(eventFixture(type, object, id)));
  return { status: res.status, json: await res.json() };
}

function seedProRow(over: Record<string, unknown> = {}) {
  (h.db.tables.subscription ??= []).push({
    id: 'subrow-pro', userId: ADULT, stripeSubscriptionId: 'sub_pro', stripePriceId: 'price_sub_pro',
    product: 'FEL_PRO', status: 'ACTIVE', cancelAtPeriodEnd: false, currentPeriodEnd: at(PERIOD_END_UNIX), ...over,
  });
}

beforeEach(() => {
  h.db = newSpyDb();
  h.stripe = fakeStripe();
  seedBuyers(h.db);
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_fake';
});

describe('the harness is not vacuous', () => {
  it('the guarded client refuses an Invalid Date the way Prisma does', async () => {
    const db = guardedPrisma(h.db);
    await expect(db.subscription.update({ where: { id: 'x' }, data: { currentPeriodEnd: new Date(NaN) } }))
      .rejects.toThrow(/Provided Date object is invalid/);
  });

  it('fixtures carry none of the fields basil removed', () => {
    const sub = subscriptionFixture({ id: 'sub_x' }) as unknown as Record<string, unknown>;
    const inv = invoiceFixture({ id: 'in_x', subscription: 'sub_x', paymentIntent: 'pi_x', amountPaid: 1 }) as unknown as Record<string, unknown>;
    expect('current_period_end' in sub).toBe(false);
    for (const gone of ['subscription', 'charge', 'payment_intent']) expect(gone in inv, gone).toBe(false);
  });
});

describe('checkout.session.completed (subscription mode)', () => {
  it('FEL_PRO writes an ACTIVE row whose period end comes from the subscription item', async () => {
    h.stripe.subscriptions.sub_pro = subscriptionFixture({ id: 'sub_pro' });
    const session = checkoutSessionFixture({
      id: 'cs_pro', mode: 'subscription', amountTotal: 600, subscription: 'sub_pro',
      metadata: { userId: ADULT, product: 'FEL_PRO', plan: 'FEL_PRO' },
    });
    expect((await deliver('checkout.session.completed', session)).status).toBe(200);
    expect(subs()).toHaveLength(1);
    expect(subs()[0]).toMatchObject({ userId: ADULT, product: 'FEL_PRO', status: 'ACTIVE', stripePriceId: 'price_sub_pro' });
    expect(subs()[0].currentPeriodEnd.getTime()).toBe(PERIOD_END_UNIX * 1000);
  });

  it('a subscription with no period at all still grants (the date is left unset, never Invalid Date)', async () => {
    const bare = subscriptionFixture({ id: 'sub_bare' }) as any;
    bare.items.data[0].current_period_end = undefined;
    h.stripe.subscriptions.sub_bare = bare;
    const session = checkoutSessionFixture({
      id: 'cs_bare', mode: 'subscription', amountTotal: 999, subscription: 'sub_bare',
      metadata: { userId: ADULT, product: 'FEL_PRO', plan: 'FEL_PRO_MONTHLY' },
    });
    expect((await deliver('checkout.session.completed', session)).status).toBe(200);
    expect(subs()[0]).toMatchObject({ status: 'ACTIVE', currentPeriodEnd: null });
  });

  it('a replay after Stripe ended the subscription does not re-open it', async () => {
    seedProRow({ status: 'CANCELED' });
    h.stripe.subscriptions.sub_pro = subscriptionFixture({ id: 'sub_pro', status: 'canceled' });
    const session = checkoutSessionFixture({
      id: 'cs_pro', mode: 'subscription', amountTotal: 600, subscription: 'sub_pro',
      metadata: { userId: ADULT, product: 'FEL_PRO', plan: 'FEL_PRO' },
    });
    expect((await deliver('checkout.session.completed', session)).status).toBe(200);
    expect(subs()[0].status).toBe('CANCELED');
  });
});

describe('invoice.paid', () => {
  it('a renewal moves the period and books the payment once, however often it is delivered', async () => {
    seedProRow();
    const next = PERIOD_END_UNIX + 7 * 86_400;
    h.stripe.subscriptions.sub_pro = subscriptionFixture({ id: 'sub_pro', periodEnd: next });
    const invoice = invoiceFixture({ id: 'in_2', subscription: 'sub_pro', paymentIntent: 'pi_2', amountPaid: 600, periodEnd: next });
    expect((await deliver('invoice.paid', invoice, 'evt_a')).status).toBe(200);
    expect((await deliver('invoice.paid', invoice, 'evt_a')).status).toBe(200); // Stripe retry, same event
    expect((await deliver('invoice.paid', invoice, 'evt_b')).status).toBe(200); // a different event for the same invoice
    expect(subs()[0].currentPeriodEnd.getTime()).toBe(next * 1000);
    const booked = ledger().filter((t) => t.idempotencyKey === 'stripe-invoice:in_2');
    expect(booked).toHaveLength(1);
    expect(booked[0]).toMatchObject({ kind: 'SUBSCRIPTION_PAYMENT_FEL_PRO', currency: 'USD_CENTS' });
  });

  it('arriving BEFORE checkout.session.completed, it writes the row from the subscription metadata', async () => {
    h.stripe.subscriptions.sub_new = subscriptionFixture({ id: 'sub_new', metadata: { userId: ADULT, product: 'FEL_PRO', plan: 'FEL_PRO' } });
    const invoice = invoiceFixture({
      id: 'in_first', subscription: 'sub_new', paymentIntent: 'pi_first', amountPaid: 600, billingReason: 'subscription_create',
      metadata: { userId: ADULT, product: 'FEL_PRO', plan: 'FEL_PRO' },
    });
    expect((await deliver('invoice.paid', invoice)).status).toBe(200);
    expect(subs()).toHaveLength(1);
    expect(subs()[0]).toMatchObject({ userId: ADULT, stripeSubscriptionId: 'sub_new', product: 'FEL_PRO', status: 'ACTIVE' });
    expect(ledger().filter((t) => t.idempotencyKey === 'stripe-invoice:in_first')).toHaveLength(1);
    // ...and the checkout event that follows finds the row instead of writing a second one.
    const session = checkoutSessionFixture({
      id: 'cs_new', mode: 'subscription', amountTotal: 600, subscription: 'sub_new',
      metadata: { userId: ADULT, product: 'FEL_PRO', plan: 'FEL_PRO' },
    });
    expect((await deliver('checkout.session.completed', session)).status).toBe(200);
    expect(subs()).toHaveLength(1);
  });

  it('an unknown subscription with no FEL metadata is ignored (200), not guessed', async () => {
    h.stripe.subscriptions.sub_other = subscriptionFixture({ id: 'sub_other' });
    const invoice = invoiceFixture({ id: 'in_other', subscription: 'sub_other', paymentIntent: 'pi_o', amountPaid: 500 });
    expect((await deliver('invoice.paid', invoice)).status).toBe(200);
    expect(subs()).toHaveLength(0);
    expect(ledger()).toHaveLength(0);
  });
});

describe('invoice.payment_failed', () => {
  it('marks the row PAST_DUE through parent.subscription_details', async () => {
    seedProRow();
    const invoice = invoiceFixture({ id: 'in_fail', subscription: 'sub_pro', paymentIntent: 'pi_fail', amountPaid: 0 });
    expect((await deliver('invoice.payment_failed', invoice)).status).toBe(200);
    expect(subs()[0].status).toBe('PAST_DUE');
  });
});

describe('customer.subscription.updated / deleted', () => {
  it('updated: status, cancel_at_period_end and the item period end', async () => {
    seedProRow();
    const next = PERIOD_END_UNIX + 30 * 86_400;
    const sub = subscriptionFixture({ id: 'sub_pro', status: 'past_due', periodEnd: next, cancelAtPeriodEnd: true });
    expect((await deliver('customer.subscription.updated', sub)).status).toBe(200);
    expect(subs()[0]).toMatchObject({ status: 'PAST_DUE', cancelAtPeriodEnd: true });
    expect(subs()[0].currentPeriodEnd.getTime()).toBe(next * 1000);
  });

  it('updated: a stale "active" after a refund cancelled the subscription does not re-open the row', async () => {
    seedProRow({ status: 'CANCELED' });
    h.stripe.subscriptions.sub_pro = subscriptionFixture({ id: 'sub_pro', status: 'canceled' });
    const stale = subscriptionFixture({ id: 'sub_pro', status: 'active' });
    expect((await deliver('customer.subscription.updated', stale)).status).toBe(200);
    expect(subs()[0].status).toBe('CANCELED');
  });

  it('updated: an unpaid subscription that recovers re-opens (Stripe says active)', async () => {
    seedProRow({ status: 'CANCELED' }); // mapStripeStatus maps 'unpaid' to CANCELED
    h.stripe.subscriptions.sub_pro = subscriptionFixture({ id: 'sub_pro', status: 'active' });
    expect((await deliver('customer.subscription.updated', subscriptionFixture({ id: 'sub_pro', status: 'active' }))).status).toBe(200);
    expect(subs()[0].status).toBe('ACTIVE');
  });

  it('deleted: CANCELED', async () => {
    seedProRow();
    expect((await deliver('customer.subscription.deleted', subscriptionFixture({ id: 'sub_pro', status: 'canceled' }))).status).toBe(200);
    expect(subs()[0]).toMatchObject({ status: 'CANCELED', cancelAtPeriodEnd: false });
  });
});

describe('subscriptionIdForCharge (basil: a charge no longer names its invoice)', () => {
  it('finds the subscription through InvoicePayments; a one-time charge is null; a list failure falls back to the customer invoices', async () => {
    h.stripe.invoices.in_s = invoiceFixture({ id: 'in_s', subscription: 'sub_s', paymentIntent: 'pi_s', amountPaid: 600 });
    const charge = (pi: string) => ({ id: `ch_${pi}`, object: 'charge', payment_intent: pi, customer: 'cus_adult', metadata: {} }) as any;
    expect(await shapes.subscriptionIdForCharge(h.stripe.client, charge('pi_s'))).toBe('sub_s');
    expect(await shapes.subscriptionIdForCharge(h.stripe.client, charge('pi_one_time'))).toBeNull();
    h.stripe.client.invoicePayments.list = async () => { throw new Error('invoice_payments unavailable'); };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await shapes.subscriptionIdForCharge(h.stripe.client, charge('pi_s'))).toBe('sub_s');
    expect(await shapes.subscriptionIdForCharge(h.stripe.client, charge('pi_one_time'))).toBeNull();
    warn.mockRestore();
  });
});

describe('the readers still accept the pre-basil shape (old events in flight)', () => {
  it('invoice.subscription and a top-level current_period_end are read when the new fields are absent', () => {
    expect(shapes.invoiceSubscriptionId({ subscription: 'sub_legacy' })).toBe('sub_legacy');
    expect(shapes.subscriptionPeriodEnd({ current_period_end: PERIOD_END_UNIX })?.getTime()).toBe(PERIOD_END_UNIX * 1000);
    expect(shapes.subscriptionPeriodEnd({})).toBeNull();
    expect(shapes.unixToDate(Number.NaN)).toBeNull();
    expect(shapes.invoicePeriodEnd(invoiceFixture({ id: 'in', subscription: 's', paymentIntent: 'p', amountPaid: 1 }))?.getTime()).toBe(PERIOD_END_UNIX * 1000);
  });
});
