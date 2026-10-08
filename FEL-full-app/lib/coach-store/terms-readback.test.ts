// STORE-TERMS (h) read-back: the paid-object terms_version is LOGGED (ids only), never a gate. Real
// fulfilCoachStoreCheckout and real reconcileCoachStore -> syncSubscriptionRow over a mocked db and Stripe.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  store: {} as Record<string, Record<string, any>[]>,
  subscriptions: [] as any[],
}));

vi.mock('@/lib/db', () => ({ get prisma() { return clientFor(h.store); } }));
vi.mock('@/lib/stripe', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/stripe')>();
  const list = (data: any[]) => () => ({
    data,
    has_more: false,
    then(onFulfilled: any, onRejected: any) {
      return Promise.resolve({ data, has_more: false }).then(onFulfilled, onRejected);
    },
    async *[Symbol.asyncIterator]() { yield* data; },
  });
  return {
    ...real,
    getStripe: () => ({
      checkout: { sessions: { retrieve: vi.fn(async () => { throw new Error('no such session'); }) } },
      refunds: { list: vi.fn(list([])) },
      disputes: { list: vi.fn(list([])) },
      charges: { retrieve: vi.fn(async (id: string) => ({ id, refunded: false })) },
      paymentIntents: { retrieve: vi.fn(async () => ({ latest_charge: { balance_transaction: { fee: 55 } } })) },
      subscriptions: { list: vi.fn(() => list(h.subscriptions)()) },
      invoices: { list: vi.fn(async () => ({ data: [] })) },
    }),
  };
});

type Row = Record<string, any>;
const p2002 = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
const UNIQUE: Record<string, string[]> = { ledgerTransaction: ['idempotencyKey'], order: ['stripeSessionId'], booking: ['slotLock'] };
const compound = (d: Row, k: string) => (d[k] == null ? null : String(d[k]));
function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, cond]) => {
    const v = row[k];
    if (cond === null) return v == null;
    if (cond instanceof Date || typeof cond !== 'object' || Array.isArray(cond)) {
      if (cond instanceof Date) return v instanceof Date && v.getTime() === cond.getTime();
      return v === cond;
    }
    const c = cond as Row;
    if (!Object.keys(c).some((op) => ['not', 'in', 'notIn', 'gte', 'gt', 'lte', 'lt'].includes(op))) return matches(row, c);
    if ('not' in c && (c.not === null ? v == null : v === c.not)) return false;
    if ('in' in c && !(c.in as unknown[]).includes(v)) return false;
    if ('notIn' in c && (c.notIn as unknown[]).includes(v)) return false;
    if ('gte' in c && !(v != null && (v instanceof Date && c.gte instanceof Date ? v.getTime() >= c.gte.getTime() : v >= c.gte))) return false;
    if ('gt' in c && !(v != null && (v instanceof Date && c.gt instanceof Date ? v.getTime() > c.gt.getTime() : v > c.gt))) return false;
    if ('lte' in c && !(v != null && (v instanceof Date && c.lte instanceof Date ? v.getTime() <= c.lte.getTime() : v <= c.lte))) return false;
    if ('lt' in c && !(v != null && (v instanceof Date && c.lt instanceof Date ? v.getTime() < c.lt.getTime() : v < c.lt))) return false;
    return true;
  });
}
const pick = (row: Row | null, select?: Row) => row && select ? Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, row[k]])) : row;
function insertInto(store: Record<string, Row[]>, model: string, data: Row) {
  (store[model] ??= []).push({ id: data.id ?? `${model}-${(store[model] ?? []).length + 1}`, ...data });
}
function applyData(row: Row, data: Row) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && 'increment' in (v as Row)) row[k] = (row[k] ?? 0) + (v as Row).increment;
    else row[k] = v;
  }
}
function table(store: Record<string, Row[]>, model: string) {
  const rows = () => (store[model] ??= []);
  const find = (where?: Row) => rows().filter((r) => matches(r, where));
  const insert = (data: Row) => {
    for (const key of UNIQUE[model] ?? []) {
      const idv = compound(data, key);
      if (idv == null) continue;
      if (rows().some((r) => compound(r, key) === idv)) throw p2002();
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
      const data = { ...a.data };
      const nested = data.postings?.create as Row[] | undefined;
      delete data.postings;
      const row = insert(data);
      if (nested) for (const p of nested) insertInto(store, 'ledgerPosting', { ...p, transactionId: row.id });
      return pick(row, a.select);
    },
    update: async (a: Row) => { const r = find(a.where)[0]; if (!r) throw Object.assign(new Error('P2025'), { code: 'P2025' }); applyData(r, a.data); return pick(r, a.select); },
    updateMany: async (a: Row) => {
      const hit = find(a.where);
      for (const r of hit) applyData(r, a.data);
      return { count: hit.length };
    },
  };
}
function clientFor(store: Record<string, Row[]>): any {
  const client: any = new Proxy({}, { get: (_t, prop) => {
    if (prop === 'then' || typeof prop === 'symbol') return undefined;
    if (prop === '$transaction') return async (arg: unknown) => (typeof arg === 'function' ? (arg as any)(client) : Promise.all(arg as Promise<unknown>[]));
    return table(store, String(prop));
  } });
  return client;
}

