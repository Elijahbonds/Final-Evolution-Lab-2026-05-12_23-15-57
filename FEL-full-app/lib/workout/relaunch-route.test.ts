// MIRROR-COACH P8 (2026-09-29): THE /workout RELAUNCH, run for real — POST and GET /api/v1/workout/plan with the real
// spend(), the real wallet read and the real dead-buy sweep, over an in-memory database. Only the session and the
// database are stand-ins: the lane's database is offline on purpose, and the :3131 dev server was down when this ran.
//
// The database behaves like Postgres where it matters here: the ledger's idempotency key and the plan's id are unique
// (a second insert throws a real Prisma P2002), and a transaction that throws takes back exactly what it wrote (an undo
// per write, so two purchases interleaving at their awaits undo only their own). The protocol gate's tables (user,
// consent, intake, pain, stored Quick Screens) are the Today store's (lib/coach/todayMemoryDb.ts), the ones the gate's
// own route tests use.
//
// What this proves, against owner rule (c) and decisions #3, #23, #24:
//   · REFUSED → ALLOWED at the OLD PRICE: P1 answered every POST 403; now 60 and 200 shards buy the two products;
//   · the plan COMES FROM A TEMPLATE BEHIND THE GATE: a FEL template matched to the answers (never the old generator),
//     no depth drop in any week for anyone, nothing that lands for youth or a blank birth year, and each adult jump
//     read through the protocol gate for the reader, today;
//   · ONE CHARGE, ONE PLAN: a retry of the same key (or two racing) is one ledger row and one plan;
//   · PAST BUYERS get every template free (one plan per product and template), idempotently, and are never charged —
//     a past charge the sweep paid back included (MIRROR-COACH P8 FIX: rule (c), "a past purchase ledger row grants");
//   · DEAD-BUYS CONSISTENCY: the wallet's own sweep never pays a relaunch charge back, while it still pays back a past
//     charge no plan claims, exactly as before; a relaunch charge with no plan is finished on the next press instead;
//   · MIRROR-COACH P8 FIX (2026-09-30): no birth year, nothing sold or claimed (409 age_needed); a youth reader buys the
//     4-week plan only; the server sells only the template the page previewed; the offer says why it is blocked.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@/public/_prisma/client';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const h = vi.hoisted(() => ({ session: { user: { id: 'u1' } } as unknown, client: null as unknown }));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ get prisma() { return h.client; } }));

import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/v1/workout/plan/route';
import { newTodayStore, todayMemoryDb, type TodayStore } from '@/lib/coach/todayMemoryDb';
import { INTAKE_IDS, INTAKE_VERSION } from '@/lib/health/intake';
import { bandOf } from '@/lib/assess/thresholds';
import { ASSESSMENT_KIND } from '@/lib/assess/prqWrite';
import { PROTOCOL_WHY, swappedLine } from '@/lib/coach/protocolGate';
import { readWallet } from '@/lib/wallet/wallet-service';
import { REASON } from '@/lib/wallet/reward-rules';
import { legacyWeeks, isDepthDrop } from './plan-generator';
import { isPlyometric } from './plan-revision';
import { isGatedTemplateItem, isTemplatePlan, type TemplatePlanWeek } from './relaunch';
import { freePlanId, paidPlanId, workoutChargeKey } from './pastBuyer';
import { WORKOUT_AGE_HREF } from './plan-sale';

// ── the in-memory database ───────────────────────────────────────────────────────────────────────────────────────────

interface Wallet { id: string; playerId: string; coins: bigint; shards: bigint; lc: bigint; version: bigint; updatedAt: Date }
interface Entry { id: string; walletId: string; currency: string; delta: bigint; balanceAfter: bigint; reasonCode: string; source: string; idempotencyKey: string; metadata: Row | null; createdAt: Date }
interface Plan { id: string; userId: string; tier: string; focus: string; weeks: unknown; createdAt: Date; scanId: string | null }
interface Store {
  today: TodayStore;
  wallets: Wallet[]; entries: Entry[]; plans: Plan[]; entitlements: { playerId: string; skuId: string; quantity: number }[];
  seq: number;
  /** Every delegate call, "table.method". */
  reads: string[];
  /** Tables whose every call throws (a test's failing read). */
  broken: Set<string>;
  /** The next WorkoutPlan insert fails (a connection dropped between the charge and the plan). */
  failNextPlanCreate?: boolean;
}

const unique = (t: string) => new Prisma.PrismaClientKnownRequestError(`Unique constraint failed on the fields: (\`${t}\`)`, { code: 'P2002', clientVersion: 'test' });
const copy = <T,>(v: T): T => structuredClone(v);
const pick = (row: Row, select?: Row): Row => (select ? Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, copy(row[k])])) : copy(row));

