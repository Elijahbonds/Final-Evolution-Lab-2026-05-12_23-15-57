// COACH-BUSINESS: the HTTP routes with every switch at its default. Closed means closed: 409 store_closed, and neither
// the database nor Stripe is touched (both are traps here). Plus the shared webhook's routing, the Free roster limit on
// the invite route, and the AI-drafts gate.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeCoachBusinessDb, fakeLedger, seedCoach } from '@/tests/helpers/fakeCoachBusinessDb';

const h = vi.hoisted(() => ({
  session: { user: { id: 'coach-1' } } as any,
  prisma: null as any,
  stripeCalls: 0,
  event: null as any,
  bookTouched: 0,
  deps: null as any,
}));

const trap = (what: string) => new Proxy({}, { get: (_t, p) => { if (p === 'then') return undefined; throw new Error(`${what}.${String(p)} touched`); } });

vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ ok: true, retryAfterSec: 0 }) }));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : (h.prisma ?? trap('prisma'))[p]) }) }));
vi.mock('@/lib/stripe', () => ({
  getStripe: () => { h.stripeCalls += 1; return { webhooks: { constructEvent: () => h.event } }; },
  STRIPE_PRODUCTS: {}, PLATFORM_TAKE_RATE: 0.15,
}));
vi.mock('@/lib/books/bookStore', () => ({ bookTablesReady: () => { h.bookTouched += 1; return false; }, prismaBookStore: () => ({}) }));
vi.mock('@/lib/coach-business/server', async (orig) => ({ ...(await orig<object>()), prismaConnectDeps: () => h.deps }));

import { POST as checkout } from '@/app/api/coach/business/checkout/route';
import { POST as verify } from '@/app/api/coach/business/checkout/verify/route';
import { GET as connectGet, POST as connectPost } from '@/app/api/coach/business/connect/route';
import { POST as dashboard } from '@/app/api/coach/business/connect/dashboard/route';
import { POST as refund } from '@/app/api/coach/business/sales/[id]/refund/route';
import { POST as pro } from '@/app/api/coach/business/pro/route';
import { POST as webhook } from '@/app/api/stripe/webhook/route';
import { POST as joinInvite } from '@/app/api/coach/invite/[token]/route';
import { GET as drafts } from '@/app/api/coach/drafts/route';
import { resetBusinessProbe } from '@/lib/coach-business/store';

const req = (body: unknown = {}) => new Request('https://fel.test/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const KEYS = ['COACH_CONNECT_PAYMENTS_ENABLED', 'COACH_CONNECT_LIVE', 'COACH_PRO_ENABLED', 'COACH_PRO_PRICE_USD_CENTS', 'COACH_FREE_CLIENT_LIMIT', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'NEXTAUTH_URL'];

beforeEach(() => {
  for (const k of KEYS) delete process.env[k];
  h.prisma = null; h.stripeCalls = 0; h.bookTouched = 0; h.session = { user: { id: 'coach-1' } };
  resetBusinessProbe();
});

describe('every money route is closed by default — and touches nothing', () => {
  const routes: [string, () => Promise<Response>][] = [
    ['checkout', () => checkout(req({ packageId: 'pkg-1' }))],
    ['verify', () => verify(req({ sessionId: 'cs_test_0123456789ab' }))],
    ['connect POST', () => connectPost()],
    ['connect GET', () => connectGet()],
    ['connect dashboard', () => dashboard()],
    ['refund', () => refund(req({}), { params: { id: 'sale-1' } })],
  ];
  for (const [name, call] of routes) {
    it(`${name}: 409 store_closed payments_off, no database, no Stripe`, async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_x';   // a key alone opens nothing
      const r = await call();
      expect(r.status).toBe(409);
      expect(await r.json()).toEqual({ error: 'store_closed', reason: 'payments_off', message: "Payments aren't live yet." });
      expect(h.stripeCalls).toBe(0);
    });
  }

  it('switch on with a LIVE key and no live switch: still closed (test mode only)', async () => {
    Object.assign(process.env, { COACH_CONNECT_PAYMENTS_ENABLED: '1', STRIPE_SECRET_KEY: 'sk_live_x', NEXTAUTH_URL: 'https://fel.test' });
    const r = await checkout(req({ packageId: 'pkg-1' }));
    expect(r.status).toBe(409);
    expect((await r.json()).reason).toBe('live_mode_off');
    expect(h.stripeCalls).toBe(0);
  });

  // test changed (coach-fee-passthrough): `price_not_set` no longer exists (the price defaults to the owner's $39), so
  // with the Pro switch on the next fence in the same order is the site URL — still closed, still no Stripe call.
  it('Coach Pro: closed while COACH_PRO_ENABLED is off, and while the site URL is unset', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    expect((await (await pro()).json()).reason).toBe('pro_off');
    process.env.COACH_PRO_ENABLED = '1';
    const r = await pro();
    expect(r.status).toBe(409);
    expect((await r.json()).reason).toBe('site_url_not_set');
    expect(h.stripeCalls).toBe(0);
  });
});

