import { beforeEach, describe, expect, it, vi } from 'vitest';

// POST and GET /api/v1/workout/plan run for real here. Only the session and the database are stand-ins: the database
// has a workoutPlan table and nothing else, so a charge, a balance read or any other write fails the test.
const m = vi.hoisted(() => ({
  session: { user: { id: 'u1' } } as unknown,
  rows: [] as { id: string; userId: string; tier: string; focus: string; weeks: unknown; createdAt: Date }[],
  touched: [] as string[],
  findMany: vi.fn(),
  updateMany: vi.fn(),
  dobYear: 1990 as number | null,
  userRead: vi.fn(),
}));
vi.mock('next-auth', () => ({ getServerSession: async () => m.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  prisma: new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'then') return undefined; // not a thenable
      m.touched.push(String(prop));
      if (prop === 'workoutPlan') return { findMany: m.findMany, updateMany: m.updateMany };
      // the reader's birth year, and nothing else about them (the revision is for who is reading: owner decision #6)
      if (prop === 'user') return { findUnique: m.userRead };
      throw new Error(`the route touched prisma.${String(prop)}`);
    },
  }),
}));

import { GET, POST } from '@/app/api/v1/workout/plan/route';
import { NOT_ON_SALE, getSku, skuOnSale } from '@/lib/wallet/catalog';
import { spend, WalletError } from '@/lib/wallet/wallet-service';
import { PLAN_POOLS, isDepthDrop, legacyWeeks, type PlanWeek } from './plan-generator';
import { HELD_FOR_PROTOCOL, PLAN_REVISED_NOTE, PLAN_REVISED_NOTE_YOUTH, PLAN_REVISION, PLAN_REVISION_ALL_WEEKS, isPlyometric, revisePlan } from './plan-revision';
import { PLAN_SALE_PAUSED, WORKOUT_PLAN_SKUS } from './plan-sale';

const post = (body: string) => (POST as unknown as (r: Request) => Promise<Response>)(new Request('http://fel.test/api/v1/workout/plan', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
}));
const drops = (weeks: unknown): number => (weeks as PlanWeek[])
  .reduce((n, w) => n + w.days.reduce((k, d) => k + d.exercises.filter(isDepthDrop).length, 0), 0);

/**
 * A plan as the route used to save it: the 12-week Mobility plan every buyer got (the page planned from defaultMetrics),
 * depth drops in weeks 1, 6 and 11 (plan-generator.ts legacyWeeks). MIRROR-COACH P2: this used to be generatePlan's
 * weeks with one depth drop put back in week 1, which stopped being the stored shape once generatePlan swapped every week.
 */
const boughtBeforeToday = () => legacyWeeks('mobility', 'program_12w');

beforeEach(() => {
  m.session = { user: { id: 'u1' } };
  m.dobYear = 1990;
  m.userRead.mockReset().mockImplementation(async ({ where, select }: { where: { id: string }; select: Record<string, boolean> }) => {
    expect(select).toEqual({ dobYear: true });
    return where.id === 'u1' ? { dobYear: m.dobYear } : null;
  });
  m.touched.length = 0;
  m.rows = [{ id: 'plan1', userId: 'u1', tier: 'program_12w', focus: 'Mobility & Range', weeks: boughtBeforeToday(), createdAt: new Date('2026-09-01T00:00:00Z') }];
  m.findMany.mockReset().mockImplementation(async ({ where }: { where: { userId: string } }) => m.rows.filter((r) => r.userId === where.userId).map((r) => ({ ...r })));
  m.updateMany.mockReset().mockImplementation(async ({ where, data }: { where: { id: string; userId: string }; data: { weeks: unknown } }) => {
    let count = 0;
    for (const r of m.rows) if (r.id === where.id && r.userId === where.userId) { r.weeks = JSON.parse(JSON.stringify(data.weeks)); count++; }
    return { count };
  });
});

