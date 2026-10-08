// STORE-READY B10 (LIVE-KEY FENCE) — one flag, default OFF, for every real-money checkout that is
// not the coach store (FE PM 4:33/4:35/4:36 PM PT Oct 7: NO real-money product outside the coach
// store sells at launch; each needs an 18+ check and a refund path before VIRTUAL_PURCHASES_ENABLED
// is turned on). Stripe, prisma and next-auth are mocked; routes are called directly.
//
// Covered: (a) key set, flag UNSET -> every fenced route answers 409 store_closed
//   virtual_purchases_off with ZERO customers.create / checkout.sessions.create / fetch calls, and
//   GET /api/v1/wallet/config says purchasesEnabled:false; no key -> 409 payments_not_set_up (never
//   503); season with the key + both season flags but no price -> 409 price_not_set (never 503).
// (b) flag ON: an `Origin: https://evil.example` header never steers success/cancel URLs — they
//   start with NEXTAUTH_URL; NEXTAUTH_URL unset -> 409 site_url_not_set, no Stripe call.
// (c) an already-paid COIN_PACK session still fulfils with the flag UNSET, exactly once.
// (d) source: no req.headers.get('origin') in the checkout routes; studio POST has no fetch/cookie.
// (e) /api/wallet/deposit never credits: flag on -> 409 deposits_off; flag off -> 403 — no ledger
//   row, no balance change, no Stripe call, whatever the body.
// (g) studio parity: /api/studio/credits and /api/stripe/checkout (STUDIO_CREDITS) pass DEEP-EQUAL
//   params to checkout.sessions.create — the pre-B10 shape, written out literally.
// (h) source: nothing under app/ imports lib/babylon/server/subscriptionApi by any path.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const USER = 'user-1';

const h = vi.hoisted(() => ({
  sessionUser: 'user-1' as string | null,
  createCalls: [] as any[],
  customerCreateCalls: [] as any[],
  fetchCalls: [] as any[],
  retrieveCalls: [] as string[],
  stripeSessions: {} as Record<string, any>,
  store: {} as Record<string, Record<string, any>[]>,
  grants: { coins: [] as any[], shards: [] as any[] },
}));

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(async () => (h.sessionUser ? { user: { id: h.sessionUser } } : null)),
}));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  get prisma() {
    return new Proxy({}, {
      get: (_t, prop) => {
        if (prop === 'then' || typeof prop === 'symbol') return undefined;
        if (prop === '$transaction') return async (fn: any) => (typeof fn === 'function' ? fn(new Proxy({}, { get: () => async () => ({}) })) : Promise.all(fn));
        const rows = () => (h.store[String(prop)] ??= []);
        return {
          findUnique: async (a: any = {}) => {
            const w = a.where ?? {};
            // Unique-key lookup the routes actually use (stripeCustomer by userId, etc.).
            if (w.userId != null) return rows().find((r) => r.userId === w.userId) ?? null;
            if (w.id != null) return rows().find((r) => r.id === w.id) ?? null;
            return rows()[0] ?? null;
          },
          findFirst: async () => null,
          findMany: async () => [],
          create: async (a: any) => { const row = { id: `${String(prop)}_${rows().length + 1}`, ...a.data }; rows().push(row); return row; },
          update: async (a: any) => Object.assign(rows()[0] ?? {}, a.data),
          updateMany: async () => ({ count: 0 }),
        };
      },
    });
  },
}));
vi.mock('@/lib/stripe', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/stripe')>();
  return {
    ...real,
    getStripe: () => ({
      customers: {
        create: vi.fn(async (a: any) => {
          h.customerCreateCalls.push(a);
          return { id: `cus_${h.customerCreateCalls.length}` };
        }),
      },
      checkout: {
        sessions: {
          create: vi.fn(async (params: any) => {
            h.createCalls.push(params);
            return { id: `cs_created_${h.createCalls.length}`, url: 'https://stripe.test/pay' };
          }),
          retrieve: vi.fn(async (id: string) => {
            h.retrieveCalls.push(id);
            const s = h.stripeSessions[id];
            if (!s) throw Object.assign(new Error(`No such checkout session: ${id}`), { statusCode: 404, type: 'StripeInvalidRequestError', code: 'resource_missing' });
            return s;
          }),
        },
      },
      subscriptions: { retrieve: vi.fn(async () => ({ items: { data: [{ price: { id: 'price_1' } }] }, current_period_end: 1893456000 })) },
    }),
  };
});
vi.mock('@/lib/season/season-service', () => ({
  getActiveSeason: vi.fn(async () => ({ id: 'season-1', key: 's1', name: 'Season 1' })),
  getPassState: vi.fn(async () => ({ hasPro: false })),
}));
// The wallet grant entry points are spied — what (c) asserts is the verify-session contract at
// THIS layer: a paid session grants with the one session key, and the replay offers the same key.
vi.mock('@/lib/wallet/wallet-service', () => ({
  grantCoinPurchase: vi.fn(async (_db: unknown, a: any) => { h.grants.coins.push(a); return { entry_id: `we-${h.grants.coins.length}`, balances: { coins: a.coins, shards: 0, lc: 0 } }; }),
  grantShardPurchase: vi.fn(async (_db: unknown, a: any) => { h.grants.shards.push(a); return { entry_id: `we-s${h.grants.shards.length}`, balances: { coins: 0, shards: a.shards, lc: 0 } }; }),
}));
// ledgerWalletDeposit is spied separately: (e) proves the deposit route NEVER calls it.
vi.mock('@/lib/stripe-helpers', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/stripe-helpers')>();
  return {
    ...real,
    ledgerWalletDeposit: vi.fn(async () => { throw new Error('ledgerWalletDeposit must never run (B10)'); }),
  };
});