describe('the shared Stripe webhook routes a COACH_CONNECT event to the coach business, first', () => {
  it('a refund is recorded once, and the book path is never asked', async () => {
    Object.assign(process.env, { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x' });
    const fake = fakeCoachBusinessDb();
    seedCoach(fake.state);
    fake.state.sales.set('sale-1', { id: 'sale-1', packageId: 'pkg-1', coachId: 'coach-1', buyerId: 'b', kind: 'session_pack', status: 'PAID', amountCents: 19_999, feeCents: 999, refundedCents: 0, feeRefundedCents: 0, paymentIntentId: 'pi_1' });
    const ledger = fakeLedger();
    // test changed (coach-fee-passthrough): the charge names its application fee, and FEL's share goes back to the coach
    // through Stripe (one application-fee refund of 999), so the deps carry a fee-refund recorder.
    const feeRefunds: number[] = [];
    let refunded = 0;
    const stripe = { applicationFees: {
      retrieve: async () => ({ amount: 1_628, amount_refunded: refunded }),
      createRefund: async (_id: string, p: { amount: number }) => { feeRefunds.push(p.amount); refunded += p.amount; return {}; },
    } };
    h.deps = { db: fake.db, post: ledger.post, stripe: () => stripe };
    h.event = { id: 'evt_1', type: 'charge.refunded', data: { object: { id: 'ch_1', amount_refunded: 19_999, application_fee: 'fee_1', metadata: { product: 'COACH_CONNECT', saleId: 'sale-1' } } } };
    const call = () => webhook(new Request('https://fel.test/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': 't=1,v1=x' }, body: '{}' }) as any);
    const first = await call();
    expect(await first.json()).toEqual({ received: true, coachConnect: 'refunded' });
    expect(await (await call()).json()).toEqual({ received: true, coachConnect: 'noop' });
    expect(h.bookTouched).toBe(0);
    expect(fake.state.sales.get('sale-1')).toMatchObject({ status: 'REFUNDED', feeRefundedCents: 999 });
    expect(ledger.rows).toHaveLength(1);
    expect(feeRefunds).toEqual([999]);
  });

  it('a failure answers 500 so Stripe retries', async () => {
    Object.assign(process.env, { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x' });
    h.deps = { db: { $queryRawUnsafe: async () => { throw new Error('db down'); }, $executeRawUnsafe: async () => 0 }, post: async () => {} };
    h.event = { id: 'evt_2', type: 'charge.refunded', data: { object: { id: 'ch_2', amount_refunded: 1, metadata: { product: 'COACH_CONNECT', saleId: 's' } } } };
    const r = await webhook(new Request('https://fel.test/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': 's' }, body: '{}' }) as any);
    expect(r.status).toBe(500);
  });
});

describe('the Pro gates, wired', () => {
  function invitePrisma(active: number, creates: string[]) {
    return {
      coachInvite: {
        findUnique: async () => ({ token: 't', coachId: 'coach-1', use: 'many', closedAt: null, expiresAt: new Date(Date.now() + 86_400_000), joined: 0, createdAt: new Date(), coach: { name: 'Coach' } }),
        update: async () => ({}),
      },
      coachClient: { findUnique: async () => null, create: async () => { creates.push('client'); return {}; }, count: async () => active },
      subscription: { findMany: async () => [] },
      user: { findUnique: async () => ({ dobYear: 1990 }) },
      guardianConsent: { findMany: async () => [] },
    };
  }

  it('gates off (default): a client joins whatever the roster size', async () => {
    const creates: string[] = [];
    h.prisma = invitePrisma(500, creates);
    h.session = { user: { id: 'client-9' } };
    const r = await joinInvite(new Request('https://fel.test', { method: 'POST' }), { params: { token: 't' } });
    expect(r.status).toBe(200);
    expect(creates).toEqual(['client']);
  });

  it('gates on: a Free coach at the limit — the joining client gets 409 coach_roster_full and nothing is written', async () => {
    Object.assign(process.env, { COACH_PRO_ENABLED: '1', COACH_FREE_CLIENT_LIMIT: '3' });
    const creates: string[] = [];
    h.prisma = invitePrisma(3, creates);
    h.session = { user: { id: 'client-9' } };
    const r = await joinInvite(new Request('https://fel.test', { method: 'POST' }), { params: { token: 't' } });
    expect(r.status).toBe(409);
    expect((await r.json()).error).toBe('coach_roster_full');
    expect(creates).toEqual([]);
  });

  it('gates on: AI drafts answer 402 coach_pro_required for a Free coach', async () => {
    process.env.COACH_PRO_ENABLED = '1';
    h.prisma = { facilitatorProfile: { findUnique: async () => ({ certificationStatus: 'certified' }) }, subscription: { findMany: async () => [] } };
    const r = await drafts();
    expect(r.status).toBe(402);
    expect((await r.json()).feature).toBe('ai_drafts');
  });
});
