// COACH-BUSINESS: the Connect money path end to end against the in-memory tables — checkout (the 5% application fee and
// the destination), the closed switch (no Stripe, no database), the webhook's idempotency per payment, and refunds.
import { beforeEach, describe, expect, it } from 'vitest';
import type Stripe from 'stripe';
import { resetBusinessProbe } from '@/lib/coach-business/store';
import { startPackageCheckout, refundSale, type CheckoutDeps } from '@/lib/coach-business/service';
import { checkoutParams, connectGate } from '@/lib/coach-business/connect';
import { saleSplit } from '@/lib/coach-business/fees';
import { coachConnectMeta, fulfilCoachConnect, fulfilConnectCheckout, type ConnectDeps } from '@/lib/coach-business/webhook';
import { fakeCoachBusinessDb, fakeLedger, seedCoach } from '@/tests/helpers/fakeCoachBusinessDb';
import { STORE_TERMS_VERSION } from '@/lib/store-terms';

// test changed (payments-ready): a package checkout now needs the buyer's store-terms tick before Stripe is called
// (lib/payments/terms.ts), so every call passes it. No assertion here changed for it; tests/coach-business/
// payments-ready.test.ts covers the refusal without the tick.
const TICK = { termsAccepted: true, termsVersion: STORE_TERMS_VERSION };

const ON = { COACH_CONNECT_PAYMENTS_ENABLED: '1', STRIPE_SECRET_KEY: 'sk_test_abc', NEXTAUTH_URL: 'https://fel.test' } as unknown as NodeJS.ProcessEnv;
const NOW = new Date('2026-10-25T18:00:00Z');

/** Anything touched throws: proof a closed path never reached it. */
const trap = <T,>(what: string): T => new Proxy({}, { get: (_t, p) => { if (p === 'then') return undefined; throw new Error(`${what}.${String(p)} touched`); } }) as T;

function fakeStripe() {
  const calls: { op: string; params: any; opts?: any }[] = [];
  const fees = new Map<string, { amount: number; refunded: number }>();
  let refunded = 0;
  const api = {
    accounts: { create: async () => ({ id: 'acct_x', livemode: false }), retrieve: async () => ({}), createLoginLink: async () => ({ url: 'u' }) },
    accountLinks: { create: async () => ({ url: 'u' }) },
    checkout: { sessions: {
      create: async (params: any, opts: any) => { calls.push({ op: 'checkout.create', params, opts }); return { id: 'cs_test_0123456789abc', url: 'https://checkout.stripe.test/c' }; },
      retrieve: async () => ({}),
    } },
    refunds: { create: async (params: any, opts: any) => { calls.push({ op: 'refunds.create', params, opts }); refunded += params.amount; return { charge: 'ch_1' }; } },
    charges: { retrieve: async () => ({ id: 'ch_1', amount_refunded: refunded, application_fee: 'fee_1' }) },
    subscriptions: { cancel: async (id: string) => { calls.push({ op: 'subscriptions.cancel', params: id }); return {}; } },
    // test changed (coach-fee-passthrough): FEL's share of a refund is handed back as an exact application-fee refund
    // (lib/coach-business/connect.ts returnApplicationFee), so the fake keeps each fee's amount_refunded the way Stripe does.
    applicationFees: {
      retrieve: async (id: string) => ({ id, amount: fees.get(id)?.amount ?? 1_000_000, amount_refunded: fees.get(id)?.refunded ?? 0 }),
      createRefund: async (id: string, params: any, opts: any) => {
        calls.push({ op: 'applicationFees.createRefund', params: { id, ...params }, opts });
        const f = fees.get(id) ?? { amount: 1_000_000, refunded: 0 };
        f.refunded += params.amount; fees.set(id, f);
        return { id: `fr_${calls.length}` };
      },
    },
    invoices: { retrieve: async () => ({}), update: async (id: string, params: any) => { calls.push({ op: 'invoices.update', params: { id, ...params } }); return {}; } },
    paymentIntents: { retrieve: async () => ({}) },
  };
  return { api: api as any, calls, fees, feeRefunded: (id: string) => fees.get(id)?.refunded ?? 0 };
}

