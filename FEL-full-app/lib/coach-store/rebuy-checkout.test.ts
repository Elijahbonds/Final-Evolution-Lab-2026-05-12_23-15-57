// STORE-READY B5 (F21): retrying a program purchase within 24 h must not 500. buyAccess resolves the existing
// row's Stripe session BEFORE any row write — a still-open session at the same price hands back its URL (no new
// session, no new unlock code); a price change expires the old session and creates a new one under a NEW
// idempotency key; a paid session fulfils and answers 409 already_owned. A Stripe outage is a 502, nothing written.
//
// In-memory DB + mocked Stripe (the pattern of lib/stripe/verify-checkout.test.ts); the real ledger runs so the
// one-sale invariant on a paid re-buy is proven against the unique idempotency key.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { storePriceByKey } from './storePrices';
import { itemKeyFor } from './manifest';

const h = vi.hoisted(() => ({
  db: null as any,
  store: {} as Record<string, any[]>,
  isAdult: true,
  sessions: {} as Record<string, any>,
  createCalls: [] as any[],
  createIdemKeys: [] as string[],
  expireCalls: [] as string[],
  retrieveCalls: 0,
}));

vi.mock('@/lib/db', () => ({ get prisma() { return h.db; } }));
vi.mock('./adult', () => ({ isVerifiedAdult: async () => h.isAdult }));
vi.mock('./stripeMode', () => ({ stripeTestGate: () => ({ ok: true, key: 'sk_test_fake' }) }));
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    customers: { create: vi.fn(async () => ({ id: 'cus_1' })) },
    checkout: {
      sessions: {
        create: vi.fn(async (params: any, opts: any) => {
          h.createCalls.push(params);
          h.createIdemKeys.push(opts?.idempotencyKey ?? '');
          const id = `cs_new_${h.createCalls.length}`;
          const s = { id, url: `https://stripe.test/${id}`, status: 'open', payment_status: 'unpaid', ...params };
          h.sessions[id] = s;
          return { id, url: s.url };
        }),
        retrieve: vi.fn(async (id: string) => {
          h.retrieveCalls++;
          const s = h.sessions[id];
          if (!s) throw Object.assign(new Error(`No such checkout session: ${id}`), { statusCode: 404, type: 'StripeInvalidRequestError', code: 'resource_missing' });
          return s;
        }),
        expire: vi.fn(async (id: string) => { h.expireCalls.push(id); if (h.sessions[id]) h.sessions[id].status = 'expired'; return h.sessions[id]; }),
      },
    },
    paymentIntents: { retrieve: vi.fn(async () => ({ latest_charge: { balance_transaction: { fee: 55 } } })) },
    charges: { retrieve: vi.fn(async () => ({ balance_transaction: { fee: 55 } })) },
  }),
}));

import { startCheckout } from './checkout';

// ── Minimal in-memory Prisma stand-in (the shape of lib/stripe/verify-checkout.test.ts's client) ─────────────
type Row = Record<string, any>;
type StoreT = Record<string, Row[]>;

function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}
function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, cond]) => {
    const v = row[k];
    if (cond === null) return v == null;
    if (cond instanceof Date || typeof cond !== 'object' || Array.isArray(cond)) return sameValue(v, cond);
    const c = cond as Row;
    if (!Object.keys(c).some((op) => ['not', 'in', 'gte', 'gt', 'lte', 'lt'].includes(op))) return matches(row, c);
    if ('not' in c && (c.not === null ? v == null : sameValue(v, c.not))) return false;
    if ('in' in c && !(c.in as unknown[]).some((x) => sameValue(v, x))) return false;
    if ('gte' in c && !(v != null && v >= c.gte)) return false;
    if ('gt' in c && !(v != null && v > c.gt)) return false;
    if ('lte' in c && !(v != null && v <= c.lte)) return false;
    if ('lt' in c && !(v != null && v < c.lt)) return false;
    return true;
  });
}
function applyData(row: Row, data: Row) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && 'increment' in (v as Row)) row[k] = (row[k] ?? 0) + (v as Row).increment;
    else row[k] = v;
  }
}
function clientFor(store: StoreT): any {
  const table = (model: string): any => {
    const rows = () => (store[model] ??= []);
    return new Proxy({} as Row, {
      get: (_t, method) => {
        if (typeof method === 'symbol' || method === 'then') return undefined;
        const m = String(method);
        if (m === 'findUnique' || m === 'findFirst') return async (a: Row = {}) => rows().find((r) => matches(r, a.where)) ?? null;
        if (m === 'findMany') return async (a: Row = {}) => rows().filter((r) => matches(r, a.where));
        if (m === 'count') return async (a: Row = {}) => rows().filter((r) => matches(r, a.where)).length;
        if (m === 'create') return async (a: Row) => { const r = { id: a.data.id ?? `${model}-${rows().length + 1}`, createdAt: new Date(), ...a.data }; rows().push(r); return r; };
        if (m === 'update') return async (a: Row) => { const r = rows().find((x) => matches(x, a.where)); if (!r) throw Object.assign(new Error('P2025'), { code: 'P2025' }); applyData(r, a.data); return r; };
        if (m === 'updateMany') return async (a: Row) => { const hit = rows().filter((x) => matches(x, a.where)); for (const r of hit) applyData(r, a.data); return { count: hit.length }; };
        if (m === 'upsert') return async (a: Row) => { const r = rows().find((x) => matches(x, a.where)); if (r) { applyData(r, a.update); return r; } const n = { id: a.create.id ?? `${model}-${rows().length + 1}`, ...a.create }; rows().push(n); return n; };
        return undefined;
      },
    });
  };
  const client: any = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'then' || typeof prop === 'symbol') return undefined;
      if (prop === '$transaction') return async (arg: unknown) => (typeof arg === 'function' ? (arg as any)(client) : Promise.all(arg as Promise<unknown>[]));
      if (prop === '__store') return store;
      return table(String(prop));
    },
  });
  return client;
}