function memoryDb(s: Store) {
  const today = todayMemoryDb(s.today) as Row;
  const make = (undo: Array<() => void> | null) => {
    const onUndo = (f: () => void) => { if (undo) undo.push(f); };
    const wallets = {
      findUnique: async (a: Row) => { const w = s.wallets.find((x) => (a.where.id ? x.id === a.where.id : x.playerId === a.where.playerId)); return w ? pick(w, a.select) : null; },
      create: async (a: Row) => {
        if (s.wallets.some((w) => w.playerId === a.data.playerId)) throw unique('playerId');
        const w: Wallet = { id: `w_${++s.seq}`, playerId: a.data.playerId, coins: 0n, shards: 0n, lc: 0n, version: 0n, updatedAt: new Date() };
        s.wallets.push(w); onUndo(() => { s.wallets = s.wallets.filter((x) => x !== w); });
        return copy(w);
      },
      updateMany: async (a: Row) => {
        const w = s.wallets.find((x) => x.id === a.where.id);
        if (!w) return { count: 0 };
        for (const f of ['coins', 'shards', 'lc'] as const) if (a.where[f]?.gte !== undefined && !(w[f] >= a.where[f].gte)) return { count: 0 };
        apply(w, a.data);
        return { count: 1 };
      },
      update: async (a: Row) => { const w = s.wallets.find((x) => x.id === a.where.id)!; apply(w, a.data); return copy(w); },
    };
    function apply(w: Wallet, data: Row) {
      const cells = w as unknown as Record<string, bigint>;
      for (const [f, op] of Object.entries(data) as [string, Row][]) {
        const by: bigint = (op.increment ?? 0n) - (op.decrement ?? 0n);
        cells[f] += by;
        onUndo(() => { cells[f] -= by; });
      }
    }
    const ledger = {
      findUnique: async (a: Row) => { const e = s.entries.find((x) => x.idempotencyKey === a.where.idempotencyKey); return e ? pick(e, a.select) : null; },
      findMany: async (a: Row) => s.entries
        .filter((e) => e.walletId === a.where.walletId && (!a.where.reasonCode?.in || a.where.reasonCode.in.includes(e.reasonCode)))
        .map((e) => pick(e, a.select)),
      create: async (a: Row) => {
        if (s.entries.some((e) => e.idempotencyKey === a.data.idempotencyKey)) throw unique('idempotencyKey');
        const e: Entry = { id: `le_${++s.seq}`, createdAt: new Date(), metadata: null, ...a.data };
        s.entries.push(e); onUndo(() => { s.entries = s.entries.filter((x) => x !== e); });
        return copy(e);
      },
    };
    const entitlements = {
      upsert: async (a: Row) => {
        const { playerId, skuId } = a.where.playerId_skuId;
        const e = s.entitlements.find((x) => x.playerId === playerId && x.skuId === skuId);
        if (e) { const was = e.quantity; e.quantity += a.update.quantity?.increment ?? 0; onUndo(() => { e.quantity = was; }); return copy(e); }
        const n = { playerId, skuId, quantity: a.create.quantity };
        s.entitlements.push(n); onUndo(() => { s.entitlements = s.entitlements.filter((x) => x !== n); });
        return copy(n);
      },
    };
    const plans = {
      findMany: async (a: Row) => s.plans
        .filter((p) => p.userId === a.where.userId)
        .sort((x, y) => (a.orderBy?.createdAt === 'desc' ? y.createdAt.getTime() - x.createdAt.getTime() : 0))
        .map((p) => pick(p, a.select)),
      findUnique: async (a: Row) => { const p = s.plans.find((x) => x.id === a.where.id); return p ? pick(p, a.select) : null; },
      create: async (a: Row) => {
        if (s.failNextPlanCreate) { s.failNextPlanCreate = false; throw new Error('connection reset'); }
        if (s.plans.some((p) => p.id === a.data.id)) throw unique('id');
        const p: Plan = { id: a.data.id ?? `ck${++s.seq}`, createdAt: new Date(), scanId: null, ...copy(a.data) };
        s.plans.push(p);
        return copy(p);
      },
      updateMany: async (a: Row) => {
        let count = 0;
        for (const p of s.plans) if (p.id === a.where.id && p.userId === a.where.userId) { p.weeks = copy(a.data.weeks); count++; }
        return { count };
      },
      deleteMany: async (a: Row) => { const before = s.plans.length; s.plans = s.plans.filter((p) => p.userId !== a.where.userId); return { count: before - s.plans.length }; },
    };
    return {
      wallet: wallets, walletLedgerEntry: ledger, playerEntitlement: entitlements, workoutPlan: plans,
      sessionBooking: { findMany: async () => [], findFirst: async () => null },
      user: today.user, healthConsent: today.healthConsent, healthIntake: today.healthIntake, painCheckIn: today.painCheckIn, workoutScan: today.workoutScan,
    } as Row;
  };
  const traced = (d: Row): Row => new Proxy(d, {
    get: (t, table) => {
      const del = t[table as string];
      if (!del || typeof del !== 'object') return del;
      return new Proxy(del, {
        get: (dd, m) => (typeof dd[m] !== 'function' ? dd[m] : (...args: unknown[]) => {
          s.reads.push(`${String(table)}.${String(m)}`);
          if (s.broken.has(String(table))) return Promise.reject(new Error(`${String(table)} is offline`));
          return dd[m](...args);
        }),
      });
    },
  });
  const client = traced(make(null));
  client.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => {
    const undo: Array<() => void> = [];
    try { return await fn(traced(make(undo))); } catch (e) { for (const f of undo.reverse()) f(); throw e; }
  };
  return client;
}