function deps(over: Partial<CheckoutDeps> & { fake?: ReturnType<typeof fakeCoachBusinessDb>; stripe?: ReturnType<typeof fakeStripe> } = {}) {
  const fake = over.fake ?? fakeCoachBusinessDb();
  const stripe = over.stripe ?? fakeStripe();
  const d: CheckoutDeps = {
    db: fake.db as any, env: ON, now: NOW, stripe: () => stripe.api,
    isAdult: async () => true, plan: async () => 'free', ensureCustomer: async () => 'cus_1', coachSlug: async () => 'jordan-lee',
    ...over,
  };
  return { d, fake, stripe };
}

beforeEach(() => resetBusinessProbe());

describe('the switch: flag off means no charge path at all', () => {
  it('payments off → 409 store_closed payments_off, before the database or Stripe is touched', async () => {
    const r = await startPackageCheckout({ ...deps().d, env: {} as NodeJS.ProcessEnv, db: trap('db'), stripe: () => trap('stripe') }, 'buyer', 'pkg-1', TICK);
    expect(r).toEqual({ ok: false, status: 409, error: 'store_closed', reason: 'payments_off' });
  });

  it('a LIVE key is refused while COACH_CONNECT_LIVE is off (test mode only)', async () => {
    const env = { ...ON, STRIPE_SECRET_KEY: 'sk_live_abc' } as NodeJS.ProcessEnv;
    expect(connectGate(env)).toEqual({ ok: false, reason: 'live_mode_off' });
    const r = await startPackageCheckout({ ...deps().d, env, db: trap('db'), stripe: () => trap('stripe') }, 'buyer', 'pkg-1', TICK);
    expect(r).toMatchObject({ status: 409, reason: 'live_mode_off' });
    // test changed (payments-ready): with COACH_CONNECT_LIVE on, live mode now also waits for the signed coach terms
    // (COACH_TERMS_VERSION is null until the owner signs them); with a signed version it opens as before.
    expect(connectGate({ ...env, COACH_CONNECT_LIVE: '1' } as NodeJS.ProcessEnv)).toEqual({ ok: false, reason: 'coach_terms_unsigned' });
    expect(connectGate({ ...env, COACH_CONNECT_LIVE: '1' } as NodeJS.ProcessEnv, 'coach-terms-2026-11-01')).toMatchObject({ ok: true, live: true });
  });

  it('no key, a strange key, or no site URL is closed too', () => {
    expect(connectGate({ COACH_CONNECT_PAYMENTS_ENABLED: '1' } as any)).toEqual({ ok: false, reason: 'payments_not_set_up' });
    expect(connectGate({ ...ON, STRIPE_SECRET_KEY: 'pk_test_x' } as any)).toEqual({ ok: false, reason: 'payments_not_set_up' });
    expect(connectGate({ ...ON, NEXTAUTH_URL: '' } as any)).toEqual({ ok: false, reason: 'site_url_not_set' });
    expect(connectGate(ON)).toMatchObject({ ok: true, live: false, origin: 'https://fel.test' });
  });
});

