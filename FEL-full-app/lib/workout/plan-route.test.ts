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
import { analyzeMovement, defaultMetrics } from './movement-screen';
import { EARLY_WEEKS, generatePlan, isDepthDrop, type PlanWeek } from './plan-generator';
import { HELD_FOR_PROTOCOL, PLAN_REVISED_NOTE_HELD, PLAN_REVISED_NOTE_YOUTH, PLAN_REVISION, isPlyometric } from './plan-revision';
import { PLAN_SALE_PAUSED, WORKOUT_PLAN_SKUS } from './plan-sale';

const post = (body: string) => (POST as unknown as (r: Request) => Promise<Response>)(new Request('http://fel.test/api/v1/workout/plan', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
}));
const earlyDrops = (weeks: unknown): number => (weeks as PlanWeek[])
  .filter((w) => w.week <= EARLY_WEEKS)
  .reduce((n, w) => n + w.days.reduce((k, d) => k + d.exercises.filter(isDepthDrop).length, 0), 0);

/** A plan as the route used to save it: generatePlan's weeks before today, depth drop and all (week 1 Friday). */
function boughtBeforeToday() {
  const weeks = JSON.parse(JSON.stringify(generatePlan(analyzeMovement(defaultMetrics()), 'program_12w').weeks)) as PlanWeek[];
  const fri = weeks[0].days[2];
  fri.exercises[1] = { name: 'Depth Drop to Vertical', sets: 4, reps: '4', cue: 'Absorb soft, explode tall', targets: 'power' };
  return weeks;
}

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
  it('returns the buyer\'s plan without the week-1 depth drop, with the note, and stores the revision once', async () => {
    const res = await (GET as unknown as () => Promise<Response>)();
    expect(res.status).toBe(200);
    const { plans } = await res.json();
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ id: 'plan1', tier: 'program_12w', focus: 'Mobility & Range', revisionNote: PLAN_REVISED_NOTE_HELD });
    expect(earlyDrops(plans[0].weeks)).toBe(0);
    expect(plans[0].weeks[0].revision).toBe(PLAN_REVISION);
    expect(plans[0].weeks[0].days[2].exercises[1]).toMatchObject({ name: 'Trap-Bar Jump', replaced: 'Depth Drop to Vertical' });
    expect(m.updateMany).toHaveBeenCalledTimes(1);
    expect(m.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'plan1', userId: 'u1' } });
    expect(Object.keys(m.updateMany.mock.calls[0][0].data)).toEqual(['weeks']);
    expect(earlyDrops(m.rows[0].weeks)).toBe(0);

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
});

// MIRROR-COACH P1 review (2026-09-25), owner decision #6: under 18 — or an age the account never gave — no depth drops or
// jumps unless a coach assigns them. The route served every buyer the same stored plan: weeks 5-12 kept "Depth Drop to
// Vertical", and the week 1-4 swap was a jump.
describe('GET /api/v1/workout/plan: revised for who is reading', () => {
  const allEx = (weeks: PlanWeek[]) => weeks.flatMap((w) => w.days.flatMap((d) => d.exercises));
  const get = async () => (await (await (GET as unknown as () => Promise<Response>)()).json()).plans as { weeks: PlanWeek[]; revisionNote: string }[];

  for (const [label, dob] of [['a 15-year-old', 2011], ['an account with no birth year', null]] as const) {
    it(`${label}: no depth drop and no jump in any week, the youth note, and that is what is stored`, async () => {
      m.dobYear = dob;
      const plans = await get();
      expect(allEx(plans[0].weeks).filter(isDepthDrop)).toEqual([]);
      expect(allEx(plans[0].weeks).filter(isPlyometric)).toEqual([]);
      expect(plans[0].revisionNote).toBe(PLAN_REVISED_NOTE_YOUTH);
      expect(allEx(m.rows[0].weeks as PlanWeek[]).filter(isPlyometric)).toEqual([]);
    });
  }

  it('a failed read of the birth year is an unknown age: youth', async () => {
    m.userRead.mockReset().mockRejectedValue(new Error('database offline'));
    const plans = await get();
    expect(allEx(plans[0].weeks).filter(isPlyometric)).toEqual([]);
  });

  it('an adult: no depth drop in weeks 1-4, and every later one is held for the protocol', async () => {
    m.dobYear = 1990;
    const plans = await get();
    const late = plans[0].weeks.filter((w) => w.week > EARLY_WEEKS).flatMap((w) => w.days.flatMap((d) => d.exercises)).filter(isDepthDrop);
    expect(late.length).toBeGreaterThan(0);
    for (const e of late) expect(e.held).toBe(HELD_FOR_PROTOCOL);
    expect(earlyDrops(plans[0].weeks)).toBe(0);
  });
});
