// PAYMENTS-READY (2026-10-26): what has to be true the moment the owner signs the terms and sets the keys.
//   1. the buyer's terms tick at package checkout, and the live fence on unsigned coach terms;
//   2. account.updated and the disputes on a coach's sale (record, notice, ledger, idempotency);
//   4. REFUND_PROCESSING_FEE, both ways, partial and full, from the coach's refund and from the Stripe Dashboard;
//   5. the platform fee by plan and under a monthly cap, at checkout and on monthly renewals.
// Against the in-memory tables (tests/helpers/fakeCoachBusinessDb.ts) and a Stripe stand-in that keeps the money the way
// Stripe does on a destination charge, so each test checks where every cent ended up. No network, no keys.
import { beforeEach, describe, expect, it } from 'vitest';
import type Stripe from 'stripe';
import { STORE_TERMS_VERSION } from '@/lib/store-terms';
import { resetBusinessProbe } from '@/lib/coach-business/store';
import { refundSale, startPackageCheckout, type CheckoutDeps } from '@/lib/coach-business/service';
import { connectGate, createExpressAccount, needsStripeSetup, recordCoachTerms } from '@/lib/coach-business/connect';
import { proGate } from '@/lib/coach-business/pro';
import {
  chargeRefundCents, monthStartUtc, platformFee, priceRefundedFromCharge, processingShareCents, saleSplit, stripeFeeCents, STRIPE_CARD_RATE,
} from '@/lib/coach-business/fees';
import { platformFeePolicy, refundProcessingFee, PLATFORM_FEE_BPS_FREE_DEFAULT, PLATFORM_FEE_BPS_PRO_DEFAULT, PLATFORM_FEE_CAP_CENTS_MONTHLY_DEFAULT, REFUND_PROCESSING_FEE_DEFAULT } from '@/lib/coach-business/config';
import { connectInvoiceCreated, connectInvoicePaid, fulfilCoachConnect, type ConnectDeps } from '@/lib/coach-business/webhook';
import { coachConnectEvent, disputeFunds, disputeOutcome, type EventDeps } from '@/lib/coach-business/events';
import { fakeCoachBusinessDb, fakeLedger, seedCoach } from '@/tests/helpers/fakeCoachBusinessDb';

const NOW = new Date('2026-10-26T18:00:00Z');
const ON = { COACH_CONNECT_PAYMENTS_ENABLED: '1', STRIPE_SECRET_KEY: 'sk_test_abc', NEXTAUTH_URL: 'https://fel.test' } as unknown as NodeJS.ProcessEnv;
const TICK = { termsAccepted: true, termsVersion: STORE_TERMS_VERSION };
const env = (o: Record<string, string> = {}) => ({ ...ON, ...o }) as unknown as NodeJS.ProcessEnv;

/**
 * Stripe on a destination charge, as far as these tests need it. Each charge keeps its total T, what is refunded, the
 * application fee A and what of it went back to the coach. The coach's balance: +T at the charge (the transfer), −A (the
 * application fee), −r per refund (reverse_transfer of a transfer of T reverses r), + each application-fee refund.
 */
function stripeSim() {
  const calls: { op: string; params: any; opts?: any }[] = [];
  const charges = new Map<string, { amount: number; refunded: number; fee: string; pi: string; metadata: Record<string, string> }>();
  const fees = new Map<string, { amount: number; refunded: number }>();
  const accounts = new Map<string, any>();
  const invoices = new Map<string, any>();
  const invoicePayments = new Map<string, string>(); // payment intent → invoice
  let buyerRefunded = 0;
  let coachReversed = 0;
  let feeReturned = 0;
  const api = {
    accounts: {
      create: async (params: any, opts: any) => { calls.push({ op: 'accounts.create', params, opts }); const a = { id: 'acct_new', livemode: false, metadata: params.metadata }; accounts.set(a.id, a); return a; },
      retrieve: async (id: string) => { calls.push({ op: 'accounts.retrieve', params: id }); return accounts.get(id) ?? { id, metadata: {} }; },
      update: async (id: string, params: any) => { calls.push({ op: 'accounts.update', params: { id, ...params } }); const a = accounts.get(id) ?? { id, metadata: {} }; a.metadata = { ...a.metadata, ...params.metadata }; accounts.set(id, a); return a; },
      createLoginLink: async () => ({ url: 'u' }),
    },
    accountLinks: { create: async () => ({ url: 'https://connect.stripe.test/onboard' }) },
    checkout: { sessions: {
      create: async (params: any, opts: any) => { calls.push({ op: 'checkout.create', params, opts }); return { id: `cs_test_${calls.length}abcdefghij`, url: 'https://checkout.stripe.test/c' }; },
      retrieve: async () => ({}),
    } },
    refunds: { create: async (params: any, opts: any) => {
      calls.push({ op: 'refunds.create', params, opts });
      const [id, c] = [...charges.entries()].find(([, x]) => x.pi === params.payment_intent)!;
      c.refunded += params.amount; buyerRefunded += params.amount;
      if (params.reverse_transfer) coachReversed += params.amount;
      return { charge: id };
    } },
    charges: { retrieve: async (id: string) => { const c = charges.get(id)!; return { id, amount: c.amount, amount_refunded: c.refunded, application_fee: c.fee, application_fee_amount: fees.get(c.fee)?.amount ?? 0, payment_intent: c.pi, metadata: c.metadata }; } },
    paymentIntents: { retrieve: async (id: string) => { const c = [...charges.values()].find((x) => x.pi === id); return { id, amount: c?.amount }; } },
    subscriptions: { cancel: async () => ({}) },
    applicationFees: {
      retrieve: async (id: string) => ({ id, amount: fees.get(id)!.amount, amount_refunded: fees.get(id)!.refunded }),
      createRefund: async (id: string, params: any, opts: any) => {
        calls.push({ op: 'applicationFees.createRefund', params: { id, ...params }, opts });
        fees.get(id)!.refunded += params.amount; feeReturned += params.amount;
        return { id: `fr_${calls.length}` };
      },
    },
    invoices: {
      retrieve: async (id: string) => invoices.get(id) ?? { id },
      update: async (id: string, params: any) => { calls.push({ op: 'invoices.update', params: { id, ...params } }); return {}; },
    },
    invoicePayments: { list: async (params: any) => { calls.push({ op: 'invoicePayments.list', params }); const inv = invoicePayments.get(params.payment.payment_intent); return { data: inv ? [{ invoice: inv }] : [] }; } },
  };
  return {
    api: api as any, calls, charges, fees, accounts, invoices, invoicePayments,
    /** A paid destination charge for a sale: T to the coach, A back to FEL. */
    pay(chargeId: string, pi: string, totalCents: number, appFeeCents: number, metadata: Record<string, string> = {}) {
      charges.set(chargeId, { amount: totalCents, refunded: 0, fee: `fee_${chargeId}`, pi, metadata });
      fees.set(`fee_${chargeId}`, { amount: appFeeCents, refunded: 0 });
    },
    /** A refund made in the Stripe Dashboard ("refund application fee" unticked, reverse transfer on). */
    dashboardRefund(chargeId: string, amount: number) { const c = charges.get(chargeId)!; c.refunded += amount; buyerRefunded += amount; coachReversed += amount; },
    money: () => ({ buyerRefunded, coachReversed, feeReturned }),
  };
}