// ── the fixtures ─────────────────────────────────────────────────────────────────────────────────────────────────────

const UUID = (n: number) => `3f2b8c1e-9d4a-4e7b-8c2d-${String(n).padStart(12, '0')}`;
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
let S: Store;

function fresh(dobYear: number | null = 1990, shards = 500) {
  const today = newTodayStore();
  today.user.push({ id: 'u1', name: 'Sam', email: 'sam@x.test', dobYear });
  S = { today, wallets: [], entries: [], plans: [], entitlements: [], seq: 0, reads: [], broken: new Set() };
  S.wallets.push({ id: 'w1', playerId: 'u1', coins: 0n, shards: BigInt(shards), lc: 0n, version: 0n, updatedAt: new Date() });
  h.client = memoryDb(S);
  h.session = { user: { id: 'u1' } };
}
const cleanAnswers = () => ({
  [INTAKE_IDS.currentPain]: false, [INTAKE_IDS.recentInjuryOrSurgery]: false, [INTAKE_IDS.dizzinessFaintingChestPain]: false,
  [INTAKE_IDS.heartOrBpCondition]: false, [INTAKE_IDS.pregnancyOrPostpartum]: false, [INTAKE_IDS.heartRateOrBalanceMedicine]: false,
  [INTAKE_IDS.clinicianToldToAvoid]: false,
});
const FLEX = bandOf('t5.landingFlex'), VALGUS = bandOf('t5.landingValgus');
/** Every check passing for an adult: live consent, a clean current intake, a passed landing check 3 days old. */
function allClear() {
  S.today.healthConsent!.push({ userId: 'u1', scope: 'health_data', coachId: null, grantedAt: ago(30), revokedAt: null });
  S.today.healthIntake.push({ id: 'hi-1', userId: 'u1', version: INTAKE_VERSION, createdAt: ago(10), answers: cleanAnswers(), redFlags: [], clearedAt: null });
  S.today.workoutScan!.push({
    id: 'ws-1', userId: 'u1', kind: ASSESSMENT_KIND, createdAt: ago(3),
    metrics: { assessmentId: 'a1', tests: [{ id: 'T5', status: 'scored', confidence: 0.9, sides: { both: { repsValid: 3, repsTotal: 3, complete: true, metrics: { landingFlex: FLEX.good, landingValgusLeft: VALGUS.good, landingValgusRight: VALGUS.good }, faults: [] } } }] },
  });
}
/** A plan bought before P1 pulled the sale: the old route's charge (the browser's key), then the plan it wrote. */
function pastPurchase(opts: { plan?: boolean; tier?: 'plan_4w' | 'program_12w' } = {}) {
  const tier = opts.tier ?? 'plan_4w';
  const at = new Date('2026-09-10T12:00:00Z');
  const price = tier === 'plan_4w' ? 60 : 200;
  const sku = tier === 'plan_4w' ? 'workout_plan_4w' : 'workout_program_12w';
  S.entries.push({ id: `past_${++S.seq}`, walletId: 'w1', currency: 'shards', delta: BigInt(-price), balanceAfter: 0n, reasonCode: REASON.SPEND_CATALOG_ITEM, source: 'spend', idempotencyKey: UUID(900 + S.seq), metadata: { skuId: sku, quantity: 1, unitPrice: price }, createdAt: at });
  if (opts.plan !== false) S.plans.push({ id: `cklegacy${S.seq}`, userId: 'u1', tier, focus: 'Mobility & Range', weeks: legacyWeeks('mobility', tier), createdAt: new Date(at.getTime() + 80), scanId: null });
}

const post = async (body: unknown) => {
  const res = await POST(new NextRequest('http://fel.test/api/v1/workout/plan', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body),
  }));
  return { status: res.status, json: await res.json() as Row };
};
const get = async () => { const res = await GET(); return { status: res.status, json: await res.json() as Row }; };
const buy = (tier: string, key: string, answers: Row = { daysPerWeek: 3, equipment: 'bodyweight' }, extra: Row = {}) => post({ tier, answers, idempotency_key: key, ...extra });
const shards = () => Number(S.wallets.find((w) => w.playerId === 'u1')!.shards);
const charges = () => S.entries.filter((e) => e.reasonCode === REASON.SPEND_CATALOG_ITEM && !e.id.startsWith('past_'));
const storedItems = (weeks: unknown) => (weeks as TemplatePlanWeek[]).flatMap((w) => w.sessions.flatMap((s) => s.items));
const viewItems = (plan: Row) => (plan.weeks as Row[]).flatMap((w) => (w.sessions as Row[]).flatMap((s) => s.items as Row[]));

beforeEach(() => fresh());