describe('checkout', () => {
  // test changed (coach-fee-passthrough, owner 2026-10-25 "5% + Stripe fee on top"): the application fee was 5% of the
  // price (999), which left Stripe's fee to come out of FEL's 5%. It is now 5% + the buyer's processing fee (999 + 629),
  // and the buyer sees the processing fee as a second line. The sale still records the price and FEL's 5% (999).
  it('a one-off package: a destination charge to the coach, 5% + the processing fee as the application fee, test mode, a held spot', async () => {
    const { d, fake, stripe } = deps();
    seedCoach(fake.state, { priceCents: 19_999 });
    const r = await startPackageCheckout(d, 'buyer-1', 'pkg-1', TICK);
    expect(r).toMatchObject({ ok: true, url: 'https://checkout.stripe.test/c' });
    const call = stripe.calls.find((c) => c.op === 'checkout.create')!;
    expect(call.params.mode).toBe('payment');
    expect(call.params.payment_intent_data).toMatchObject({ application_fee_amount: 999 + 629, transfer_data: { destination: 'acct_coach-1' }, on_behalf_of: 'acct_coach-1' });
    expect(call.params.payment_intent_data.metadata).toMatchObject({ product: 'COACH_CONNECT', buyerId: 'buyer-1', coachId: 'coach-1', priceCents: '19999', processingFeeCents: '629', totalCents: '20628', felShareCents: '999', appFeeCents: '1628' });
    expect(call.params.line_items[0].price_data.unit_amount).toBe(19_999);
    expect(call.params.line_items[1].price_data).toMatchObject({ unit_amount: 629, product_data: { name: 'Processing fee' } });
    expect(call.params.line_items).toHaveLength(2);
    expect(call.params.expires_at).toBe(Math.floor(NOW.getTime() / 1000) + 30 * 60);
    expect(call.params.success_url).toBe('https://fel.test/coach/business/thanks?session_id={CHECKOUT_SESSION_ID}');
    expect(call.opts.idempotencyKey).toMatch(/^coach-connect-checkout:/);
    const sale = [...fake.state.sales.values()][0];
    expect(sale).toMatchObject({ status: 'PENDING', amountCents: 19_999, feeCents: 999, checkoutSessionId: 'cs_test_0123456789abc', livemode: false });
  });

  // test changed (coach-fee-passthrough): application_fee_percent was a flat 5, which cannot carry Stripe's 30¢. Monthly
  // coaching now bills the price AND the processing fee as two monthly lines, with the percent sized to 5% + the fee
  // (rounded up; the webhook makes each invoice exact — fee-passthrough.test.ts).
  it('monthly coaching is a subscription: two monthly lines, application_fee_percent = (5% + processing fee) / total, rounded up', () => {
    const p = checkoutParams({
      pkg: { id: 'p', coachId: 'c', kind: 'monthly', title: 'Online coaching', summary: '', priceCents: 12_000, includes: ['x'], capacity: null, sessions: null, active: true, sortOrder: 0 },
      saleId: 's', buyerId: 'b', customerId: 'cus', coachSlug: 'c', destination: 'acct_c', split: saleSplit(12_000), origin: 'https://fel.test', now: NOW,
    });
    expect(p.mode).toBe('subscription');
    // 12000 → total 12390, processing 390, A = 600 + 390 = 990; 990 / 12390 = 7.9903…% → 8 (rounded UP to 2 decimals)
    expect(p.subscription_data).toMatchObject({ application_fee_percent: 8, transfer_data: { destination: 'acct_c' }, on_behalf_of: 'acct_c' });
    expect(p.subscription_data!.metadata).toMatchObject({ priceCents: '12000', totalCents: '12390', appFeeCents: '990', felShareCents: '600' });
    expect((p as any).payment_intent_data).toBeUndefined();
    expect((p.line_items![0] as any).price_data).toMatchObject({ unit_amount: 12_000, recurring: { interval: 'month' } });
    expect((p.line_items![1] as any).price_data).toMatchObject({ unit_amount: 390, recurring: { interval: 'month' }, product_data: { name: 'Processing fee' } });
  });

  it('refusals, in order: own package, coach not ready, a minor buyer — none reaches Stripe', async () => {
    const { d, fake, stripe } = deps();
    seedCoach(fake.state);
    expect(await startPackageCheckout(d, 'coach-1', 'pkg-1', TICK)).toMatchObject({ status: 400, error: 'own_package' });
    const minor = await startPackageCheckout({ ...d, isAdult: async () => false }, 'teen-1', 'pkg-1', TICK);
    expect(minor).toMatchObject({ status: 403, error: 'adults_only' });
    expect((minor as any).message).toMatch(/parent or guardian/);
    fake.state.connect.get('coach-1')!.chargesEnabled = false;
    expect(await startPackageCheckout(d, 'buyer-1', 'pkg-1', TICK)).toMatchObject({ status: 409, error: 'coach_not_ready' });
    expect(stripe.calls).toEqual([]);
    expect(fake.state.sales.size).toBe(0);
  });

  it('with the Pro gates on, a Free coach cannot take payments; a Pro coach can', async () => {
    const env = { ...ON, COACH_PRO_ENABLED: '1' } as NodeJS.ProcessEnv;
    const { d, fake } = deps({ env });
    seedCoach(fake.state);
    expect(await startPackageCheckout(d, 'buyer-1', 'pkg-1', TICK)).toMatchObject({ status: 409, error: 'coach_not_ready' });
    expect(await startPackageCheckout({ ...d, plan: async () => 'pro' }, 'buyer-1', 'pkg-1', TICK)).toMatchObject({ ok: true });
  });

  it('capacity: the last spot goes to one buyer; an expired hold frees it; a Stripe failure releases it', async () => {
    const { d, fake } = deps();
    seedCoach(fake.state, { capacity: 1 });
    expect(await startPackageCheckout(d, 'buyer-1', 'pkg-1', TICK)).toMatchObject({ ok: true });
    expect(await startPackageCheckout(d, 'buyer-2', 'pkg-1', TICK)).toMatchObject({ status: 409, error: 'package_full' });
    const later = new Date(NOW.getTime() + 31 * 60_000);
    expect(await startPackageCheckout({ ...d, now: later }, 'buyer-2', 'pkg-1', TICK)).toMatchObject({ ok: true });
    const failing = fakeStripe();
    failing.api.checkout.sessions.create = async () => { throw new Error('stripe down'); };
    const { d: d2, fake: f2 } = deps({ stripe: failing });
    seedCoach(f2.state, { capacity: 1 });
    expect(await startPackageCheckout(d2, 'buyer-1', 'pkg-1', TICK)).toMatchObject({ status: 502 });
    expect([...f2.state.sales.values()][0].status).toBe('EXPIRED');
    expect(await startPackageCheckout({ ...d2, stripe: () => fakeStripe().api }, 'buyer-2', 'pkg-1', TICK)).toMatchObject({ ok: true });
  });
});