function setup(o: { env?: NodeJS.ProcessEnv; plan?: 'free' | 'pro'; priceCents?: number; kind?: string; paymentsReady?: boolean } = {}) {
  const fake = fakeCoachBusinessDb({ paymentsReady: o.paymentsReady });
  seedCoach(fake.state, { priceCents: o.priceCents ?? 19_999, kind: o.kind, capacity: null });
  const stripe = stripeSim();
  const ledger = fakeLedger(fake.state, () => NOW);
  const e = o.env ?? ON;
  const ledgerDeps: ConnectDeps = { db: fake.db as any, post: ledger.post, stripe: () => stripe.api, env: e, now: () => NOW };
  const deps: CheckoutDeps = {
    db: fake.db as any, env: e, now: NOW, stripe: () => stripe.api,
    isAdult: async () => true, plan: async () => o.plan ?? 'free', ensureCustomer: async () => 'cus_1', coachSlug: async () => 'jordan-lee',
  };
  return { fake, stripe, ledger, ledgerDeps, deps, refundDeps: { db: fake.db as any, stripe: () => stripe.api, env: e, ledger: ledgerDeps } };
}

/** Buy the seeded package and have Stripe charge it (checkout.session.completed). Returns the sale id and its split. */
async function buy(s: ReturnType<typeof setup>) {
  const r = await startPackageCheckout(s.deps, 'buyer-1', 'pkg-1', TICK);
  if (!r.ok) throw new Error(`checkout refused: ${JSON.stringify(r)}`);
  const create = s.stripe.calls.filter((c) => c.op === 'checkout.create').at(-1)!;
  const meta = create.params.metadata;
  const total = Number(meta.totalCents);
  const app = Number(meta.appFeeCents);
  s.stripe.pay('ch_1', 'pi_1', total, app, meta);
  await fulfilCoachConnect(s.ledgerDeps, { id: 'evt_paid', type: 'checkout.session.completed', data: { object: { id: create.params ? 'cs_x' : '', mode: 'payment', payment_status: 'paid', payment_intent: 'pi_1', metadata: meta } } } as any);
  return { saleId: r.saleId, total, app, price: Number(meta.priceCents), felShare: Number(meta.felShareCents), processing: Number(meta.processingFeeCents), meta };
}

beforeEach(() => resetBusinessProbe());

// ── 1. terms ────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('the buyer ticks the terms before Stripe is called', () => {
  it.each([
    ['no tick', undefined],
    ['the box unticked', { termsAccepted: false, termsVersion: STORE_TERMS_VERSION }],
    ['an old version', { termsAccepted: true, termsVersion: 'store-terms-2026-10-04' }],
  ])('%s: 409 terms_required with the current version; no spot held, nothing at Stripe', async (_n, body) => {
    const s = setup();
    const r = await startPackageCheckout(s.deps, 'buyer-1', 'pkg-1', body as never);
    expect(r).toEqual({ ok: false, status: 409, error: 'terms_required', version: STORE_TERMS_VERSION });
    expect(s.fake.state.sales.size).toBe(0);
    expect(s.stripe.calls).toEqual([]);
  });

  it('the accepted version and time ride on the session, the payment and (monthly) the subscription', async () => {
    const s = setup();
    await startPackageCheckout(s.deps, 'buyer-1', 'pkg-1', TICK);
    const p = s.stripe.calls.find((c) => c.op === 'checkout.create')!.params;
    for (const m of [p.metadata, p.payment_intent_data.metadata]) expect(m).toMatchObject({ terms_version: STORE_TERMS_VERSION, terms_accepted_at: NOW.toISOString(), product: 'COACH_CONNECT' });
    const sm = setup({ kind: 'monthly', priceCents: 12_000 });
    await startPackageCheckout(sm.deps, 'buyer-1', 'pkg-1', TICK);
    expect(sm.stripe.calls.find((c) => c.op === 'checkout.create')!.params.subscription_data.metadata).toMatchObject({ terms_version: STORE_TERMS_VERSION, terms_accepted_at: NOW.toISOString() });
  });
});