// ── the sale ─────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('POST: refused under P1, now sold at the old price (owner decision #24)', () => {
  it('signed out: 401 on both, nothing read', async () => {
    h.session = null;
    expect((await buy('plan_4w', UUID(1))).status).toBe(401);
    expect((await get()).status).toBe(401);
    expect(S.reads).toEqual([]);
  });

  it('a request that is not what the page sends is refused before anything is read or written', async () => {
    for (const [body, error] of [
      ['not json', 'invalid_json'],
      [{ tier: 'plan_8w', answers: { daysPerWeek: 3, equipment: 'gym' }, idempotency_key: UUID(1) }, 'unknown_tier'],
      [{ tier: 'plan_4w', answers: { daysPerWeek: 7, equipment: 'gym' }, idempotency_key: UUID(1) }, 'bad_answers'],
      [{ tier: 'plan_4w', answers: { daysPerWeek: 3, equipment: 'gym' } }, 'missing_idempotency_key'],
      [{ tier: 'plan_4w', answers: { daysPerWeek: 3, equipment: 'gym' }, idempotency_key: 'workout:u2:steal' }, 'missing_idempotency_key'],
    ] as const) {
      const r = await post(body);
      expect(r.status, JSON.stringify(body)).toBe(400);
      expect(r.json.error).toBe(error);
    }
    expect(S.reads).toEqual([]);
    expect(shards()).toBe(500);
  });

  it('THE 4-WEEK PLAN, 60 SHARDS: one charge under the server\'s key, one plan under an id fixed by that charge', async () => {
    const r = await buy('plan_4w', UUID(1));
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ free: false, charged: { currency: 'shards', amount: 60 }, replayed: false });
    expect(shards()).toBe(440);
    expect(charges()).toHaveLength(1);
    const [c] = charges();
    expect(c).toMatchObject({ idempotencyKey: workoutChargeKey('u1', UUID(1)), delta: -60n, metadata: { skuId: 'workout_plan_4w', quantity: 1, unitPrice: 60 } });
    expect(S.plans).toHaveLength(1);
    expect(S.plans[0]).toMatchObject({ id: paidPlanId(c.id), userId: 'u1', tier: 'plan_4w', focus: '3 days a week · bodyweight' });
    expect(r.json.planId).toBe(paidPlanId(c.id));
  });

  it('THE 12-WEEK PLAN, 200 SHARDS: three waves of the template the answers pick', async () => {
    const r = await buy('program_12w', UUID(2), { daysPerWeek: 4, equipment: 'gym' });
    expect(r.status).toBe(200);
    expect(r.json.charged).toEqual({ currency: 'shards', amount: 200 });
    expect(shards()).toBe(300);
    const weeks = S.plans[0].weeks as TemplatePlanWeek[];
    expect(weeks).toHaveLength(12);
    expect(weeks.every((w) => w.template === 'adult-gym-4')).toBe(true);
    expect(weeks.filter((w) => w.easier).map((w) => w.week)).toEqual([4, 8, 12]);
  });

  it('not enough shards: 409 with the price, nothing charged and no plan (the transaction took back what it wrote)', async () => {
    fresh(1990, 10);
    const r = await buy('plan_4w', UUID(3));
    expect(r.status).toBe(409);
    expect(r.json).toMatchObject({ error: 'insufficient_funds', price: 60, shards: 10, needShards: true });
    expect(shards()).toBe(10);
    expect(charges()).toEqual([]);
    expect(S.plans).toEqual([]);
    expect(S.entitlements).toEqual([]);
  });

  it('NO BIRTH YEAR ON FILE: 409 age_needed with the link — no charge, no plan, no free claim (blocker: a youth plan kept for good)', async () => {
    fresh(null);
    for (const extra of [{}, { free: true }]) {
      const r = await buy('plan_4w', UUID(6), { daysPerWeek: 3, equipment: 'bodyweight' }, extra);
      expect(r.status).toBe(409);
      expect(r.json).toEqual({ error: 'age_needed', href: WORKOUT_AGE_HREF });
    }
    expect(charges()).toEqual([]);
    expect(S.plans).toEqual([]);
    expect(shards()).toBe(500);
    // the offer says so: nothing to buy, and where to answer
    expect((await get()).json.offer).toMatchObject({ purchasable: false, blockedBy: 'age_needed', ageHref: WORKOUT_AGE_HREF, ageKnown: false });
  });

  it("…and a past buyer's free plans wait for the answer too, then the ADULT template is theirs, free", async () => {
    fresh(null, 0);
    pastPurchase();
    expect((await buy('plan_4w', UUID(7), undefined, { free: true })).json.error).toBe('age_needed');
    S.today.user[0].dobYear = 1990;                                            // the health intake wrote the birth year
    const r = await buy('plan_4w', UUID(8), undefined, { free: true });
    expect(r.json).toMatchObject({ free: true, charged: null, planId: freePlanId('u1', 'plan_4w', 'adult-bw-3') });
    expect((S.plans.find((p) => p.id === r.json.planId)!.weeks as TemplatePlanWeek[])[0].template).toBe('adult-bw-3');
  });

  it('A YOUTH READER BUYS THE 4-WEEK PLAN ONLY: the 12-week one would be its 4 weeks three times (409, nothing charged)', async () => {
    fresh(new Date().getFullYear() - 15);
    const r = await buy('program_12w', UUID(9), { daysPerWeek: 3, equipment: 'bodyweight' });
    expect(r.status).toBe(409);
    expect(r.json.error).toBe('youth_4w_only');
    expect(charges()).toEqual([]);
    const offer = (await get()).json.offer;
    expect(offer.products.map((p: Row) => [p.tier, p.onSale])).toEqual([['plan_4w', true], ['program_12w', false]]);
    expect((await buy('plan_4w', UUID(10), { daysPerWeek: 3, equipment: 'bodyweight' })).json.charged).toEqual({ currency: 'shards', amount: 60 });
  });

  it('the days must be ones the page offers the reader (an adult\'s "2 days" is not a template they were shown)', async () => {
    expect((await buy('plan_4w', UUID(11), { daysPerWeek: 2, equipment: 'bodyweight' })).json.error).toBe('bad_answers');
    fresh(new Date().getFullYear() - 15);
    expect((await buy('plan_4w', UUID(12), { daysPerWeek: 4, equipment: 'bodyweight' })).json.error).toBe('bad_answers');
    expect(charges()).toEqual([]);
  });

  it('THE TEMPLATE THE PAGE SHOWED is the one sold: another one (the account changed since the page loaded) is 409, nothing charged', async () => {
    const r = await buy('plan_4w', UUID(13), { daysPerWeek: 3, equipment: 'bodyweight' }, { template: 'youth-bw-2' });
    expect(r.status).toBe(409);
    expect(r.json).toEqual({ error: 'template_changed', template: 'adult-bw-3' });
    expect(charges()).toEqual([]);
    expect((await buy('plan_4w', UUID(14), { daysPerWeek: 3, equipment: 'bodyweight' }, { template: 'adult-bw-3' })).status).toBe(200);
  });

  it('a failed birth-year read refuses the purchase (503): a youth template bought on an unknown age is the wrong product', async () => {
    S.broken.add('user');
    const r = await buy('plan_4w', UUID(4));
    expect(r.status).toBe(503);
    expect(charges()).toEqual([]);
    expect(S.plans).toEqual([]);
  });

  it('a failed read of past purchases refuses too (503): a past buyer must never be charged for what is free for them', async () => {
    S.broken.add('walletLedgerEntry');
    const r = await buy('plan_4w', UUID(5));
    expect(r.status).toBe(503);
    expect(shards()).toBe(500);
    expect(S.plans).toEqual([]);
  });
});