import { reconcileCoachStore } from './reconcile';
import { coachStoreSessionMeta, fulfilCoachStoreCheckout } from './webhook';
import { STORE_TERMS_VERSION, termsVersionStatus } from '@/lib/store-terms';
import { ptParts, ptWallClockToUtc } from '@/lib/sessions/schedule';

const USER = 'coach-1';
const NOW = new Date('2026-10-08T12:00:00Z');
const STALE = 'store-terms-2000-01-01';
const WEEKLY = [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, startMin: 0, endMin: 24 * 60 }));
const PREFIX = '[coach-store] terms_version';

// Three variants: no terms_version, a stale one, the current one.
const VARIANTS: { name: string; terms: Row; status: 'missing' | 'stale' | null }[] = [
  { name: 'missing', terms: {}, status: 'missing' },
  { name: 'stale', terms: { terms_version: STALE }, status: 'stale' },
  { name: 'current', terms: { terms_version: STORE_TERMS_VERSION }, status: null },
];

let warn: ReturnType<typeof vi.spyOn>;
const termsWarnings = () =>
  warn.mock.calls.filter((c) => typeof c[0] === 'string' && (c[0] as string).startsWith(PREFIX)).map((c) => [...c]);

function resetStore() {
  h.store = {};
  h.subscriptions = [];
  h.store.instructor = [{ id: 'ins-1', userId: USER, slug: 'elijah', published: true, weeklyHours: WEEKLY, blackoutDates: [], bufferMinutes: 0, minNoticeHours: 12, maxDaysAhead: 28 }];
}
function nextSlot(now: Date): Date {
  const p = ptParts(now);
  for (let d = 1; d <= 14; d++) {
    const c = new Date(Date.UTC(p.y, p.m - 1, p.day + d, 12, 0, 0));
    const pc = ptParts(c);
    const s = ptWallClockToUtc(pc.y, pc.m, pc.day, 10, 0);
    if (s.getTime() > now.getTime() + 12 * 3_600_000) return s;
  }
  throw new Error('no slot');
}
function seedAccess(over: Row = {}) {
  const rows = (h.store.programAccess ??= []);
  const row = { id: `pa_${rows.length + 1}`, userId: 'buyer-1', instructorId: 'ins-1', listingId: 'l', lane: 'dunking', billing: 'one_time', scope: 'lane', beneficiary: 'self', status: 'PENDING', priceCents: 7900, stripeFeeCents: 0, codeActive: true, createdAt: new Date(), updatedAt: new Date(), ...over };
  rows.push(row); return row;
}
function seedBooking(over: Row = {}) {
  const rows = (h.store.booking ??= []);
  const startsAt = nextSlot(NOW);
  const row = { id: `bk_${rows.length + 1}`, kind: 'video_review', instructorId: 'ins-1', coachUserId: USER, clientUserId: 'buyer-1', listingId: 'l', status: 'HELD', priceCents: 6500, stripeFeeCents: 0, durationMin: 30, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), slotLock: `ins-1:${startsAt.toISOString()}`, createdAt: NOW, updatedAt: NOW, ...over };
  rows.push(row); return row;
}
function session(rowId: string, kind: string, terms: Row): any {
  return {
    id: `cs_${rowId}`, mode: 'payment', status: 'complete', payment_status: 'paid',
    payment_intent: { id: `pi_${rowId}` }, subscription: null, client_reference_id: 'buyer-1',
    metadata: { product: 'COACH_STORE', userId: 'buyer-1', rowId, kind, beneficiary: 'self', ...terms },
  };
}
async function fulfil(s: any) {
  return fulfilCoachStoreCheckout(s, coachStoreSessionMeta(s)!, `stripe-session:${s.id}`);
}

beforeEach(() => {
  resetStore();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
  vi.useFakeTimers(); vi.setSystemTime(NOW);
});
afterEach(() => {
  warn.mockRestore();
  vi.useRealTimers();
  delete process.env.STRIPE_SECRET_KEY;
});