describe('live coach payments wait for the signed coach terms', () => {
  const live = { COACH_CONNECT_PAYMENTS_ENABLED: '1', COACH_CONNECT_LIVE: '1', STRIPE_SECRET_KEY: 'rk_live_x', NEXTAUTH_URL: 'https://fel.test', COACH_PRO_ENABLED: '1' } as unknown as NodeJS.ProcessEnv;
  it('COACH_TERMS_VERSION null: Connect and Coach Pro refuse to start in live mode, with the reason', async () => {
    expect(connectGate(live)).toEqual({ ok: false, reason: 'coach_terms_unsigned' });
    expect(proGate(live)).toEqual({ ok: false, reason: 'coach_terms_unsigned' });
    const s = setup({ env: live });
    expect(await startPackageCheckout(s.deps, 'buyer-1', 'pkg-1', TICK)).toEqual({ ok: false, status: 409, error: 'store_closed', reason: 'coach_terms_unsigned' });
    expect(s.stripe.calls).toEqual([]);
  });
  it('test mode is unaffected; once signed, live opens', () => {
    expect(connectGate(ON)).toMatchObject({ ok: true, live: false });
    expect(connectGate(live, 'coach-terms-2026-11-01')).toMatchObject({ ok: true, live: true });
    expect(proGate(live, 'coach-terms-2026-11-01')).toMatchObject({ ok: true, live: true });
  });
  it('the coach\'s acceptance is kept on the Express account: at creation, and once per version after', async () => {
    const st = stripeSim();
    const acceptance = { version: 'coach-terms-unsigned-test-mode', acceptedAt: NOW.toISOString() };
    await createExpressAccount(st.api, { userId: 'coach-1', email: null, profileUrl: null, terms: acceptance });
    expect(st.calls[0].params.metadata).toEqual({ userId: 'coach-1', product: 'COACH_CONNECT', coach_terms_version: acceptance.version, coach_terms_accepted_at: acceptance.acceptedAt });
    expect(await recordCoachTerms(st.api, 'acct_new', acceptance)).toBe(false);   // same version: kept as first accepted
    expect(await recordCoachTerms(st.api, 'acct_new', { version: 'coach-terms-2026-11-01', acceptedAt: '2026-11-02T00:00:00.000Z' })).toBe(true);
    expect(st.accounts.get('acct_new').metadata).toMatchObject({ coach_terms_version: 'coach-terms-2026-11-01', coach_terms_accepted_at: '2026-11-02T00:00:00.000Z' });
  });
});