describe('POST /api/v1/workout/plan: the sale is pulled (owner decision #3)', () => {
  it('refuses every purchase on the server with the paused-sale message (FEL\'s draft), before it reads the body or the database', async () => {
    for (const body of [
      JSON.stringify({ idempotency_key: '3f2b8c1e-9d4a-4e7b-8c2d-1a2b3c4d5e6f', tier: 'plan_4w' }),
      JSON.stringify({ idempotency_key: 'k_1_a', tier: 'program_12w', scanId: 'scan1' }),
      JSON.stringify({}),
      'not json',
    ]) {
      const res = await post(body);
      expect(res.status, body).toBe(403);
      expect(await res.json(), body).toEqual({ error: 'not_on_sale', message: PLAN_SALE_PAUSED });
    }
    expect(m.touched).toEqual([]);                                           // no charge, no plan, no wallet read
  });

  it('still asks who you are first', async () => {
    m.session = null;
    const res = await post('{}');
    expect(res.status).toBe(401);
    expect(m.touched).toEqual([]);
  });

  it('and spend() refuses both SKUs from any other route: they are held in NOT_ON_SALE, still registered', async () => {
    const lookupOnly = new Proxy({}, {
      get: (_t, prop) => {
        if (prop === 'then') return undefined;
        if (prop === 'walletLedgerEntry') return { findUnique: async () => null };
        throw new Error(`spend touched prisma.${String(prop)}`);
      },
    }) as never;
    for (const skuId of WORKOUT_PLAN_SKUS) {
      expect(NOT_ON_SALE.has(skuId), skuId).toBe(true);
      expect(getSku(skuId), skuId).not.toBeNull();
      expect(skuOnSale(skuId), skuId).toBe(false);
      const err = await spend(lookupOnly, { playerId: 'u1', idempotencyKey: `k_${skuId}`, skuId, quantity: 1 }).then(() => null, (e: unknown) => e);
      expect(err, skuId).toBeInstanceOf(WalletError);
      expect((err as WalletError).code, skuId).toBe('NOT_ON_SALE');
    }
  });
});

describe('GET /api/v1/workout/plan: buyers keep their plans, revised on read', () => {
  it('returns the buyer\'s plan without a depth drop in any week, with the note, and stores the revision once', async () => {
    const res = await (GET as unknown as () => Promise<Response>)();
    expect(res.status).toBe(200);
    const { plans } = await res.json();
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ id: 'plan1', tier: 'program_12w', focus: 'Mobility & Range', revisionNote: PLAN_REVISED_NOTE });
    expect(drops(plans[0].weeks)).toBe(0);
    expect(plans[0].weeks.filter((w: PlanWeek) => w.revision === PLAN_REVISION_ALL_WEEKS).map((w: PlanWeek) => w.week)).toEqual([1, 6, 11]);
    // week 1 Friday: not the Trap-Bar Jump P1 put there (already on Monday), the first no-flight stand-in not in the week
    expect(plans[0].weeks[0].days[2].exercises[1]).toMatchObject({ name: 'Wall Drive March', replaced: 'Depth Drop to Vertical' });
    expect(m.updateMany).toHaveBeenCalledTimes(1);
    expect(m.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'plan1', userId: 'u1' } });
    expect(Object.keys(m.updateMany.mock.calls[0][0].data)).toEqual(['weeks']);
    expect(drops(m.rows[0].weeks)).toBe(0);

    // the next read: the same plan and note, and nothing written
    const again = await (await (GET as unknown as () => Promise<Response>)()).json();
    expect(again.plans).toEqual(plans);
    expect(m.updateMany).toHaveBeenCalledTimes(1);
  });

  it('reads only the signed-in buyer\'s plans — all of them, not the newest ten — and nobody\'s when signed out', async () => {
    await (GET as unknown as () => Promise<Response>)();
    expect(m.findMany.mock.calls[0][0]).toMatchObject({ where: { userId: 'u1' } });
    expect(m.findMany.mock.calls[0][0]).not.toHaveProperty('take');
    m.session = null;
    m.findMany.mockClear();
    const res = await (GET as unknown as () => Promise<Response>)();
    expect(res.status).toBe(401);
    expect(m.findMany).not.toHaveBeenCalled();
  });

  // MIRROR-COACH P2 (2026-09-25): "only the 10 newest plans were revised or shown" (P1 review). The limit went in that
  // review; this pins that every row is revised and written, however many there are.
  it('revises and writes every plan the buyer holds: 25 of them, 25 writes, 25 shown', async () => {
    m.rows = Array.from({ length: 25 }, (_, i) => ({
      id: `plan${i}`, userId: 'u1', tier: i % 2 ? 'plan_4w' : 'program_12w', focus: 'Mobility & Range',
      weeks: legacyWeeks('power', i % 2 ? 'plan_4w' : 'program_12w'), createdAt: new Date(Date.UTC(2026, 7, 1 + i)),
    }));
    const { plans } = await (await (GET as unknown as () => Promise<Response>)()).json();
    expect(plans).toHaveLength(25);
    expect(m.updateMany).toHaveBeenCalledTimes(25);
    for (const r of m.rows) expect(drops(r.weeks), r.id).toBe(0);
  });

  it('a plan P1 already revised on read (held depth drops in weeks 6 and 11, a Trap-Bar Jump twice in week 1) is revised again, once', async () => {
    const p1 = boughtBeforeToday().map((w) => (![1, 6, 11].includes(w.week) ? w : {
      ...w, revision: PLAN_REVISION,
      days: w.days.map((d) => ({ ...d, exercises: d.exercises.map((e) => (!isDepthDrop(e) ? e
        : w.week === 1 ? { ...PLAN_POOLS.power[1], replaced: e.name } : { ...e, held: HELD_FOR_PROTOCOL })) })),
    }));
    m.rows[0].weeks = JSON.parse(JSON.stringify(p1));
    const { plans } = await (await (GET as unknown as () => Promise<Response>)()).json();
    const ex = (plans[0].weeks as PlanWeek[]).flatMap((w) => w.days.flatMap((d) => d.exercises));
    expect(ex.filter(isDepthDrop)).toEqual([]);
    expect(ex.filter((e) => e.held)).toEqual([]);
    expect((plans[0].weeks as PlanWeek[])[0].days.flatMap((d) => d.exercises).filter((e) => e.name === 'Trap-Bar Jump')).toHaveLength(1);
    expect(plans[0].revisionNote).toBe(PLAN_REVISED_NOTE);
    expect(plans[0].weeks).toEqual(revisePlan(boughtBeforeToday(), 'adult').weeks);   // the same plan a never-opened row becomes
    expect(m.updateMany).toHaveBeenCalledTimes(1);
  });
});