const ENV_KEYS = ['COACH_STORE_PAYMENTS_ENABLED', 'COACH_STORE_COACH_USER_IDS'] as const;
const SAVED: Record<string, string | undefined> = {};
const COACH = 'coach-elijah';
const BUYER = 'buyer-1';

beforeEach(() => {
  for (const k of ENV_KEYS) SAVED[k] = process.env[k];
  process.env.COACH_STORE_PAYMENTS_ENABLED = '1';
  process.env.COACH_STORE_COACH_USER_IDS = COACH;
  h.store = {}; h.db = clientFor(h.store);
  h.isAdult = true;
  h.sessions = {};
  h.createCalls = [];
  h.createIdemKeys = [];
  h.expireCalls = [];
  h.retrieveCalls = 0;
  seedStore();
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
});

function seedStore() {
  const row = storePriceByKey('signature-dunk-course')!;
  const listingId = `listing-${row.key}`;
  (h.store.marketplaceListing ??= []).push({
    id: listingId, creatorId: COACH, title: row.title, itemKey: itemKeyFor(row.manifest!, 'elijah'),
    priceUsd: row.priceCents, active: true, listingType: 'COACH_STORE', manifest: JSON.stringify(row.manifest),
  });
  (h.store.instructor ??= []).push({
    id: 'instructor-1', userId: COACH, slug: 'elijah', published: true,
    weeklyHours: '[]', blackoutDates: '[]', bufferMinutes: 15, minNoticeHours: 12, maxDaysAhead: 28,
  });
  return listingId;
}

async function buy(listingId: string) {
  const res = await startCheckout(BUYER, { listingId }, 'https://fel.test');
  return { status: res.status, json: await res.json() };
}

function openSessionFor(rowId: string, priceCents: number) {
  // The session the first checkout created, retrievable by the row's stored stripeCheckoutId.
  const id = `cs_open_${rowId}`;
  h.sessions[id] = {
    id, url: `https://stripe.test/${id}`, status: 'open', payment_status: 'unpaid', mode: 'payment',
    metadata: { product: 'COACH_STORE', userId: BUYER, rowId, kind: 'course', beneficiary: 'self' },
  };
  return id;
}

describe('B5 retrying a program purchase within 24 h never 500s', () => {
  it('(a) a second checkout while the first is open returns the same URL, creates no new session, keeps the unlock code', async () => {
    const listingId = seedStore();
    const first = await buy(listingId);
    expect(first.status).toBe(200);
    const rowId = first.json.rowId;
    // Simulate the first session still open at Stripe under the row's stored id.
    const row = (h.store.programAccess ?? []).find((r: any) => r.id === rowId)!;
    row.stripeCheckoutId = openSessionFor(rowId, row.priceCents);
    const unlockBefore = row.unlockCodeHash;
    h.createCalls = [];

    const second = await buy(listingId);
    expect(second.status).toBe(200);
    expect(second.json.url).toBe(h.sessions[row.stripeCheckoutId].url);
    expect(second.json.rowId).toBe(rowId);
    expect(h.createCalls).toHaveLength(0);
    expect((h.store.programAccess ?? []).find((r: any) => r.id === rowId)!.unlockCodeHash).toBe(unlockBefore);
  });

  it('(b) the first session expired -> a new session is created under a DIFFERENT idempotency key, 200', async () => {
    const listingId = seedStore();
    const first = await buy(listingId);
    const rowId = first.json.rowId;
    const row = (h.store.programAccess ?? []).find((r: any) => r.id === rowId)!;
    // Mark the stored session expired at Stripe.
    const oldId = row.stripeCheckoutId;
    if (h.sessions[oldId]) h.sessions[oldId].status = 'expired';
    else { h.sessions[oldId] = { id: oldId, status: 'expired', payment_status: 'unpaid', mode: 'payment', metadata: {} }; }
    const keysBefore = [...h.createIdemKeys];

    const second = await buy(listingId);
    expect(second.status).toBe(200);
    expect(h.createCalls.length).toBeGreaterThan(keysBefore.length);
    const newKey = h.createIdemKeys[h.createIdemKeys.length - 1];
    // The new session's idempotency key carries the timestamp — never the bare reused row key that 500'd.
    expect(newKey).toMatch(new RegExp(`^coach-store:checkout:${rowId}:\\d+$`));
    expect(newKey).not.toBe(`coach-store:checkout:${rowId}`);
  });

  it('(c) the first session is paid -> fulfil + 409 already_owned, one sale posting, row ACTIVE', async () => {
    const listingId = seedStore();
    const first = await buy(listingId);
    const rowId = first.json.rowId;
    const row = (h.store.programAccess ?? []).find((r: any) => r.id === rowId)!;
    row.stripeCheckoutId = openSessionFor(rowId, row.priceCents);
    h.sessions[row.stripeCheckoutId].payment_status = 'paid';
    h.sessions[row.stripeCheckoutId].status = 'complete';
    h.sessions[row.stripeCheckoutId].payment_intent = { id: 'pi_1' };
    h.createCalls = [];

    const second = await buy(listingId);
    expect(second.status).toBe(409);
    expect(second.json.error).toBe('already_owned');
    expect(h.createCalls).toHaveLength(0);
    expect((h.store.programAccess ?? []).find((r: any) => r.id === rowId)!.status).toBe('ACTIVE');
    const sales = (h.store.ledgerTransaction ?? []).filter((t: any) => t.kind === 'MARKETPLACE_SALE');
    expect(sales).toHaveLength(1);
  });
});
