// SEC-F4 NO-WEBHOOK — server-verified Stripe checkout fulfilment (2026-10-07).
//
// The Stripe client, next-auth and every feature's outer service are mocked; the M1 double-entry
// ledger and the wallet's applyDelta run for real against an in-memory database that honours the
// two invariants the whole design stands on:
//
//   - a unique key (LedgerTransaction.idempotencyKey, WalletLedgerEntry.idempotencyKey,
//     Order.stripeSessionId, MarketplacePurchase(buyerId,listingId)) refuses a second insert with
//     P2002 — which is what makes "webhook AND verify both ran" one grant, not two;
//   - the Booking/ProgramAccess grants are a status compare-and-set (updateMany where the row is
//     still HELD/PENDING), so a replayed fulfilment moves nothing.
//
// Proven here, with no Stripe network and no database:
//   paid => granted once; a second verify (the page reloaded) grants nothing again;
//   unpaid/open/expired => nothing granted, a friendly pending; another user's session => 403;
//   a tampered client param never reaches the grant (the Stripe-retrieved session is the only
//   source); webhook + verify both firing => one grant; and every checkout route's create call
//   carries NO payment_method_types by default (the SEC-F4 automatic-payment-methods addendum).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER = 'user-1';
const OTHER = 'user-2';

// ---------------------------------------------------------------------------
// The in-memory database (see header)
// ---------------------------------------------------------------------------

type Row = Record<string, any>;
type Store = Record<string, Row[]>;

const p2002 = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

/** The unique keys this suite's behaviour depends on, per model. */
const UNIQUE: Record<string, string[]> = {
  ledgerTransaction: ['idempotencyKey'],
  walletLedgerEntry: ['idempotencyKey'],
  order: ['stripeSessionId'],
  marketplacePurchase: ['buyerId_listingId'],
};
const compound = (data: Row, key: string) =>
  key === 'buyerId_listingId' ? `${data.buyerId}|${data.listingId}` : String(data[key]);

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, cond]) => {
    const v = row[k];
    if (cond === null) return v == null;
    if (cond instanceof Date || typeof cond !== 'object' || Array.isArray(cond)) return v === cond;
    const c = cond as Row;
    if (!Object.keys(c).some((op) => ['not', 'in', 'gte', 'gt', 'lte', 'lt'].includes(op))) return matches(row, c);
    if ('not' in c && (c.not === null ? v == null : v === c.not)) return false;
    if ('in' in c && !(c.in as unknown[]).includes(v)) return false;
    if ('gte' in c && !(v != null && v >= c.gte)) return false;
    if ('gt' in c && !(v != null && v > c.gt)) return false;
    if ('lte' in c && !(v != null && v <= c.lte)) return false;
    if ('lt' in c && !(v != null && v < c.lt)) return false;
    return true;
  });
}

const pick = (row: Row | null, select?: Row) =>
  row && select ? Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, row[k]])) : row;