describe('ONE CHARGE, ONE PLAN', () => {
  it('the same key again: the same plan back, no second charge, no second plan', async () => {
    const a = await buy('plan_4w', UUID(10));
    const b = await buy('plan_4w', UUID(10));
    expect(b.status).toBe(200);
    expect(b.json).toMatchObject({ planId: a.json.planId, replayed: true });
    expect(charges()).toHaveLength(1);
    expect(S.plans).toHaveLength(1);
    expect(shards()).toBe(440);
  });

  it('two requests with one key racing: one charge, one plan, both answered with it', async () => {
    const [a, b] = await Promise.all([buy('plan_4w', UUID(11)), buy('plan_4w', UUID(11))]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.json.planId).toBe(b.json.planId);
    expect(charges()).toHaveLength(1);
    expect(S.plans).toHaveLength(1);
    expect(shards()).toBe(440);
  });

  it('the charge went through and the plan write failed: 500 with the retry line; the SAME key then finishes it, uncharged', async () => {
    S.failNextPlanCreate = true;
    const a = await buy('plan_4w', UUID(12));
    expect(a.status).toBe(500);
    expect(a.json.error).toBe('plan_not_saved');
    expect(shards()).toBe(440);
    expect(S.plans).toEqual([]);
    const b = await buy('plan_4w', UUID(12));
    expect(b.status).toBe(200);
    expect(charges()).toHaveLength(1);
    expect(shards()).toBe(440);
    expect(S.plans.map((p) => p.id)).toEqual([paidPlanId(charges()[0].id)]);
  });

  it('THE PLAN WRITE FAILED AND THE PAGE WAS RELOADED (the key lost): the next press, with a NEW key, finishes it — never a second charge', async () => {
    S.failNextPlanCreate = true;
    const a = await buy('plan_4w', UUID(15));
    expect(a.json.error).toBe('plan_not_saved');
    expect(shards()).toBe(440);
    // the reloaded page: the offer says a paid plan is waiting
    const offer = (await get()).json.offer;
    expect(offer.products.map((p: Row) => [p.tier, p.unfinished])).toEqual([['plan_4w', true], ['program_12w', false]]);
    const b = await buy('plan_4w', UUID(16));                                  // a new browser key
    expect(b.status).toBe(200);
    expect(b.json).toMatchObject({ free: false, charged: null, recovered: true });
    expect(charges()).toHaveLength(1);
    expect(shards()).toBe(440);
    expect(S.plans.map((p) => p.id)).toEqual([paidPlanId(charges()[0].id)]);
    expect((await get()).json.offer.products[0].unfinished).toBe(false);
    // and the press after that is a new purchase, as it should be
    expect((await buy('plan_4w', UUID(17))).json.charged).toEqual({ currency: 'shards', amount: 60 });
  });

  it("an unfinished 12-week charge is not finished by a 4-week press (each product finishes its own)", async () => {
    S.failNextPlanCreate = true;
    await buy('program_12w', UUID(18));
    const r = await buy('plan_4w', UUID(19));
    expect(r.json).toMatchObject({ charged: { amount: 60 } });
    expect(charges()).toHaveLength(2);
  });

  it('two different keys are two purchases (a second plan is a second buy)', async () => {
    await buy('plan_4w', UUID(13));
    await buy('plan_4w', UUID(14));
    expect(charges()).toHaveLength(2);
    expect(S.plans).toHaveLength(2);
    expect(shards()).toBe(380);
  });
});

