// COACH-FEE-PASSTHROUGH (owner, 2026-10-25: "5% + Stripe fee on top"; Coach Pro $39/month; Free = 3 clients).
// The split of a coach's sale across every price from $1 to $500, its rounding under every way Stripe could round,
// refunds (partial and full), monthly coaching (the first invoice's true-up and each renewal's exact fee), the closed
// switches (no Stripe call), and the one Coach Pro price behind every place it shows.
import { STORE_TERMS_VERSION } from '@/lib/store-terms';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  feeExcessCents, feeRefundDue, feeReturnedCents, felNetCents, felShareCents, grossUpCents, percentFeeCents, refundStep,
  saleSplit, STRIPE_CARD_RATE, stripeFeeCents, subscriptionFeePercent, type Rounding,
} from '@/lib/coach-business/fees';
import { COACH_PRO_PRICE_DEFAULT_CENTS, FREE_CLIENT_LIMIT_DEFAULT, STRIPE_CARD_FEE_BPS, STRIPE_CARD_FEE_FIXED_CENTS, coachFreeClientLimit, coachProPriceCents } from '@/lib/coach-business/config';
import { checkoutParams, connectGate } from '@/lib/coach-business/connect';
import { connectInvoiceCreated, connectInvoicePaid, fulfilCoachConnect, metaSplit, type ConnectDeps } from '@/lib/coach-business/webhook';
import { refundSale, startPackageCheckout } from '@/lib/coach-business/service';
import { proCheckoutParams, proGate } from '@/lib/coach-business/pro';
import { resetBusinessProbe } from '@/lib/coach-business/store';
import { STRIPE_PRODUCTS } from '@/lib/stripe';
import { b2bPaywall } from '@/lib/pro-guard';
import { FeeBreakdown } from '@/components/coach-business/fee-breakdown';
import { fakeCoachBusinessDb, fakeLedger, seedCoach } from '@/tests/helpers/fakeCoachBusinessDb';

const ROUNDINGS: Rounding[] = ['up', 'nearest', 'down'];
const DOLLAR = 100;
const FIVE_HUNDRED = 50_000;
const NOW = new Date('2026-10-25T18:00:00Z');

describe('the rate lives in config, once', () => {
  it("is Stripe's US card rate, 2.9% + 30¢ (assumption), and fees.ts reads it from there", () => {
    expect(STRIPE_CARD_FEE_BPS).toBe(290);
    expect(STRIPE_CARD_FEE_FIXED_CENTS).toBe(30);
    expect(STRIPE_CARD_RATE).toEqual({ bps: 290, fixedCents: 30 });
  });
});

describe('every price from $1 to $500: FEL nets 5% ± 1¢ after Stripe, the coach exactly price − 5%, nothing negative', () => {
  it('holds for every cent, under every way Stripe could round its fee', () => {
    const bad: string[] = [];
    for (let p = DOLLAR; p <= FIVE_HUNDRED; p += 1) {
      const s = saleSplit(p);
      if (s.totalCents !== p + s.processingFeeCents) bad.push(`${p}: total`);
      if (s.coachNetCents !== p - felShareCents(p) || s.totalCents - s.applicationFeeCents !== s.coachNetCents) bad.push(`${p}: coach`);
      if (s.applicationFeeCents !== s.felShareCents + s.processingFeeCents || s.applicationFeeCents > s.totalCents) bad.push(`${p}: app fee`);
      for (const r of ROUNDINGS) {
        const net = felNetCents(s, STRIPE_CARD_RATE, r);
        const off = net - p * 0.05;
        if (net < 0 || off <= -1 || off > 1) bad.push(`${p} ${r}: FEL nets ${net} vs ${p * 0.05}`);
        if (net < s.felShareCents) bad.push(`${p} ${r}: under 5% floor`);
      }
      if (s.processingFeeCents < stripeFeeCents(s.totalCents, STRIPE_CARD_RATE, 'nearest')) bad.push(`${p}: fee short`);
    }
    expect(bad).toEqual([]);
  });

  it('the buyer pays the least that works: one cent less and Stripe (rounding up) would eat into the price', () => {
    const bad: number[] = [];
    for (let p = DOLLAR; p <= FIVE_HUNDRED; p += 1) {
      const t = grossUpCents(p);
      if (t - stripeFeeCents(t) !== p || (t - 1) - stripeFeeCents(t - 1) >= p) bad.push(p);
    }
    expect(bad).toEqual([]);
  });

  it('the old model went negative below about $14; this one never does', () => {
    const oldNet = (p: number) => felShareCents(p) - stripeFeeCents(p, STRIPE_CARD_RATE, 'nearest');
    expect(oldNet(1_000)).toBeLessThan(0);
    expect(oldNet(1_400)).toBeLessThan(0);
    expect(oldNet(1_500)).toBeGreaterThanOrEqual(0);
    expect(felNetCents(saleSplit(1_000))).toBe(50);
    expect(felNetCents(saleSplit(DOLLAR))).toBe(5);
  });
});