// ── 5. the platform fee ─────────────────────────────────────────────────────────────────────────────────────────────
describe('the platform fee: (plan, price, month so far) → FEL\'s share', () => {
  it('MONEY defaults are today\'s: 5% for Free and Pro, no cap, processing fee not refunded', () => {
    expect([PLATFORM_FEE_BPS_FREE_DEFAULT, PLATFORM_FEE_BPS_PRO_DEFAULT, PLATFORM_FEE_CAP_CENTS_MONTHLY_DEFAULT, REFUND_PROCESSING_FEE_DEFAULT]).toEqual([500, 500, null, false]);
    expect(platformFeePolicy({} as NodeJS.ProcessEnv)).toEqual({ bpsFree: 500, bpsPro: 500, capCentsMonthly: null });
    expect(refundProcessingFee({} as NodeJS.ProcessEnv)).toBe(false);
    // a value that is not understood is the default, never a different fee
    expect(platformFeePolicy({ PLATFORM_FEE_BPS_PRO: '5%', PLATFORM_FEE_BPS_FREE: '10001', PLATFORM_FEE_CAP_CENTS_MONTHLY: '-5' } as never)).toEqual({ bpsFree: 500, bpsPro: 500, capCentsMonthly: null });
    expect(refundProcessingFee({ REFUND_PROCESSING_FEE: 'maybe' } as never)).toBe(false);
    // with the defaults the share is exactly the old floor(P × 5%) at every price
    for (let p = 100; p <= 50_000; p += 37) {
      expect(platformFee(platformFeePolicy({} as never), 'free', p).felShareCents).toBe(Math.floor(p * 0.05));
      expect(platformFee(platformFeePolicy({} as never), 'pro', p, 999_999).felShareCents).toBe(Math.floor(p * 0.05));
      expect(saleSplit(p, STRIPE_CARD_RATE, platformFee(platformFeePolicy({} as never), 'pro', p).felShareCents)).toEqual(saleSplit(p));
    }
  });

  it('option A, keep 5% (no env): a Pro coach\'s checkout is today\'s', async () => {
    const s = setup({ plan: 'pro' });
    await startPackageCheckout(s.deps, 'buyer-1', 'pkg-1', TICK);
    expect(s.stripe.calls[0].params.payment_intent_data.application_fee_amount).toBe(999 + 629);
    expect([...s.fake.state.sales.values()][0]).toMatchObject({ feeCents: 999 });
  });

  it('option B, 0% on Pro (PLATFORM_FEE_BPS_PRO=0): a Pro coach pays no share; a Free coach still 5%; the buyer pays the same', async () => {
    const e = env({ PLATFORM_FEE_BPS_PRO: '0' });
    const pro = setup({ env: e, plan: 'pro' });
    const sale = await buy(pro);
    expect(pro.stripe.calls[0].params.payment_intent_data.application_fee_amount).toBe(629);          // the processing fee only
    expect(sale).toMatchObject({ felShare: 0, processing: 629, total: 20_628 });
    expect(pro.fake.state.sales.get(sale.saleId)).toMatchObject({ feeCents: 0 });
    expect(pro.ledger.rows).toEqual([]);                                                               // nothing booked for 0
    const free = setup({ env: e, plan: 'free' });
    await startPackageCheckout(free.deps, 'buyer-1', 'pkg-1', TICK);
    expect(free.stripe.calls[0].params.payment_intent_data.application_fee_amount).toBe(999 + 629);
    // a refund under 0%: the coach's transfer is reversed, nothing of FEL's to hand back
    const r = await refundSale(pro.refundDeps, 'coach-1', sale.saleId, null);
    expect(r).toMatchObject({ ok: true, status: 'REFUNDED' });
    expect(pro.stripe.money()).toEqual({ buyerRefunded: 19_999, coachReversed: 19_999, feeReturned: 0 });
  });

  it('option C, a monthly cap (PLATFORM_FEE_CAP_CENTS_MONTHLY): the share is what is left of it, read from the ledger', async () => {
    const e = env({ PLATFORM_FEE_CAP_CENTS_MONTHLY: '5000' });
    const s = setup({ env: e });
    const month = monthStartUtc(NOW);
    s.fake.state.ledger.push(
      { kind: 'COACH_CONNECT_FEE', metadata: { coachId: 'coach-1', feeCents: 4_900 }, createdAt: new Date(month.getTime() + 1000) },
      { kind: 'COACH_CONNECT_FEE', metadata: { coachId: 'coach-1', feeCents: 9_999 }, createdAt: new Date(month.getTime() - 1000) },   // last month
      { kind: 'COACH_CONNECT_FEE', metadata: { coachId: 'coach-2', feeCents: 9_999 }, createdAt: NOW },                                 // another coach
    );
    await startPackageCheckout(s.deps, 'buyer-1', 'pkg-1', TICK);
    expect(s.stripe.calls[0].params.payment_intent_data.application_fee_amount).toBe(100 + 629);    // 5000 − 4900 = 100 left
    expect(s.stripe.calls[0].params.payment_intent_data.metadata).toMatchObject({ felShareCents: '100', processingFeeCents: '629', totalCents: '20628' });
    // that open checkout holds its 100: a second buyer now finds the cap spent (FEL takes 0, the buyer pays the same)
    await startPackageCheckout(s.deps, 'buyer-2', 'pkg-1', TICK);
    expect(s.stripe.calls[1].params.payment_intent_data.application_fee_amount).toBe(629);
    expect([...s.fake.state.sales.values()].map((x) => x.feeCents)).toEqual([100, 0]);
  });

  it('option C: a fee handed back on a refund this month frees room again', async () => {
    const e = env({ PLATFORM_FEE_CAP_CENTS_MONTHLY: '5000' });
    const s = setup({ env: e });
    s.fake.state.ledger.push(
      { kind: 'COACH_CONNECT_FEE', metadata: { coachId: 'coach-1', feeCents: 4_900 }, createdAt: NOW },
      { kind: 'COACH_CONNECT_FEE_REFUND', metadata: { coachId: 'coach-1', feeReturnedCents: 2_000 }, createdAt: NOW },
    );
    await startPackageCheckout(s.deps, 'buyer-1', 'pkg-1', TICK);
    expect([...s.fake.state.sales.values()][0].feeCents).toBe(999);   // 5000 − 2900 = 2100 room ≥ 999
  });

  it('option C on monthly coaching: each renewal is capped on its draft, and invoice.paid books the capped share', async () => {
    const e = env({ PLATFORM_FEE_CAP_CENTS_MONTHLY: '5000' });
    const s = setup({ env: e });
    const split = saleSplit(12_000);   // F 600, X 390, T 12390, A 990
    const subMeta = { product: 'COACH_CONNECT', saleId: 'sale-m', coachId: 'coach-1', priceCents: '12000', processingFeeCents: '390', totalCents: '12390', felShareCents: '600', appFeeCents: '990' };
    s.fake.state.ledger.push({ kind: 'COACH_CONNECT_FEE', metadata: { coachId: 'coach-1', feeCents: 4_800 }, createdAt: NOW });
    const draft = { id: 'in_2', status: 'draft', billing_reason: 'subscription_cycle', total: split.totalCents, parent: { subscription_details: { metadata: subMeta } } } as unknown as Stripe.Invoice;
    expect(await connectInvoiceCreated(s.ledgerDeps, draft)).toBe('fee_set');
    const upd = s.stripe.calls.find((c) => c.op === 'invoices.update')!.params;
    expect(upd).toEqual({ id: 'in_2', application_fee_amount: 200 + 390, metadata: { felShareCents: '200', appFeeCents: '590', feeCapApplied: '1' } });
    // Stripe finalises and charges at the overridden fee; the invoice now carries the capped split in its own metadata
    s.stripe.pay('ch_in2', 'pi_in2', 12_390, 590);
    s.stripe.invoices.set('in_2', { id: 'in_2', payments: { data: [{ payment: { type: 'charge', charge: 'ch_in2' } }] } });
    const paid = { ...draft, status: 'paid', amount_paid: 12_390, metadata: upd.metadata } as unknown as Stripe.Invoice;
    expect(await connectInvoicePaid(s.ledgerDeps, paid)).toBe('fulfilled');
    expect(s.ledger.rows.at(-1)).toMatchObject({ kind: 'COACH_CONNECT_FEE', idempotencyKey: 'coach-connect-fee:in_2', metadata: { coachId: 'coach-1', feeCents: 200 } });
    expect(s.stripe.calls.some((c) => c.op === 'applicationFees.createRefund')).toBe(false);   // collected exactly 590
  });

  it('option C on a renewal whose draft was missed: invoice.paid caps it, hands the excess back and books the capped share', async () => {
    const e = env({ PLATFORM_FEE_CAP_CENTS_MONTHLY: '5000' });
    const s = setup({ env: e });
    const subMeta = { product: 'COACH_CONNECT', saleId: 'sale-m', coachId: 'coach-1', priceCents: '12000', processingFeeCents: '390', totalCents: '12390', felShareCents: '600', appFeeCents: '990' };
    s.fake.state.ledger.push({ kind: 'COACH_CONNECT_FEE', metadata: { coachId: 'coach-1', feeCents: 4_800 }, createdAt: NOW });
    s.stripe.pay('ch_in3', 'pi_in3', 12_390, 992);   // the percent fee, rounded up
    s.stripe.invoices.set('in_3', { id: 'in_3', payments: { data: [{ payment: { type: 'charge', charge: 'ch_in3' } }] } });
    const paid = { id: 'in_3', status: 'paid', billing_reason: 'subscription_cycle', amount_paid: 12_390, parent: { subscription_details: { metadata: subMeta } } } as unknown as Stripe.Invoice;
    await connectInvoicePaid(s.ledgerDeps, paid);
    expect(s.stripe.fees.get('fee_ch_in3')).toEqual({ amount: 992, refunded: 992 - 590 });
    expect(s.ledger.rows.at(-1)!.metadata).toMatchObject({ feeCents: 200 });
    // the FIRST invoice keeps the split its checkout already capped
    const first = { ...paid, id: 'in_1', billing_reason: 'subscription_create' } as unknown as Stripe.Invoice;
    s.stripe.pay('ch_in1', 'pi_in1', 12_390, 990);
    s.stripe.invoices.set('in_1', { id: 'in_1', payments: { data: [{ payment: { type: 'charge', charge: 'ch_in1' } }] } });
    await connectInvoicePaid(s.ledgerDeps, first);
    expect(s.ledger.rows.at(-1)!.metadata).toMatchObject({ feeCents: 600 });
  });

  it('no cap: the ledger is never read for the fee', async () => {
    const s = setup();
    await startPackageCheckout(s.deps, 'buyer-1', 'pkg-1', TICK);
    expect(s.fake.state.statements).not.toContain('coachFeesSince');
  });
});

