// FOUNDERS-CAP-1 (Cyber COACH-STORE-CHECKOUT-SIGNOFF 2026-11-03, L2; v2: PM ruling + Cyber review 2026-11-10 H1/H2/Q3/M1):
// the server cap on the 10 Founders spots, behind FOUNDERS_CAP_ENABLED (default off). NEW tests only. In-memory DB + mocked Stripe, the pattern of rebuy-checkout.test.ts;
// the advisory lock is modelled as a real per-key mutex so the race test proves the claim serializes (and the control
// case, with the lock made a no-op, proves the race is real without it).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORE_TERMS_VERSION } from '@/lib/store-terms';
import { FOUNDERS_SPOTS, FOUNDERS_PRICE_CENTS } from './storeOffers';
import { HOLD_MINUTES } from './constants';

const h = vi.hoisted(() => ({
  db: null as any,
  store: {} as Record<string, any[]>,
  lockOn: true,
  lockCalls: [] as { sql: string; key: unknown }[],
  customerCreates: 0,
  sessionCreates: 0,
  failSessionCreate: false,
  subs: {} as Record<string, string>,
  subCancels: [] as { id: string; key?: string }[],
  sales: [] as unknown[],
  cancelFail: false,
  lockFail: false,
  verifySession: null as any,
}));

vi.mock('@/lib/db', () => ({ get prisma() { return h.db; } }));
vi.mock('./adult', () => ({ isVerifiedAdult: async () => true }));
vi.mock('./stripeMode', () => ({ stripeTestGate: () => ({ ok: true, key: 'sk_test_fake' }) }));
vi.mock('@/lib/ledger', () => ({ postTransaction: vi.fn(async (_db: unknown, tx: unknown) => { h.sales.push(tx); return tx; }) }));
const stripeSubscriptions = () => ({
  retrieve: vi.fn(async (id: string) => ({ id, status: h.subs[id] ?? 'active' })),
  cancel: vi.fn(async (id: string, _p: unknown, opts?: { idempotencyKey?: string }) => {
    if (h.cancelFail) throw new Error('stripe cancel unavailable');
    h.subCancels.push({ id, key: opts?.idempotencyKey }); h.subs[id] = 'canceled'; return { id, status: 'canceled' };
  }),
});
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    subscriptions: stripeSubscriptions(),
    paymentIntents: { retrieve: vi.fn(async () => ({ latest_charge: { balance_transaction: { fee: 400 } } })) },
    customers: { create: vi.fn(async () => { h.customerCreates++; return { id: `cus_${h.customerCreates}` }; }) },
    checkout: {
      sessions: {
        create: vi.fn(async () => {
          if (h.failSessionCreate) throw new Error('stripe down');
          h.sessionCreates++;
          const id = `cs_${h.sessionCreates}`;
          return { id, url: `https://stripe.test/${id}` };
        }),
        retrieve: vi.fn(async () => {
          if (h.verifySession) return h.verifySession;
          throw Object.assign(new Error('missing'), { statusCode: 404, code: 'resource_missing' });
        }),
        expire: vi.fn(async () => ({})),
      },
    },
  }),
}));

import { startCheckout } from './checkout';
import { fulfilCoachStore, fulfilCoachStoreCheckout } from './webhook';
import { reconcileCoachStore } from './reconcile';
import { verifyCheckoutSession } from '@/lib/stripe/verify-checkout';
import { FOUNDERS_ITEM_KEY, FOUNDERS_REFUND_DUE_HOURS, heldSpotsWhere, isFoundersItemKey, listFoundersRefundDue } from './foundersCap';