// ── the plan: a template behind the gate ─────────────────────────────────────────────────────────────────────────────

describe('the plan comes from a template, behind the protocol gate', () => {
  it('NO DEPTH DROP in any week of anything sold, for any answer, adult or youth; the old generator is never used', async () => {
    let n = 0;
    // MIRROR-COACH P8 FIX: every answer each audience is offered, every product it may buy (a blank birth year buys nothing)
    const youthYear = new Date().getFullYear() - 14;
    for (const [dob, choices, tiers] of [
      [1990, [[3, 'bodyweight'], [4, 'gym'], [3, 'gym'], [4, 'bodyweight']], ['plan_4w', 'program_12w']],
      [youthYear, [[3, 'bodyweight'], [2, 'bodyweight']], ['plan_4w']],
    ] as const) {
      for (const tier of tiers) {
        for (const [d, eq] of choices) {
          fresh(dob, 1000);
          const r = await buy(tier, UUID(100 + ++n), { daysPerWeek: d, equipment: eq });
          expect(r.status, `${dob} ${tier} ${d} ${eq}`).toBe(200);
          const weeks = S.plans[0].weeks as TemplatePlanWeek[];
          expect(isTemplatePlan(weeks)).toBe(true);
          expect(storedItems(weeks).filter((i) => isDepthDrop(i))).toEqual([]);
          expect(viewItems(r.json.plan).filter((i) => isDepthDrop(i))).toEqual([]);
          expect(JSON.stringify(weeks)).not.toMatch(/Depth Drop/i);
        }
      }
    }
  });

  // MIRROR-COACH P8 FIX (2026-09-30): this ran for a blank birth year too, and treated the youth plan it bought as correct —
  // the blocker (a blank birth year now buys nothing: 'NO BIRTH YEAR ON FILE' above). A youth reader buys the 4-week plan.
  for (const [label, dob] of [['a 14-year-old', new Date().getFullYear() - 14]] as const) {
    it(`${label}: a youth template whatever the answers (gym, 3 days) — nothing that lands in any week, no gate read`, async () => {
      fresh(dob);
      const r = await buy('plan_4w', UUID(20), { daysPerWeek: 3, equipment: 'gym' });
      expect(r.status).toBe(200);
      const weeks = S.plans[0].weeks as TemplatePlanWeek[];
      expect(weeks[0].template).toBe('youth-bw-3');
      for (const it of storedItems(weeks)) {
        expect(isGatedTemplateItem(it), it.name).toBe(false);
        expect(isPlyometric(it), it.name).toBe(false);
      }
      expect(r.json.plan.gate).toEqual({ gatedItems: 0, swapped: 0, held: 0 });
      expect(r.json.plan.template.dailyTargetLine).toMatch(/60 minutes/);
      // nothing to gate, so the gate's health tables were never read
      expect(S.reads.filter((x) => /^(healthConsent|healthIntake|painCheckIn|workoutScan)\./.test(x))).toEqual([]);
      const g = await get();
      expect(g.json.offer).toMatchObject({ audience: 'youth', ageKnown: true, purchasable: true, blockedBy: null });
    });
  }

  it('AN ADULT WITH NOTHING ON FILE: each day\'s jump reaches them as its easier step, with the gate\'s one line — stored as written', async () => {
    const r = await buy('plan_4w', UUID(30));
    const stored = storedItems(S.plans[0].weeks);
    expect(stored.filter((i) => i.gated).map((i) => i.exercise).slice(0, 3)).toEqual(['cmj-stick', 'lateral-bound-stick', 'broad-jump-stick']);
    const first = r.json.plan.weeks[0].sessions[0].items[0];
    expect(first).toMatchObject({ exercise: 'fast-bw-squat', gate: { from: { id: 'cmj-stick', name: 'Countermovement Jump and Stick' }, reason: 'no_health_consent', line: swappedLine('Countermovement Jump and Stick', PROTOCOL_WHY.no_health_consent) } });
    expect(r.json.plan.gate).toEqual({ gatedItems: 12, swapped: 12, held: 0 });
    expect(viewItems(r.json.plan).filter((i) => isGatedTemplateItem(i))).toEqual([]);
  });

  it('EVERY CHECK PASSING: the jump shows as written; a pain check-in easing training today swaps it again, on the next read', async () => {
    allClear();
    await buy('plan_4w', UUID(31));
    let first = (await get()).json.plans[0].weeks[0].sessions[0].items[0];
    expect(first).toMatchObject({ exercise: 'cmj-stick', name: 'Countermovement Jump and Stick' });
    expect(first.gate).toBeUndefined();
    S.today.painCheckIn!.push({ userId: 'u1', exerciseName: 'Backpack Hug Squat', bodyArea: 'knee', decision: 'step_down_flag_coach', createdAt: ago(0.1) });
    first = (await get()).json.plans[0].weeks[0].sessions[0].items[0];
    expect(first).toMatchObject({ exercise: 'fast-bw-squat', gate: { reason: 'pain_today', line: swappedLine('Countermovement Jump and Stick', PROTOCOL_WHY.pain_today) } });
  });

  it('a landing check over 4 weeks old closes it; the gate\'s facts failing to read closes it too (never opens it)', async () => {
    allClear();
    S.today.workoutScan![0].createdAt = ago(29);
    await buy('plan_4w', UUID(32));
    expect((await get()).json.plans[0].weeks[0].sessions[0].items[0].gate.reason).toBe('landing_old');
    S.today.workoutScan![0].createdAt = ago(3);
    S.broken.add('healthConsent');
    expect((await get()).json.plans[0].weeks[0].sessions[0].items[0]).toMatchObject({ exercise: 'fast-bw-squat', gate: { reason: 'unread' } });
  });
});

