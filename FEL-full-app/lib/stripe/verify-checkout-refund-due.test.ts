// STORE-READY B6 (F2): a paid booking is never dropped silently, and the null-slotLock "taken" bug is gone.
//
// Covered here, in-memory DB + mocked Stripe (the pattern of lib/stripe/verify-checkout.test.ts):
//   (a) HELD -> swept EXPIRED -> paid verify -> PAID, exactly one MARKETPLACE_SALE.
//   (b) a paid-after-sweep booking whose slot overlaps ANOTHER PAID booking at a DIFFERENT start (a 60-min at
//       10:00 vs a 30-min at 10:30) -> REFUND_DUE, one posting, HTTP 200 with status 'refund_due'.
//   (c) an EXPIRED booking plus an UNRELATED paid video review (slotLock null) still pays -> PAID (the null
//       slotLock no longer means "taken").
//   (d) a second verify of the same session posts no second sale and changes nothing.
//   (e) booked 12 h 10 min ahead with minNoticeHours 12, verified 33 min later -> PAID (notice measured from the
//       BOOKING's createdAt, not the verify time).
//   (f) a session whose startsAt has ALREADY passed when the paid verify lands -> REFUND_DUE, slotLock null,
//       never PAID, status 'refund_due', one posting, nothing thrown.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const USER = 'buyer-1';

type Row = Record<string, any>;
type Store = Record<string, Row[]>;

const p2002 = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
const UNIQUE: Record<string, string[]> = {
  ledgerTransaction: ['idempotencyKey'],
  ledgerAccount: ['key'],
  order: ['stripeSessionId'],
  booking: ['slotLock'],
};
const compound = (data: Row, key: string) => (data[key] == null ? null : String(data[key]));

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
    if (!Object.keys(c).some((op) => ['not', 'in', 'gte', 'gt', 'lte', 'lt'].includes(op))) return matches(row, c);
    if ('not' in c && (c.not === null ? v == null : v === c.not)) return false;
    if ('in' in c && !(c.in as unknown[]).includes(v)) return false;
    if ('gte' in c && !(v != null && (v instanceof Date && c.gte instanceof Date ? v.getTime() >= c.gte.getTime() : v >= c.gte))) return false;
    if ('gt' in c && !(v != null && (v instanceof Date && c.gt instanceof Date ? v.getTime() > c.gt.getTime() : v > c.gt))) return false;
    if ('lte' in c && !(v != null && (v instanceof Date && c.lte instanceof Date ? v.getTime() <= c.lte.getTime() : v <= c.lte))) return false;
    if ('lt' in c && !(v != null && (v instanceof Date && c.lt instanceof Date ? v.getTime() < c.lt.getTime() : v < c.lt))) return false;
    return true;
  });
}
const pick = (row: Row | null, select?: Row) =>
  row && select ? Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, row[k]])) : row;

function applyData(row: Row, data: Row) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && 'increment' in (v as Row)) row[k] = (row[k] ?? 0) + (v as Row).increment;
    else row[k] = v;
  }
}

function table(store: Store, model: string) {
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
      return row;
    },
    updateMany: async (a: Row) => {
      const hit = find(a.where);
      // The unique slotLock CAS: a paid-after-expiry claim that would collide throws P2002.
      for (const key of UNIQUE[model] ?? []) {
        if (!(key in (a.data ?? {}))) continue;
        for (const r of hit) {
          const nv = compound({ ...r, [key]: a.data[key] }, key);
          if (nv == null) continue;
          if (rows().some((o) => o !== r && !hit.includes(o) && compound(o, key) === nv)) throw p2002();
          if (rows().some((o) => o !== r && hit.includes(o) && o.id !== r.id && compound(o, key) === nv)) throw p2002();
        }
      }
      for (const r of hit) applyData(r, a.data);
      return { count: hit.length };
    },
    deleteMany: async (a: Row = {}) => {
      const before = rows().length;
      store[model] = rows().filter((r) => !matches(r, a.where));
      return { count: before - store[model].length };
    },
  };
}