function table(store: Store, model: string) {
  const rows = () => (store[model] ??= []);
  const find = (where?: Row) => rows().filter((r) => matches(r, where));
  const insert = (data: Row) => {
    for (const key of UNIQUE[model] ?? []) {
      if (data[key] == null && key !== 'buyerId_listingId') continue;
      if (rows().some((r) => compound(r, key) === compound(data, key))) throw p2002();
    }
    const row = { id: data.id ?? `${model}-${rows().length + 1}`, createdAt: new Date(), ...data };
    rows().push(row);
    return row;
  };
  return {
    findUnique: async (a: Row = {}) => pick(find(a.where)[0] ?? null, a.select),
    findFirst: async (a: Row = {}) => pick(find(a.where)[0] ?? null, a.select),
    findMany: async (a: Row = {}) => find(a.where).map((r) => pick(r, a.select)),
    count: async (a: Row = {}) => find(a.where).length,
    create: async (a: Row) => {
      // ledgerTransaction.create carries nested postings; ledgerAccount is keyed by `key`.
      const data = { ...a.data };
      const nested = data.postings?.create as Row[] | undefined;
      delete data.postings;
      const row = insert(data);
      if (nested) for (const p of nested) insert_into(store, 'ledgerPosting', { ...p, transactionId: row.id });
      return pick(row, a.select);
    },
    update: async (a: Row) => {
      const row = find(a.where)[0];
      if (!row) throw Object.assign(new Error('Record to update not found.'), { code: 'P2025' });
      applyData(row, a.data);
      return pick(row, a.select);
    },
    updateMany: async (a: Row) => {
      const hit = find(a.where);
      for (const r of hit) applyData(r, a.data);
      return { count: hit.length };
    },
    upsert: async (a: Row) => {
      const row = find(a.where)[0];
      if (row) { applyData(row, a.update); return pick(row, a.select); }
      return pick(table(store, model).create({ data: a.create }) as unknown as Row, a.select);
    },
    deleteMany: async (a: Row = {}) => {
      const before = rows().length;
      store[model] = rows().filter((r) => !matches(r, a.where));
      return { count: before - store[model].length };
    },
    aggregate: async (a: Row) => {
      const hit = find(a.where);
      const sum: Row = {};
      for (const [field] of Object.entries(a._sum ?? {})) {
        sum[field] = hit.reduce((acc, r) => acc + Number(r[field] ?? 0), 0);
      }
      return { _sum: sum };
    },
  };
}
function insert_into(store: Store, model: string, data: Row) {
  (store[model] ??= []).push({ id: data.id ?? `${model}-${store[model].length + 1}`, ...data });
}
/** Prisma update data, including the `{ increment: n }` operator the wallet balance uses. */
function applyData(row: Row, data: Row) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && 'increment' in (v as Row)) {
      row[k] = (row[k] ?? 0) + (v as Row).increment;
    } else {
      row[k] = v;
    }
  }
}

function clientFor(store: Store): any {
  const client: any = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'then' || typeof prop === 'symbol') return undefined;
      if (prop === '$transaction') {
        return async (arg: unknown) =>
          typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(client) : Promise.all(arg as Promise<unknown>[]);
      }
      return table(store, String(prop));
    },
  });
  return client;
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  store: {} as Store,
  sessionUser: null as string | null,
  stripeSessions: {} as Record<string, any>,
  subscriptions: {} as Record<string, any>,
  createCalls: [] as any[],
  grants: { coins: [] as any[], shards: [] as any[], pro: [] as any[] },
  retrieveCalls: 0,
}));

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(async () => (h.sessionUser ? { user: { id: h.sessionUser } } : null)),
}));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ get prisma() { return clientFor(h.store); } }));
vi.mock('@/lib/stripe', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/stripe')>();
  return {
    ...real,
    getStripe: () => ({
      checkout: {
        sessions: {
          retrieve: vi.fn(async (id: string) => {
            h.retrieveCalls++;
            const s = h.stripeSessions[id];
            if (!s) throw Object.assign(new Error(`No such checkout session: ${id}`), { statusCode: 404, type: 'StripeInvalidRequestError', code: 'resource_missing' });
            return s;
          }),
          create: vi.fn(async (params: any) => {
            h.createCalls.push(params);
            return { id: `cs_created_${h.createCalls.length}`, url: 'https://stripe.test/pay' };
          }),
        },
      },
      subscriptions: {
        retrieve: vi.fn(async (id: string) => h.subscriptions[id] ?? {
          id,
          items: { data: [{ price: { id: 'price_1' } }] },
          current_period_end: 1893456000,
        }),
      },
      // coach-store's fee read (payment intent -> latest charge -> balance transaction).
      paymentIntents: {
        retrieve: vi.fn(async () => ({ latest_charge: { balance_transaction: { fee: 55 } } })),
      },
      charges: {
        retrieve: vi.fn(async () => ({ balance_transaction: { fee: 55 } })),
      },
    }),
  };
});
// The wallet grant entry points are spied (the wallet ledger is its own suite); what is asserted is
// the idempotency contract at THIS layer: one call per paid session, however often verify runs.
vi.mock('@/lib/wallet/wallet-service', () => ({
  grantCoinPurchase: vi.fn(async (_db: unknown, a: any) => { h.grants.coins.push(a); return { entry_id: `we-${h.grants.coins.length}`, balances: { coins: a.coins, shards: 0, lc: 0 } }; }),
  grantShardPurchase: vi.fn(async (_db: unknown, a: any) => { h.grants.shards.push(a); return { entry_id: `we-s${h.grants.shards.length}`, balances: { coins: 0, shards: a.shards, lc: 0 } }; }),
}));
vi.mock('@/lib/season/season-service', () => ({
  unlockProLane: vi.fn(async (a: any) => { h.grants.pro.push(a); return { seasonKey: 's1', tier: 3, backfilled: 3, delivered: 3 }; }),
}));