// ── 4. refunding the processing fee ─────────────────────────────────────────────────────────────────────────────────
describe('REFUND_PROCESSING_FEE: the owner\'s one-line flip', () => {
  it('the math: charge refund ↔ price refund is exact both ways at every cent of a sale', () => {
    for (const price of [100, 999, 1_500, 19_999]) {
      const split = saleSplit(price);
      let last = -1;
      for (let r = 0; r <= price; r += 1) {
        const c = chargeRefundCents(split, r, true);
        expect(c).toBeGreaterThan(last);
        last = c;
        expect(priceRefundedFromCharge(split, c, true)).toBe(r);
        expect(priceRefundedFromCharge(split, chargeRefundCents(split, r, false), false)).toBe(r);
      }
      expect(chargeRefundCents(split, price, true)).toBe(split.totalCents);
      expect(priceRefundedFromCharge(split, split.totalCents, true)).toBe(price);
      expect(priceRefundedFromCharge(split, split.totalCents, false)).toBe(price);
    }
  });

  for (const flag of [false, true]) {
    describe(flag ? 'ON (refund the fee; FEL absorbs it)' : 'OFF (default: today)', () => {
      const e = env(flag ? { REFUND_PROCESSING_FEE: '1' } : {});

      it('full refund by the coach: where every cent ends', async () => {
        const s = setup({ env: e });
        const sale = await buy(s);   // P 19999, F 999, X 629, T 20628, A 1628
        const r = await refundSale(s.refundDeps, 'coach-1', sale.saleId, null);
        expect(r).toMatchObject({ ok: true, refundedCents: 19_999, status: 'REFUNDED' });
        const m = s.stripe.money();
        const coach = sale.total - sale.app - m.coachReversed + m.feeReturned;
        const fel = sale.app - stripeFeeCents(sale.total, STRIPE_CARD_RATE, 'nearest') - m.feeReturned;
        expect(coach).toBe(0);                                                         // the coach ends at 0 either way
        expect(m.buyerRefunded).toBe(flag ? 20_628 : 19_999);                          // the buyer gets the fee back only when on
        expect(fel).toBe(flag ? -stripeFeeCents(sale.total, STRIPE_CARD_RATE, 'nearest') : 629 - stripeFeeCents(20_628, STRIPE_CARD_RATE, 'nearest'));
        expect(s.fake.state.sales.get(sale.saleId)).toMatchObject({ refundedCents: 19_999, feeRefundedCents: 999, status: 'REFUNDED' });
        const kinds = s.ledger.rows.map((x) => x.kind);
        expect(kinds).toEqual(flag ? ['COACH_CONNECT_FEE', 'COACH_CONNECT_FEE_REFUND', 'COACH_CONNECT_PROCESSING_FEE_REFUND'] : ['COACH_CONNECT_FEE', 'COACH_CONNECT_FEE_REFUND']);
        if (flag) expect(s.ledger.rows[2].metadata).toMatchObject({ processingReturnedCents: 629, coachId: 'coach-1' });
        // the webhook's charge.refunded afterwards finds nothing to do
        const ch = await s.stripe.api.charges.retrieve('ch_1');
        expect(await fulfilCoachConnect(s.ledgerDeps, { id: 'evt_r', type: 'charge.refunded', data: { object: ch } } as any)).toBe('noop');
      });

      it('partial refunds (a third, then the rest), with a redelivery: the coach\'s outcome is the same as today', async () => {
        const s = setup({ env: e });
        const sale = await buy(s);
        expect(await refundSale(s.refundDeps, 'coach-1', sale.saleId, 6_666)).toMatchObject({ ok: true, refundedCents: 6_666, status: 'PARTIALLY_REFUNDED' });
        let m = s.stripe.money();
        expect(m.buyerRefunded).toBe(6_666 + (flag ? processingShareCents(629, 19_999, 6_666) : 0));
        const coachAfterThird = sale.total - sale.app - m.coachReversed + m.feeReturned;
        expect(coachAfterThird).toBe(19_999 - 999 - 6_666 + Math.floor((999 * 6_666) / 19_999));
        // Stripe redelivers the refund event: nothing moves
        const ch = await s.stripe.api.charges.retrieve('ch_1');
        expect(await fulfilCoachConnect(s.ledgerDeps, { id: 'evt_r1', type: 'charge.refunded', data: { object: ch } } as any)).toBe('noop');
        expect(await refundSale(s.refundDeps, 'coach-1', sale.saleId, null)).toMatchObject({ ok: true, refundedCents: 19_999, status: 'REFUNDED' });
        m = s.stripe.money();
        expect(m.buyerRefunded).toBe(flag ? 20_628 : 19_999);
        expect(sale.total - sale.app - m.coachReversed + m.feeReturned).toBe(0);
        expect(m.feeReturned).toBe(999 + (flag ? 629 : 0));
        expect(s.ledger.rows.filter((x) => x.kind === 'COACH_CONNECT_FEE_REFUND').reduce((n, x) => n + Number(x.metadata.feeReturnedCents), 0)).toBe(999);
      });

      it('a refund of the whole charge from the Stripe Dashboard', async () => {
        const s = setup({ env: e });
        const sale = await buy(s);
        s.stripe.dashboardRefund('ch_1', sale.total);
        const ch = await s.stripe.api.charges.retrieve('ch_1');
        expect(await fulfilCoachConnect(s.ledgerDeps, { id: 'evt_d', type: 'charge.refunded', data: { object: ch } } as any)).toBe('refunded');
        const m = s.stripe.money();
        // ON: the coach gets F + X back and ends at 0. OFF: today's rule hands back F only (the Dashboard refunded X too,
        // which the docs tell the owner not to do: refund the price only).
        expect(m.feeReturned).toBe(flag ? 999 + 629 : 999);
        if (flag) expect(sale.total - sale.app - m.coachReversed + m.feeReturned).toBe(0);
        expect(s.fake.state.sales.get(sale.saleId)).toMatchObject({ status: 'REFUNDED', refundedCents: 19_999 });
      });

      it('a partial Dashboard refund maps back to the price share it covers', async () => {
        const s = setup({ env: e });
        const sale = await buy(s);
        s.stripe.dashboardRefund('ch_1', 10_000);
        const ch = await s.stripe.api.charges.retrieve('ch_1');
        await fulfilCoachConnect(s.ledgerDeps, { id: 'evt_d2', type: 'charge.refunded', data: { object: ch } } as any);
        const priceShare = flag ? priceRefundedFromCharge({ priceCents: 19_999, processingFeeCents: 629 }, 10_000, true) : 10_000;
        expect(s.fake.state.sales.get(sale.saleId)).toMatchObject({ refundedCents: priceShare, status: 'PARTIALLY_REFUNDED' });
        expect(chargeRefundCents({ priceCents: 19_999, processingFeeCents: 629 }, priceShare, flag)).toBeLessThanOrEqual(10_000);
      });
    });
  }
});

