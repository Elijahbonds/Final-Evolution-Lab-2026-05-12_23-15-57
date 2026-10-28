// PAYMENTS-READY (2026-10-26): the real checkout routes outside the coach store, with PURCHASES_ALLOWLIST and the FEL Pro
// terms tick. The harness is lib/stripe/launch-sales-matrix.test.ts's (fake Stripe, write-spy Prisma, fake session); every
// switch is turned on inside this file only.
//   · allow list UNSET: every product follows VIRTUAL_PURCHASES_ENABLED exactly as before;
//   · allow list SET: only the listed products reach Stripe; every other one answers 409 store_closed
//     virtual_purchases_off with nothing created at Stripe;
//   · FEL Pro: no tick (or a stale version) → 409 terms_required with the current version, nothing at Stripe; the minor
//     check still answers first.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newSpyDb, type SpyDb } from '@/tests/helpers/writeSpyDb';
import { ADULT, MINOR, fakeStripe, guardedPrisma, jsonRequest, seedBuyers, withMissingTables, type FakeStripe } from '@/tests/helpers/stripeSales';

const h = vi.hoisted(() => ({ db: null as unknown as SpyDb, stripe: null as unknown as FakeStripe, user: null as string | null }));

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(async () => (h.user ? { user: { id: h.user, email: `${h.user}@fel.test` } } : null)),
}));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ get prisma() { return withMissingTables(guardedPrisma(h.db), []); } }));
vi.mock('@/lib/stripe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/stripe')>()),
  getStripe: () => h.stripe.client,
}));
vi.mock('@/lib/books/bookCheckout', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/books/bookCheckout')>()),
  getBookStripe: () => h.stripe.client,
}));
vi.mock('@/lib/analytics-server', () => ({ recordServerEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/season/season-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/season/season-service')>()),
  getActiveSeason: vi.fn(async () => ({ id: 'season-1', key: 's1', name: 'Season 1' })),
  getPassState: vi.fn(async () => ({ hasPro: false })),
}));

const { POST: stripeCheckout } = await import('@/app/api/stripe/checkout/route');
const { POST: seasonCheckout } = await import('@/app/api/season/checkout/route');
const { POST: coinCheckout } = await import('@/app/api/v1/wallet/checkout/route');
const { POST: shardCheckout } = await import('@/app/api/v1/wallet/shard-checkout/route');
const { GET: walletConfig } = await import('@/app/api/v1/wallet/config/route');
const { POST: bookCheckout } = await import('@/app/api/books/checkout/route');
const { BOOKS } = await import('@/lib/books/bookCatalog');
const { bookOfferAllowed } = await import('@/lib/books/bookTerms');
// test changed (owner-approvals, 2026-10-27, card C28): FEL Pro buyers tick the Purchase Terms now (lib/payments/terms.ts
// BUYER_TERMS.fel_pro), not the coach store's terms; the tick's version is read from there. The assertions are unchanged.
const { BUYER_TERMS } = await import('@/lib/payments/terms');
const BUYER_TERMS_VERSION = BUYER_TERMS.fel_pro.version;
const { STORE_TERMS_VERSION } = await import('@/lib/store-terms');   // books still tick the coach store's terms
const { buyPro } = await import('@/lib/payments/proBuy');

const ENV: Record<string, string> = {
  STRIPE_SECRET_KEY: 'sk_test_payments_ready_fake',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_fake',
  NEXTAUTH_URL: 'https://fel.test',
  VIRTUAL_PURCHASES_ENABLED: '1',
  SEASON_PASS_PURCHASE: '1',
  SEASON_PASS_PRO_PRICE_USD_CENTS: '999',
  BOOK_STORE_ENABLED: '1',
};
const KEYS = [...Object.keys(ENV), 'PURCHASES_ALLOWLIST'];
const saved: Record<string, string | undefined> = {};
const TICK = { termsAccepted: true, termsVersion: BUYER_TERMS_VERSION };
const offer = BOOKS.flatMap((b) => b.offers).find((o) => bookOfferAllowed(o))!;

beforeEach(() => {
  h.db = newSpyDb();
  h.stripe = fakeStripe();
  h.user = ADULT;
  seedBuyers(h.db);
  (h.db.tables.stripeCustomer ??= []).push({ id: 'sc-adult', userId: ADULT, stripeCustomerId: 'cus_adult' });
  for (const k of KEYS) saved[k] = process.env[k];
  for (const [k, v] of Object.entries(ENV)) process.env[k] = v;
  delete process.env.PURCHASES_ALLOWLIST;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  vi.restoreAllMocks();
});

async function call(route: (req: any) => Promise<Response>, body: unknown) {
  const res = await route(jsonRequest(body));
  return { status: res.status, json: await res.json() };
}

const ROUTES: [string, (req: any) => Promise<Response>, unknown][] = [
  ['fel_pro', stripeCheckout, { product: 'FEL_PRO', ...TICK }],
  ['cosmetic', stripeCheckout, { product: 'COSMETIC', itemKey: 'cosm-chrome-visor' }],
  ['coins', coinCheckout, { pack_id: 'coins_starter' }],
  ['shards', shardCheckout, { pack_id: 'pack_starter' }],
  ['season_pass', seasonCheckout, {}],
  ['books', bookCheckout, { offerId: offer?.id, termsAccepted: true, termsVersion: STORE_TERMS_VERSION }],
];