function insert_into(store: Store, model: string, data: Row) {
  (store[model] ??= []).push({ id: data.id ?? `${model}-${(store[model] ?? []).length + 1}`, ...data });
}

function clientFor(store: Store): any {
  const client: any = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'then' || typeof prop === 'symbol') return undefined;
      if (prop === '$transaction') return async (arg: unknown) => (typeof arg === 'function' ? (arg as any)(client) : Promise.all(arg as Promise<unknown>[]));
      return table(store, String(prop));
    },
  });
  return client;
}

const h = vi.hoisted(() => ({
  store: {} as Record<string, Record<string, any>[]>,
  sessionUser: 'buyer-1' as string | null,
  stripeSessions: {} as Record<string, any>,
}));

vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => (h.sessionUser ? { user: { id: h.sessionUser } } : null)) }));
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
            const s = h.stripeSessions[id];
            if (!s) throw Object.assign(new Error(`No such checkout session: ${id}`), { statusCode: 404, type: 'StripeInvalidRequestError', code: 'resource_missing' });
            return s;
          }),
        },
      },
      paymentIntents: { retrieve: vi.fn(async () => ({ latest_charge: { balance_transaction: { fee: 55 } } })) },
      charges: { retrieve: vi.fn(async () => ({ balance_transaction: { fee: 55 } })) },
    }),
  };
});

import { verifyCheckoutSession } from './verify-checkout';
import { POST as verifySessionRoute } from '@/app/api/stripe/verify-session/route';

// The Pacific openSlots math is real; build a slot inside a weekly window a known distance ahead of `now`.
// dow 0-6 Pacific; we pick the next occurrence of `dow` at 10:00 PT for a `durationMin` slot.
import { ptWallClockToUtc, ptParts } from '@/lib/sessions/schedule';

function nextSessionStart(now: Date, dow: number, durationMin: number, hourPt = 10): Date {
  const p = ptParts(now);
  for (let d = 1; d <= 14; d++) {
    const cursor = new Date(Date.UTC(p.y, p.m - 1, p.day + d, 12, 0, 0));
    const pc = ptParts(cursor);
    if (pc.weekday !== dow) continue;
    const startsAt = ptWallClockToUtc(pc.y, pc.m, pc.day, hourPt, 0);
    if (startsAt.getTime() > now.getTime()) return startsAt;
  }
  throw new Error('no slot');
}

function weeklyOpenAll(): { dow: number; startMin: number; endMin: number }[] {
  // Prisma's Json column returns a PARSED array at runtime — fixtures must match (a JSON string reads as no windows).
  return [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, startMin: 0, endMin: 24 * 60 }));
}

/** The first 10:00-PT 30-min slot whose startsAt is >= `earliest` (and inside the notice/horizon from `now`). */
function firstOpenStart(now: Date, durationMin: number, earliest: Date): Date {
  // Reuse the real slot math: ask openSlots directly (no busy rows) so the fixture start is a real slot.
  // (Imported lazily to keep the hoisted mocks in place.)
  return firstOpenStartSync(now, durationMin, earliest);
}

import { openSlots } from '@/lib/coach-store/slots';
function firstOpenStartSync(now: Date, durationMin: number, earliest: Date): Date {
  const open = openSlots({
    now, weekly: weeklyOpenAll(), blackouts: [], busy: [],
    bufferMinutes: 0, minNoticeHours: 0, maxDaysAhead: 28, durations: [durationMin as 30 | 60],
  });
  const slot = open.find((s) => s.startsAt.getTime() >= earliest.getTime());
  if (!slot) throw new Error('no open slot in fixture horizon');
  return slot.startsAt;
}

function seedInstructor(over: Row = {}) {
  (h.store.instructor ??= []).push({
    id: 'ins-1', userId: 'coach-1', slug: 'elijah', published: true,
    weeklyHours: weeklyOpenAll(), blackoutDates: [], bufferMinutes: 0, minNoticeHours: 12, maxDaysAhead: 28,
    ...over,
  });
}

