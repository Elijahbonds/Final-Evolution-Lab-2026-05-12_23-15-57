// LAUNCH-SALES (P0, 2026-10-20): the three paths every launch product must prove before its switch goes on, in
// Stripe TEST mode with fake keys (STORE-READY B10: "each needs an 18+ check and a refund path"):
//
//   1. a verified adult can buy it (the real checkout route answers 200 and opens a Checkout Session; the shared
//      webhook then grants it);
//   2. an under-18 account and an unknown-age account are refused: 403 adults_only, nothing created at Stripe;
//   3. a refund (charge.refunded, delivered to the SHARED /api/stripe/webhook) revokes the entitlement.
//
// Products here: FEL Pro weekly and monthly, the season pass PRO lane, the cosmetic SKU, coin packs, books (and shard
// packs, which are not on the launch list but share the gate). The coach store's kinds are in
// lib/coach-store/launch-sales-matrix.test.ts. Every switch is turned on INSIDE this file only; the defaults stay off.
//
// Real code under test: the checkout routes, app/api/stripe/webhook, lib/stripe/checkout-fulfil, refund-revoke,
// basil-shapes, the ledger, the book store and revokeProLane. Faked: Stripe (tests/helpers/stripeSales.ts), the
// session, Prisma (write-spy tables behind Prisma's Invalid Date check), the wallet's balance writes (spied; the wallet
// suite owns them) and the season unlock (spied; its back-fill needs a full season table).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newSpyDb, type SpyDb } from '@/tests/helpers/writeSpyDb';
import {
  ADULT, MINOR, UNKNOWN_AGE, chargeFixture, checkoutSessionFixture, eventFixture, fakeStripe, guardedPrisma,
  invoiceFixture, jsonRequest, seedBuyers, subscriptionFixture, webhookRequest, withMissingTables, type FakeStripe,
} from '@/tests/helpers/stripeSales';

const h = vi.hoisted(() => ({
  db: null as unknown as SpyDb,
  stripe: null as unknown as FakeStripe,
  user: null as string | null,
  wallet: { grants: [] as any[], refunds: [] as any[] },
  unlocks: [] as any[],
  missingTables: [] as string[],
}));

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(async () => (h.user ? { user: { id: h.user, email: `${h.user}@fel.test` } } : null)),
}));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ get prisma() { return withMissingTables(guardedPrisma(h.db), h.missingTables); } }));
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
  unlockProLane: vi.fn(async (a: any) => { h.unlocks.push(a); return { seasonKey: 's1', tier: 2, backfilled: 2, delivered: 2 }; }),
}));
vi.mock('@/lib/wallet/wallet-service', () => {
  const grant = (kind: string) => vi.fn(async (_db: unknown, a: any) => { h.wallet.grants.push({ kind, ...a }); return { entry_id: `we-${h.wallet.grants.length}`, balances: { coins: 0, shards: 0, lc: 0 } }; });
  const refund = (kind: string) => vi.fn(async (_db: unknown, a: any) => { h.wallet.refunds.push({ kind, ...a }); return { entry_id: `wr-${h.wallet.refunds.length}`, balances: { coins: 0, shards: 0, lc: 0 } }; });
  return { grantCoinPurchase: grant('coins'), grantShardPurchase: grant('shards'), refundCoins: refund('coins'), refundShards: refund('shards') };
});

const { POST: stripeCheckout } = await import('@/app/api/stripe/checkout/route');
const { POST: seasonCheckout } = await import('@/app/api/season/checkout/route');
const { POST: coinCheckout } = await import('@/app/api/v1/wallet/checkout/route');
const { POST: shardCheckout } = await import('@/app/api/v1/wallet/shard-checkout/route');
const { POST: bookCheckout } = await import('@/app/api/books/checkout/route');
const { POST: studioCredits } = await import('@/app/api/studio/credits/route');
const { POST: webhook } = await import('@/app/api/stripe/webhook/route');
const { hasActivePro } = await import('@/lib/progression/upgradeGate');
const { BOOKS } = await import('@/lib/books/bookCatalog');
const { bookOfferAllowed } = await import('@/lib/books/bookTerms');
const { STORE_TERMS_VERSION } = await import('@/lib/store-terms');
// test changed (owner-approvals, 2026-10-27, card C28): FEL Pro buyers tick the Purchase Terms now (lib/payments/terms.ts
// BUYER_TERMS.fel_pro), not the coach store's terms; books still tick the store terms. The assertions are unchanged.
const { BUYER_TERMS } = await import('@/lib/payments/terms');
const FEL_PRO_TERMS_VERSION = BUYER_TERMS.fel_pro.version;