// ── past buyers ──────────────────────────────────────────────────────────────────────────────────────────────────────

describe('PAST BUYERS: every template free, one plan per product and template, idempotent (owner decisions #23, #24; rule (c))', () => {
  it('a past buyer sees both products free, and a claim writes the plan with no charge', async () => {
    fresh(1990, 0);
    pastPurchase();
    const g = await get();
    expect(g.json.offer).toMatchObject({ pastBuyer: true, purchasable: true, blockedBy: null });
    expect(g.json.offer.products.map((p: Row) => [p.tier, p.price, p.free])).toEqual([['plan_4w', 60, true], ['program_12w', 200, true]]);
    const r = await buy('plan_4w', UUID(40), { daysPerWeek: 3, equipment: 'bodyweight' }, { free: true });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ free: true, charged: null, replayed: false, planId: freePlanId('u1', 'plan_4w', 'adult-bw-3') });
    expect(charges()).toEqual([]);
    expect(shards()).toBe(0);
    expect(S.plans.map((p) => p.id).sort()).toEqual([freePlanId('u1', 'plan_4w', 'adult-bw-3'), 'cklegacy1'].sort());
  });

  it('the same claim again — a retry, a double click, a second tab racing — is the same plan, never a charge', async () => {
    fresh(1990, 500);
    pastPurchase();
    const [a, b] = await Promise.all([
      buy('plan_4w', UUID(41), { daysPerWeek: 3, equipment: 'bodyweight' }, { free: true }),
      buy('plan_4w', UUID(42), { daysPerWeek: 3, equipment: 'bodyweight' }, { free: true }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.json.planId).toBe(b.json.planId);
    const c = await buy('plan_4w', UUID(43), { daysPerWeek: 3, equipment: 'bodyweight' });
    expect(c.json).toMatchObject({ planId: freePlanId('u1', 'plan_4w', 'adult-bw-3'), replayed: true, free: true });
    expect(charges()).toEqual([]);
    expect(shards()).toBe(500);
    expect(S.plans.filter((p) => p.id.startsWith('wp_'))).toHaveLength(1);
  });

  it('OTHER ANSWERS ARE ANOTHER FREE PLAN (#23 "free access to the relaunched templates"): gym, 4 days, the 12-week one — never a charge', async () => {
    fresh(1990, 500);
    pastPurchase();
    await buy('plan_4w', UUID(44), undefined, { free: true });
    const gym = await buy('plan_4w', UUID(45), { daysPerWeek: 4, equipment: 'gym' });
    expect(gym.json).toMatchObject({ free: true, charged: null, planId: freePlanId('u1', 'plan_4w', 'adult-gym-4') });
    const twelve = await buy('program_12w', UUID(46));                        // not asked as free: claimed free anyway
    expect(twelve.json).toMatchObject({ free: true, charged: null, planId: freePlanId('u1', 'program_12w', 'adult-bw-3') });
    expect((await get()).json.offer.products.map((p: Row) => p.free)).toEqual([true, true]);
    expect(charges()).toEqual([]);
    expect(shards()).toBe(500);
    expect(S.plans.filter((p) => p.id.startsWith('wp_free_'))).toHaveLength(3);
  });

  it('asking for the free claim without being a past buyer: 409 not_free, nothing written', async () => {
    const r = await buy('plan_4w', UUID(47), undefined, { free: true });
    expect(r.status).toBe(409);
    expect(r.json.error).toBe('not_free');
    expect(S.plans).toEqual([]);
    expect(charges()).toEqual([]);
  });

  it('A PAST PURCHASE LEDGER ROW GRANTS — even one the sweep pays back (no plan claims it: a /store buy, or a plan erased)', async () => {
    // MIRROR-COACH P8 FIX (2026-09-30): this pinned the opposite ("not a past buyer: shards back, no free plans too"). With
    // 0 WorkoutPlan rows in production that left every real past buyer without the free plans rule (c) and #24 promise.
    fresh(1990, 0);
    pastPurchase({ plan: false });
    expect((await get()).json.offer).toMatchObject({ pastBuyer: true });
    // the sweep's own rule is unchanged: the charge still comes back as shards (the owner's 2026-09-25 call)…
    for (const e of S.entries) e.createdAt = ago(30);
    expect((await readWallet(h.client as never, 'u1')).shards).toBe(60);
    // …and the free plans stay theirs once it has
    expect((await get()).json.offer).toMatchObject({ pastBuyer: true });
    expect((await buy('plan_4w', UUID(49))).json).toMatchObject({ free: true, charged: null });
  });

  it('GET when the past purchases cannot be read: the plans still show, and nothing is offered on that read — saying why', async () => {
    await buy('plan_4w', UUID(48));
    S.broken.add('walletLedgerEntry');
    const g = await get();
    expect(g.json.plans).toHaveLength(1);
    expect(g.json.offer).toMatchObject({ pastBuyer: null, purchasable: false, blockedBy: 'purchases' });
    // and when the birth year cannot be read, the template the page would preview is a guess: nothing offered either,
    // with its own reason (MIRROR-COACH P8 FIX: the page blamed the past purchases for this one)
    S.broken.delete('walletLedgerEntry');
    S.broken.add('user');
    const u = await get();
    expect(u.json.plans).toHaveLength(1);
    expect(u.json.offer).toMatchObject({ purchasable: false, ageKnown: false, blockedBy: 'age_unread' });
  });
});