// ── in-memory Prisma stand-in ──────────────────────────────────────────────────────────────────────────────
type Row = Record<string, any>;
const tick = () => new Promise((r) => setTimeout(r, 1));
function same(a: unknown, b: unknown) { return a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b; }
function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, cond]) => {
    if (k === 'OR') return (cond as Row[]).some((w) => matches(row, w));
    const v = row[k];
    if (cond === null) return v == null;
    if (cond instanceof Date || typeof cond !== 'object' || Array.isArray(cond)) return same(v, cond);
    const c = cond as Row;
    if (!Object.keys(c).some((op) => ['not', 'in', 'notIn', 'gt', 'gte', 'lt'].includes(op))) return matches(row, c);
    if ('not' in c && (c.not === null ? v != null : same(v, c.not))) return false;
    if ('in' in c && !(c.in as unknown[]).some((x) => same(v, x))) return false;
    if ('notIn' in c && (c.notIn as unknown[]).some((x) => same(v, x))) return false;
    if ('gte' in c && !(v != null && v >= c.gte)) return false;
    if ('gt' in c && !(v != null && v > c.gt)) return false;
    if ('lt' in c && !(v != null && v < c.lt)) return false;
    return true;
  });
}
function clientFor(store: Record<string, Row[]>): any {
  const locks = new Map<string, Promise<void>>();
  const table = (model: string): any => {
    const rows = () => (store[model] ??= []);
    return new Proxy({}, {
      get: (_t, m) => {
        if (typeof m === 'symbol' || m === 'then') return undefined;
        if (m === 'findUnique' || m === 'findFirst') return async (a: Row = {}) => {
          const w = a.where?.userId_listingId_beneficiary ?? a.where;
          return rows().find((r) => matches(r, w)) ?? null;
        };
        if (m === 'findMany') return async (a: Row = {}) => {
          const hit = rows().filter((r) => matches(r, a.where));
          return a.orderBy?.updatedAt === 'asc' ? [...hit].sort((x, y) => x.updatedAt - y.updatedAt) : hit;
        };
        if (m === 'count') return async (a: Row = {}) => { const n = rows().filter((r) => matches(r, a.where)).length; await tick(); return n; };
        if (m === 'create') return async (a: Row) => {
          await tick();
          const r = { id: a.data.id ?? `${model}-${rows().length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...a.data };
          rows().push(r); return r;
        };
        if (m === 'upsert') return async (a: Row) => {
          const r = rows().find((x) => matches(x, a.where)); if (r) { Object.assign(r, a.update); return r; }
          const n = { id: `${model}-${rows().length + 1}`, ...a.create }; rows().push(n); return n;
        };
        if (m === 'update') return async (a: Row) => {
          const r = rows().find((x) => matches(x, a.where)); if (!r) throw Object.assign(new Error('P2025'), { code: 'P2025' });
          Object.assign(r, a.data, { updatedAt: new Date() }); return r;
        };
        if (m === 'updateMany') return async (a: Row) => {
          const hit = rows().filter((x) => matches(x, a.where)); for (const r of hit) Object.assign(r, a.data, { updatedAt: new Date() });
          return { count: hit.length };
        };
        return undefined;
      },
    });
  };
  const client: any = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'then' || typeof prop === 'symbol') return undefined;
      if (prop === '$transaction') return async (fn: (tx: any) => Promise<unknown>) => {
        const held: Array<() => void> = [];
        const tx = new Proxy({}, {
          get: (_x, p) => {
            if (p === 'then' || typeof p === 'symbol') return undefined;
            if (p === '$queryRawUnsafe') return async (sql: string, key: string) => {
              if (h.lockFail) throw new Error('db connection lost');
              h.lockCalls.push({ sql, key });
              if (!h.lockOn) return [{ locked: 1 }];
              const prev = locks.get(key) ?? Promise.resolve();
              let release!: () => void;
              const mine = new Promise<void>((r) => { release = r; });
              locks.set(key, prev.then(() => mine));
              await prev; held.push(release);
              return [{ locked: 1 }];
            };
            return client[p];
          },
        });
        try { return await fn(tx); } finally { for (const r of held) r(); }
      };
      return table(String(prop));
    },
  });
  return client;
}

// ── fixtures ───────────────────────────────────────────────────────────────────────────────────────────────
const COACH = 'coach-elijah';
const LISTING = 'listing-founders';
const OTHER_ADULT = 'listing-other-adult-membership';
const FOUNDERS_MANIFEST = { kind: 'membership', audience: 'adult', interval: 'month' } as const;
const ENV = ['COACH_STORE_PAYMENTS_ENABLED', 'COACH_STORE_COACH_USER_IDS', 'FOUNDERS_CAP_ENABLED'] as const;
const SAVED: Record<string, string | undefined> = {};

function seed() {
  h.store.marketplaceListing = [{
    id: LISTING, creatorId: COACH, title: 'Founders Coaching', itemKey: FOUNDERS_ITEM_KEY,
    priceUsd: FOUNDERS_PRICE_CENTS, active: true, listingType: 'COACH_STORE', manifest: JSON.stringify(FOUNDERS_MANIFEST),
  }, {
    // M1: the same adult monthly manifest under a different itemKey (a second adult membership) is NOT Founders.
    id: OTHER_ADULT, creatorId: COACH, title: 'Adult Coaching', itemKey: 'coach-store:elijahbonds-team:membership:adult:month',
    priceUsd: FOUNDERS_PRICE_CENTS, active: true, listingType: 'COACH_STORE', manifest: JSON.stringify(FOUNDERS_MANIFEST),
  }];
  h.store.instructor = [{
    id: 'instructor-1', userId: COACH, slug: 'elijah', published: true,
    weeklyHours: '[]', blackoutDates: '[]', bufferMinutes: 15, minNoticeHours: 12, maxDaysAhead: 28,
  }];
}
/** Another buyer's access row on the Founders listing. */
function member(i: number, status: string, minutesAgo = 0, extra: Row = {}) {
  const at = new Date(Date.now() - minutesAgo * 60_000);
  (h.store.programAccess ??= []).push({
    id: `access-${i}`, userId: `member-${i}`, instructorId: 'instructor-1', listingId: LISTING, lane: 'adult', billing: 'month',
    scope: 'all', beneficiary: 'self', status, priceCents: FOUNDERS_PRICE_CENTS, stripeFeeCents: 0, codeActive: true,
    reviewCredits: 0, lastCreditInvoiceId: null, stripeCheckoutId: null, stripeSubscriptionId: null, stripePaymentIntentId: null,
    createdAt: at, updatedAt: at, ...extra,
  });
}
const rowById = (id: string) => (h.store.programAccess ?? []).find((r) => r.id === id)!;
const rowsOf = (userId: string) => (h.store.programAccess ?? []).filter((r) => r.userId === userId);
async function buy(userId: string) {
  const res = await startCheckout(userId, { listingId: LISTING, termsAccepted: true, termsVersion: STORE_TERMS_VERSION }, 'https://fel.test');
  return { status: res.status, json: await res.json() };
}

beforeEach(() => {
  for (const k of ENV) SAVED[k] = process.env[k];
  process.env.COACH_STORE_PAYMENTS_ENABLED = '1';
  process.env.COACH_STORE_COACH_USER_IDS = COACH;
  process.env.FOUNDERS_CAP_ENABLED = '1';
  h.store = {}; h.db = clientFor(h.store);
  h.lockOn = true; h.lockCalls = []; h.customerCreates = 0; h.sessionCreates = 0; h.failSessionCreate = false;
  h.subs = {}; h.subCancels = []; h.sales = []; h.cancelFail = false; h.lockFail = false; h.verifySession = null;
  seed();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  for (const k of ENV) { if (SAVED[k] === undefined) delete process.env[k]; else process.env[k] = SAVED[k]; }
  vi.restoreAllMocks();
});

describe('FOUNDERS-CAP-1 — the flag', () => {
  it('FOUNDERS_CAP_ENABLED unset: an 11th Founders checkout still opens a session (today\'s behaviour, no lock taken)', async () => {
    delete process.env.FOUNDERS_CAP_ENABLED;
    for (let i = 1; i <= FOUNDERS_SPOTS; i++) member(i, 'ACTIVE');
    const r = await buy('buyer-11');
    expect(r.status).toBe(200);
    expect(h.sessionCreates).toBe(1);
    expect(h.lockCalls).toHaveLength(0);
  });

  it('only 1/true/on/yes turn it on', async () => {
    const { isFoundersCapEnabled } = await import('@/lib/flags');
    for (const v of ['1', 'true', 'TRUE', ' on ', 'yes']) { process.env.FOUNDERS_CAP_ENABLED = v; expect(isFoundersCapEnabled(), v).toBe(true); }
    for (const v of ['', '0', 'false', 'off', 'no', 'enabled', '2']) { process.env.FOUNDERS_CAP_ENABLED = v; expect(isFoundersCapEnabled(), v).toBe(false); }
    delete process.env.FOUNDERS_CAP_ENABLED; expect(isFoundersCapEnabled()).toBe(false);
  });

  it('M1: Founders is the ONE fixed itemKey (Elijah\'s adult monthly membership), not any adult membership', () => {
    expect(FOUNDERS_ITEM_KEY).toBe('coach-store:elijahbonds:membership:adult:month');
    expect(isFoundersItemKey(FOUNDERS_ITEM_KEY)).toBe(true);
    expect(isFoundersItemKey('coach-store:elijahbonds-team:membership:adult:month')).toBe(false);
    expect(isFoundersItemKey('coach-store:elijah:membership:adult:month')).toBe(false);
    expect(isFoundersItemKey('coach-store:elijahbonds:membership:teen:month')).toBe(false);
    expect(isFoundersItemKey(null)).toBe(false);
  });

  it('M1: a second adult membership (same manifest, other itemKey) is not capped and takes no lock', async () => {
    for (let i = 1; i <= FOUNDERS_SPOTS; i++) member(i, 'ACTIVE', 0, { listingId: OTHER_ADULT });
    const res = await startCheckout('buyer-other', { listingId: OTHER_ADULT, termsAccepted: true, termsVersion: STORE_TERMS_VERSION }, 'https://fel.test');
    expect(res.status).toBe(200);
    expect(h.lockCalls).toHaveLength(0);
  });

  it('M1: members of another adult membership do not use up Founders spots', async () => {
    for (let i = 1; i <= FOUNDERS_SPOTS; i++) member(i, 'ACTIVE', 0, { listingId: OTHER_ADULT });
    expect((await buy('buyer-f')).status).toBe(200);
  });
});

describe('FOUNDERS-CAP-1 — cap reached', () => {
  it('10 spots held (ACTIVE, PAST_DUE, fresh PENDING): the 11th is 409 sold_out before ANY Stripe call, nothing written', async () => {
    for (let i = 1; i <= 8; i++) member(i, 'ACTIVE');
    member(9, 'PAST_DUE');
    member(10, 'PENDING', HOLD_MINUTES - 5);
    const r = await buy('buyer-11');
    expect(r).toEqual({ status: 409, json: { error: 'sold_out' } });
    expect(h.customerCreates).toBe(0);
    expect(h.sessionCreates).toBe(0);
    expect(rowsOf('buyer-11')).toHaveLength(0);
  });

  it('the locked count refuses too when the early read is passed (a spot taken between the two reads)', async () => {
    for (let i = 1; i <= FOUNDERS_SPOTS - 1; i++) member(i, 'ACTIVE');
    // The 10th spot is claimed after the early read and before the lock: model it by claiming on the first count call.
    const realCount = h.db.programAccess.count;
    let first = true;
    const programAccess = new Proxy(h.db.programAccess, {
      get: (t, m) => (m === 'count' ? async (a: Row) => { const n = await realCount(a); if (first) { first = false; member(99, 'PENDING'); } return n; } : t[m as string]),
    });
    const base = h.db;
    h.db = new Proxy(base, { get: (t, p) => (p === 'programAccess' ? programAccess : t[p as string]) });
    const r = await buy('buyer-late');
    expect(r).toEqual({ status: 409, json: { error: 'sold_out' } });
    expect(h.sessionCreates).toBe(0);
    expect(rowsOf('buyer-late')).toHaveLength(0);
    expect(h.lockCalls.map((c) => c.key)).toEqual([`founders-cap:${FOUNDERS_ITEM_KEY}`]);
    expect(h.lockCalls[0].sql).toMatch(/pg_advisory_xact_lock\(hashtext\(\$1\)\)/);
  });

  it('9 held: the 10th buyer gets a session and a PENDING claim', async () => {
    for (let i = 1; i <= FOUNDERS_SPOTS - 1; i++) member(i, 'ACTIVE');
    const r = await buy('buyer-10');
    expect(r.status).toBe(200);
    expect(r.json.url).toMatch(/^https:\/\/stripe\.test\//);
    expect(rowsOf('buyer-10').map((x) => x.status)).toEqual(['PENDING']);
  });

  it('rows that hold no spot are not counted: stale PENDING, EXPIRED, CANCELED, REFUNDED, REFUND_DUE', async () => {
    for (let i = 1; i <= 5; i++) member(i, 'ACTIVE');
    member(6, 'PENDING', HOLD_MINUTES + 1);
    ['EXPIRED', 'CANCELED', 'REFUNDED', 'REFUND_DUE'].forEach((s, k) => member(7 + k, s));
    const r = await buy('buyer-x');
    expect(r.status).toBe(200);
  });

  it('a Founders claim whose Stripe session never opens gives its spot back at once', async () => {
    for (let i = 1; i <= FOUNDERS_SPOTS - 1; i++) member(i, 'ACTIVE');
    h.failSessionCreate = true;
    await expect(buy('buyer-a')).rejects.toThrow('stripe down');
    expect(rowsOf('buyer-a').map((x) => x.status)).toEqual(['EXPIRED']);
    h.failSessionCreate = false;
    expect((await buy('buyer-b')).status).toBe(200);
  });
});

describe('FOUNDERS-CAP-1 — concurrent checkouts cannot oversell', () => {
  it('15 buyers at once on an empty listing: exactly 10 sessions, 5 sold_out', async () => {
    const results = await Promise.all(Array.from({ length: 15 }, (_, i) => buy(`racer-${i}`)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(FOUNDERS_SPOTS);
    expect(results.filter((r) => r.status === 409 && r.json.error === 'sold_out')).toHaveLength(5);
    expect(h.sessionCreates).toBe(FOUNDERS_SPOTS);
    const now = new Date();
    expect((h.store.programAccess ?? []).filter((r) => matches(r, heldSpotsWhere([LISTING], now)))).toHaveLength(FOUNDERS_SPOTS);
  });

  it('9 held and 6 buyers race for the last spot: exactly one wins', async () => {
    for (let i = 1; i <= 9; i++) member(i, 'ACTIVE');
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => buy(`last-${i}`)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(h.sessionCreates).toBe(1);
  });

  it('control: with the lock made a no-op the same race oversells — the lock is what holds the cap', async () => {
    h.lockOn = false;
    for (let i = 1; i <= 9; i++) member(i, 'ACTIVE');
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => buy(`nolock-${i}`)));
    expect(results.filter((r) => r.status === 200).length).toBeGreaterThan(1);
  });
});

describe('FOUNDERS-CAP-1 — refund, cancel and expiry free a spot (PM ruling on L2)', () => {
  const refundEvent = (rowId: string, type: string) => ({ type, data: { object: { metadata: { product: 'COACH_STORE', rowId } } } }) as any;

  it('a refunded member gives the spot back (charge.refunded -> REFUNDED)', async () => {
    for (let i = 1; i <= FOUNDERS_SPOTS; i++) member(i, 'ACTIVE');
    expect((await buy('buyer-11')).status).toBe(409);
    await fulfilCoachStore(refundEvent('access-3', 'charge.refunded'), 'evt_refund');
    expect(h.store.programAccess.find((r) => r.id === 'access-3')!.status).toBe('REFUNDED');
    expect((await buy('buyer-11')).status).toBe(200);
  });

  it('a subscription that has ended gives the spot back (customer.subscription.deleted -> CANCELED)', async () => {
    for (let i = 1; i <= FOUNDERS_SPOTS; i++) member(i, 'ACTIVE', 0, { stripeSubscriptionId: `sub_${i}` });
    const ev = { type: 'customer.subscription.deleted', data: { object: { id: 'sub_4', status: 'canceled', cancel_at_period_end: false, metadata: { product: 'COACH_STORE', rowId: 'access-4' } } } } as any;
    await fulfilCoachStore(ev, 'evt_sub_deleted');
    expect(h.store.programAccess.find((r) => r.id === 'access-4')!.status).toBe('CANCELED');
    expect((await buy('buyer-11')).status).toBe(200);
  });

  it('cancel at period end keeps the spot until the period ends (the row is still ACTIVE)', async () => {
    for (let i = 1; i <= FOUNDERS_SPOTS; i++) member(i, 'ACTIVE', 0, { stripeSubscriptionId: `sub_${i}` });
    const ev = { type: 'customer.subscription.updated', data: { object: { id: 'sub_5', status: 'active', cancel_at_period_end: true, metadata: { product: 'COACH_STORE', rowId: 'access-5' } } } } as any;
    await fulfilCoachStore(ev, 'evt_sub_updated');
    const row = h.store.programAccess.find((r) => r.id === 'access-5')!;
    expect(row.status).toBe('ACTIVE');
    expect(row.cancelAtPeriodEnd).toBe(true);
    expect((await buy('buyer-11')).status).toBe(409);
  });

  it('a checkout that expires unpaid gives its claim back (checkout.session.expired -> EXPIRED)', async () => {
    for (let i = 1; i <= FOUNDERS_SPOTS - 1; i++) member(i, 'ACTIVE');
    member(10, 'PENDING');
    expect((await buy('buyer-11')).status).toBe(409);
    await fulfilCoachStore(refundEvent('access-10', 'checkout.session.expired'), 'evt_expired');
    expect((await buy('buyer-11')).status).toBe(200);
  });
});

describe('FOUNDERS-CAP-1 — re-check at fulfilment (over the cap -> refund_due)', () => {
  const paid = (rowId: string) => ({
    id: `cs_paid_${rowId}`, mode: 'subscription', status: 'complete', payment_status: 'paid', subscription: `sub_${rowId}`,
    metadata: { product: 'COACH_STORE', rowId, userId: 'late', kind: 'membership', beneficiary: 'self' },
  }) as any;

  it('10 members ACTIVE: a paid 11th claim is REFUND_DUE, never ACTIVE', async () => {
    for (let i = 1; i <= FOUNDERS_SPOTS; i++) member(i, 'ACTIVE');
    member(11, 'PENDING', 0, { userId: 'late' });
    const out = await fulfilCoachStoreCheckout(paid('access-11'), paid('access-11').metadata, 'k');
    expect(out).toBe('refund_due');
    const row = h.store.programAccess.find((r) => r.id === 'access-11')!;
    expect(row.status).toBe('REFUND_DUE');
    expect(row.codeActive).toBe(false);
  });

  it('9 members ACTIVE: the paid 10th becomes ACTIVE', async () => {
    for (let i = 1; i <= FOUNDERS_SPOTS - 1; i++) member(i, 'ACTIVE');
    member(10, 'PENDING', 0, { userId: 'late' });
    const out = await fulfilCoachStoreCheckout(paid('access-10'), paid('access-10').metadata, 'k');
    expect(out).toBe('fulfilled');
    expect(h.store.programAccess.find((r) => r.id === 'access-10')!.status).toBe('ACTIVE');
  });

  it('flag off: fulfilment is unchanged (an 11th paid claim still becomes ACTIVE)', async () => {
    delete process.env.FOUNDERS_CAP_ENABLED;
    for (let i = 1; i <= FOUNDERS_SPOTS; i++) member(i, 'ACTIVE');
    member(11, 'PENDING', 0, { userId: 'late' });
    expect(await fulfilCoachStoreCheckout(paid('access-11'), paid('access-11').metadata, 'k')).toBe('fulfilled');
    expect(h.lockCalls).toHaveLength(0);
  });
});

describe('FOUNDERS-CAP-1 v2 — expiry by name (PM ruling: expiry frees a spot)', () => {
  it('a PENDING claim older than the hold no longer counts (time-based expiry, no event needed)', async () => {
    for (let i = 1; i <= FOUNDERS_SPOTS - 1; i++) member(i, 'ACTIVE');
    member(10, 'PENDING', HOLD_MINUTES + 1);
    expect((await buy('buyer-after-expiry')).status).toBe(200);
  });
});

describe('FOUNDERS-CAP-1 v2 — a dispute (PAUSED) HOLDS its spot (PM ruling + Cyber H2/Q1)', () => {
  const ev = (rowId: string, type: string) => ({ type, data: { object: { metadata: { product: 'COACH_STORE', rowId } } } }) as any;

  it('9 ACTIVE + 1 PAUSED: the next buyer is 409 sold_out, no Stripe call', async () => {
    for (let i = 1; i <= 9; i++) member(i, 'ACTIVE');
    member(10, 'PAUSED');
    expect(await buy('buyer-11')).toEqual({ status: 409, json: { error: 'sold_out' } });
    expect(h.customerCreates + h.sessionCreates).toBe(0);
  });

  it('webhook path: charge.dispute.created moves a member to PAUSED and the spot stays taken; a later refund frees it', async () => {
    for (let i = 1; i <= FOUNDERS_SPOTS; i++) member(i, 'ACTIVE');
    await fulfilCoachStore(ev('access-2', 'charge.dispute.created'), 'evt_dispute');
    expect(rowById('access-2').status).toBe('PAUSED');
    expect(rowById('access-2').codeActive).toBe(false);
    expect((await buy('buyer-11')).status).toBe(409);
    await fulfilCoachStore(ev('access-2', 'charge.refunded'), 'evt_dispute_lost_refund');
    expect(rowById('access-2').status).toBe('REFUNDED');
    expect((await buy('buyer-11')).status).toBe(200);
  });

  it('fulfilment re-check counts PAUSED: 9 ACTIVE + 1 PAUSED, a paid 11th is REFUND_DUE', async () => {
    for (let i = 1; i <= 9; i++) member(i, 'ACTIVE');
    member(10, 'PAUSED');
    member(11, 'PENDING', 0, { userId: 'late' });
    const s = { id: 'cs_p', mode: 'subscription', status: 'complete', payment_status: 'paid', subscription: 'sub_late', metadata: { product: 'COACH_STORE', rowId: 'access-11' } } as any;
    expect(await fulfilCoachStoreCheckout(s, s.metadata, 'k')).toBe('refund_due');
    expect(rowById('access-11').status).toBe('REFUND_DUE');
  });

  it('a won dispute (invoice.paid on the PAUSED row) restores the member without taking an 11th spot', async () => {
    for (let i = 1; i <= 9; i++) member(i, 'ACTIVE');
    member(10, 'PAUSED', 0, { stripeSubscriptionId: 'sub_10' });
    await fulfilCoachStore(invoiceEvent('access-10', 'sub_10', 'subscription_cycle'), 'evt_inv_paused');
    expect(rowById('access-10').status).toBe('ACTIVE');
    expect((await buy('buyer-11')).status).toBe(409);
  });
});

function invoiceEvent(rowId: string, subId: string, billingReason: string, amount = FOUNDERS_PRICE_CENTS) {
  return {
    type: 'invoice.paid',
    data: { object: {
      id: `in_${rowId}_${billingReason}`, amount_paid: amount, billing_reason: billingReason, payment_intent: `pi_${rowId}`,
      parent: { subscription_details: { subscription: subId, metadata: { product: 'COACH_STORE', rowId, userId: 'late', kind: 'membership', beneficiary: 'self' } } },
      lines: { data: [{ period: { end: Math.floor(Date.now() / 1000) + 30 * 86400 } }] },
    } },
  } as any;
}
const paidSession = (rowId: string, subId: string) => ({
  id: `cs_paid_${rowId}`, mode: 'subscription', status: 'complete', payment_status: 'paid', subscription: subId,
  metadata: { product: 'COACH_STORE', rowId, userId: 'late', kind: 'membership', beneficiary: 'self' },
}) as any;

describe('FOUNDERS-CAP-1 v2 — invoice.paid cannot bypass the cap (Cyber H1)', () => {
  it('invoice.paid BEFORE checkout.session.completed at 10/10: REFUND_DUE, subscription cancelled, no sale; checkout then stays refund_due', async () => {
    for (let i = 1; i <= FOUNDERS_SPOTS; i++) member(i, 'ACTIVE');
    member(11, 'PENDING', 0, { userId: 'late' });
    await fulfilCoachStore(invoiceEvent('access-11', 'sub_late', 'subscription_create'), 'evt_inv_first');
    const row = rowById('access-11');
    expect(row.status).toBe('REFUND_DUE');
    expect(row.codeActive).toBe(false);
    expect(row.stripeSubscriptionId).toBe('sub_late');
    expect(h.subCancels).toEqual([{ id: 'sub_late', key: 'founders-cap:cancel:sub_late' }]);
    expect(h.sales).toHaveLength(0);
    expect(h.store.coachStoreReferral ?? []).toHaveLength(0);
    // The checkout event lands second: still REFUND_DUE, never ACTIVE, the cancel is not sent twice.
    expect(await fulfilCoachStoreCheckout(paidSession('access-11', 'sub_late'), paidSession('access-11', 'sub_late').metadata, 'k')).toBe('refund_due');
    expect(rowById('access-11').status).toBe('REFUND_DUE');
    expect(h.subCancels).toHaveLength(1);
    expect(h.sales).toHaveLength(0);
  });

  it('invoice.paid before checkout with a spot free (9/10): the row becomes ACTIVE through the lock and the sale posts', async () => {
    for (let i = 1; i <= FOUNDERS_SPOTS - 1; i++) member(i, 'ACTIVE');
    member(10, 'PENDING', 0, { userId: 'late' });
    await fulfilCoachStore(invoiceEvent('access-10', 'sub_10', 'subscription_create'), 'evt_inv_ok');
    expect(rowById('access-10').status).toBe('ACTIVE');
    expect(rowById('access-10').stripeSubscriptionId).toBe('sub_10');
    expect(h.lockCalls.map((c) => c.key)).toEqual([`founders-cap:${FOUNDERS_ITEM_KEY}`]);
    expect(h.sales).toHaveLength(1);
    expect(h.subCancels).toHaveLength(0);
  });

  it('invoice.paid on a REFUND_DUE row: stays REFUND_DUE, no sale; the cancel is idempotent (sent once across deliveries)', async () => {
    for (let i = 1; i <= FOUNDERS_SPOTS - 1; i++) member(i, 'ACTIVE');
    member(11, 'REFUND_DUE', 0, { userId: 'late', codeActive: false, stripeSubscriptionId: 'sub_late' });
    await fulfilCoachStore(invoiceEvent('access-11', 'sub_late', 'subscription_create'), 'evt_rd_1');
    await fulfilCoachStore(invoiceEvent('access-11', 'sub_late', 'subscription_create'), 'evt_rd_1_replay');
    expect(rowById('access-11').status).toBe('REFUND_DUE');
    expect(h.subCancels).toEqual([{ id: 'sub_late', key: 'founders-cap:cancel:sub_late' }]);
    expect(h.sales).toHaveLength(0);
    expect(h.lockCalls).toHaveLength(0);
  });

  it('a renewal (subscription_cycle) after REFUND_DUE: never ACTIVE, no sale, no referral, the subscription is cancelled', async () => {
    for (let i = 1; i <= FOUNDERS_SPOTS; i++) member(i, 'ACTIVE');
    member(11, 'REFUND_DUE', 0, { userId: 'late', codeActive: false, stripeSubscriptionId: 'sub_late' });
    await fulfilCoachStore(invoiceEvent('access-11', 'sub_late', 'subscription_cycle'), 'evt_renewal');
    expect(rowById('access-11').status).toBe('REFUND_DUE');
    expect(rowById('access-11').codeActive).toBe(false);
    expect(h.sales).toHaveLength(0);
    expect(h.store.coachStoreReferral ?? []).toHaveLength(0);
    expect(h.subCancels.map((c) => c.id)).toEqual(['sub_late']);
  });

  it('v3 (PM (b) / Cyber V1): invoice.paid on a REFUNDED or a CANCELED row -> REFUND_DUE (on the list), subscription cancelled, no sale/referral, never ACTIVE', async () => {
    member(1, 'REFUNDED', 0, { stripeSubscriptionId: 'sub_1', codeActive: false });
    member(2, 'CANCELED', 0, { stripeSubscriptionId: 'sub_2', codeActive: false });
    await fulfilCoachStore(invoiceEvent('access-1', 'sub_1', 'subscription_cycle'), 'evt_r');
    await fulfilCoachStore(invoiceEvent('access-2', 'sub_2', 'subscription_cycle'), 'evt_c');
    expect([rowById('access-1').status, rowById('access-2').status]).toEqual(['REFUND_DUE', 'REFUND_DUE']);
    expect([rowById('access-1').codeActive, rowById('access-2').codeActive]).toEqual([false, false]);
    expect(h.subCancels).toEqual([
      { id: 'sub_1', key: 'founders-cap:cancel:sub_1' },
      { id: 'sub_2', key: 'founders-cap:cancel:sub_2' },
    ]);
    expect(h.sales).toHaveLength(0);
    expect(h.store.coachStoreReferral ?? []).toHaveLength(0);
    expect((await listFoundersRefundDue(h.db, new Date())).map((r) => r.id).sort()).toEqual(['access-1', 'access-2']);
    // A replayed delivery sends no second cancel and posts nothing.
    await fulfilCoachStore(invoiceEvent('access-1', 'sub_1', 'subscription_cycle'), 'evt_r_replay');
    expect(h.subCancels).toHaveLength(2);
    expect(h.sales).toHaveLength(0);
    const lines = (console.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => c.map(String).join(' '));
    expect(lines.filter((l) => l.includes('founders_cap_full'))).toEqual(expect.arrayContaining([
      '[coach-store] founders_cap_full row=access-1 source=invoice_on_refunded outcome=refund_due',
      '[coach-store] founders_cap_full row=access-2 source=invoice_on_canceled outcome=refund_due',
    ]));
  });

  it('an ACTIVE member\'s renewal is unchanged under the flag (no lock, sale posts)', async () => {
    for (let i = 1; i <= FOUNDERS_SPOTS; i++) member(i, 'ACTIVE', 0, { stripeSubscriptionId: `sub_${i}` });
    await fulfilCoachStore(invoiceEvent('access-3', 'sub_3', 'subscription_cycle'), 'evt_renew_ok');
    expect(rowById('access-3').status).toBe('ACTIVE');
    expect(h.lockCalls).toHaveLength(0);
    expect(h.sales).toHaveLength(1);
  });

  it('flag off: invoice.paid is unchanged (a PENDING 11th still becomes ACTIVE, no lock, no cancel)', async () => {
    delete process.env.FOUNDERS_CAP_ENABLED;
    for (let i = 1; i <= FOUNDERS_SPOTS; i++) member(i, 'ACTIVE');
    member(11, 'PENDING', 0, { userId: 'late' });
    await fulfilCoachStore(invoiceEvent('access-11', 'sub_late', 'subscription_create'), 'evt_off');
    expect(rowById('access-11').status).toBe('ACTIVE');
    expect(h.lockCalls).toHaveLength(0);
    expect(h.subCancels).toHaveLength(0);
  });

  it('checkout over the cap stores the subscription id and cancels the subscription at once', async () => {
    for (let i = 1; i <= FOUNDERS_SPOTS; i++) member(i, 'ACTIVE');
    member(11, 'PENDING', 0, { userId: 'late' });
    expect(await fulfilCoachStoreCheckout(paidSession('access-11', 'sub_late'), paidSession('access-11', 'sub_late').metadata, 'k')).toBe('refund_due');
    expect(rowById('access-11').stripeSubscriptionId).toBe('sub_late');
    expect(h.subCancels.map((c) => c.id)).toEqual(['sub_late']);
    expect(h.sales).toHaveLength(0);
  });
});

describe('FOUNDERS-CAP-1 v2 — the refund-due list is durable and admin-visible (Cyber Q3)', () => {
  it('listFoundersRefundDue: the REFUND_DUE Founders rows, oldest first, each with a 48 h refund-by and overdue flag', async () => {
    member(1, 'ACTIVE');
    member(2, 'REFUND_DUE', 60 * 50, { stripeSubscriptionId: 'sub_2' });
    member(3, 'REFUND_DUE', 10, { stripeSubscriptionId: 'sub_3' });
    member(4, 'REFUND_DUE', 0, { listingId: OTHER_ADULT });
    const now = new Date();
    const list = await listFoundersRefundDue(h.db, now);
    expect(list.map((r) => [r.id, r.overdue])).toEqual([['access-2', true], ['access-3', false]]);
    expect(list[1].refundBy.getTime() - list[1].since.getTime()).toBe(FOUNDERS_REFUND_DUE_HOURS * 3_600_000);
    expect(list[0].stripeSubscriptionId).toBe('sub_2');
  });

  it('our own cancel (customer.subscription.deleted) keeps the row REFUND_DUE, on the list; the refund takes it off', async () => {
    member(2, 'REFUND_DUE', 0, { stripeSubscriptionId: 'sub_2', codeActive: false });
    const del = { type: 'customer.subscription.deleted', data: { object: { id: 'sub_2', status: 'canceled', cancel_at_period_end: false, metadata: { product: 'COACH_STORE', rowId: 'access-2' } } } } as any;
    await fulfilCoachStore(del, 'evt_del');
    expect(rowById('access-2').status).toBe('REFUND_DUE');
    expect((await listFoundersRefundDue(h.db, new Date())).map((r) => r.id)).toEqual(['access-2']);
    const dispute = { type: 'charge.dispute.created', data: { object: { metadata: { product: 'COACH_STORE', rowId: 'access-2' } } } } as any;
    await fulfilCoachStore(dispute, 'evt_rd_dispute');
    expect(rowById('access-2').status).toBe('REFUND_DUE'); // a dispute never turns it PAUSED (that would hold a spot)
    const refund = { type: 'charge.refunded', data: { object: { metadata: { product: 'COACH_STORE', rowId: 'access-2' } } } } as any;
    await fulfilCoachStore(refund, 'evt_rd_refund');
    expect(rowById('access-2').status).toBe('REFUNDED');
    expect(await listFoundersRefundDue(h.db, new Date())).toEqual([]);
  });

  it('reconcile (no webhook): the run reports the list size, Pass 4 never turns REFUND_DUE CANCELED, Pass 2 refund closes it', async () => {
    member(2, 'REFUND_DUE', 60 * 49, { stripeSubscriptionId: 'sub_2', stripePaymentIntentId: 'pi_2', codeActive: false });
    async function* none() { /* empty */ }
    const stripe: any = {
      checkout: { sessions: { retrieve: vi.fn() } },
      refunds: { list: () => none() }, disputes: { list: () => none() },
      subscriptions: { list: async function* () { yield { id: 'sub_2', status: 'canceled', cancel_at_period_end: false, metadata: {} }; }, ...stripeSubscriptions() },
    };
    const counts = await reconcileCoachStore({ now: new Date(), stripe });
    expect(rowById('access-2').status).toBe('REFUND_DUE');
    expect(counts.foundersRefundDue).toBe(1);
    expect(counts.foundersRefundOverdue).toBe(1);
    // Pass 2: the Dashboard refund lands on the row's PaymentIntent -> REFUNDED, off the list.
    stripe.refunds.list = async function* () { yield { status: 'succeeded', charge: 'ch_2' }; };
    stripe.charges = { retrieve: vi.fn(async () => ({ id: 'ch_2', refunded: true, payment_intent: 'pi_2' })) };
    stripe.subscriptions.list = () => none();
    const after = await reconcileCoachStore({ now: new Date(), stripe });
    expect(rowById('access-2').status).toBe('REFUNDED');
    expect(after.foundersRefundDue).toBe(0);
  });

  it('reconcile Pass 4 (same hole as H1): an active subscription on an EXPIRED Founders row at 10/10 is REFUND_DUE + cancelled, never ACTIVE', async () => {
    for (let i = 1; i <= FOUNDERS_SPOTS; i++) member(i, 'ACTIVE');
    member(11, 'EXPIRED', 0, { stripeSubscriptionId: 'sub_11', codeActive: false });
    async function* none() { /* empty */ }
    const subs = stripeSubscriptions();
    const stripe: any = {
      checkout: { sessions: { retrieve: vi.fn() } }, refunds: { list: () => none() }, disputes: { list: () => none() },
      subscriptions: { ...subs, list: async function* () { yield { id: 'sub_11', status: 'active', cancel_at_period_end: false, metadata: {} }; } },
    };
    await reconcileCoachStore({ now: new Date(), stripe });
    expect(rowById('access-11').status).toBe('REFUND_DUE');
    expect(h.subCancels.map((c) => c.id)).toEqual(['sub_11']);
  });

  it('flag off: reconcile reports no Founders counts', async () => {
    delete process.env.FOUNDERS_CAP_ENABLED;
    async function* none() { /* empty */ }
    const stripe: any = { checkout: { sessions: { retrieve: vi.fn() } }, refunds: { list: () => none() }, disputes: { list: () => none() }, subscriptions: { list: () => none() } };
    const counts = await reconcileCoachStore({ now: new Date(), stripe });
    expect('foundersRefundDue' in counts).toBe(false);
  });
});

describe('FOUNDERS-CAP-1 v2 — the race loser\'s orphan Stripe customer is logged without PII (PM item 6)', () => {
  const EMAIL = 'loser.buyer@example.com';
  const NAME = 'Lucy Loser';
  function loseTheRace(buyer: string) {
    for (let i = 1; i <= FOUNDERS_SPOTS - 1; i++) member(i, 'ACTIVE');
    const realCount = h.db.programAccess.count;
    let first = true;
    const programAccess = new Proxy(h.db.programAccess, {
      get: (t, m) => (m === 'count' ? async (a: Row) => { const n = await realCount(a); if (first) { first = false; member(99, 'PENDING'); } return n; } : t[m as string]),
    });
    const base = h.db;
    h.db = new Proxy(base, { get: (t, p) => (p === 'programAccess' ? programAccess : t[p as string]) });
    (h.store.user ??= []).push({ id: buyer, email: EMAIL, name: NAME });
  }
  const warnLines = () => (console.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => c.map(String).join(' '));

  it('a NEW customer left by a race loss is logged with the listing id and Stripe customer id only', async () => {
    loseTheRace('buyer-lucy');
    expect((await buy('buyer-lucy')).status).toBe(409);
    expect(h.customerCreates).toBe(1);
    expect(h.sessionCreates).toBe(0);
    const orphan = warnLines().filter((l) => l.includes('founders_orphan_customer'));
    expect(orphan).toEqual([`[coach-store] founders_orphan_customer listing=${LISTING} customer=cus_1`]);
    for (const line of warnLines()) {
      expect(line).not.toContain(EMAIL);
      expect(line).not.toContain(NAME);
      expect(line).not.toContain('buyer-lucy');
      expect(line).not.toMatch(/@/);
    }
  });

  it('a buyer who already had a Stripe customer leaves no orphan: no orphan line', async () => {
    loseTheRace('buyer-old');
    (h.store.stripeCustomer ??= []).push({ id: 'sc-1', userId: 'buyer-old', stripeCustomerId: 'cus_existing' });
    expect((await buy('buyer-old')).status).toBe(409);
    expect(h.customerCreates).toBe(0);
    expect(warnLines().some((l) => l.includes('founders_orphan_customer'))).toBe(false);
  });
});

describe('FOUNDERS-CAP-1 v3 — reconcile cancels a closed Founders row\'s still-billing subscription (Cyber V2)', () => {
  async function* none() { /* empty */ }
  const stripeWith = (subs: Array<{ id: string; status: string }>) => ({
    checkout: { sessions: { retrieve: vi.fn() } }, refunds: { list: () => none() }, disputes: { list: () => none() },
    subscriptions: { ...stripeSubscriptions(), list: async function* () { for (const s of subs) yield { ...s, cancel_at_period_end: false, metadata: {} }; } },
  }) as any;

  it('REFUND_DUE (active), REFUNDED (trialing), CANCELED (past_due) with the cap NOT full: each cancelled and counted; statuses kept', async () => {
    member(1, 'ACTIVE');
    member(2, 'REFUND_DUE', 0, { stripeSubscriptionId: 'sub_2', codeActive: false });
    member(3, 'REFUNDED', 0, { stripeSubscriptionId: 'sub_3', codeActive: false });
    member(4, 'CANCELED', 0, { stripeSubscriptionId: 'sub_4', codeActive: false });
    h.subs = { sub_2: 'active', sub_3: 'trialing', sub_4: 'past_due' };
    const counts = await reconcileCoachStore({ now: new Date(), stripe: stripeWith([
      { id: 'sub_2', status: 'active' }, { id: 'sub_3', status: 'trialing' }, { id: 'sub_4', status: 'past_due' },
    ]) });
    expect(h.subCancels.map((c) => c.id)).toEqual(['sub_2', 'sub_3', 'sub_4']);
    expect(counts.foundersSubsCanceled).toBe(3);
    expect(['access-2', 'access-3', 'access-4'].map((id) => rowById(id).status)).toEqual(['REFUND_DUE', 'REFUNDED', 'CANCELED']);
    expect(rowById('access-3').codeActive).toBe(false);
  });

  it('a self-heal: the cancel failed at fulfilment, the next reconcile run cancels it (once; a later run finds it canceled)', async () => {
    for (let i = 1; i <= FOUNDERS_SPOTS; i++) member(i, 'ACTIVE');
    member(11, 'PENDING', 0, { userId: 'late' });
    h.cancelFail = true;
    await expect(fulfilCoachStoreCheckout(paidSession('access-11', 'sub_late'), paidSession('access-11', 'sub_late').metadata, 'k')).rejects.toThrow(/founders_cap_step_failed/);
    expect(rowById('access-11').status).toBe('REFUND_DUE');
    h.cancelFail = false;
    const first = await reconcileCoachStore({ now: new Date(), stripe: stripeWith([{ id: 'sub_late', status: 'active' }]) });
    expect(first.foundersSubsCanceled).toBe(1);
    const second = await reconcileCoachStore({ now: new Date(), stripe: stripeWith([{ id: 'sub_late', status: 'canceled' }]) });
    expect(second.foundersSubsCanceled).toBeUndefined();
    expect(h.subCancels.map((c) => c.id)).toEqual(['sub_late']);
    expect(rowById('access-11').status).toBe('REFUND_DUE');
  });

  it('not cancelled: an ACTIVE member\'s subscription, a closed row on a non-Founders listing, and anything with the flag off', async () => {
    member(1, 'ACTIVE', 0, { stripeSubscriptionId: 'sub_1' });
    member(2, 'REFUNDED', 0, { stripeSubscriptionId: 'sub_2', listingId: OTHER_ADULT });
    await reconcileCoachStore({ now: new Date(), stripe: stripeWith([{ id: 'sub_1', status: 'active' }, { id: 'sub_2', status: 'active' }]) });
    expect(h.subCancels).toHaveLength(0);
    delete process.env.FOUNDERS_CAP_ENABLED;
    member(3, 'REFUND_DUE', 0, { stripeSubscriptionId: 'sub_3' });
    const off = await reconcileCoachStore({ now: new Date(), stripe: stripeWith([{ id: 'sub_3', status: 'active' }]) });
    expect(h.subCancels).toHaveLength(0);
    expect('foundersSubsCanceled' in off).toBe(false);
  });
});

describe('FOUNDERS-CAP-1 v3 — verify-session never 500s on a cap-path failure (PM (c) / Cyber V3)', () => {
  const lateSession = () => ({ ...paidSession('access-11', 'sub_late'), client_reference_id: 'late', payment_intent: null });

  it('the subscription cancel throws after the buyer lost the cap: verify answers refund_due (sold out, refund coming); the webhook still throws', async () => {
    for (let i = 1; i <= FOUNDERS_SPOTS; i++) member(i, 'ACTIVE');
    member(11, 'PENDING', 0, { userId: 'late' });
    h.cancelFail = true;
    h.verifySession = lateSession();
    const r = await verifyCheckoutSession('late', h.verifySession.id);
    expect(r).toEqual({ ok: true, status: 'refund_due', product: 'COACH_STORE', rowId: 'access-11' });
    expect(rowById('access-11').status).toBe('REFUND_DUE');
    // The webhook path for the same session still throws, so Stripe retries the delivery.
    const ev = { type: 'checkout.session.completed', data: { object: lateSession() } } as any;
    await expect(fulfilCoachStore(ev, 'evt_retry')).rejects.toThrow(/founders_cap_step_failed stage=checkout_cancel/);
    const lines = (console.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => c.map(String).join(' '));
    expect(lines).toContain('[verify-checkout] founders_cap_step_failed row=access-11 stage=checkout_cancel answered=refund_due');
  });

  it('any other cap-path failure (the lock/DB): verify answers pending, the row is untouched; the webhook still throws', async () => {
    for (let i = 1; i <= FOUNDERS_SPOTS - 1; i++) member(i, 'ACTIVE');
    member(10, 'PENDING', 0, { userId: 'late' });
    h.lockFail = true;
    h.verifySession = { ...paidSession('access-10', 'sub_10'), client_reference_id: 'late', payment_intent: null };
    const r = await verifyCheckoutSession('late', h.verifySession.id);
    expect(r).toEqual({ ok: true, status: 'pending', product: 'COACH_STORE' });
    expect(rowById('access-10').status).toBe('PENDING');
    const ev = { type: 'checkout.session.completed', data: { object: h.verifySession } } as any;
    await expect(fulfilCoachStore(ev, 'evt_retry_lock')).rejects.toThrow(/founders_cap_step_failed stage=checkout_claim/);
    // Once the DB is back, the next verify fulfils normally.
    h.lockFail = false;
    expect((await verifyCheckoutSession('late', h.verifySession.id)).status).toBe('fulfilled');
    expect(rowById('access-10').status).toBe('ACTIVE');
  });

  it('a non-cap failure is unchanged: verify still throws it', async () => {
    member(10, 'PENDING', 0, { userId: 'late' });
    h.verifySession = { ...paidSession('access-10', 'sub_10'), client_reference_id: 'late', payment_intent: null };
    const base = h.db;
    h.db = new Proxy(base, { get: (t, p) => (p === 'instructor' ? { findUnique: async () => { throw new Error('plain db error'); } } : t[p as string]) });
    await expect(verifyCheckoutSession('late', h.verifySession.id)).rejects.toThrow('plain db error');
  });
});
