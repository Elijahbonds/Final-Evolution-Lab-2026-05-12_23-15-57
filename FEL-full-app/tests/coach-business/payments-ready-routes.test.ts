// PAYMENTS-READY (2026-10-26): the HTTP routes.
//   · /api/stripe/webhook verifies with the platform secret OR the connected-accounts secret (real Stripe signatures,
//     computed offline by the SDK; no network), routes account.updated and disputes to the coach business first, and
//     leaves every other connected-account event alone;
//   · POST /api/coach/business/connect needs the coach's terms tick before any Stripe call, and keeps it on the account;
//   · POST /api/coach/business/checkout answers 409 terms_required without the buyer's tick.
import Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeCoachBusinessDb, fakeLedger, seedCoach } from '@/tests/helpers/fakeCoachBusinessDb';

const h = vi.hoisted(() => ({
  session: { user: { id: 'coach-1' } } as any,
  prisma: null as any,
  stripe: null as any,
  deps: null as any,
}));
const trap = (what: string) => new Proxy({}, { get: (_t, p) => { if (p === 'then') return undefined; throw new Error(`${what}.${String(p)} touched`); } });

vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ ok: true, retryAfterSec: 0 }) }));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : (h.prisma ?? trap('prisma'))[p]) }) }));
vi.mock('@/lib/stripe', () => ({ getStripe: () => h.stripe, STRIPE_PRODUCTS: {}, PLATFORM_TAKE_RATE: 0.15 }));
vi.mock('@/lib/books/bookStore', () => ({ bookTablesReady: () => false, prismaBookStore: () => ({}) }));
vi.mock('@/lib/coach-business/server', async (orig) => ({ ...(await orig<object>()), prismaConnectDeps: () => h.deps }));

import { POST as webhook } from '@/app/api/stripe/webhook/route';
import { GET as connectGet, POST as connectPost } from '@/app/api/coach/business/connect/route';
import { POST as checkout } from '@/app/api/coach/business/checkout/route';
import { resetBusinessProbe } from '@/lib/coach-business/store';
import { COACH_TERMS_TEST_PLACEHOLDER } from '@/lib/payments/terms';
import { STORE_TERMS_VERSION } from '@/lib/store-terms';

const KEYS = ['COACH_CONNECT_PAYMENTS_ENABLED', 'COACH_CONNECT_LIVE', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_CONNECT_WEBHOOK_SECRET', 'NEXTAUTH_URL', 'COACH_PRO_ENABLED'];
const sdk = new Stripe('sk_test_offline_signing_only');
const PLATFORM = 'whsec_platform_test';
const CONNECT = 'whsec_connect_test';

beforeEach(() => {
  for (const k of KEYS) delete process.env[k];
  h.prisma = null; h.stripe = null; h.deps = null; h.session = { user: { id: 'coach-1' } };
  resetBusinessProbe();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

function signed(event: unknown, secret: string): Request {
  const payload = JSON.stringify(event);
  const header = sdk.webhooks.generateTestHeaderString({ payload, secret });
  return new Request('https://fel.test/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': header }, body: payload });
}

function connectWorld() {
  const fake = fakeCoachBusinessDb();
  seedCoach(fake.state);
  fake.state.connect.get('coach-1')!.chargesEnabled = false;
  const accounts = new Map<string, any>([['acct_coach-1', { id: 'acct_coach-1', charges_enabled: true, payouts_enabled: true, details_submitted: true, requirements: { currently_due: [] } }]]);
  const ledger = fakeLedger(fake.state);
  h.deps = { db: fake.db, post: ledger.post, stripe: () => ({ accounts: { retrieve: async (id: string) => accounts.get(id) } }) };
  return { fake, ledger };
}

describe('/api/stripe/webhook: two signing secrets, one URL', () => {
  const accountUpdated = { id: 'evt_acct_1', object: 'event', type: 'account.updated', account: 'acct_coach-1', data: { object: { id: 'acct_coach-1' } } };

  it('a connected-account event signed with the Connect secret: refused while that secret is unset, routed once it is set', async () => {
    Object.assign(process.env, { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: PLATFORM });
    h.stripe = { webhooks: sdk.webhooks };
    const w = connectWorld();
    h.prisma = trap('prisma');   // the ledger-dedupe read below the coach-business branch is never reached
    expect((await webhook(signed(accountUpdated, CONNECT) as any)).status).toBe(400);
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = CONNECT;
    const r = await webhook(signed(accountUpdated, CONNECT) as any);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ received: true, coachConnect: 'account_updated' });
    expect(w.fake.state.connect.get('coach-1')).toMatchObject({ chargesEnabled: true, payoutsEnabled: true, requirementsDue: false });
  });

  it('the platform secret still verifies; a third secret never does', async () => {
    Object.assign(process.env, { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: PLATFORM, STRIPE_CONNECT_WEBHOOK_SECRET: CONNECT });
    h.stripe = { webhooks: sdk.webhooks };
    connectWorld();
    expect((await webhook(signed(accountUpdated, PLATFORM) as any)).status).toBe(200);
    expect((await webhook(signed(accountUpdated, 'whsec_someone_else') as any)).status).toBe(400);
  });

  it('any other connected-account event is acknowledged and left alone (no product handler, no ledger read)', async () => {
    Object.assign(process.env, { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: PLATFORM, STRIPE_CONNECT_WEBHOOK_SECRET: CONNECT });
    h.stripe = { webhooks: sdk.webhooks };
    h.prisma = trap('prisma');
    const payout = { id: 'evt_payout', object: 'event', type: 'payout.paid', account: 'acct_coach-1', data: { object: { id: 'po_1' } } };
    const r = await webhook(signed(payout, CONNECT) as any);
    expect(await r.json()).toEqual({ received: true, ignored: 'connected_account_event' });
  });

  it('a coach-sale dispute on the platform endpoint is the coach business\'s; a failure answers 500 so Stripe retries', async () => {
    Object.assign(process.env, { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: PLATFORM });
    h.stripe = { webhooks: sdk.webhooks };
    const w = connectWorld();
    w.fake.state.sales.set('sale-1', { id: 'sale-1', packageId: 'pkg-1', coachId: 'coach-1', buyerId: 'b', kind: 'session_pack', status: 'PAID', amountCents: 19_999, feeCents: 999, refundedCents: 0, feeRefundedCents: 0, paymentIntentId: 'pi_1' });
    const created = { id: 'evt_dp', object: 'event', type: 'charge.dispute.created', data: { object: { id: 'dp_1', amount: 20_628, charge: 'ch_1', payment_intent: 'pi_1', reason: 'fraudulent', status: 'needs_response', livemode: false, balance_transactions: [{ net: -22_128 }] } } };
    const r = await webhook(signed(created, PLATFORM) as any);
    expect(await r.json()).toEqual({ received: true, coachConnect: 'dispute_recorded' });
    expect(w.fake.state.disputes.get('dp_1')).toMatchObject({ saleId: 'sale-1', withdrawnCents: 22_128 });
    h.deps = { ...h.deps, post: async () => { throw new Error('ledger down'); } };
    expect((await webhook(signed({ ...created, id: 'evt_dp2' }, PLATFORM) as any)).status).toBe(500);
  });
});