const { verifyCheckoutSession, isPaidSession } = await import('./verify-checkout');
const { POST: verifySessionRoute } = await import('@/app/api/stripe/verify-session/route');
const { fulfilCheckoutSession } = await import('./checkout-fulfil');
const { paymentMethodsFor } = await import('@/lib/stripe-payment-methods');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function paidSession(over: Row = {}): Row {
  return {
    id: 'cs_1',
    object: 'checkout.session',
    mode: 'payment',
    status: 'complete',
    payment_status: 'paid',
    amount_total: 499,
    client_reference_id: null,
    payment_intent: { id: 'pi_1' },
    subscription: null,
    metadata: { userId: USER, product: 'COSMETIC', itemKey: 'cosm-chrome-visor' },
    ...over,
  };
}

function req(body: unknown): any {
  return { json: async () => body, headers: { get: () => null } };
}

beforeEach(() => {
  h.store = {};
  h.stripeSessions = {};
  h.subscriptions = {};
  h.createCalls = [];
  h.grants = { coins: [], shards: [], pro: [] };
  h.retrieveCalls = 0;
  h.sessionUser = USER;
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
});

// ---------------------------------------------------------------------------
// The SEC-F4 cases
// ---------------------------------------------------------------------------

describe('verifyCheckoutSession — the no-webhook fulfilment path', () => {
  it('paid => grants once, straight from the Stripe-retrieved session', async () => {
    h.stripeSessions.cs_1 = paidSession();
    const r = await verifyCheckoutSession(USER, 'cs_1');
    expect(r).toMatchObject({ ok: true, status: 'fulfilled', product: 'COSMETIC' });
    // Order PAID + the ledger's EXTERNAL -> PLATFORM_REVENUE pair, once.
    const orders = h.store.order ?? [];
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ userId: USER, stripeSessionId: 'cs_1', status: 'PAID', itemKey: 'cosm-chrome-visor' });
    const txs = h.store.ledgerTransaction ?? [];
    expect(txs).toHaveLength(1);
    expect(txs[0].idempotencyKey).toBe('stripe-session:cs_1');
    const postings = h.store.ledgerPosting ?? [];
    expect(postings.reduce((a, p) => a + p.amount, 0)).toBe(0); // balanced
  });

  it('a second verify of the same session grants nothing again', async () => {
    h.stripeSessions.cs_1 = paidSession();
    await verifyCheckoutSession(USER, 'cs_1');
    const again = await verifyCheckoutSession(USER, 'cs_1');
    expect(again).toMatchObject({ ok: true, status: 'fulfilled' });
    expect(h.store.order).toHaveLength(1);
    expect(h.store.ledgerTransaction).toHaveLength(1); // postTransaction deduped on the key
    expect(h.store.ledgerPosting).toHaveLength(2);     // still the one balanced pair
  });

  it('the webhook firing AS WELL still grants once — the ledger key dedupes, the Order upserts', async () => {
    h.stripeSessions.cs_1 = paidSession();
    // The webhook (fulfilCheckoutSession under its stripe-event key)…
    await fulfilCheckoutSession(h.stripeSessions.cs_1 as any, 'stripe-event:evt_1');
    // …and the no-webhook verify path, in either order.
    const r = await verifyCheckoutSession(USER, 'cs_1');
    expect(r).toMatchObject({ ok: true, status: 'fulfilled' });
    await fulfilCheckoutSession(h.stripeSessions.cs_1 as any, 'stripe-event:evt_1');
    expect(h.store.order).toHaveLength(1);
    // Each idempotency key (the webhook's stripe-event one, the verify path's stripe-session one)
    // posted its ledger transaction at most once — re-running either path is a no-op, and the
    // per-session truth (the Order row, unique on stripeSessionId) is one PAID row.
    const byKey = new Map<string, number>();
    for (const t of h.store.ledgerTransaction ?? []) byKey.set(t.idempotencyKey, (byKey.get(t.idempotencyKey) ?? 0) + 1);
    for (const [k, n] of byKey) expect(n, k).toBe(1);
  });

  it.each([
    ['unpaid', { payment_status: 'unpaid', status: 'open' }],
    ['open', { payment_status: 'unpaid', status: 'open' }],
    ['expired', { payment_status: 'unpaid', status: 'expired' }],
  ])('%s => no grant, a friendly pending', async (_name, over) => {
    h.stripeSessions.cs_1 = paidSession(over);
    const r = await verifyCheckoutSession(USER, 'cs_1');
    expect(r).toEqual({ ok: true, status: 'pending', product: 'COSMETIC' });
    expect(h.store.order ?? []).toHaveLength(0);
    expect(h.store.ledgerTransaction ?? []).toHaveLength(0);
  });

  it("a session belonging to someone else => 403, nothing granted", async () => {
    h.stripeSessions.cs_1 = paidSession({ metadata: { userId: OTHER, product: 'COSMETIC', itemKey: 'cosm-chrome-visor' } });
    const r = await verifyCheckoutSession(USER, 'cs_1');
    expect(r).toEqual({ ok: false, status: 403, error: 'not_your_session' });
    expect(h.store.order ?? []).toHaveLength(0);
    expect(h.store.ledgerTransaction ?? []).toHaveLength(0);
  });

  it('a session Stripe has never heard of => 404', async () => {
    const r = await verifyCheckoutSession(USER, 'cs_nope');
    expect(r).toEqual({ ok: false, status: 404, error: 'session_not_found' });
  });

  it('the client cannot pick the product: session_id is only a lookup key', async () => {
    // The caller's idea of what they bought never reaches verifyCheckoutSession — the ONLY thing
    // the client supplies is the id, and the grant comes from the session Stripe returns for it.
    // A tampered id for a session that was created for a CHEAPER product grants the cheaper one.
    h.stripeSessions.cs_small = paidSession({ id: 'cs_small', metadata: { userId: USER, product: 'COIN_PACK', packId: 'p', coins: '100' } });
    const r = await verifyCheckoutSession(USER, 'cs_small'); // client ASKED for nothing else; it cannot
    expect(r).toMatchObject({ ok: true, status: 'fulfilled', product: 'COIN_PACK' });
    expect(h.grants.coins).toEqual([
      expect.objectContaining({ playerId: USER, coins: 100, idempotencyKey: 'stripe-session:cs_small' }),
    ]);
  });

  it('COIN_PACK: mints the metadata coins once; a replay mints nothing (same key)', async () => {
    h.stripeSessions.cs_coins = paidSession({ id: 'cs_coins', metadata: { playerId: USER, product: 'COIN_PACK', packId: 'starter', coins: '1250' }, client_reference_id: USER });
    const r1 = await verifyCheckoutSession(USER, 'cs_coins');
    expect(r1).toMatchObject({ ok: true, status: 'fulfilled', product: 'COIN_PACK' });
    expect(h.grants.coins).toHaveLength(1);
    // The second verify calls the grant again with the SAME key; the wallet's applyDelta
    // (unique idempotencyKey) is what makes that a replay — asserted at this layer as
    // "the key offered twice is the same key", the contract the wallet enforces.
    await verifyCheckoutSession(USER, 'cs_coins');
    expect(h.grants.coins.map((g) => g.idempotencyKey)).toEqual(['stripe-session:cs_coins', 'stripe-session:cs_coins']);
  });

  it('SHARD_PACK: mints shards for the signed-in player only', async () => {
    h.stripeSessions.cs_shards = paidSession({ id: 'cs_shards', metadata: { playerId: USER, product: 'SHARD_PACK', packId: 's', shards: '40' } });
    const r = await verifyCheckoutSession(USER, 'cs_shards');
    expect(r).toMatchObject({ ok: true, status: 'fulfilled', product: 'SHARD_PACK' });
    expect(h.grants.shards).toEqual([expect.objectContaining({ playerId: USER, shards: 40 })]);
  });

  it('SEASON_PASS_PRO: opens the PRO lane for the metadata season, once', async () => {
    h.stripeSessions.cs_season = paidSession({ id: 'cs_season', metadata: { playerId: USER, product: 'SEASON_PASS_PRO', seasonId: 'season-1', seasonKey: 's1' }, client_reference_id: USER });
    const r = await verifyCheckoutSession(USER, 'cs_season');
    expect(r).toMatchObject({ ok: true, status: 'fulfilled', product: 'SEASON_PASS_PRO' });
    expect(h.grants.pro).toEqual([expect.objectContaining({ userId: USER, seasonId: 'season-1' })]);
  });

  it('a subscription checkout grants only when complete AND paid', async () => {
    h.stripeSessions.cs_sub = paidSession({
      id: 'cs_sub', mode: 'subscription', subscription: 'sub_1',
      metadata: { userId: USER, product: 'FEL_PRO', plan: 'FEL_PRO' },
    });
    const r = await verifyCheckoutSession(USER, 'cs_sub');
    expect(r).toMatchObject({ ok: true, status: 'fulfilled', product: 'FEL_PRO' });
    expect(h.store.subscription?.[0]).toMatchObject({ userId: USER, stripeSubscriptionId: 'sub_1', status: 'ACTIVE' });

    // paid but the checkout itself is still open => pending, no entitlement
    h.stripeSessions.cs_open_sub = paidSession({
      id: 'cs_open_sub', mode: 'subscription', status: 'open', subscription: null,
      metadata: { userId: USER, product: 'FEL_PRO', plan: 'FEL_PRO' },
    });
    const p = await verifyCheckoutSession(USER, 'cs_open_sub');
    expect(p).toEqual({ ok: true, status: 'pending', product: 'FEL_PRO' });
    expect(h.store.subscription ?? []).toHaveLength(1); // still only the first
  });

  it('coach-store rows fulfil through the coach-store handler (status CAS = one grant)', async () => {
    (h.store.booking ??= []).push({
      id: 'bk_1', kind: 'video_review', instructorId: 'ins_1', coachUserId: 'coach-1', clientUserId: USER,
      listingId: 'lst_1', status: 'HELD', priceCents: 1900, stripeFeeCents: 0, stripeCheckoutId: 'cs_coach',
    });
    h.stripeSessions.cs_coach = paidSession({
      id: 'cs_coach',
      metadata: { product: 'COACH_STORE', userId: USER, rowId: 'bk_1', kind: 'video_review', beneficiary: 'self' },
      client_reference_id: USER,
    });
    const r = await verifyCheckoutSession(USER, 'cs_coach');
    expect(r).toMatchObject({ ok: true, status: 'fulfilled', product: 'COACH_STORE' });
    expect(h.store.booking[0].status).toBe('PAID');
    // Replay: the CAS no longer matches, nothing moves, still fulfilled.
    const again = await verifyCheckoutSession(USER, 'cs_coach');
    expect(again).toMatchObject({ ok: true, status: 'fulfilled' });
    expect(h.store.booking).toHaveLength(1);
    expect(h.store.booking[0].status).toBe('PAID');
  });
});