describe('rounding', () => {
  it('Stripe fee examples: the percentage rounds up, to nearest, or down; 30¢ on top', () => {
    expect(stripeFeeCents(1_000)).toBe(59);                                // 29.0 + 30
    expect(stripeFeeCents(1_017, STRIPE_CARD_RATE, 'up')).toBe(60);        // 29.493 → 30
    expect(stripeFeeCents(1_017, STRIPE_CARD_RATE, 'nearest')).toBe(59);   // 29.493 → 29
    expect(stripeFeeCents(1_017, STRIPE_CARD_RATE, 'down')).toBe(59);
    expect(stripeFeeCents(5_000 + 181, STRIPE_CARD_RATE, 'nearest')).toBe(180);  // 150.249 → 150
  });

  it('the owner-facing table: $5, $15, $50, $100, $500', () => {
    const row = (p: number) => {
      const s = saleSplit(p);
      return [s.totalCents, stripeFeeCents(s.totalCents, STRIPE_CARD_RATE, 'nearest'), felNetCents(s), s.coachNetCents];
    };
    // [buyer total, Stripe fee, FEL net, coach net]
    expect(row(500)).toEqual([546, 46, 25, 475]);
    expect(row(1_500)).toEqual([1_576, 76, 75, 1_425]);
    expect(row(5_000)).toEqual([5_181, 180, 251, 4_750]);
    expect(row(10_000)).toEqual([10_330, 330, 500, 9_500]);
    expect(row(50_000)).toEqual([51_525, 1_524, 2_501, 47_500]);
  });

  it('FEL\'s 5% rounds down, so the coach keeps the fraction', () => {
    expect(saleSplit(19_999)).toMatchObject({ felShareCents: 999, coachNetCents: 19_000, processingFeeCents: 629, totalCents: 20_628 });
    expect(saleSplit(101)).toMatchObject({ felShareCents: 5, coachNetCents: 96 });
  });

  it('no float reaches Stripe: every amount is a whole number of cents', () => {
    for (const p of [100, 333, 1_999, 12_345, 49_999]) {
      for (const v of Object.values(saleSplit(p))) expect(Number.isSafeInteger(v)).toBe(true);
    }
    expect(() => saleSplit(10.5)).toThrow();
    expect(() => saleSplit(-1)).toThrow();
  });
});

describe('refunds: the listed price comes back, FEL hands back its 5% share exactly, the processing fee stays with Stripe', () => {
  it('a full refund leaves the coach at 0 and FEL at 0 or 1¢, at every price', () => {
    const bad: number[] = [];
    for (let p = DOLLAR; p <= FIVE_HUNDRED; p += 7) {
      const s = saleSplit(p);
      const coach = s.coachNetCents - p + feeReturnedCents(s.felShareCents, p, p);   // transfer reversed by p, share back
      const fel = felNetCents(s) - feeReturnedCents(s.felShareCents, p, p);
      if (coach !== 0 || fel < 0 || fel > 1) bad.push(p);
    }
    expect(bad).toEqual([]);
  });

  it('partial refunds hand back the same share, and add up to one full refund', () => {
    const s = saleSplit(19_999);
    expect(feeReturnedCents(s.felShareCents, 19_999, 4_000)).toBe(199);
    let before = 0; let back = 0;
    for (const step of [4_000, 5_999, 10_000]) {
      back += refundStep(s.felShareCents, 19_999, before, before + step).feeDelta;
      before += step;
    }
    expect(back).toBe(999);
  });

  it('the hand-back is state-based: what Stripe already refunded on the fee is never paid again', () => {
    expect(feeRefundDue(249, 0)).toBe(249);
    expect(feeRefundDue(249, 249)).toBe(0);
    expect(feeRefundDue(999, 249)).toBe(750);
    expect(feeRefundDue(249, 999)).toBe(0);
  });
});