const ENV: Record<string, string> = {
  STRIPE_SECRET_KEY: 'sk_test_launch_sales_fake',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_fake',
  NEXTAUTH_URL: 'https://fel.test',
  VIRTUAL_PURCHASES_ENABLED: '1',
  SEASON_PASS_PURCHASE: '1',
  SEASON_PASS_PRO_PRICE_USD_CENTS: '999',
  BOOK_STORE_ENABLED: '1',
};
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  h.db = newSpyDb();
  h.stripe = fakeStripe();
  h.user = ADULT;
  h.wallet = { grants: [], refunds: [] };
  h.unlocks = [];
  h.missingTables = [];
  seedBuyers(h.db);
  (h.db.tables.stripeCustomer ??= []).push({ id: 'sc-adult', userId: ADULT, stripeCustomerId: 'cus_adult' });
  for (const [k, v] of Object.entries(ENV)) { saved[k] = process.env[k]; process.env[k] = v; }
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  for (const k of Object.keys(ENV)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  vi.restoreAllMocks();
});

async function call(route: (req: any) => Promise<Response>, body: unknown) {
  const res = await route(jsonRequest(body));
  return { status: res.status, json: await res.json() };
}
async function deliver(type: string, object: unknown, id?: string) {
  const res = await webhook(webhookRequest(eventFixture(type, object, id)));
  return { status: res.status, json: await res.json() };
}

/** The refusal half of the matrix: under 18 and unknown age, 403 with the reason, nothing at Stripe. */
async function expectMinorsRefused(route: (req: any) => Promise<Response>, body: unknown, withReason = true) {
  for (const [user, reason] of [[MINOR, 'under_18'], [UNKNOWN_AGE, 'age_unknown']] as const) {
    h.user = user;
    const r = await call(route, body);
    expect(r.status, `${user}`).toBe(403);
    expect(r.json.error, `${user}`).toBe('adults_only');
    if (withReason) expect(r.json.reason, `${user}`).toBe(reason);
  }
  expect(h.stripe.created).toHaveLength(0);
  expect(h.stripe.customersCreated).toHaveLength(0);
  h.user = ADULT;
}

const proActive = async () => hasActivePro(h.db.tables.subscription ?? []);
const ledgerKinds = () => (h.db.tables.ledgerTransaction ?? []).map((t) => t.kind);