import { POST as walletCheckout } from '@/app/api/v1/wallet/checkout/route';
import { POST as shardCheckout } from '@/app/api/v1/wallet/shard-checkout/route';
import { POST as stripeCheckout } from '@/app/api/stripe/checkout/route';
import { POST as seasonCheckout } from '@/app/api/season/checkout/route';
import { POST as studioCredits } from '@/app/api/studio/credits/route';
import { POST as walletDeposit } from '@/app/api/wallet/deposit/route';
import { GET as walletConfig } from '@/app/api/v1/wallet/config/route';
import { POST as verifySession } from '@/app/api/stripe/verify-session/route';
import { STORE_CLOSED_MESSAGE } from '@/lib/coach-store/constants';
import { STUDIO_CREDIT_PACKS } from '@/lib/studio-plan';
import { paymentMethodsFor } from '@/lib/stripe-payment-methods';

function req(body: unknown, headers: Record<string, string> = {}): any {
  return {
    json: async () => {
      if (body instanceof Error) throw body;
      return body;
    },
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  };
}

beforeEach(() => {
  h.sessionUser = USER;
  h.createCalls = [];
  h.customerCreateCalls = [];
  h.fetchCalls = [];
  h.retrieveCalls = [];
  h.stripeSessions = {};
  h.store = {};
  h.grants = { coins: [], shards: [] };
  process.env.STRIPE_SECRET_KEY = 'sk_live_fake';
  delete process.env.VIRTUAL_PURCHASES_ENABLED;
  delete process.env.SEASON_PASS_PURCHASE;
  delete process.env.SEASON_PASS_PRO_PRICE_USD_CENTS;
  delete process.env.STUDIO_CREATOR_ENABLED;
  delete process.env.REAL_MONEY_COMPETITION;
  delete process.env.COACH_STORE_LIVE;
  delete process.env.NEXTAUTH_URL;
  vi.stubGlobal('fetch', vi.fn(async (...a: any[]) => { h.fetchCalls.push(a); return new Response('{}'); }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.VIRTUAL_PURCHASES_ENABLED;
  delete process.env.SEASON_PASS_PURCHASE;
  delete process.env.SEASON_PASS_PRO_PRICE_USD_CENTS;
  delete process.env.STUDIO_CREATOR_ENABLED;
  delete process.env.REAL_MONEY_COMPETITION;
  delete process.env.COACH_STORE_LIVE;
  delete process.env.NEXTAUTH_URL;
});

const STRIPE_PRODUCTS_UNDER_TEST = [
  'FEL_PRO', 'FEL_PRO_MONTHLY', 'FEL_COACH', 'FEL_FACILITY', 'STUDIO_CREATOR', 'COSMETIC', 'COACH_PROGRAM', 'STUDIO_CREDITS', 'MARKETPLACE',
];

describe('B10 live-key fence', () => {
  it('(a) key set + flag UNSET: every fenced checkout is 409 virtual_purchases_off, ZERO Stripe/fetch calls; config says off', async () => {
    for (const [name, call] of [
      ['wallet/checkout', () => walletCheckout(req({ pack_id: 'coins_starter' }))],
      ['wallet/shard-checkout', () => shardCheckout(req({ pack_id: 'pack_starter' }))],
      ...STRIPE_PRODUCTS_UNDER_TEST.map((p) => [`stripe/checkout ${p}`, () => stripeCheckout(req({ product: p, itemKey: 'studio-credits-5', listingId: 'lst_1' }))] as const),
      ['season/checkout', () => { process.env.SEASON_PASS_PURCHASE = '1'; process.env.SEASON_PASS_PRO_PRICE_USD_CENTS = '999'; return seasonCheckout(req({})); }],
      ['studio/credits', () => { process.env.STUDIO_CREATOR_ENABLED = '1'; return studioCredits(req({ itemKey: 'studio-credits-5' })); }],
    ] as Array<[string, () => Promise<Response>]>) {
      const res = await call();
      const json = await res.json();
      expect({ name, status: res.status, json }).toEqual({
        name, status: 409,
        json: { error: 'store_closed', reason: 'virtual_purchases_off', message: STORE_CLOSED_MESSAGE },
      });
      delete process.env.SEASON_PASS_PURCHASE;
      delete process.env.SEASON_PASS_PRO_PRICE_USD_CENTS;
      delete process.env.STUDIO_CREATOR_ENABLED;
    }
    expect(h.customerCreateCalls).toHaveLength(0);
    expect(h.createCalls).toHaveLength(0);
    expect(h.fetchCalls).toHaveLength(0);
    expect((await (await walletConfig()).json()).purchasesEnabled).toBe(false);
  });

  it('(a2) NO key at all: the same routes are 409 payments_not_set_up (no 503)', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    process.env.VIRTUAL_PURCHASES_ENABLED = '1'; // even with the flag on, no key refuses first
    for (const [name, call] of [
      ['wallet/checkout', () => walletCheckout(req({ pack_id: 'coins_starter' }))],
      ['wallet/shard-checkout', () => shardCheckout(req({ pack_id: 'pack_starter' }))],
      ['stripe/checkout', () => stripeCheckout(req({ product: 'FEL_PRO' }))],
      ['season/checkout', () => { process.env.SEASON_PASS_PURCHASE = '1'; process.env.SEASON_PASS_PRO_PRICE_USD_CENTS = '999'; return seasonCheckout(req({})); }],
      ['studio/credits', () => { process.env.STUDIO_CREATOR_ENABLED = '1'; return studioCredits(req({ itemKey: 'studio-credits-5' })); }],
    ] as Array<[string, () => Promise<Response>]>) {
      const res = await call();
      const json = await res.json();
      expect({ name, status: res.status, reason: json.reason }).toEqual({ name, status: 409, reason: 'payments_not_set_up' });
    }
    expect(h.customerCreateCalls).toHaveLength(0);
    expect(h.createCalls).toHaveLength(0);
  });

  it('(a3) season with key + flags on but SEASON_PASS_PRO_PRICE_USD_CENTS unset -> 409 price_not_set, no Stripe call', async () => {
    process.env.VIRTUAL_PURCHASES_ENABLED = '1';
    process.env.SEASON_PASS_PURCHASE = '1';
    const res = await seasonCheckout(req({}));
    expect(res.status).toBe(409);
    expect((await res.json()).reason).toBe('price_not_set');
    expect(h.customerCreateCalls).toHaveLength(0);
    expect(h.createCalls).toHaveLength(0);
  });

  it('(b) flag ON: an Origin: https://evil.example header never steers success/cancel URLs (NEXTAUTH_URL wins)', async () => {
    process.env.VIRTUAL_PURCHASES_ENABLED = '1';
    process.env.NEXTAUTH_URL = 'https://fel.example';
    const evil = { origin: 'https://evil.example' };

    const res1 = await walletCheckout(req({ pack_id: 'coins_starter' }, evil));
    expect(res1.status).toBe(200);
    const res2 = await shardCheckout(req({ pack_id: 'pack_starter' }, evil));
    expect(res2.status).toBe(200);
    process.env.SEASON_PASS_PURCHASE = '1';
    process.env.SEASON_PASS_PRO_PRICE_USD_CENTS = '999';
    const res3 = await seasonCheckout(req({}, evil));
    expect(res3.status).toBe(200);
    process.env.STUDIO_CREATOR_ENABLED = '1';
    const res4 = await studioCredits(req({ itemKey: 'studio-credits-5' }, evil));
    expect(res4.status).toBe(200);

    expect(h.createCalls).toHaveLength(4);
    for (const params of h.createCalls) {
      expect(params.success_url.startsWith('https://fel.example/')).toBe(true);
      expect(params.cancel_url.startsWith('https://fel.example/')).toBe(true);
      expect(JSON.stringify(params)).not.toContain('evil.example');
    }
    expect(h.fetchCalls).toHaveLength(0); // studio calls the checkout code in-process now
  });

  it('(b2) flag ON but NEXTAUTH_URL unset: 409 site_url_not_set, no Stripe call', async () => {
    process.env.VIRTUAL_PURCHASES_ENABLED = '1';
    delete process.env.NEXTAUTH_URL;
    for (const call of [
      () => walletCheckout(req({ pack_id: 'coins_starter' })),
      () => shardCheckout(req({ pack_id: 'pack_starter' })),
      () => { process.env.SEASON_PASS_PURCHASE = '1'; process.env.SEASON_PASS_PRO_PRICE_USD_CENTS = '999'; return seasonCheckout(req({})); },
      () => { process.env.STUDIO_CREATOR_ENABLED = '1'; return studioCredits(req({ itemKey: 'studio-credits-5' })); },
    ]) {
      const res = await call();
      expect(res.status).toBe(409);
      expect((await res.json()).reason).toBe('site_url_not_set');
      delete process.env.SEASON_PASS_PURCHASE;
      delete process.env.SEASON_PASS_PRO_PRICE_USD_CENTS;
      delete process.env.STUDIO_CREATOR_ENABLED;
    }
    expect(h.customerCreateCalls).toHaveLength(0);
    expect(h.createCalls).toHaveLength(0);
  });

  it('(c) an already-paid COIN_PACK session still fulfils with the flag UNSET — exactly once', async () => {
    delete process.env.VIRTUAL_PURCHASES_ENABLED; // the B10 fence never gates fulfilment
    // verify-session keeps its pre-B10 key gate (a fulfilment path — deliberately NOT fenced by
    // the new flag): with a bare live key loaded it still answers 409 live_mode_off, so this test
    // runs with COACH_STORE_LIVE on exactly as the post-deploy prod env has it. What is asserted
    // is that VIRTUAL_PURCHASES_ENABLED unset does NOT strand a payer.
    process.env.COACH_STORE_LIVE = '1';
    h.stripeSessions.cs_coins = {
      id: 'cs_coins', object: 'checkout.session', mode: 'payment', status: 'complete',
      payment_status: 'paid', amount_total: 199, client_reference_id: USER,
      payment_intent: { id: 'pi_1' }, subscription: null,
      metadata: { playerId: USER, product: 'COIN_PACK', packId: 'pack_starter', coins: '600' },
    };
    const r1 = await verifySession(req({ session_id: 'cs_coins' }));
    expect(r1.status).toBe(200);
    expect((await r1.json()).status).toBe('fulfilled');
    const r2 = await verifySession(req({ session_id: 'cs_coins' }));
    expect(r2.status).toBe(200);
    // One session key offered, however often verify runs (the wallet's unique idempotencyKey is
    // what makes the second offer a no-op — asserted here as "the key offered twice is the same").
    expect(h.grants.coins).toHaveLength(2);
    expect(new Set(h.grants.coins.map((g: any) => g.idempotencyKey))).toEqual(new Set(['stripe-session:cs_coins']));
    expect(h.grants.coins[0]).toMatchObject({ playerId: USER, coins: 600 });
  });

  it('(d) source: no Origin-header read in the checkout routes; studio POST has no fetch( and no cookie', async () => {
    const originFiles = [
      'app/api/v1/wallet/checkout/route.ts',
      'app/api/v1/wallet/shard-checkout/route.ts',
      'app/api/season/checkout/route.ts',
      'app/api/studio/credits/route.ts',
      'app/api/stripe/checkout/route.ts',
      'lib/stripe/product-checkout.ts',
    ];
    for (const f of originFiles) {
      const src = readFileSync(`${process.cwd()}/${f}`, 'utf8');
      expect(src.includes(`req.headers.get('origin')`) || src.includes('req.headers.get("origin")'), f).toBe(false);
    }
    const studio = readFileSync(`${process.cwd()}/app/api/studio/credits/route.ts`, 'utf8');
    expect(studio).not.toContain('fetch(');
    expect(studio).not.toContain('cookie');
  });

  it('(e) /api/wallet/deposit never credits the wallet, whatever the flag or body', async () => {
    const { ledgerWalletDeposit } = await import('@/lib/stripe-helpers');
    // Flag OFF -> 403 FEATURE_DISABLED as today.
    let res = await walletDeposit(req({ amountCents: 500, paymentRef: 'pi_never_seen_by_stripe' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('feature_disabled');
    // Flag ON -> 409 deposits_off for every body shape.
    process.env.REAL_MONEY_COMPETITION = '1';
    for (const body of [
      { amountCents: 500, paymentRef: 'pi_never_seen_by_stripe' },
      { amountCents: 500 },                        // no paymentRef
      'not-json',                                   // invalid body
      new Error('bad json'),                        // unparseable body
    ]) {
      res = await walletDeposit(req(body));
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json).toEqual({ error: 'store_closed', reason: 'deposits_off', message: STORE_CLOSED_MESSAGE });
    }
    expect(ledgerWalletDeposit).not.toHaveBeenCalled();
    expect(h.store.ledgerTransaction ?? []).toHaveLength(0);
    expect(h.store.ledgerPosting ?? []).toHaveLength(0);
    expect(h.store.wallet ?? []).toHaveLength(0);
    expect(h.customerCreateCalls).toHaveLength(0);
    expect(h.createCalls).toHaveLength(0);
  });

  it('(g) studio parity: /api/studio/credits and /api/stripe/checkout pass DEEP-EQUAL, pre-B10 params for the same pack', async () => {
    process.env.VIRTUAL_PURCHASES_ENABLED = '1';
    process.env.STUDIO_CREATOR_ENABLED = '1';
    process.env.NEXTAUTH_URL = 'https://fel.example';
    const itemKey = 'studio-credits-5';
    const pack = STUDIO_CREDIT_PACKS[itemKey];

    const r1 = await studioCredits(req({ itemKey }));
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ url: 'https://stripe.test/pay' });
    const r2 = await stripeCheckout(req({ product: 'STUDIO_CREDITS', itemKey }));
    expect(r2.status).toBe(200);
    expect(await r2.json()).toEqual({ url: 'https://stripe.test/pay' });

    expect(h.createCalls).toHaveLength(2);
    expect(h.createCalls[1]).toEqual(h.createCalls[0]);
    // The tracked customer is the one ensureStripeCustomer found-or-created for this user.
    expect(h.createCalls[0].customer).toBe(h.store.stripeCustomer[0].stripeCustomerId);
    expect(h.createCalls[0]).toEqual({
      customer: h.store.stripeCustomer[0].stripeCustomerId,
      mode: 'payment',
      payment_method_types: paymentMethodsFor('payment'),
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: pack.label, description: `${pack.credits} NEXUS Studio build credits` },
          unit_amount: pack.priceUsdCents,
        },
        quantity: 1,
      }],
      metadata: { userId: USER, product: 'STUDIO_CREDITS', itemKey, credits: String(pack.credits) },
      success_url: 'https://fel.example/studio?credits=success&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://fel.example/studio?credits=cancel',
    });
    expect(h.fetchCalls).toHaveLength(0);
  });

  it('(h) source: nothing under app/ imports lib/babylon/server/subscriptionApi by any path', () => {
    const appDir = join(process.cwd(), 'app');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) files.push(p);
      }
    };
    walk(appDir);
    const specifier = /(?:import\s[^'"]*|export\s[^'"]*from\s*|require\(\s*|import\(\s*)['"]([^'"]+)['"]/g;
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(specifier)) {
        const spec = m[1];
        const hits =
          spec === '@/lib/babylon/server/subscriptionApi' ||
          /(^|\/)babylon\/server\/subscriptionApi(\.[a-z]+)?$/.test(spec);
        expect(hits, `${file} imports ${spec}`).toBe(false);
      }
    }
  });

  it('(f-mirror) purchasesEnabledFromEnv: a live key alone is false; the flag turns it on; 0/empty/false stay off', async () => {
    const { purchasesEnabledFromEnv } = await import('@/lib/wallet/purchases');
    expect(purchasesEnabledFromEnv({ STRIPE_SECRET_KEY: 'sk_live_fake' })).toBe(false);
    expect(purchasesEnabledFromEnv({ STRIPE_SECRET_KEY: 'sk_live_fake', VIRTUAL_PURCHASES_ENABLED: '1' })).toBe(true);
    expect(purchasesEnabledFromEnv({ STRIPE_SECRET_KEY: 'sk_live_fake', VIRTUAL_PURCHASES_ENABLED: '0' })).toBe(false);
    expect(purchasesEnabledFromEnv({ STRIPE_SECRET_KEY: 'sk_live_fake', VIRTUAL_PURCHASES_ENABLED: '' })).toBe(false);
    expect(purchasesEnabledFromEnv({ STRIPE_SECRET_KEY: 'sk_live_fake', VIRTUAL_PURCHASES_ENABLED: 'false' })).toBe(false);
  });
});