// MIRROR-COACH P1 review (2026-09-25), owner decision #6: under 18 — or an age the account never gave — no depth drops or
// jumps unless a coach assigns them. The route served every buyer the same stored plan: weeks 5-12 kept "Depth Drop to
// Vertical", and the week 1-4 swap was a jump.
describe('GET /api/v1/workout/plan: revised for who is reading', () => {
  const allEx = (weeks: PlanWeek[]) => weeks.flatMap((w) => w.days.flatMap((d) => d.exercises));
  const get = async () => (await (await (GET as unknown as () => Promise<Response>)()).json()).plans as { weeks: PlanWeek[]; revisionNote: string }[];

  // FLIPPED IN THE P2 REVIEW (2026-09-26): the youth plan is SERVED, never stored — stored, it outlived an adult birth
  // year (no later adult read could bring the jumps back). What is stored is everyone's revision: no depth drop.
  for (const [label, dob] of [['a 15-year-old', 2011], ['an account with no birth year', null]] as const) {
    it(`${label}: no depth drop and no jump in any week, the youth note — served; only the depth-drop revision is stored`, async () => {
      m.dobYear = dob;
      const plans = await get();
      expect(allEx(plans[0].weeks).filter(isDepthDrop)).toEqual([]);
      expect(allEx(plans[0].weeks).filter(isPlyometric)).toEqual([]);
      expect(plans[0].revisionNote).toBe(PLAN_REVISED_NOTE_YOUTH);
      expect(m.rows[0].weeks).toEqual(revisePlan(boughtBeforeToday(), 'adult').weeks);
      expect(allEx(m.rows[0].weeks as PlanWeek[]).filter(isDepthDrop)).toEqual([]);
    });
  }

  it('no birth year, then an ADULT one: the jumps and the adult note come back (nothing youth was stored)', async () => {
    m.dobYear = null;
    expect(allEx((await get())[0].weeks).filter(isPlyometric)).toEqual([]);
    m.dobYear = 1990;
    const plans = await get();
    expect(allEx(plans[0].weeks).filter(isPlyometric).length).toBeGreaterThan(0);
    expect(plans[0].revisionNote).toBe(PLAN_REVISED_NOTE);
  });

  it('a failed read of the birth year is an unknown age: youth is SERVED, and nothing that depends on it is stored', async () => {
    m.userRead.mockReset().mockRejectedValue(new Error('database offline'));
    const plans = await get();
    expect(allEx(plans[0].weeks).filter(isPlyometric)).toEqual([]);
    expect(m.rows[0].weeks).toEqual(revisePlan(boughtBeforeToday(), 'adult').weeks);
  });

  it('an adult: no depth drop in any week, nothing held (MIRROR-COACH P2, owner decision #22; P1 held weeks 5-12)', async () => {
    m.dobYear = 1990;
    const plans = await get();
    expect(drops(plans[0].weeks)).toBe(0);
    expect(allEx(plans[0].weeks).filter((e) => e.held)).toEqual([]);
    expect(plans[0].revisionNote).toBe(PLAN_REVISED_NOTE);
  });
});