// ── FEL Pro, both cadences ────────────────────────────────────────────────────────────────────────────────────
describe.each([
  ['weekly', 'FEL_PRO', 600, 'week'],
  ['monthly', 'FEL_PRO_MONTHLY', 999, 'month'],
] as const)('FEL Pro %s', (_label, plan, cents, interval) => {
  const subId = `sub_${plan}`;
  const pi = `pi_${plan}`;

  // test changed (payments-ready): FEL Pro now needs the buyer's store-terms tick before Stripe is called, so the buy
  // sends it, and the session and subscription metadata carry the accepted version and time beside the old keys.
  async function buyAndPay() {
    const r = await call(stripeCheckout, { product: plan, termsAccepted: true, termsVersion: FEL_PRO_TERMS_VERSION });
    expect(r.status).toBe(200);
    expect(r.json.url).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    const params = h.stripe.created[0];
    expect(params.mode).toBe('subscription');
    expect(params.line_items[0].price_data).toMatchObject({ unit_amount: cents, recurring: { interval } });
    const meta = { userId: ADULT, product: 'FEL_PRO', plan, terms_version: FEL_PRO_TERMS_VERSION, terms_accepted_at: expect.stringMatching(/^\d{4}-\d\d-\d\dT/) };
    expect(params.metadata).toEqual(meta);
    expect(params.subscription_data.metadata).toEqual(meta);
    // Stripe completes the checkout and bills the first invoice; both reach the shared webhook.
    h.stripe.subscriptions[subId] = subscriptionFixture({ id: subId, metadata: params.subscription_data.metadata });
    const session = checkoutSessionFixture({ id: `cs_${plan}`, mode: 'subscription', amountTotal: cents, subscription: subId, metadata: params.metadata });
    h.stripe.sessions[session.id] = session;
    h.stripe.invoices[`in_${plan}`] = invoiceFixture({ id: `in_${plan}`, subscription: subId, paymentIntent: pi, amountPaid: cents, billingReason: 'subscription_create', metadata: params.metadata });
    expect((await deliver('checkout.session.completed', session)).status).toBe(200);
    expect((await deliver('invoice.paid', h.stripe.invoices[`in_${plan}`])).status).toBe(200);
    return session;
  }

  it('a verified adult buys it and gets Pro', async () => {
    await buyAndPay();
    expect(await proActive()).toBe(true);
    expect(ledgerKinds()).toContain('SUBSCRIPTION_PAYMENT_FEL_PRO');
  });

  it('under 18 and unknown age: 403 adults_only with the reason, nothing at Stripe', async () => {
    await expectMinorsRefused(stripeCheckout, { product: plan });
  });

  it('a full refund revokes Pro, reverses the payment, stops billing, and a replay does not re-grant', async () => {
    const session = await buyAndPay();
    const refund = eventFixture('charge.refunded', chargeFixture({ id: `ch_${plan}`, paymentIntent: pi, amount: cents }), `evt_refund_${plan}`);
    const r = await webhook(webhookRequest(refund));
    expect(r.status).toBe(200);
    expect((await r.json()).refund).toBe('subscription');
    expect(await proActive()).toBe(false);
    expect(h.db.tables.subscription[0].status).toBe('CANCELED');
    expect(h.stripe.cancelled).toEqual([subId]);
    expect(ledgerKinds().filter((k) => k === 'SUBSCRIPTION_REFUND_FEL_PRO')).toHaveLength(1);

    // Stripe retries the refund event; the success page re-verifies the old session: nothing comes back.
    expect((await webhook(webhookRequest(refund))).status).toBe(200);
    expect((await deliver('checkout.session.completed', session)).status).toBe(200);
    expect(await proActive()).toBe(false);
    expect(h.stripe.cancelled).toEqual([subId]);
    expect(ledgerKinds().filter((k) => k === 'SUBSCRIPTION_REFUND_FEL_PRO')).toHaveLength(1);
  });

  it('a refund still revokes before the coach-store SQL is applied (Booking/ProgramAccess tables missing)', async () => {
    await buyAndPay();
    h.missingTables = ['booking', 'programAccess'];
    const res = await deliver('charge.refunded', chargeFixture({ id: `ch_m_${plan}`, paymentIntent: pi, amount: cents }));
    h.missingTables = [];
    expect(res.status).toBe(200);
    expect(res.json.refund).toBe('subscription');
    expect(await proActive()).toBe(false);
  });

  it('a partial refund (a goodwill credit) revokes nothing', async () => {
    await buyAndPay();
    const partial = chargeFixture({ id: `ch_p_${plan}`, paymentIntent: pi, amount: cents, refunded: false, amountRefunded: 100 });
    expect((await deliver('charge.refunded', partial)).json.refund).toBe('partial');
    expect(await proActive()).toBe(true);
    expect(h.stripe.cancelled).toEqual([]);
  });
});

// ── Season pass PRO lane ──────────────────────────────────────────────────────────────────────────────────────
describe('Season pass PRO lane', () => {
  it('a verified adult buys it; the SHARED webhook opens the lane', async () => {
    const r = await call(seasonCheckout, {});
    expect(r.status).toBe(200);
    const params = h.stripe.created[0];
    expect(params.line_items[0].price_data.unit_amount).toBe(999);
    expect(params.payment_intent_data.metadata).toEqual({ playerId: ADULT, product: 'SEASON_PASS_PRO', seasonId: 'season-1' });
    const session = checkoutSessionFixture({ id: 'cs_season', amountTotal: 999, paymentIntent: 'pi_season', clientReferenceId: ADULT, metadata: params.metadata });
    const res = await deliver('checkout.session.completed', session);
    expect(res.status).toBe(200);
    expect(res.json.pro_unlocked).toBe('s1');
    expect(h.unlocks).toEqual([{ userId: ADULT, seasonId: 'season-1', stripeEventId: 'stripe-session:cs_season' }]);
  });

  it('under 18 and unknown age: 403 adults_only with the reason, nothing at Stripe', async () => {
    await expectMinorsRefused(seasonCheckout, {});
  });

  it('a refund closes the lane and withdraws its cosmetics (free-lane items stay)', async () => {
    (h.db.tables.season ??= []).push({ id: 'season-1', key: 's1' });
    (h.db.tables.passProgress ??= []).push({ userId: ADULT, seasonId: 'season-1', hasPro: true });
    (h.db.tables.passGrant ??= []).push(
      { userId: ADULT, seasonId: 'season-1', lane: 'pro', reward: { id: 'cos-pro-1' } },
      { userId: ADULT, seasonId: 'season-1', lane: 'free', reward: { id: 'cos-free-1' } },
    );
    (h.db.tables.ownedWearable ??= []).push({ userId: ADULT, itemId: 'cos-pro-1' }, { userId: ADULT, itemId: 'cos-free-1' });
    const charge = chargeFixture({ id: 'ch_season', paymentIntent: 'pi_season', amount: 999, metadata: { playerId: ADULT, product: 'SEASON_PASS_PRO', seasonId: 'season-1' } });
    const res = await deliver('charge.refunded', charge);
    expect(res.status).toBe(200);
    expect(res.json.refund).toBe('wallet');
    expect(h.db.tables.passProgress[0].hasPro).toBe(false);
    expect(h.db.tables.ownedWearable.map((w) => w.itemId)).toEqual(['cos-free-1']);
  });
});