// ── 2. account.updated ──────────────────────────────────────────────────────────────────────────────────────────────
function eventDeps(s: ReturnType<typeof setup>): EventDeps {
  return { db: s.fake.db as any, post: s.ledger.post, stripe: () => s.stripe.api };
}
const acctEvent = (account: string, object: any = { id: account }) => ({ id: 'evt_a', type: 'account.updated', account, data: { object } }) as unknown as Stripe.Event;

describe('account.updated: the coach\'s Stripe status, as Stripe has it now', () => {
  it('re-reads the account (an older event cannot overwrite a newer state) and keeps requirements due', async () => {
    const s = setup();
    s.stripe.accounts.set('acct_coach-1', { id: 'acct_coach-1', charges_enabled: true, payouts_enabled: false, details_submitted: true, requirements: { currently_due: ['external_account'], past_due: [], disabled_reason: null } });
    const stale = { id: 'acct_coach-1', charges_enabled: false, payouts_enabled: false, details_submitted: false };
    expect(await coachConnectEvent(eventDeps(s), acctEvent('acct_coach-1', stale))).toBe('account_updated');
    expect(s.fake.state.connect.get('coach-1')).toMatchObject({ chargesEnabled: true, payoutsEnabled: false, detailsSubmitted: true, requirementsDue: true });
    expect(needsStripeSetup(s.fake.state.connect.get('coach-1') as any)).toBe(true);
    s.stripe.accounts.set('acct_coach-1', { id: 'acct_coach-1', charges_enabled: true, payouts_enabled: true, details_submitted: true, requirements: { currently_due: [], past_due: [], disabled_reason: null } });
    await coachConnectEvent(eventDeps(s), acctEvent('acct_coach-1'));
    expect(s.fake.state.connect.get('coach-1')).toMatchObject({ payoutsEnabled: true, requirementsDue: false });
    expect(needsStripeSetup(s.fake.state.connect.get('coach-1') as any)).toBe(false);
  });

  it('before the payments-ready SQL: the three flags as before, no requirements column touched', async () => {
    const s = setup({ paymentsReady: false });
    s.stripe.accounts.set('acct_coach-1', { id: 'acct_coach-1', charges_enabled: false, payouts_enabled: false, details_submitted: true, requirements: { currently_due: ['x'] } });
    expect(await coachConnectEvent(eventDeps(s), acctEvent('acct_coach-1'))).toBe('account_updated');
    expect(s.fake.state.connect.get('coach-1')).toMatchObject({ chargesEnabled: false, detailsSubmitted: true });
    expect(s.fake.state.statements).not.toContain('updateConnectDue');
  });

  it('an account that is not a coach\'s, or tables not there: not ours (null), nothing written', async () => {
    const s = setup();
    expect(await coachConnectEvent(eventDeps(s), acctEvent('acct_someone_else'))).toBeNull();
    resetBusinessProbe();
    const n = setup();
    n.fake.state.ready = false;
    expect(await coachConnectEvent(eventDeps(n), acctEvent('acct_coach-1'))).toBeNull();
  });
});

