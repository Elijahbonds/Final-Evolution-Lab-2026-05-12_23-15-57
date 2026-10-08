// STORE-READY B8 (RECONCILE): one authed run brings FEL in line with Stripe for paid checkouts nobody came
// back from, and for Dashboard refunds and disputes — no webhook. Mocked Stripe + in-memory DB.
//
// Covered: (a) HELD booking, session paid, verify never called -> PAID after one run; (b) same after the sweep
// with the slot taken -> REFUND_DUE; (c) PENDING program, session paid -> ACTIVE + one sale; (c2) HELD/EXPIRED
// booking whose paid session is found after its startsAt passed -> REFUND_DUE, never PAID; (d) full refund on a
// PAID booking's PI -> REFUNDED, slotLock null, referral REVERSED; (e) on REFUND_DUE -> REFUNDED; (f) on an
// ACTIVE teen program -> REFUNDED, codeActive false; (g) partial refund -> no change; (h) dispute needs_response
// -> PAUSED/DISPUTED, won -> restored, lost -> REFUNDED; (i) a second run on the same data -> no writes, no
// second posting; (j) the route's auth ladder (401 / 404 / coach / secret / no-key skip).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const USER = 'coach-1';
const h = vi.hoisted(() => ({
  store: {} as Record<string, Record<string, any>[]>,
  sessionUser: 'coach-1' as string | null,
  sessions: {} as Record<string, any>,
  refunds: [] as any[],
  disputes: [] as any[],
  charges: {} as Record<string, any>,
  subscriptions: [] as any[],
  invoices: [] as any[],
}));

vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => (h.sessionUser ? { user: { id: h.sessionUser } } : null)) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ get prisma() { return clientFor(h.store); } }));
vi.mock('@/lib/stripe', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/stripe')>();
  return {
    ...real,
    getStripe: () => ({
      checkout: { sessions: { retrieve: vi.fn(async (id: string) => {
        const s = h.sessions[id];
        if (!s) throw Object.assign(new Error('no such session'), { statusCode: 404, type: 'StripeInvalidRequestError', code: 'resource_missing' });
        return s;
      }) } },
      refunds: { list: vi.fn(async () => ({ data: h.refunds })) },
      disputes: { list: vi.fn(async () => ({ data: h.disputes })) },
      charges: { retrieve: vi.fn(async (id: string) => h.charges[id] ?? { id, refunded: false }) },
      paymentIntents: { retrieve: vi.fn(async () => ({ latest_charge: { balance_transaction: { fee: 55 } } })) },
      subscriptions: { list: vi.fn(async () => ({ data: h.subscriptions })) },
      invoices: { list: vi.fn(async () => ({ data: h.invoices })) },
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
function insert_into(store: Record<string, Row[]>, model: string, data: Row) {
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
      if (nested) for (const p of nested) insert_into(store, 'ledgerPosting', { ...p, transactionId: row.id });
      return pick(row, a.select);
    },
    update: async (a: Row) => { const r = find(a.where)[0]; if (!r) throw Object.assign(new Error('P2025'), { code: 'P2025' }); applyData(r, a.data); return pick(r, a.select); },
    updateMany: async (a: Row) => {
      const hit = find(a.where);
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

import { reconcileCoachStore, verifyReconcileSecret } from './reconcile';
import { POST as reconcileRoute } from '@/app/api/coach-store/reconcile/route';
import { ptParts, ptWallClockToUtc } from '@/lib/sessions/schedule';

const NOW = new Date('2026-10-08T12:00:00Z');
const WEEKLY = [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, startMin: 0, endMin: 24 * 60 }));

function seedInstructor() {
  (h.store.instructor ??= []).length = 0;
  (h.store.instructor ??= []).push({ id: 'ins-1', userId: USER, slug: 'elijah', published: true, weeklyHours: WEEKLY, blackoutDates: [], bufferMinutes: 0, minNoticeHours: 12, maxDaysAhead: 28 });
}
function nextSlot(now: Date, durationMin = 30): Date {
  const p = ptParts(now);
  for (let d = 1; d <= 14; d++) {
    const c = new Date(Date.UTC(p.y, p.m - 1, p.day + d, 12, 0, 0));
    const pc = ptParts(c);
    const s = ptWallClockToUtc(pc.y, pc.m, pc.day, 10, 0);
    if (s.getTime() > now.getTime() + 12 * 3_600_000) return s;
  }
  throw new Error('no slot');
}
function seedBooking(over: Row = {}) {
  const rows = (h.store.booking ??= []);
  const row = { id: `bk_${rows.length + 1}`, kind: 'live_1on1', instructorId: 'ins-1', coachUserId: USER, clientUserId: 'buyer-1', listingId: 'l', status: 'HELD', priceCents: 6500, stripeFeeCents: 0, durationMin: 30, createdAt: new Date(), updatedAt: new Date(), ...over };
  rows.push(row); return row;
}
function seedAccess(over: Row = {}) {
  const rows = (h.store.programAccess ??= []);
  const row = { id: `pa_${rows.length + 1}`, userId: 'buyer-1', instructorId: 'ins-1', listingId: 'l', lane: 'dunking', billing: 'one_time', scope: 'lane', beneficiary: 'self', status: 'PENDING', priceCents: 7900, stripeFeeCents: 0, codeActive: true, createdAt: new Date(), updatedAt: new Date(), ...over };
  rows.push(row); return row;
}
function paidSession(rowId: string, over: Row = {}) {
  const id = `cs_${rowId}`;
  h.sessions[id] = { id, mode: 'payment', status: 'complete', payment_status: 'paid', payment_intent: { id: `pi_${rowId}` }, subscription: null, metadata: { product: 'COACH_STORE', userId: 'buyer-1', rowId, kind: 'live_1on1', beneficiary: 'self' }, client_reference_id: 'buyer-1', ...over };
  return id;
}

beforeEach(() => {
  h.store = {}; h.sessions = {}; h.refunds = []; h.disputes = []; h.charges = {};
  h.subscriptions = []; h.invoices = [];
  h.sessionUser = USER;
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
  process.env.COACH_STORE_COACH_USER_IDS = USER;
  seedInstructor();
  vi.useFakeTimers(); vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.COACH_STORE_COACH_USER_IDS;
  delete process.env.COACH_STORE_RECONCILE_SECRET;
});

async function run() {
  const { getStripe } = await import('@/lib/stripe');
  return reconcileCoachStore({ now: new Date(), stripe: getStripe() });
}

describe('B8 reconcile pass 1 (paid checkouts nobody came back from)', () => {
  it('(a) a HELD booking with a paid session, verify never called -> PAID after one run', async () => {
    const startsAt = nextSlot(NOW);
    const bk = seedBooking({ startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), slotLock: `ins-1:${startsAt.toISOString()}`, createdAt: new Date(NOW.getTime() - 3_600_000), stripeCheckoutId: paidSession('bk_1') });
    h.sessions[bk.stripeCheckoutId].metadata.rowId = bk.id;
    const c = await run();
    expect(c.checked).toBe(1);
    expect(c.fulfilled).toBe(1);
    expect(h.store.booking.find((b) => b.id === bk.id)!.status).toBe('PAID');
  });

  it('(b) after the sweep with the slot taken -> REFUND_DUE', async () => {
    const t0 = nextSlot(NOW, 60);
    seedBooking({ id: 'bk_taken', status: 'PAID', startsAt: t0, endsAt: new Date(t0.getTime() + 60 * 60_000), durationMin: 60, slotLock: `ins-1:${t0.toISOString()}`, createdAt: NOW });
    const t30 = new Date(t0.getTime() + 30 * 60_000);
    const bk = seedBooking({ status: 'EXPIRED', startsAt: t30, endsAt: new Date(t30.getTime() + 30 * 60_000), slotLock: null, createdAt: new Date(NOW.getTime() - 3_600_000) });
    bk.stripeCheckoutId = paidSession(bk.id);
    const c = await run();
    expect(c.refundDue).toBe(1);
    expect(h.store.booking.find((b) => b.id === bk.id)!.status).toBe('REFUND_DUE');
  });

  it('(c) a PENDING program with a paid session -> ACTIVE, one sale', async () => {
    const pa = seedAccess({ stripeCheckoutId: paidSession('pa_1', { metadata: { product: 'COACH_STORE', userId: 'buyer-1', rowId: 'pa_1', kind: 'program', beneficiary: 'self' } }) });
    const c = await run();
    expect(c.fulfilled).toBe(1);
    expect(h.store.programAccess.find((a) => a.id === pa.id)!.status).toBe('ACTIVE');
    expect((h.store.ledgerTransaction ?? []).filter((t) => t.kind === 'MARKETPLACE_SALE')).toHaveLength(1);
  });

  it('(c2) a paid session found after the startsAt passed -> REFUND_DUE, never PAID', async () => {
    const startsAt = new Date(NOW.getTime() - 30 * 60_000); // already passed
    const bk = seedBooking({ status: 'EXPIRED', startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), slotLock: null, createdAt: new Date(NOW.getTime() - 2 * 3_600_000) });
    bk.stripeCheckoutId = paidSession(bk.id);
    const c = await run();
    expect(c.refundDue).toBe(1);
    const row = h.store.booking.find((b) => b.id === bk.id)!;
    expect(row.status).toBe('REFUND_DUE');
    expect(row.slotLock).toBe(null);
  });
});

describe('B8 reconcile passes 2-3 (refunds, disputes)', () => {
  function paidBookingWithReferral(over: Row = {}) {
    const bk = seedBooking({ status: 'PAID', startsAt: nextSlot(NOW), stripePaymentIntentId: 'pi_x', slotLock: `ins-1:${nextSlot(NOW).toISOString()}`, createdAt: NOW, ...over });
    (h.store.coachStoreReferral ??= []).push({ id: 'ref-1', paymentKey: 'live_1on1:bk:0', sourceId: bk.id, status: 'PENDING', holdUntil: NOW });
    return bk;
  }

  it('(d) a full refund on a PAID booking PI -> REFUNDED, slotLock null, referral REVERSED', async () => {
    const bk = paidBookingWithReferral();
    h.refunds = [{ id: 're_1', status: 'succeeded', charge: 'ch_1' }];
    h.charges = { ch_1: { id: 'ch_1', refunded: true, payment_intent: bk.stripePaymentIntentId } };
    const c = await run();
    expect(c.refunded).toBe(1);
    const row = h.store.booking.find((b) => b.id === bk.id)!;
    expect(row.status).toBe('REFUNDED');
    expect(row.slotLock).toBe(null);
    expect(h.store.coachStoreReferral.find((r) => r.sourceId === bk.id)!.status).toBe('REVERSED');
  });

  it('(e) a full refund on a REFUND_DUE booking -> REFUNDED', async () => {
    const bk = seedBooking({ status: 'REFUND_DUE', stripePaymentIntentId: 'pi_rd', slotLock: null, createdAt: NOW });
    h.refunds = [{ id: 're_1', status: 'succeeded', charge: 'ch_1' }];
    h.charges = { ch_1: { id: 'ch_1', refunded: true, payment_intent: 'pi_rd' } };
    const c = await run();
    expect(c.refunded).toBe(1);
    expect(h.store.booking.find((b) => b.id === bk.id)!.status).toBe('REFUNDED');
  });

  it('(f) a full refund on an ACTIVE teen program -> REFUNDED, codeActive false', async () => {
    const pa = seedAccess({ status: 'ACTIVE', beneficiary: 'teen', codeActive: true, stripePaymentIntentId: 'pi_teen' });
    h.refunds = [{ id: 're_1', status: 'succeeded', charge: 'ch_1' }];
    h.charges = { ch_1: { id: 'ch_1', refunded: true, payment_intent: 'pi_teen' } };
    const c = await run();
    expect(c.refunded).toBe(1);
    const row = h.store.programAccess.find((a) => a.id === pa.id)!;
    expect(row.status).toBe('REFUNDED');
    expect(row.codeActive).toBe(false);
  });

  it('(g) a partial refund -> no change', async () => {
    const bk = paidBookingWithReferral();
    h.refunds = [{ id: 're_1', status: 'succeeded', charge: 'ch_1' }];
    h.charges = { ch_1: { id: 'ch_1', refunded: false, payment_intent: bk.stripePaymentIntentId } }; // partial
    const c = await run();
    expect(c.refunded).toBe(0);
    expect(h.store.booking.find((b) => b.id === bk.id)!.status).toBe('PAID');
  });

  it('(h) a dispute needs_response -> DISPUTED/PAUSED; won -> restored; lost -> REFUNDED', async () => {
    const bk = paidBookingWithReferral({ stripePaymentIntentId: 'pi_d' });
    h.disputes = [{ id: 'dp_1', status: 'needs_response', payment_intent: 'pi_d' }];
    let c = await run();
    expect(c.disputed).toBe(1);
    expect(h.store.booking.find((b) => b.id === bk.id)!.status).toBe('DISPUTED');
    h.disputes = [{ id: 'dp_1', status: 'won', payment_intent: 'pi_d' }];
    c = await run();
    expect(c.restored).toBe(1);
    expect(h.store.booking.find((b) => b.id === bk.id)!.status).toBe('PAID');
    h.disputes = [{ id: 'dp_1', status: 'lost', payment_intent: 'pi_d' }];
    c = await run();
    expect(c.refunded).toBe(1);
    expect(h.store.booking.find((b) => b.id === bk.id)!.status).toBe('REFUNDED');
  });

  it('(i) a second run on the same data writes nothing and posts no second sale', async () => {
    const pa = seedAccess({ stripeCheckoutId: paidSession('pa_1', { metadata: { product: 'COACH_STORE', userId: 'buyer-1', rowId: 'pa_1', kind: 'program', beneficiary: 'self' } }) });
    await run();
    const before = JSON.stringify(h.store.programAccess);
    const salesBefore = (h.store.ledgerTransaction ?? []).length;
    const c2 = await run();
    expect((h.store.ledgerTransaction ?? []).length).toBe(salesBefore);
    expect(JSON.stringify(h.store.programAccess)).toBe(before);
  });
});

describe('B9 reconcile pass 4 (subscription sync + renewal refund/dispute mapping)', () => {
  function seedMembership(over: Row = {}) {
    return seedAccess({ billing: 'month', status: 'ACTIVE', stripeSubscriptionId: 'sub_1', codeActive: true, cancelAtPeriodEnd: false, accessUntil: null, ...over });
  }
  const sub = (status: string, over: Row = {}) => ({
    id: 'sub_1', status, cancel_at_period_end: false,
    items: { data: [{ current_period_end: Math.floor(NOW.getTime() / 1000) + 30 * 86_400 }] }, ...over,
  });

  it('(k) an active subscription syncs the row ACTIVE with accessUntil = period end; a canceled one closes it', async () => {
    const pa = seedMembership({ status: 'PAST_DUE' });
    h.subscriptions = [sub('active')];
    let c = await run();
    expect(c.subscriptionsChecked).toBe(1);
    expect(c.renewed).toBe(1);
    let row = h.store.programAccess.find((a) => a.id === pa.id)!;
    expect(row.status).toBe('ACTIVE');
    expect(row.accessUntil).toBeInstanceOf(Date);

    h.subscriptions = [sub('canceled')];
    c = await run();
    expect(c.canceled).toBe(1);
    row = h.store.programAccess.find((a) => a.id === pa.id)!;
    expect(row.status).toBe('CANCELED');
    expect(row.codeActive).toBe(false);
  });

  it('(l) a past_due subscription moves an ACTIVE row to PAST_DUE (still open), codeActive stays true', async () => {
    const pa = seedMembership({ status: 'ACTIVE' });
    h.subscriptions = [sub('past_due')];
    const c = await run();
    expect(c.paused).toBe(1);
    const row = h.store.programAccess.find((a) => a.id === pa.id)!;
    expect(row.status).toBe('PAST_DUE');
    expect(row.codeActive).toBe(true);
  });

  it('(m) a renewal refund resolves through the invoice -> subscription, not the row PI', async () => {
    const pa = seedMembership({ status: 'ACTIVE', stripePaymentIntentId: 'pi_first_month' });
    // The refund is on a DIFFERENT PI (the renewal invoice's), so a direct row lookup misses it.
    h.refunds = [{ id: 're_1', status: 'succeeded', charge: 'ch_ren' }];
    h.charges = { ch_ren: { id: 'ch_ren', refunded: true, payment_intent: 'pi_renewal' } };
    h.invoices = [{ id: 'in_1', parent: { subscription_details: { subscription: 'sub_1' } }, payments: { data: [{ payment: { type: 'payment_intent', payment_intent: 'pi_renewal' } }] } }];
    const c = await run();
    expect(c.refunded).toBe(1);
    const row = h.store.programAccess.find((a) => a.id === pa.id)!;
    expect(row.status).toBe('REFUNDED');
    expect(row.codeActive).toBe(false);
  });

  it('(n) a renewal dispute resolves through the invoice -> subscription and pauses the row', async () => {
    const pa = seedMembership({ status: 'ACTIVE', stripePaymentIntentId: 'pi_first_month' });
    h.disputes = [{ id: 'dp_1', status: 'needs_response', payment_intent: 'pi_renewal' }];
    h.invoices = [{ id: 'in_1', subscription: 'sub_1', payments: { data: [{ payment: { payment_intent: 'pi_renewal' } }] } }];
    const c = await run();
    expect(c.disputed).toBe(1);
    const row = h.store.programAccess.find((a) => a.id === pa.id)!;
    expect(row.status).toBe('PAUSED');
    expect(row.codeActive).toBe(false);
  });

  it('(o) a subscription Stripe does not return is left alone, and an unknown subscription id is skipped', async () => {
    const pa = seedMembership({ status: 'ACTIVE', stripeSubscriptionId: 'sub_gone' });
    h.subscriptions = [sub('active', { id: 'sub_other' })]; // a subscription with no FEL row
    const c = await run();
    expect(c.subscriptionsChecked).toBe(1);
    expect(h.store.programAccess.find((a) => a.id === pa.id)!.status).toBe('ACTIVE');
  });
});

describe('B8 reconcile route auth ladder', () => {
  function req(headers: Record<string, string> = {}): any {
    return { headers: { get: (k: string) => headers[k.toLowerCase()] ?? null }, json: async () => ({}) };
  }

  it('signed-in coach runs (200)', async () => {
    const res = await reconcileRoute(req());
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it('env secret set + no header -> 401; wrong header -> 401; correct -> 200', async () => {
    process.env.COACH_STORE_RECONCILE_SECRET = 'reconcile-secret-1';
    h.sessionUser = null;
    expect((await reconcileRoute(req())).status).toBe(401);
    expect((await reconcileRoute(req({ 'x-coach-store-reconcile-secret': 'wrong' }))).status).toBe(401);
    const ok = await reconcileRoute(req({ 'x-coach-store-reconcile-secret': 'reconcile-secret-1' }));
    expect(ok.status).toBe(200);
  });

  it('env unset + non-coach session -> 404', async () => {
    delete process.env.COACH_STORE_RECONCILE_SECRET;
    h.sessionUser = 'someone-else';
    process.env.COACH_STORE_COACH_USER_IDS = USER; // coach is coach-1, not someone-else
    expect((await reconcileRoute(req())).status).toBe(404);
  });

  it('signed-in non-coach with no header -> 404 (even when the secret IS set)', async () => {
    process.env.COACH_STORE_RECONCILE_SECRET = 'reconcile-secret-1';
    h.sessionUser = 'someone-else';
    expect((await reconcileRoute(req())).status).toBe(404);
  });

  it('no Stripe key after auth -> 200 skipped, zero counts, no Stripe call', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const res = await reconcileRoute(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.skipped).toBe('payments_not_set_up');
    expect(json.checked).toBe(0);
  });

  it('verifyReconcileSecret is constant-time and refuses blank/missing', () => {
    expect(verifyReconcileSecret(null, 's')).toBe(false);
    expect(verifyReconcileSecret('', 's')).toBe(false);
    expect(verifyReconcileSecret('x', undefined)).toBe(false);
    expect(verifyReconcileSecret('s', 's')).toBe(true);
    expect(verifyReconcileSecret('s', 'other')).toBe(false);
  });
});