// ── The cosmetic SKU ──────────────────────────────────────────────────────────────────────────────────────────
describe('Cosmetic (COSMETIC_SKUS)', () => {
  async function buyAndPay() {
    const r = await call(stripeCheckout, { product: 'COSMETIC', itemKey: 'cosm-chrome-visor' });
    expect(r.status).toBe(200);
    const params = h.stripe.created[0];
    expect(params.payment_intent_data.metadata).toEqual({ userId: ADULT, product: 'COSMETIC', itemKey: 'cosm-chrome-visor' });
    const session = checkoutSessionFixture({ id: 'cs_cos', amountTotal: 499, paymentIntent: 'pi_cos', metadata: params.metadata });
    h.stripe.sessions[session.id] = session;
    expect((await deliver('checkout.session.completed', session)).status).toBe(200);
    return session;
  }

  it('a verified adult buys it (Order PAID, sale booked)', async () => {
    await buyAndPay();
    expect(h.db.tables.order[0]).toMatchObject({ userId: ADULT, type: 'COSMETIC', status: 'PAID', itemKey: 'cosm-chrome-visor' });
    expect(ledgerKinds()).toEqual(['COSMETIC_PURCHASE']);
  });

  it('under 18 and unknown age: 403 adults_only with the reason, nothing at Stripe', async () => {
    await expectMinorsRefused(stripeCheckout, { product: 'COSMETIC', itemKey: 'cosm-chrome-visor' });
  });

  it('a refund marks the Order REFUNDED and reverses the sale; a replayed checkout does not flip it back', async () => {
    const session = await buyAndPay();
    const charge = chargeFixture({ id: 'ch_cos', paymentIntent: 'pi_cos', amount: 499, metadata: { userId: ADULT, product: 'COSMETIC', itemKey: 'cosm-chrome-visor' } });
    expect((await deliver('charge.refunded', charge)).json.refund).toBe('order');
    expect(h.db.tables.order[0].status).toBe('REFUNDED');
    expect(ledgerKinds()).toEqual(['COSMETIC_PURCHASE', 'COSMETIC_REFUND']);
    expect((await deliver('checkout.session.completed', session)).status).toBe(200);
    expect(h.db.tables.order[0].status).toBe('REFUNDED');
    expect(ledgerKinds()).toEqual(['COSMETIC_PURCHASE', 'COSMETIC_REFUND']);
  });
});

// ── Coin packs (the currency cosmetics are bought with) ───────────────────────────────────────────────────────
describe('Coin pack (/api/v1/wallet/checkout)', () => {
  it('a verified adult buys it; the SHARED webhook mints the coins once per session', async () => {
    const r = await call(coinCheckout, { pack_id: 'coins_starter' });
    expect(r.status).toBe(200);
    const params = h.stripe.created[0];
    const session = checkoutSessionFixture({ id: 'cs_coins', amountTotal: 199, paymentIntent: 'pi_coins', clientReferenceId: ADULT, metadata: params.metadata });
    expect((await deliver('checkout.session.completed', session)).status).toBe(200);
    expect((await deliver('checkout.session.completed', session)).status).toBe(200);
    expect(h.wallet.grants.map((g) => [g.kind, g.playerId, g.coins, g.idempotencyKey])).toEqual([
      ['coins', ADULT, 500, 'stripe-session:cs_coins'],
      ['coins', ADULT, 500, 'stripe-session:cs_coins'], // the wallet dedupes on this key (its own suite)
    ]);
  });

  it('under 18 and unknown age: 403 adults_only with the reason, nothing at Stripe', async () => {
    await expectMinorsRefused(coinCheckout, { pack_id: 'coins_starter' });
  });

  it('a refund debits the coins back (the wallet clamps at 0)', async () => {
    const charge = chargeFixture({ id: 'ch_coins', paymentIntent: 'pi_coins', amount: 199, metadata: { playerId: ADULT, coins: '500' } });
    const res = await deliver('charge.refunded', charge, 'evt_coin_refund');
    expect(res.json.refund).toBe('wallet');
    expect(h.wallet.refunds).toEqual([expect.objectContaining({ kind: 'coins', playerId: ADULT, coins: 500, idempotencyKey: 'evt_coin_refund' })]);
  });
});