// ── monthly coaching ────────────────────────────────────────────────────────────────────────────────────────────────
describe('subscriptions: the percent never under-takes, and the true-up lands every invoice on exactly 5% + fee', () => {
  it('for every price, the first invoice takes at least A (any rounding), at most a few cents more, and the excess goes back', () => {
    const bad: string[] = [];
    let worst = 0;
    for (let p = DOLLAR; p <= FIVE_HUNDRED; p += 1) {
      const s = saleSplit(p);
      const pct = subscriptionFeePercent(s);
      if (Math.round(pct * 100) !== pct * 100 && Math.abs(Math.round(pct * 100) - pct * 100) > 1e-9) bad.push(`${p}: >2 decimals`);
      for (const r of ROUNDINGS) {
        const taken = percentFeeCents(s.totalCents, pct, r);
        if (taken < s.applicationFeeCents) bad.push(`${p} ${r}: took ${taken} < ${s.applicationFeeCents}`);
        const kept = taken - feeExcessCents(taken, s.applicationFeeCents);
        if (kept !== s.applicationFeeCents) bad.push(`${p} ${r}: after true-up ${kept}`);
        worst = Math.max(worst, taken - s.applicationFeeCents);
      }
    }
    expect(bad).toEqual([]);
    expect(worst).toBeLessThanOrEqual(7);   // ≤ total / 10 000 + 1¢ of overshoot, handed back on invoice.paid
  });
});

function feeStripe(opts: { collected?: number; feeId?: string | null } = {}) {
  const calls: { op: string; args: any[] }[] = [];
  const refunded = new Map<string, number>();
  const api = {
    invoices: {
      retrieve: async (...args: any[]) => { calls.push({ op: 'invoices.retrieve', args }); return { id: args[0], payments: { data: [{ payment: { charge: 'ch_inv' } }] } }; },
      update: async (...args: any[]) => { calls.push({ op: 'invoices.update', args }); return {}; },
    },
    charges: { retrieve: async (...args: any[]) => { calls.push({ op: 'charges.retrieve', args }); return { id: 'ch_inv', application_fee: opts.feeId === undefined ? 'fee_inv' : opts.feeId, application_fee_amount: opts.collected ?? 0 }; } },
    paymentIntents: { retrieve: async () => { throw new Error('not expected'); } },
    applicationFees: {
      retrieve: async (id: string) => ({ id, amount: opts.collected ?? 0, amount_refunded: refunded.get(id) ?? 0 }),
      createRefund: async (id: string, params: any, o: any) => { calls.push({ op: 'applicationFees.createRefund', args: [id, params, o] }); refunded.set(id, (refunded.get(id) ?? 0) + params.amount); return {}; },
    },
  };
  return { api: api as any, calls, refunded: (id = 'fee_inv') => refunded.get(id) ?? 0 };
}

function monthlyMeta(priceCents: number) {
  const s = saleSplit(priceCents);
  return {
    split: s,
    meta: { product: 'COACH_CONNECT', saleId: 'sale-m', priceCents: String(s.priceCents), processingFeeCents: String(s.processingFeeCents), totalCents: String(s.totalCents), felShareCents: String(s.felShareCents), appFeeCents: String(s.applicationFeeCents) },
  };
}

const invoice = (o: Record<string, unknown>) => o as unknown as Stripe.Invoice;