describe('PURCHASES_ALLOWLIST unset: exactly as before', () => {
  it.each(ROUTES)('%s sells', async (_id, route, body) => {
    const r = await call(route, body);
    expect(r.status).toBe(200);
    expect(h.stripe.created).toHaveLength(1);
  });

  it('the wallet config says coins are on sale', async () => {
    expect(await (await walletConfig()).json()).toEqual({ purchasesEnabled: true });
  });
});

describe('PURCHASES_ALLOWLIST="fel_pro,coins": only those sell', () => {
  beforeEach(() => { process.env.PURCHASES_ALLOWLIST = 'fel_pro,coins'; });

  it.each(ROUTES)('%s', async (id, route, body) => {
    const r = await call(route, body);
    if (id === 'fel_pro' || id === 'coins') {
      expect(r.status).toBe(200);
      expect(h.stripe.created).toHaveLength(1);
    } else {
      expect(r.status).toBe(409);
      expect(r.json).toMatchObject({ error: 'store_closed', reason: 'virtual_purchases_off' });
      expect(h.stripe.created).toHaveLength(0);
      expect(h.stripe.customersCreated).toHaveLength(0);
    }
  });

  it('the wallet config follows the list', async () => {
    process.env.PURCHASES_ALLOWLIST = 'fel_pro';
    expect(await (await walletConfig()).json()).toEqual({ purchasesEnabled: false });
  });

  it('VIRTUAL_PURCHASES_ENABLED off still closes everything on the list', async () => {
    delete process.env.VIRTUAL_PURCHASES_ENABLED;
    for (const [, route, body] of ROUTES) expect((await call(route, body)).status).toBe(409);
    expect(h.stripe.created).toHaveLength(0);
  });
});

describe('FEL Pro: the buyer ticks the terms before Stripe is called', () => {
  it.each([
    ['no tick', { product: 'FEL_PRO' }],
    ['ticked an old version', { product: 'FEL_PRO_MONTHLY', termsAccepted: true, termsVersion: 'store-terms-2026-10-04' }],
    ['version without the tick', { product: 'FEL_PRO', termsVersion: BUYER_TERMS_VERSION }],
  ])('%s: 409 terms_required naming the current version, nothing at Stripe', async (_n, body) => {
    const r = await call(stripeCheckout, body);
    expect(r.status).toBe(409);
    expect(r.json).toEqual({ error: 'terms_required', version: BUYER_TERMS_VERSION });
    expect(h.stripe.created).toHaveLength(0);
    expect(h.stripe.customersCreated).toHaveLength(0);
  });

  it('the 18+ check still answers first', async () => {
    h.user = MINOR;
    const r = await call(stripeCheckout, { product: 'FEL_PRO' });
    expect(r.status).toBe(403);
    expect(r.json.error).toBe('adults_only');
  });

  it('a product that is not FEL Pro needs no tick (unchanged)', async () => {
    expect((await call(stripeCheckout, { product: 'COSMETIC', itemKey: 'cosm-chrome-visor' })).status).toBe(200);
  });

  it('the accepted version and time ride on the session and the subscription', async () => {
    const before = Date.now();
    expect((await call(stripeCheckout, { product: 'FEL_PRO', ...TICK })).status).toBe(200);
    const p = h.stripe.created[0];
    for (const meta of [p.metadata, p.subscription_data.metadata]) {
      expect(meta.terms_version).toBe(BUYER_TERMS_VERSION);
      expect(Date.parse(meta.terms_accepted_at)).toBeGreaterThanOrEqual(before - 1000);
    }
  });
});

describe('the /pro page\'s button, end to end through the real route', () => {
  // the page's fetch, answered by the route itself
  const viaRoute = (async (_url: string, init: RequestInit) => stripeCheckout(jsonRequest(JSON.parse(String(init.body))))) as unknown as typeof fetch;

  it('an adult goes to Stripe with the plan they picked and the tick on the metadata', async () => {
    const out = await buyPro(viaRoute, 'weekly', BUYER_TERMS_VERSION);
    expect(out.kind).toBe('redirect');
    expect(h.stripe.created[0].line_items[0].price_data).toMatchObject({ unit_amount: 600, recurring: { interval: 'week' } });
    expect(h.stripe.created[0].metadata.terms_version).toBe(BUYER_TERMS_VERSION);
  });

  it('a teen sees exactly what the route answers today, and nothing reaches Stripe', async () => {
    h.user = MINOR;
    const direct = await call(stripeCheckout, { product: 'FEL_PRO_MONTHLY', ...TICK });
    expect(direct.status).toBe(403);
    expect(await buyPro(viaRoute, 'monthly', BUYER_TERMS_VERSION)).toEqual({ kind: 'refused', message: direct.json.message });
    expect(h.stripe.created).toHaveLength(0);
  });

  it('closed by the allow list: the page\'s not-on-sale line', async () => {
    process.env.PURCHASES_ALLOWLIST = 'coins';
    expect((await buyPro(viaRoute, 'monthly', BUYER_TERMS_VERSION)).kind).toBe('closed');
  });
});