function seedBooking(over: Row = {}) {
  const rows = (h.store.booking ??= []);
  const row = {
    id: `bk_${rows.length + 1}`, kind: 'live_1on1', instructorId: 'ins-1', coachUserId: 'coach-1', clientUserId: USER,
    listingId: 'l', status: 'HELD', priceCents: 6500, stripeFeeCents: 0, durationMin: 30, ...over,
  };
  rows.push(row);
  return row;
}

function paidCoachSession(rowId: string, over: Row = {}) {
  const id = `cs_${rowId}`;
  h.stripeSessions[id] = {
    id, object: 'checkout.session', mode: 'payment', status: 'complete', payment_status: 'paid',
    amount_total: 6500, payment_intent: { id: `pi_${rowId}` }, subscription: null,
    metadata: { product: 'COACH_STORE', userId: USER, rowId, kind: 'live_1on1', beneficiary: 'self' },
    client_reference_id: USER, ...over,
  };
  return id;
}

function req(body: unknown): any {
  return { json: async () => body, headers: { get: () => null }, nextUrl: { origin: 'https://fel.test' } };
}

beforeEach(() => {
  h.store = {};
  h.stripeSessions = {};
  h.sessionUser = USER;
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
});
afterEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
});

describe('B6 a paid booking is never dropped silently', () => {
  it('(a) HELD -> sweep EXPIRED -> paid verify -> PAID, one MARKETPLACE_SALE', async () => {
    seedInstructor();
    const now = new Date('2026-10-08T12:00:00Z');
    const startsAt = nextSessionStart(now, ptParts(now).weekday, 30);
    const createdAt = new Date(now.getTime() - 33 * 60_000); // booked 33 min before verify
    const bk = seedBooking({ startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), status: 'EXPIRED', slotLock: null, createdAt });
    const cs = paidCoachSession(bk.id);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const r = await verifyCheckoutSession(USER, cs);
      expect(r).toMatchObject({ ok: true, status: 'fulfilled' });
      const row = h.store.booking.find((b) => b.id === bk.id)!;
      expect(row.status).toBe('PAID');
      expect(row.slotLock).toBe(`ins-1:${startsAt.toISOString()}`);
      const sales = (h.store.ledgerTransaction ?? []).filter((t) => t.kind === 'MARKETPLACE_SALE');
      expect(sales).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('(b) overlap with another PAID booking at a DIFFERENT start -> REFUND_DUE, one posting, HTTP 200 refund_due', async () => {
    seedInstructor({ bufferMinutes: 0 });
    const now = new Date('2026-10-08T12:00:00Z');
    const t0 = nextSessionStart(now, ptParts(now).weekday, 60);
    // A 60-minute PAID booking at 10:00 occupies [10:00, 11:00).
    seedBooking({
      id: 'bk_taken', status: 'PAID', startsAt: t0, endsAt: new Date(t0.getTime() + 60 * 60_000),
      durationMin: 60, slotLock: `ins-1:${t0.toISOString()}`, createdAt: new Date(now.getTime() - 60 * 60_000),
    });
    // The buyer's 30-minute booking at 10:30 (created before the sweep, swept to EXPIRED with slotLock null).
    const t30 = new Date(t0.getTime() + 30 * 60_000);
    const bk = seedBooking({
      status: 'EXPIRED', startsAt: t30, endsAt: new Date(t30.getTime() + 30 * 60_000), durationMin: 30,
      slotLock: null, createdAt: new Date(now.getTime() - 40 * 60_000),
    });
    const cs = paidCoachSession(bk.id);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const res = await verifySessionRoute(req({ session_id: cs }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('refund_due');
      const row = h.store.booking.find((b) => b.id === bk.id)!;
      expect(row.status).toBe('REFUND_DUE');
      expect(row.slotLock).toBe(null);
      const sales = (h.store.ledgerTransaction ?? []).filter((t) => t.kind === 'MARKETPLACE_SALE');
      expect(sales).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('(c) EXPIRED booking + an unrelated PAID video review (null slotLock) -> still PAID', async () => {
    seedInstructor();
    const now = new Date('2026-10-08T12:00:00Z');
    const startsAt = nextSessionStart(now, ptParts(now).weekday, 30);
    // An unrelated PAID video_review (no slot) — must not be read as "taken".
    seedBooking({ id: 'bk_vr', kind: 'video_review', status: 'PAID', startsAt: null, endsAt: null, slotLock: null, createdAt: now });
    const bk = seedBooking({ status: 'EXPIRED', startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), slotLock: null, createdAt: new Date(now.getTime() - 40 * 60_000) });
    const cs = paidCoachSession(bk.id);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const r = await verifyCheckoutSession(USER, cs);
      expect(r).toMatchObject({ ok: true, status: 'fulfilled' });
      expect(h.store.booking.find((b) => b.id === bk.id)!.status).toBe('PAID');
    } finally {
      vi.useRealTimers();
    }
  });

  it('(d) a second verify posts no second sale and changes nothing', async () => {
    seedInstructor();
    const now = new Date('2026-10-08T12:00:00Z');
    const startsAt = nextSessionStart(now, ptParts(now).weekday, 30);
    const bk = seedBooking({ status: 'HELD', startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), createdAt: now });
    const cs = paidCoachSession(bk.id);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      await verifyCheckoutSession(USER, cs);
      const again = await verifyCheckoutSession(USER, cs);
      expect(again).toMatchObject({ ok: true, status: 'fulfilled' });
      const sales = (h.store.ledgerTransaction ?? []).filter((t) => t.kind === 'MARKETPLACE_SALE');
      expect(sales).toHaveLength(1);
      expect(h.store.booking.filter((b) => b.id === bk.id)).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('(e) booked 12h10m ahead, minNoticeHours 12, verified 33 min later -> PAID (notice from createdAt)', async () => {
    seedInstructor({ minNoticeHours: 12 });
    const createdAt = new Date('2026-10-08T00:00:00Z');
    // The first REAL slot at/after 12h10m from createdAt — so it passes notice measured from createdAt.
    const startsAt = firstOpenStart(createdAt, 30, new Date(createdAt.getTime() + (12 * 60 + 10) * 60_000));
    const verifyAt = new Date(createdAt.getTime() + 33 * 60_000); // 33 min later, notice window already failed by "now"
    const bk = seedBooking({ status: 'HELD', startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), createdAt });
    const cs = paidCoachSession(bk.id);
    vi.useFakeTimers();
    vi.setSystemTime(verifyAt);
    try {
      const r = await verifyCheckoutSession(USER, cs);
      expect(r).toMatchObject({ ok: true, status: 'fulfilled' });
      expect(h.store.booking.find((b) => b.id === bk.id)!.status).toBe('PAID');
    } finally {
      vi.useRealTimers();
    }
  });

  it('(f) startsAt already passed when the paid verify lands -> REFUND_DUE, slotLock null, never PAID, status refund_due', async () => {
    seedInstructor({ bufferMinutes: 0 });
    const now = new Date('2026-10-08T12:00:00Z');
    // The session was booked for a slot already in the past by the time payment lands.
    const startsAt = new Date(now.getTime() - 30 * 60_000);
    const bk = seedBooking({ status: 'HELD', startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), createdAt: new Date(now.getTime() - 90 * 60_000) });
    const cs = paidCoachSession(bk.id);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const res = await verifySessionRoute(req({ session_id: cs }));
      expect(res.status).toBe(200);
      expect((await res.json()).status).toBe('refund_due');
      const row = h.store.booking.find((b) => b.id === bk.id)!;
      expect(row.status).toBe('REFUND_DUE');
      expect(row.slotLock).toBe(null);
      const sales = (h.store.ledgerTransaction ?? []).filter((t) => t.kind === 'MARKETPLACE_SALE');
      expect(sales).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