describe('POST /api/coach/business/connect: the coach ticks the coach terms first', () => {
  function world() {
    Object.assign(process.env, { COACH_CONNECT_PAYMENTS_ENABLED: '1', STRIPE_SECRET_KEY: 'sk_test_x', NEXTAUTH_URL: 'https://fel.test' });
    const fake = fakeCoachBusinessDb();
    const calls: { op: string; params: any }[] = [];
    const accounts = new Map<string, any>();
    h.stripe = {
      accounts: {
        create: async (params: any) => { calls.push({ op: 'accounts.create', params }); const a = { id: 'acct_new', livemode: false, metadata: params.metadata, charges_enabled: false, requirements: { currently_due: ['external_account'] } }; accounts.set(a.id, a); return a; },
        retrieve: async (id: string) => { calls.push({ op: 'accounts.retrieve', params: id }); return accounts.get(id); },
        update: async (id: string, params: any) => { calls.push({ op: 'accounts.update', params }); Object.assign(accounts.get(id).metadata, params.metadata); return accounts.get(id); },
      },
      accountLinks: { create: async () => ({ url: 'https://connect.stripe.test/onboarding' }) },
    };
    h.prisma = {
      ...fake.db,
      user: { findUnique: async () => ({ dobYear: 1990, email: 'coach@fel.test' }) },
      instructor: { findUnique: async () => ({ slug: 'jordan-lee' }) },
      subscription: { findMany: async () => [] },
    };
    return { fake, calls, accounts };
  }
  const post = (body: unknown) => connectPost(new Request('https://fel.test/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));

  it('no tick: 409 terms_required naming the version (test-mode placeholder; no link while the terms are unwritten); nothing at Stripe', async () => {
    const w = world();
    const r = await post({});
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: 'terms_required', version: COACH_TERMS_TEST_PLACEHOLDER, href: null });
    expect(w.calls).toEqual([]);
    expect(w.fake.state.connect.size).toBe(0);
  });

  it('ticked: the account is made with the acceptance on it; again later: kept, not rewritten', async () => {
    const w = world();
    const tick = { termsAccepted: true, termsVersion: COACH_TERMS_TEST_PLACEHOLDER };
    const r = await post(tick);
    expect(await r.json()).toEqual({ url: 'https://connect.stripe.test/onboarding' });
    expect(w.calls[0].params.metadata).toMatchObject({ userId: 'coach-1', coach_terms_version: COACH_TERMS_TEST_PLACEHOLDER, coach_terms_accepted_at: expect.stringMatching(/^\d{4}-/) });
    expect((await post(tick)).status).toBe(200);
    expect(w.calls.filter((c) => c.op === 'accounts.update')).toEqual([]);
  });

  it('GET keeps whether Stripe is asking the coach for something', async () => {
    const w = world();
    await post({ termsAccepted: true, termsVersion: COACH_TERMS_TEST_PLACEHOLDER });
    const r = await connectGet();
    expect(await r.json()).toMatchObject({ connected: true, chargesEnabled: false, requirementsDue: true });
    expect(w.fake.state.connect.get('coach-1')).toMatchObject({ requirementsDue: true });
  });
});

describe('POST /api/coach/business/checkout: the buyer\'s tick', () => {
  it('without it: 409 terms_required with the store terms\' version', async () => {
    Object.assign(process.env, { COACH_CONNECT_PAYMENTS_ENABLED: '1', STRIPE_SECRET_KEY: 'sk_test_x', NEXTAUTH_URL: 'https://fel.test' });
    const fake = fakeCoachBusinessDb();
    seedCoach(fake.state);
    h.session = { user: { id: 'buyer-1' } };
    h.stripe = trap('stripe');
    h.prisma = {
      ...fake.db,
      user: { findUnique: async () => ({ dobYear: 1990, email: 'b@fel.test' }) },
      instructor: { findUnique: async () => ({ slug: 'jordan-lee', published: true }) },
      subscription: { findMany: async () => [] },
    };
    const r = await checkout(new Request('https://fel.test/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ packageId: 'pkg-1' }) }));
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: 'terms_required', version: STORE_TERMS_VERSION });
    expect(fake.state.sales.size).toBe(0);
  });
});