describe('Shard pack (not on the launch list; same gate)', () => {
  it('adult 200; under 18 and unknown age 403 adults_only', async () => {
    expect((await call(shardCheckout, { pack_id: 'pack_starter' })).status).toBe(200);
    h.stripe.created = [];
    h.stripe.customersCreated = [];
    await expectMinorsRefused(shardCheckout, { pack_id: 'pack_starter' });
  });
});

describe('Studio credit packs (not on the launch list; same gate on both doors)', () => {
  it('adult 200; under 18 and unknown age 403 adults_only', async () => {
    process.env.STUDIO_CREATOR_ENABLED = '1';
    try {
      expect((await call(studioCredits, { itemKey: 'studio-credits-5' })).status).toBe(200);
      expect((await call(stripeCheckout, { product: 'STUDIO_CREDITS', itemKey: 'studio-credits-5' })).status).toBe(200);
      h.stripe.created = [];
      h.stripe.customersCreated = [];
      await expectMinorsRefused(studioCredits, { itemKey: 'studio-credits-5' });
      await expectMinorsRefused(stripeCheckout, { product: 'STUDIO_CREDITS', itemKey: 'studio-credits-5' });
    } finally {
      delete process.env.STUDIO_CREATOR_ENABLED;
    }
  });
});

// ── Books ─────────────────────────────────────────────────────────────────────────────────────────────────────
const offer = BOOKS.flatMap((b) => b.offers).find((o) => bookOfferAllowed(o))!;
const bookBody = { offerId: offer?.id, termsAccepted: true, termsVersion: STORE_TERMS_VERSION };

describe('Books (/api/books/checkout)', () => {
  const body = bookBody;

  async function buyAndPay() {
    const r = await call(bookCheckout, body);
    expect(r.status).toBe(200);
    const params = h.stripe.created[0];
    const session = checkoutSessionFixture({ id: 'cs_book', amountTotal: offer.priceCents, paymentIntent: 'pi_book', metadata: params.metadata });
    (session as any).customer_details = { email: `${ADULT}@fel.test` };
    expect((await deliver('checkout.session.completed', session)).status).toBe(200);
  }

  it('there is an offer the current store terms sell', () => {
    expect(offer).toBeTruthy();
    expect(offer.format).toBe('audiobook');
  });

  it('a verified adult buys it (an ACTIVE entitlement)', async () => {
    await buyAndPay();
    expect(h.db.tables.bookEntitlement[0]).toMatchObject({ offerId: offer.id, status: 'ACTIVE', stripePaymentIntentId: 'pi_book' });
  });

  it('under 18 and unknown age: 403 adults_only, nothing at Stripe', async () => {
    // The book shop answers { error: 'adults_only' } without the reason field (its own route, unchanged).
    await expectMinorsRefused(bookCheckout, body, false);
  });

  it('a refund revokes the entitlement', async () => {
    await buyAndPay();
    const res = await deliver('charge.refunded', chargeFixture({ id: 'ch_book', paymentIntent: 'pi_book', amount: offer.priceCents }));
    expect(res.status).toBe(200);
    expect(h.db.tables.bookEntitlement[0].status).toBe('REVOKED');
  });
});

// ── The switches stay OFF by default ──────────────────────────────────────────────────────────────────────────
describe('nothing sells with the switches at their defaults', () => {
  it('every route above is 409 store_closed with VIRTUAL_PURCHASES_ENABLED / BOOK_STORE_ENABLED / SEASON_PASS_PURCHASE unset', async () => {
    for (const k of ['VIRTUAL_PURCHASES_ENABLED', 'BOOK_STORE_ENABLED', 'SEASON_PASS_PURCHASE', 'SEASON_PASS_PRO_PRICE_USD_CENTS']) delete process.env[k];
    for (const [route, b] of [
      [stripeCheckout, { product: 'FEL_PRO' }], [stripeCheckout, { product: 'COSMETIC', itemKey: 'cosm-chrome-visor' }],
      [coinCheckout, { pack_id: 'coins_starter' }], [bookCheckout, bookBody],
    ] as const) {
      const r = await call(route as any, b);
      expect(r.status).toBe(409);
      expect(r.json.error).toBe('store_closed');
    }
    expect((await call(seasonCheckout, {})).status).toBe(403); // SEASON_PASS_PURCHASE off: feature_disabled
    expect(h.stripe.created).toHaveLength(0);
  });
});