// ── 2. disputes ─────────────────────────────────────────────────────────────────────────────────────────────────────
const dispute = (o: Partial<Record<string, any>> = {}) => ({
  id: 'dp_1', object: 'dispute', amount: 20_628, charge: 'ch_1', payment_intent: 'pi_1', reason: 'fraudulent', status: 'needs_response', livemode: false,
  balance_transactions: [], ...o,
});
const disputeEvent = (type: string, d: any, id = `evt_${type}`) => ({ id, type, data: { object: d } }) as unknown as Stripe.Event;
const WITHDRAWN = [{ id: 'txn_w', amount: -20_628, fee: 1_500, net: -22_128, reporting_category: 'dispute' }];
const REINSTATED = [...WITHDRAWN, { id: 'txn_r', amount: 20_628, fee: 0, net: 20_628, reporting_category: 'dispute_reversal' }];

describe('disputes on a coach\'s sale', () => {
  it('created (with the withdrawal): recorded on the sale, the coach\'s notice, FEL\'s ledger debited once; redelivery and funds_withdrawn add nothing', async () => {
    const s = setup();
    const sale = await buy(s);
    const d = dispute({ balance_transactions: WITHDRAWN });
    expect(await coachConnectEvent(eventDeps(s), disputeEvent('charge.dispute.created', d))).toBe('dispute_recorded');
    expect(s.fake.state.disputes.get('dp_1')).toMatchObject({ saleId: sale.saleId, coachId: 'coach-1', chargeId: 'ch_1', amountCents: 20_628, reason: 'fraudulent', outcome: 'OPEN', withdrawnCents: 22_128 });
    const w = s.ledger.rows.filter((x) => x.kind === 'COACH_CONNECT_DISPUTE_WITHDRAWN');
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ idempotencyKey: 'coach-connect-dispute-withdrawn:dp_1', postings: [{ type: 'EXTERNAL', amount: -22_128 }, { type: 'PLATFORM_REVENUE', amount: 22_128 }], metadata: { saleId: sale.saleId, coachId: 'coach-1', disputeId: 'dp_1' } });
    await coachConnectEvent(eventDeps(s), disputeEvent('charge.dispute.created', d, 'evt_again'));
    expect(await coachConnectEvent(eventDeps(s), disputeEvent('charge.dispute.funds_withdrawn', d))).toBe('dispute_noop');
    expect(s.ledger.rows.filter((x) => x.kind === 'COACH_CONNECT_DISPUTE_WITHDRAWN')).toHaveLength(1);
    expect(s.fake.state.disputes.size).toBe(1);
    // the sale's own status and refund record are untouched (a dispute is not a refund)
    expect(s.fake.state.sales.get(sale.saleId)).toMatchObject({ status: 'PAID', refundedCents: 0 });
  });

  it('won: funds reinstated are booked back once; the outcome closes and an older "updated" never reopens it', async () => {
    const s = setup();
    await buy(s);
    await coachConnectEvent(eventDeps(s), disputeEvent('charge.dispute.created', dispute({ balance_transactions: WITHDRAWN })));
    expect(await coachConnectEvent(eventDeps(s), disputeEvent('charge.dispute.funds_reinstated', dispute({ status: 'won', balance_transactions: REINSTATED })))).toBe('dispute_closed');
    expect(await coachConnectEvent(eventDeps(s), disputeEvent('charge.dispute.closed', dispute({ status: 'won', balance_transactions: REINSTATED })))).toBe('dispute_noop');
    expect(s.fake.state.disputes.get('dp_1')).toMatchObject({ outcome: 'WON', stripeStatus: 'won', withdrawnCents: 22_128, reinstatedCents: 20_628 });
    expect(s.ledger.rows.filter((x) => x.kind === 'COACH_CONNECT_DISPUTE_REINSTATED')).toEqual([expect.objectContaining({ postings: [{ type: 'EXTERNAL', amount: 20_628 }, { type: 'PLATFORM_REVENUE', amount: -20_628 }] })]);
    await coachConnectEvent(eventDeps(s), disputeEvent('charge.dispute.updated', dispute({ status: 'under_review', balance_transactions: WITHDRAWN }), 'evt_late'));
    expect(s.fake.state.disputes.get('dp_1')).toMatchObject({ outcome: 'WON' });
  });

  it('lost: the outcome is LOST and the withdrawal stays booked (no money moves from the coach here: owner call)', async () => {
    const s = setup();
    await buy(s);
    await coachConnectEvent(eventDeps(s), disputeEvent('charge.dispute.created', dispute({ balance_transactions: WITHDRAWN })));
    expect(await coachConnectEvent(eventDeps(s), disputeEvent('charge.dispute.closed', dispute({ status: 'lost', balance_transactions: WITHDRAWN })))).toBe('dispute_closed');
    expect(s.fake.state.disputes.get('dp_1')).toMatchObject({ outcome: 'LOST' });
    expect(s.stripe.calls.filter((c) => /transfer|refunds/.test(c.op))).toEqual([]);
  });

  it('a monthly renewal\'s dispute is traced through its invoice to the sale', async () => {
    const s = setup({ kind: 'monthly', priceCents: 12_000 });
    s.fake.state.sales.set('sale-m', { id: 'sale-m', packageId: 'pkg-1', coachId: 'coach-1', buyerId: 'b', kind: 'monthly', status: 'ACTIVE', amountCents: 12_000, feeCents: 600, refundedCents: 0, feeRefundedCents: 0, subscriptionId: 'sub_1', paymentIntentId: null });
    s.stripe.charges.set('ch_r', { amount: 12_390, refunded: 0, fee: 'fee_r', pi: 'pi_renewal', metadata: {} });
    s.stripe.invoicePayments.set('pi_renewal', 'in_r');
    s.stripe.invoices.set('in_r', { id: 'in_r', parent: { subscription_details: { subscription: 'sub_1', metadata: { product: 'COACH_CONNECT', saleId: 'sale-m' } } } });
    expect(await coachConnectEvent(eventDeps(s), disputeEvent('charge.dispute.created', dispute({ id: 'dp_m', charge: 'ch_r', payment_intent: 'pi_renewal', amount: 12_390 })))).toBe('dispute_recorded');
    expect(s.fake.state.disputes.get('dp_m')).toMatchObject({ saleId: 'sale-m', coachId: 'coach-1' });
  });

  it('a dispute that is not a coach sale is not ours (the coach store and FEL Pro paths run as before)', async () => {
    const s = setup();
    s.stripe.charges.set('ch_other', { amount: 600, refunded: 0, fee: '', pi: 'pi_other', metadata: { product: 'COACH_STORE', rowId: 'b1' } });
    expect(await coachConnectEvent(eventDeps(s), disputeEvent('charge.dispute.created', dispute({ id: 'dp_x', charge: 'ch_other', payment_intent: 'pi_other' })))).toBeNull();
    expect(s.fake.state.disputes.size).toBe(0);
    expect(s.ledger.rows).toEqual([]);
    // and with the coach-business tables not applied, nothing is asked at all
    resetBusinessProbe();
    const n = setup();
    n.fake.state.ready = false;
    expect(await coachConnectEvent(eventDeps(n), disputeEvent('charge.dispute.created', dispute()))).toBeNull();
    expect(n.stripe.calls).toEqual([]);
  });

  it('before the payments-ready SQL: no row, but FEL\'s ledger is still booked, once', async () => {
    const s = setup({ paymentsReady: false });
    await buy(s);
    expect(await coachConnectEvent(eventDeps(s), disputeEvent('charge.dispute.created', dispute({ balance_transactions: WITHDRAWN })))).toBe('dispute_recorded');
    await coachConnectEvent(eventDeps(s), disputeEvent('charge.dispute.funds_withdrawn', dispute({ balance_transactions: WITHDRAWN })));
    expect(s.fake.state.disputes.size).toBe(0);
    expect(s.ledger.rows.filter((x) => x.kind === 'COACH_CONNECT_DISPUTE_WITHDRAWN')).toHaveLength(1);
  });

  it('the pure parts: Stripe status → outcome; funds from the balance transactions', () => {
    expect(['won', 'warning_closed', 'lost', 'needs_response', 'under_review'].map(disputeOutcome)).toEqual(['WON', 'WON', 'LOST', 'OPEN', 'OPEN']);
    expect(disputeFunds(dispute({ balance_transactions: REINSTATED }) as any, 'charge.dispute.closed')).toEqual({ withdrawnCents: 22_128, reinstatedCents: 20_628 });
    expect(disputeFunds(dispute() as any, 'charge.dispute.funds_withdrawn')).toEqual({ withdrawnCents: 20_628, reinstatedCents: 0 });
    expect(disputeFunds(dispute() as any, 'charge.dispute.created')).toEqual({ withdrawnCents: 0, reinstatedCents: 0 });
  });
});