// ── the old plans, and the wallet's sweep ────────────────────────────────────────────────────────────────────────────

describe('old plans are read as before; the dead-buy sweep agrees with the relaunch', () => {
  it('GET lists old and new plans newest first: the old one revised with its note, the new one gated', async () => {
    pastPurchase();
    await buy('plan_4w', UUID(50), undefined, { free: true });
    const { json } = await get();
    expect(json.plans.map((p: Row) => p.kind)).toEqual(['template', 'legacy']);
    expect(json.plans[1].revisionNote).toMatch(/they are free for you/);
    expect(json.plans[1].weeks.flatMap((w: Row) => w.days.flatMap((d: Row) => d.exercises)).filter(isDepthDrop)).toEqual([]);
    expect(json.plans[0]).toMatchObject({ kind: 'template', free: true, revisionNote: null, template: { id: 'adult-bw-3' } });
  });

  it('THE SWEEP NEVER PAYS A RELAUNCH CHARGE BACK — not even after its buyer erases the plan', async () => {
    await buy('plan_4w', UUID(51));
    // older than the sweep's grace, then read the wallet the way every page does
    for (const e of charges()) e.createdAt = ago(1);
    expect((await readWallet(h.client as never, 'u1')).shards).toBe(440);
    S.plans = [];                                                            // delete-my-data
    // a fresh client: the sweep remembers a player it swept per client, so this is a new server instance reading
    expect((await readWallet(memoryDb(S) as never, 'u1')).shards).toBe(440);
    expect(S.entries.filter((e) => e.reasonCode === REASON.DEAD_BUY_REFUND)).toEqual([]);
    // MIRROR-COACH P8 FIX (2026-09-30): not stranded either — the next press of the product writes it again, uncharged
    h.client = memoryDb(S);
    const again = await buy('plan_4w', UUID(54));
    expect(again.json).toMatchObject({ recovered: true, charged: null, planId: paidPlanId(charges()[0].id) });
    expect(shards()).toBe(440);
    expect(charges()).toHaveLength(1);
  });

  it('…while a past charge no plan claims is still paid back by it, as it always was', async () => {
    fresh(1990, 0);
    pastPurchase({ plan: false });
    expect((await readWallet(h.client as never, 'u1')).shards).toBe(60);
    expect(S.entries.filter((e) => e.reasonCode === REASON.DEAD_BUY_REFUND)).toHaveLength(1);
  });

  it('a past charge its plan claims is not paid back, and relaunch plans written later claim nothing of the past', async () => {
    fresh(1990, 100);
    pastPurchase();
    expect((await buy('plan_4w', UUID(52))).json.free).toBe(true);           // the past buyer's free claim
    expect((await buy('plan_4w', UUID(53), { daysPerWeek: 4, equipment: 'gym' })).json.free).toBe(true);
    expect(charges()).toEqual([]);
    expect((await readWallet(h.client as never, 'u1')).shards).toBe(100);
    expect(S.entries.filter((e) => e.reasonCode === REASON.DEAD_BUY_REFUND)).toEqual([]);
  });
});