describe('subscriptions through the webhook', () => {
  it('the split is read back from the invoice\'s subscription metadata', () => {
    const { meta, split } = monthlyMeta(12_000);
    expect(metaSplit(meta)).toEqual({ priceCents: 12_000, totalCents: split.totalCents, felShareCents: 600, appFeeCents: split.applicationFeeCents });
    expect(metaSplit({ product: 'COACH_CONNECT', saleId: 's' })).toBeNull();
  });

  it('invoice.created on a renewal draft sets application_fee_amount to A exactly; the first invoice, a finalised one or another total is left alone', async () => {
    const { meta, split } = monthlyMeta(12_000);
    const stripe = feeStripe();
    const deps: ConnectDeps = { db: {} as any, post: async () => {}, stripe: () => stripe.api };
    const base = { id: 'in_2', status: 'draft', billing_reason: 'subscription_cycle', total: split.totalCents, parent: { subscription_details: { metadata: meta } } };
    expect(await connectInvoiceCreated(deps, invoice(base))).toBe('fee_set');
    expect(stripe.calls).toEqual([{ op: 'invoices.update', args: ['in_2', { application_fee_amount: split.applicationFeeCents }] }]);
    expect(await connectInvoiceCreated(deps, invoice({ ...base, billing_reason: 'subscription_create' }))).toBe('noop');
    expect(await connectInvoiceCreated(deps, invoice({ ...base, status: 'open' }))).toBe('noop');
    expect(await connectInvoiceCreated(deps, invoice({ ...base, total: split.totalCents - 500 }))).toBe('noop');
    expect(stripe.calls).toHaveLength(1);
    // routed through the webhook's entry point
    expect(await fulfilCoachConnect(deps, { id: 'evt', type: 'invoice.created', data: { object: base } } as any)).toBe('fee_set');
  });

  it('invoice.paid: the first invoice\'s excess fee goes back to the coach once, and FEL books 5% of the price', async () => {
    const { meta, split } = monthlyMeta(50_000);
    const taken = percentFeeCents(split.totalCents, subscriptionFeePercent(split), 'nearest');
    expect(taken).toBeGreaterThan(split.applicationFeeCents);
    const stripe = feeStripe({ collected: taken });
    const ledger = fakeLedger();
    const deps: ConnectDeps = { db: {} as any, post: ledger.post, stripe: () => stripe.api };
    const inv = invoice({ id: 'in_1', amount_paid: split.totalCents, billing_reason: 'subscription_create', parent: { subscription_details: { metadata: meta } } });
    expect(await connectInvoicePaid(deps, inv)).toBe('fulfilled');
    expect(await connectInvoicePaid(deps, inv)).toBe('fulfilled');   // redelivered
    expect(stripe.refunded()).toBe(taken - split.applicationFeeCents);
    expect(stripe.calls.filter((c) => c.op === 'applicationFees.createRefund')).toHaveLength(1);
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.revenue()).toBe(2_500);
  });

  it('a renewal already at A: nothing to hand back, 5% booked', async () => {
    const { meta, split } = monthlyMeta(12_000);
    const stripe = feeStripe({ collected: split.applicationFeeCents });
    const ledger = fakeLedger();
    await connectInvoicePaid({ db: {} as any, post: ledger.post, stripe: () => stripe.api }, invoice({ id: 'in_3', amount_paid: split.totalCents, parent: { subscription_details: { metadata: meta } } }));
    expect(stripe.calls.some((c) => c.op === 'applicationFees.createRefund')).toBe(false);
    expect(ledger.revenue()).toBe(600);
  });

  it('a different total (a proration): 5% of the coaching part is booked, and the fee is left as Stripe took it', async () => {
    const { meta, split } = monthlyMeta(12_000);
    const stripe = feeStripe({ collected: 999 });
    const ledger = fakeLedger();
    await connectInvoicePaid({ db: {} as any, post: ledger.post, stripe: () => stripe.api }, invoice({ id: 'in_4', amount_paid: Math.floor(split.totalCents / 2), parent: { subscription_details: { metadata: meta } } }));
    expect(stripe.calls).toEqual([]);
    expect(ledger.revenue()).toBe(felShareCents(Math.floor((Math.floor(split.totalCents / 2) * 12_000) / split.totalCents)));
  });

  it('an excess with no application fee id throws, so Stripe retries rather than the coach losing it', async () => {
    const { meta, split } = monthlyMeta(50_000);
    const stripe = feeStripe({ collected: split.applicationFeeCents + 4, feeId: null });
    await expect(connectInvoicePaid({ db: {} as any, post: async () => {}, stripe: () => stripe.api }, invoice({ id: 'in_5', amount_paid: split.totalCents, parent: { subscription_details: { metadata: meta } } }))).rejects.toThrow();
  });
});