describe('STORE-TERMS (h) read-back', () => {
  it('1. termsVersionStatus classifies current / stale / missing and never throws', () => {
    expect(termsVersionStatus({ terms_version: 'store-terms-2026-10-04' })).toBe('current');
    expect(termsVersionStatus({ terms_version: 'store-terms-2000-01-01' })).toBe('stale');
    for (const m of [{}, { terms_version: '' }, { terms_version: 5 }, null, undefined, 'x', 42]) {
      expect(termsVersionStatus(m)).toBe('missing');
    }
    const throwing = { get terms_version(): string { throw new Error('boom'); } };
    expect(() => termsVersionStatus(throwing)).not.toThrow();
    expect(termsVersionStatus(throwing)).toBe('missing');
  });

  it('2. one-time PROGRAM: same outcome, ACTIVE and one sale in all three; warnings missing / stale / none', async () => {
    const results: { out: unknown; status: unknown; sales: number; warns: unknown[][] }[] = [];
    for (const v of VARIANTS) {
      resetStore();
      warn.mockClear();
      const pa = seedAccess({ id: 'pa_prog' });
      const out = await fulfil(session(pa.id, 'program', v.terms));
      results.push({
        out,
        status: h.store.programAccess.find((a) => a.id === pa.id)!.status,
        sales: (h.store.ledgerTransaction ?? []).filter((t) => t.kind === 'MARKETPLACE_SALE').length,
        warns: termsWarnings(),
      });
    }
    expect(results.map((r) => r.out)).toEqual(['fulfilled', 'fulfilled', 'fulfilled']);
    expect(results.map((r) => r.status)).toEqual(['ACTIVE', 'ACTIVE', 'ACTIVE']);
    expect(results.map((r) => r.sales)).toEqual([1, 1, 1]);
    expect(results.map((r) => r.warns)).toEqual([
      [[`${PREFIX} missing`, 'pa_prog']],
      [[`${PREFIX} stale`, 'pa_prog']],
      [],
    ]);
  });

  it('3. paid BOOKING HELD -> PAID: same outcome and row in all three; warnings missing / stale / none', async () => {
    const results: { out: unknown; status: unknown; sales: number; warns: unknown[][] }[] = [];
    for (const v of VARIANTS) {
      resetStore();
      warn.mockClear();
      const bk = seedBooking({ id: 'bk_vr' });
      const out = await fulfil(session(bk.id, 'video_review', v.terms));
      results.push({
        out,
        status: h.store.booking.find((b) => b.id === bk.id)!.status,
        sales: (h.store.ledgerTransaction ?? []).filter((t) => t.kind === 'MARKETPLACE_SALE').length,
        warns: termsWarnings(),
      });
    }
    expect(results.map((r) => r.out)).toEqual(['fulfilled', 'fulfilled', 'fulfilled']);
    expect(results.map((r) => r.status)).toEqual(['PAID', 'PAID', 'PAID']);
    expect(new Set(results.map((r) => r.sales)).size).toBe(1);
    expect(results.map((r) => r.warns)).toEqual([
      [[`${PREFIX} missing`, 'bk_vr']],
      [[`${PREFIX} stale`, 'bk_vr']],
      [],
    ]);
  });

  const sub = (over: Row = {}) => ({
    id: 'sub_1', status: 'active', cancel_at_period_end: false,
    items: { data: [{ current_period_end: Math.floor(NOW.getTime() / 1000) + 30 * 86_400 }] }, ...over,
  });

  it('4. syncSubscriptionRow (Pass 4): row ACTIVE and same counts in all three; warnings missing / stale / none', async () => {
    const { getStripe } = await import('@/lib/stripe');
    const results: { counts: unknown; status: unknown; warns: unknown[][] }[] = [];
    for (const v of VARIANTS) {
      resetStore();
      warn.mockClear();
      const pa = seedAccess({ id: 'pa_mem', billing: 'month', status: 'PAST_DUE', stripeSubscriptionId: 'sub_1', cancelAtPeriodEnd: false, accessUntil: null });
      h.subscriptions = [sub({ metadata: { ...v.terms } })];
      const counts = await reconcileCoachStore({ now: new Date(), stripe: getStripe() });
      results.push({ counts, status: h.store.programAccess.find((a) => a.id === pa.id)!.status, warns: termsWarnings() });
    }
    expect(results.map((r) => r.status)).toEqual(['ACTIVE', 'ACTIVE', 'ACTIVE']);
    expect(results[1].counts).toEqual(results[0].counts);
    expect(results[2].counts).toEqual(results[0].counts);
    expect((results[0].counts as any).renewed).toBe(1);
    expect(results.map((r) => r.warns)).toEqual([
      [[`${PREFIX} missing`, 'pa_mem']],
      [[`${PREFIX} stale`, 'pa_mem']],
      [],
    ]);
  });

  it('5. a subscription with NO FEL row logs no terms warning', async () => {
    const { getStripe } = await import('@/lib/stripe');
    h.subscriptions = [sub({ id: 'sub_orphan', metadata: {} })];
    await reconcileCoachStore({ now: new Date(), stripe: getStripe() });
    expect(termsWarnings()).toEqual([]);
  });
});