// ── the webhook ─────────────────────────────────────────────────────────────────────────────────────────────────────
function evt(type: string, object: any, id = `evt_${Math.random().toString(36).slice(2)}`): Stripe.Event {
  return { id, type, data: { object } } as unknown as Stripe.Event;
}

async function paidSale(kind = 'session_pack', priceCents = 19_999) {
  const { d, fake, stripe } = deps();
  seedCoach(fake.state, { kind, priceCents, capacity: null });
  const r = await startPackageCheckout(d, 'buyer-1', 'pkg-1', TICK);
  if (!r.ok) throw new Error('setup');
  const ledger = fakeLedger();
  const cdeps: ConnectDeps = { db: fake.db as any, post: ledger.post, stripe: () => stripe.api };
  const meta = { product: 'COACH_CONNECT', saleId: r.saleId, buyerId: 'buyer-1' };
  return { fake, ledger, cdeps, saleId: r.saleId, meta, stripe, d };
}

describe('the webhook is idempotent per payment', () => {
  it('checkout.session.completed twice, then the success-page verify: PAID once, the fee booked once', async () => {
    const { fake, ledger, cdeps, saleId, meta } = await paidSale();
    const session = { id: 'cs_test_0123456789abc', mode: 'payment', payment_status: 'paid', payment_intent: 'pi_1', metadata: meta };
    expect(await fulfilCoachConnect(cdeps, evt('checkout.session.completed', session))).toBe('fulfilled');
    expect(await fulfilCoachConnect(cdeps, evt('checkout.session.completed', session))).toBe('already');
    expect(await fulfilConnectCheckout(cdeps, session as any)).toBe('already');
    expect(fake.state.sales.get(saleId)).toMatchObject({ status: 'PAID', paymentIntentId: 'pi_1' });
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0]).toMatchObject({ kind: 'COACH_CONNECT_FEE', idempotencyKey: 'coach-connect-fee:cs_test_0123456789abc' });
    expect(ledger.revenue()).toBe(999);
  });

  it('an unpaid session (async payment still pending) moves nothing and books nothing', async () => {
    const { fake, ledger, cdeps, saleId, meta } = await paidSale();
    expect(await fulfilCoachConnect(cdeps, evt('checkout.session.completed', { id: 'cs_x', mode: 'payment', payment_status: 'unpaid', metadata: meta }))).toBe('pending');
    expect(fake.state.sales.get(saleId)!.status).toBe('PENDING');
    expect(ledger.rows).toEqual([]);
  });

  it('expired, then paid late: the payment is honoured', async () => {
    const { fake, cdeps, saleId, meta } = await paidSale();
    await fulfilCoachConnect(cdeps, evt('checkout.session.expired', { id: 'cs_x', metadata: meta }));
    expect(fake.state.sales.get(saleId)!.status).toBe('EXPIRED');
    await fulfilCoachConnect(cdeps, evt('checkout.session.completed', { id: 'cs_x', mode: 'payment', payment_status: 'paid', payment_intent: 'pi_9', metadata: meta }));
    expect(fake.state.sales.get(saleId)!.status).toBe('PAID');
  });

  it('monthly: ACTIVE on checkout (no fee there), the fee per invoice as Stripe reported it, once per invoice', async () => {
    const { fake, ledger, cdeps, saleId, meta } = await paidSale('monthly', 12_000);
    await fulfilCoachConnect(cdeps, evt('checkout.session.completed', { id: 'cs_m', mode: 'subscription', status: 'complete', subscription: 'sub_1', metadata: meta }));
    expect(fake.state.sales.get(saleId)).toMatchObject({ status: 'ACTIVE', subscriptionId: 'sub_1' });
    expect(ledger.rows).toEqual([]);
    const invoice = { id: 'in_1', amount_paid: 12_000, application_fee_amount: 600, parent: { subscription_details: { metadata: meta } } };
    await fulfilCoachConnect(cdeps, evt('invoice.paid', invoice));
    await fulfilCoachConnect(cdeps, evt('invoice.paid', invoice));
    await fulfilCoachConnect(cdeps, evt('invoice.paid', { ...invoice, id: 'in_2', application_fee_amount: undefined }));
    expect(ledger.rows.map((r) => r.idempotencyKey)).toEqual(['coach-connect-fee:in_1', 'coach-connect-fee:in_2']);
    expect(ledger.revenue()).toBe(1_200);
    await fulfilCoachConnect(cdeps, evt('customer.subscription.deleted', { id: 'sub_1', status: 'canceled', metadata: meta }));
    expect(fake.state.sales.get(saleId)!.status).toBe('CANCELED');
    expect(await fulfilCoachConnect(cdeps, evt('customer.subscription.deleted', { id: 'sub_1', status: 'canceled', metadata: meta }))).toBe('noop');
  });

  // test changed (coach-fee-passthrough): the charge now names its application fee (Stripe always does), and FEL's share
  // is handed back to the coach at Stripe, exactly; the assertions on the sale and the ledger are unchanged.
  it('refunds: partial, redelivered, then full, then an older event late — the fee returned is exact and never twice', async () => {
    const { fake, ledger, cdeps, saleId, meta, stripe } = await paidSale();
    await fulfilCoachConnect(cdeps, evt('checkout.session.completed', { id: 'cs_r', mode: 'payment', payment_status: 'paid', payment_intent: 'pi_r', metadata: meta }));
    const partial = evt('charge.refunded', { id: 'ch_r', amount_refunded: 5_000, application_fee: 'fee_r', metadata: meta });
    expect(await fulfilCoachConnect(cdeps, partial)).toBe('refunded');
    expect(await fulfilCoachConnect(cdeps, partial)).toBe('noop');
    expect(fake.state.sales.get(saleId)).toMatchObject({ status: 'PARTIALLY_REFUNDED', refundedCents: 5_000, feeRefundedCents: 249 });
    expect(stripe.feeRefunded('fee_r')).toBe(249);
    expect(await fulfilCoachConnect(cdeps, evt('charge.refunded', { id: 'ch_r', amount_refunded: 19_999, application_fee: 'fee_r', metadata: meta }))).toBe('refunded');
    expect(await fulfilCoachConnect(cdeps, evt('charge.refunded', { id: 'ch_r', amount_refunded: 5_000, application_fee: 'fee_r', metadata: meta }))).toBe('noop');
    expect(fake.state.sales.get(saleId)).toMatchObject({ status: 'REFUNDED', refundedCents: 19_999, feeRefundedCents: 999 });
    expect(stripe.feeRefunded('fee_r')).toBe(999);
    expect(ledger.rows.map((r) => r.kind)).toEqual(['COACH_CONNECT_FEE', 'COACH_CONNECT_FEE_REFUND', 'COACH_CONNECT_FEE_REFUND']);
    expect(ledger.revenue()).toBe(0);
  });

  // test changed (coach-fee-passthrough): refund_application_fee was true, which hands back the same share of the WHOLE
  // application fee (processing fee included). It is now false, and FEL's share of the 5% goes back exactly, as an
  // application-fee refund (4000 of 19999 → 199 of 999).
  it('the coach refunds from the dashboard: Stripe reverses the transfer, FEL hands back its share; the webhook after it finds nothing to do', async () => {
    const { fake, ledger, cdeps, saleId, meta, stripe } = await paidSale();
    await fulfilCoachConnect(cdeps, evt('checkout.session.completed', { id: 'cs_r', mode: 'payment', payment_status: 'paid', payment_intent: 'pi_r', metadata: meta }));
    const r = await refundSale({ db: fake.db as any, stripe: () => stripe.api, env: ON, ledger: cdeps }, 'coach-1', saleId, 4_000);
    expect(r).toMatchObject({ ok: true, refundedCents: 4_000, status: 'PARTIALLY_REFUNDED' });
    const call = stripe.calls.find((c) => c.op === 'refunds.create')!;
    expect(call.params).toMatchObject({ payment_intent: 'pi_r', amount: 4_000, reverse_transfer: true, refund_application_fee: false });
    expect(call.opts.idempotencyKey).toBe(`coach-connect-refund:${saleId}:4000`);
    expect(stripe.feeRefunded('fee_1')).toBe(199);
    expect(await fulfilCoachConnect(cdeps, evt('charge.refunded', { id: 'ch_1', amount_refunded: 4_000, application_fee: 'fee_1', metadata: meta }))).toBe('noop');
    expect(stripe.feeRefunded('fee_1')).toBe(199);
    expect(ledger.rows.filter((x) => x.kind === 'COACH_CONNECT_FEE_REFUND')).toHaveLength(1);
    expect(await refundSale({ db: fake.db as any, stripe: () => stripe.api, env: ON, ledger: cdeps }, 'someone-else', saleId, 100)).toMatchObject({ status: 404 });
    expect(await refundSale({ db: fake.db as any, stripe: () => stripe.api, env: ON, ledger: cdeps }, 'coach-1', saleId, 20_000)).toMatchObject({ status: 400, error: 'invalid_amount' });
    expect(await refundSale({ db: trap('db'), stripe: () => trap('stripe'), env: {} as any, ledger: cdeps }, 'coach-1', saleId, 1)).toMatchObject({ status: 409, reason: 'payments_off' });
  });

  it('only COACH_CONNECT objects are routed here; the invoice\'s basil metadata is read', () => {
    expect(coachConnectMeta({ metadata: { product: 'COACH_STORE', rowId: 'r' } })).toBeNull();
    expect(coachConnectMeta({ metadata: { product: 'COACH_CONNECT' } })).toBeNull();
    expect(coachConnectMeta({ parent: { subscription_details: { metadata: { product: 'COACH_CONNECT', saleId: 's1' } } } })?.saleId).toBe('s1');
  });
});