// ── the switches ────────────────────────────────────────────────────────────────────────────────────────────────────
const trap = <T,>(what: string): T => new Proxy({}, { get: (_t, p) => { if (p === 'then') return undefined; throw new Error(`${what}.${String(p)} touched`); } }) as T;

describe('every switch off: no Stripe call', () => {
  beforeEach(() => resetBusinessProbe());
  const CLOSED: [string, NodeJS.ProcessEnv][] = [
    ['all off', {} as NodeJS.ProcessEnv],
    ['payments off, a test key and a site URL', { STRIPE_SECRET_KEY: 'sk_test_x', NEXTAUTH_URL: 'https://fel.test' } as unknown as NodeJS.ProcessEnv],
    ['payments on, a live key, live off', { COACH_CONNECT_PAYMENTS_ENABLED: '1', STRIPE_SECRET_KEY: 'sk_live_x', NEXTAUTH_URL: 'https://fel.test' } as unknown as NodeJS.ProcessEnv],
  ];
  for (const [name, env] of CLOSED) {
    it(`${name}: checkout and refund refuse before the database or Stripe`, async () => {
      expect(connectGate(env).ok).toBe(false);
      const deps = { db: trap('db'), stripe: () => trap('stripe'), env, now: NOW, isAdult: async () => true, plan: async () => 'pro' as const, ensureCustomer: async () => trap<string>('customer'), coachSlug: async () => 'c' };
      expect(await startPackageCheckout(deps as any, 'b', 'pkg-1')).toMatchObject({ ok: false, status: 409, error: 'store_closed' });
      expect(await refundSale({ db: trap('db'), stripe: () => trap('stripe'), env, ledger: trap('ledger') } as any, 'coach-1', 'sale-1', null)).toMatchObject({ ok: false, status: 409, error: 'store_closed' });
    });
  }

  it('Coach Pro off: the upgrade gate is closed whatever the price', () => {
    expect(proGate({ STRIPE_SECRET_KEY: 'sk_test_x', NEXTAUTH_URL: 'https://fel.test' } as any)).toEqual({ ok: false, reason: 'pro_off' });
    expect(proGate({ COACH_PRO_ENABLED: '1', STRIPE_SECRET_KEY: 'sk_live_x', NEXTAUTH_URL: 'https://fel.test' } as any)).toEqual({ ok: false, reason: 'live_mode_off' });
  });

  // test changed (payments-ready): the checkout now needs the buyer's store-terms tick, so the call passes it.
  it('switches on (test key): the checkout reaches Stripe with the grossed-up split', async () => {
    const env = { COACH_CONNECT_PAYMENTS_ENABLED: '1', STRIPE_SECRET_KEY: 'sk_test_x', NEXTAUTH_URL: 'https://fel.test' } as unknown as NodeJS.ProcessEnv;
    const fake = fakeCoachBusinessDb();
    seedCoach(fake.state, { priceCents: 1_500 });
    const made: any[] = [];
    const stripe = { checkout: { sessions: { create: async (p: any) => { made.push(p); return { id: 'cs_test_0123456789abc', url: 'u' }; } } } };
    // test changed (owner-approvals, 2026-10-27): the coach was on 'pro'; Pro's default share is 0% now (owner, "0% on
    // Pro"), so the 5% split this test holds is a Free coach's. The assertions are unchanged.
    const r = await startPackageCheckout({ db: fake.db as any, stripe: () => stripe as any, env, now: NOW, isAdult: async () => true, plan: async () => 'free', ensureCustomer: async () => 'cus', coachSlug: async () => 'c' }, 'b', 'pkg-1', { termsAccepted: true, termsVersion: STORE_TERMS_VERSION });
    expect(r).toMatchObject({ ok: true });
    expect(made[0].payment_intent_data.application_fee_amount).toBe(75 + 76);
    expect(made[0].line_items.map((l: any) => l.price_data.unit_amount)).toEqual([1_500, 76]);
    expect([...fake.state.sales.values()][0]).toMatchObject({ amountCents: 1_500, feeCents: 75 });
  });
});