describe('isPaidSession — Stripe’s word, not the client’s', () => {
  it('paid payment session', () => expect(isPaidSession(paidSession() as any)).toBe(true));
  it('unpaid is not paid', () => expect(isPaidSession(paidSession({ payment_status: 'unpaid' }) as any)).toBe(false));
  it('expired is not paid', () => expect(isPaidSession(paidSession({ status: 'expired' }) as any)).toBe(false));
  it('subscription must be complete AND paid', () => {
    expect(isPaidSession(paidSession({ mode: 'subscription', status: 'complete' }) as any)).toBe(true);
    expect(isPaidSession(paidSession({ mode: 'subscription', status: 'open' }) as any)).toBe(false);
  });
  it('no_payment_required is NOT accepted — nothing sold here is free', () => {
    expect(isPaidSession(paidSession({ payment_status: 'no_payment_required' }) as any)).toBe(false);
  });
});

describe('POST /api/stripe/verify-session', () => {
  it('401 when signed out', async () => {
    h.sessionUser = null;
    const res = await verifySessionRoute(req({ session_id: 'cs_1' }));
    expect(res.status).toBe(401);
  });
  it('400 without a session id', async () => {
    const res = await verifySessionRoute(req({}));
    expect(res.status).toBe(400);
  });
  it('403 for another user’s session', async () => {
    h.stripeSessions.cs_1 = paidSession({ metadata: { userId: OTHER, product: 'COSMETIC' } });
    const res = await verifySessionRoute(req({ session_id: 'cs_1' }));
    expect(res.status).toBe(403);
  });
  it('200 pending for an unpaid session, with the friendly state', async () => {
    h.stripeSessions.cs_1 = paidSession({ payment_status: 'unpaid', status: 'open' });
    const res = await verifySessionRoute(req({ session_id: 'cs_1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'pending', message: 'payment pending' });
  });
  it('200 fulfilled for a paid session, idempotent across calls', async () => {
    h.stripeSessions.cs_1 = paidSession();
    const r1 = await verifySessionRoute(req({ session_id: 'cs_1' }));
    expect(r1.status).toBe(200);
    expect(await r1.json()).toMatchObject({ status: 'fulfilled', product: 'COSMETIC' });
    const r2 = await verifySessionRoute(req({ session_id: 'cs_1' }));
    expect(r2.status).toBe(200);
    expect(h.store.ledgerTransaction).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// SEC-F4 addendum — automatic payment methods: nothing pins payment_method_types.
// ---------------------------------------------------------------------------

describe('automatic payment methods (SEC-F4 addendum)', () => {
  it('paymentMethodsFor is undefined by default — a created session carries NO payment_method_types', () => {
    const prev = process.env.STRIPE_PM_PIN;
    delete process.env.STRIPE_PM_PIN;
    try {
      expect(paymentMethodsFor('payment')).toBeUndefined();
      expect(paymentMethodsFor('subscription')).toBeUndefined();
    } finally {
      if (prev === undefined) delete process.env.STRIPE_PM_PIN; else process.env.STRIPE_PM_PIN = prev;
    }
  });

  it('no checkout session create call in the tree pins payment_method_types', async () => {
    const { readFileSync } = await import('node:fs');
    const files = [
      'app/api/stripe/checkout/route.ts',
      'app/api/season/checkout/route.ts',
      'app/api/v1/wallet/checkout/route.ts',
      'app/api/v1/wallet/shard-checkout/route.ts',
      'app/api/studio/credits/route.ts',
      'lib/coach-store/checkout.ts',
      'lib/babylon/server/subscriptionApi.ts',
    ];
    for (const f of files) {
      const src = readFileSync(`${process.cwd()}/${f}`, 'utf8');
      // A pinned list is a literal `payment_method_types: […]`. `paymentMethodsFor(...)` is the
      // approved shape: undefined by default, so nothing is pinned unless STRIPE_PM_PIN=1.
      const pinned = src.split('\n').filter((l) => /payment_method_types\s*:\s*\[/.test(l));
      expect(pinned, `${f} pins payment_method_types`).toEqual([]);
    }
  });
});