// ── the prices ──────────────────────────────────────────────────────────────────────────────────────────────────────
describe('Coach Pro $39 and Free = 3: one value drives every place', () => {
  const saved = process.env.COACH_PRO_PRICE_USD_CENTS;
  afterEach(() => { if (saved === undefined) delete process.env.COACH_PRO_PRICE_USD_CENTS; else process.env.COACH_PRO_PRICE_USD_CENTS = saved; });

  it('defaults: $39 and 3 clients', () => {
    expect(COACH_PRO_PRICE_DEFAULT_CENTS).toBe(3_900);
    expect(FREE_CLIENT_LIMIT_DEFAULT).toBe(3);
    expect(coachProPriceCents({} as NodeJS.ProcessEnv)).toBe(3_900);
    expect(coachFreeClientLimit({} as NodeJS.ProcessEnv)).toBe(3);
  });

  it('unset: the upgrade, /api/stripe/checkout FEL_COACH and the paywall all say $39', () => {
    delete process.env.COACH_PRO_PRICE_USD_CENTS;
    expect(STRIPE_PRODUCTS.FEL_COACH.priceUsd).toBe(3_900);
    expect(b2bPaywall('Camp', 'coach', 'x').message).toBe('Camp is part of FEL Coach ($39/month).');
    const gate = proGate({ COACH_PRO_ENABLED: '1', STRIPE_SECRET_KEY: 'sk_test_x', NEXTAUTH_URL: 'https://fel.test' } as any);
    expect(gate).toMatchObject({ ok: true, priceCents: 3_900 });
    expect((proCheckoutParams({ userId: 'u', customerId: 'c', priceCents: (gate as any).priceCents, origin: 'o' }).line_items![0] as any).price_data.unit_amount).toBe(3_900);
  });

  it('set to $49.50: every place follows; Facility is untouched', () => {
    process.env.COACH_PRO_PRICE_USD_CENTS = '4950';
    expect(STRIPE_PRODUCTS.FEL_COACH.priceUsd).toBe(4_950);
    expect(b2bPaywall('Camp', 'coach', 'x').message).toBe('Camp is part of FEL Coach ($49.50/month).');
    expect(proGate({ ...process.env, COACH_PRO_ENABLED: '1', STRIPE_SECRET_KEY: 'sk_test_x', NEXTAUTH_URL: 'https://fel.test' } as any)).toMatchObject({ priceCents: 4_950 });
    expect(STRIPE_PRODUCTS.FEL_FACILITY.priceUsd).toBe(19_900);
    expect(b2bPaywall('CRM', 'facility', 'x').message).toBe('CRM is part of FEL Facility ($199/month).');
  });
});

// ── what the buyer sees ─────────────────────────────────────────────────────────────────────────────────────────────
describe('the itemised total before Checkout', () => {
  it('shows price, processing fee and total, matching what Checkout charges', () => {
    const html = renderToStaticMarkup(createElement(FeeBreakdown, { priceCents: 5_000, kind: 'session_pack' }));
    expect(html).toContain('data-fee-breakdown');
    expect(html).toMatch(/data-line="price">\$50\.00</);
    expect(html).toMatch(/data-line="processing">\$1\.81</);
    expect(html).toMatch(/data-line="total">\$51\.81</);
    const monthly = renderToStaticMarkup(createElement(FeeBreakdown, { priceCents: 12_000, kind: 'monthly' }));
    expect(monthly).toMatch(/data-line="total">\$123\.90 \/ month</);
    const p = checkoutParams({
      pkg: { id: 'p', coachId: 'c', kind: 'session_pack', title: 'Pack', summary: '', priceCents: 5_000, includes: ['x'], capacity: null, sessions: 4, active: true, sortOrder: 0 },
      saleId: 's', buyerId: 'b', customerId: 'cus', coachSlug: 'c', destination: 'acct', split: saleSplit(5_000), origin: 'https://fel.test', now: NOW,
    });
    expect((p.line_items as any[]).reduce((n, l) => n + l.price_data.unit_amount, 0)).toBe(5_181);
  });
});
