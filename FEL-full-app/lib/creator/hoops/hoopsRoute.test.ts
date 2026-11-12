// lane/hoops-builder (owner 2026-11-12): GET + POST /api/v1/creator/hoops and the read-and-write under them, DRIVEN against an
// in-memory AthleteBuild / SessionRun store (no database). Signed-in only; points are claimed from the server's own run records;
// a save cannot spend what was not earned or pass a ceiling; the rest of the build is never touched; the Creator's Finalize keeps it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
vi.mock('next-auth', () => ({ getServerSession: (...a: unknown[]) => getServerSession(...a) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
const axesFor = vi.fn();
vi.mock('@/lib/creator/athleteAxes-server', () => ({ axesFor: (...a: unknown[]) => axesFor(...a) }));

type BuildRow = { userId: string; build: Record<string, unknown>; updatedAt: Date };
type RunRow = { userId: string; mode: string; status: string; payoutEligible: boolean; agentRun: boolean; finishedAt: Date | null; durationMs: number | null; result: unknown };
const store = { builds: [] as BuildRow[], runs: [] as RunRow[], writes: [] as string[], tick: 0, raceOnce: false };

const fakeDb = {
  athleteBuild: {
    findUnique: async ({ where }: { where: { userId: string } }) => {
      const r = store.builds.find((b) => b.userId === where.userId);
      return r ? { build: JSON.parse(JSON.stringify(r.build)), updatedAt: r.updatedAt } : null;
    },
    updateMany: async ({ where, data }: { where: { userId: string; updatedAt: Date }; data: { build: Record<string, unknown> } }) => {
      store.writes.push('athleteBuild.updateMany');
      const r = store.builds.find((b) => b.userId === where.userId);
      if (store.raceOnce && r) { store.raceOnce = false; r.updatedAt = new Date(r.updatedAt.getTime() + 1); }   // somebody else wrote first
      if (!r || r.updatedAt.getTime() !== where.updatedAt.getTime()) return { count: 0 };
      r.build = data.build; r.updatedAt = new Date(r.updatedAt.getTime() + 1000 + store.tick++);
      return { count: 1 };
    },
    create: async ({ data }: { data: { userId: string; build: Record<string, unknown> } }) => {
      store.writes.push('athleteBuild.create');
      store.builds.push({ userId: data.userId, build: data.build, updatedAt: new Date(1_000) });
      return {};
    },
    upsert: async () => ({ finalizedAt: new Date(0) }),
  },
  sessionRun: {
    findMany: async ({ where }: { where: { userId: string; mode: { in: string[] }; status: { in: string[] }; payoutEligible: boolean; agentRun: boolean; finishedAt: { gt: Date } } }) =>
      store.runs
        .filter((r) => r.userId === where.userId && where.mode.in.includes(r.mode) && where.status.in.includes(r.status)
          && r.payoutEligible === where.payoutEligible && r.agentRun === where.agentRun && r.finishedAt && r.finishedAt > where.finishedAt.gt)
        .sort((a, b) => a.finishedAt!.getTime() - b.finishedAt!.getTime()),
  },
};
vi.mock('@/lib/db', () => ({ get prisma() { return fakeDb; } }));

import { GET, POST } from '@/app/api/v1/creator/hoops/route';
import { loadHoops } from './hoopsBuild-server';

const NOW = new Date('2026-11-12T18:00:00.000Z');
const today = (m: number) => new Date(Date.parse('2026-11-12T00:00:00.000Z') + m * 60_000);   // minutes into the (fixed) day, UTC
const addRun = (o: Partial<RunRow> = {}) => store.runs.push({
  userId: 'u1', mode: 'hoops1v1', status: 'paid', payoutEligible: true, agentRun: false, finishedAt: today(1), durationMs: 120_000, result: { status: 200, body: { won: false } }, ...o,
});
const get = async () => { const r = await GET(); return { status: r.status, body: await r.json() }; };
const post = async (b: unknown) => { const r = await POST({ json: async () => b } as never); return { status: r.status, body: await r.json() }; };
const zero = { speed: 0, handle: 0, shooting: 0, finishing: 0, defense: 0 };

afterEach(() => { vi.useRealTimers(); });
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW);
  store.builds = []; store.runs = []; store.writes = []; store.raceOnce = false;
  getServerSession.mockResolvedValue({ user: { id: 'u1' } });
  axesFor.mockReset(); axesFor.mockResolvedValue(null);
});

describe('signed-in only', () => {
  it('GET and POST are 401 without a session, and touch nothing', async () => {
    getServerSession.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
    expect((await post({ position: 'wing', heightIn: 76, steps: zero })).status).toBe(401);
    expect(store.writes).toEqual([]);
  });
});

describe('GET: the ratings, and the points finished games earned', () => {
  it('a new player is a wing at 6\'4", every rating 50, no points', async () => {
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.body.hoops).toMatchObject({ position: 'wing', heightIn: 76, ratings: { speed: 50, handle: 50, shooting: 50, finishing: 50, defense: 50 }, points: { earned: 0, left: 0 } });
  });

  it('claims today\'s finished hoops games: 2 a game, 3 a win; agent, playtest, rejected, other-mode and short runs pay nothing', async () => {
    addRun({ finishedAt: today(10) });
    addRun({ finishedAt: today(20), mode: 'hoops3v3', status: 'recorded', result: { body: { won: true } } });
    addRun({ finishedAt: today(30), agentRun: true });
    addRun({ finishedAt: today(40), payoutEligible: false });
    addRun({ finishedAt: today(50), status: 'rejected' });
    addRun({ finishedAt: today(60), mode: 'soccer' });
    addRun({ finishedAt: today(70), durationMs: 5_000 });
    const r = await get();
    expect(r.body.gained).toBe(5);
    expect(r.body.hoops.points).toMatchObject({ earned: 5, left: 5, today: 5 });
    expect((await get()).body.gained).toBe(0);                   // counted once
    expect(store.builds[0].build.hoops).toMatchObject({ points: { earned: 5 } });
  });

  it('never touches the rest of the build', async () => {
    store.builds.push({ userId: 'u1', build: { attributes: { speed: 61 }, frame: { bodyType: 'female' }, palette: { a: '#fff' } }, updatedAt: new Date(5_000) });
    addRun({ finishedAt: today(100) });
    await get();
    expect(store.builds[0].build).toMatchObject({ attributes: { speed: 61 }, frame: { bodyType: 'female' }, palette: { a: '#fff' } });
    expect(store.builds[0].build.hoops).toBeTruthy();
  });

  it('a write that lost a race reads again and does not pay twice', async () => {
    store.builds.push({ userId: 'u1', build: {}, updatedAt: new Date(5_000) });
    addRun({ finishedAt: today(10), result: { body: { won: true } } });
    store.raceOnce = true;
    const l = await loadHoops(fakeDb as never, 'u1', NOW);
    expect(l.build.points.earned).toBe(3);
    expect(store.writes).toEqual(['athleteBuild.updateMany', 'athleteBuild.updateMany']);
  });
});

describe('POST: spend, validated on the server', () => {
  const earn = (n: number) => store.builds.push({ userId: 'u1', build: { hoops: { v: 1, position: 'wing', heightIn: 76, steps: zero, points: { earned: n, through: new Date().toISOString(), day: null, dayEarned: 0 } } }, updatedAt: new Date(5_000) });

  it('saves a legal choice and answers with the new ratings', async () => {
    earn(12);
    const r = await post({ position: 'guard', heightIn: 74, steps: { ...zero, shooting: 10 } });
    expect(r.status).toBe(200);
    expect(r.body.hoops).toMatchObject({ position: 'guard', heightIn: 74, ratings: { shooting: 61 }, points: { earned: 12, spent: 10, left: 2 } });
  });

  it('points cannot go negative: 422, nothing written', async () => {
    earn(5);
    const r = await post({ position: 'wing', heightIn: 76, steps: { ...zero, speed: 6 } });
    expect(r.status).toBe(422);
    expect(r.body.issues[0].field).toBe('points');
    expect(store.writes).toEqual([]);
  });

  it('a ceiling from the MEASURED axes is enforced — the request cannot send its own', async () => {
    earn(50);
    axesFor.mockResolvedValue({ agility: 10 });   // Perimeter Defense ceiling 55
    const r = await post({ position: 'wing', heightIn: 76, steps: { ...zero, defense: 6 }, prq: null, ceilings: { defense: 90 } });
    expect(r.status).toBe(422);
    expect(r.body.issues[0]).toMatchObject({ field: 'defense' });
    expect((await post({ position: 'wing', heightIn: 76, steps: { ...zero, defense: 5 } })).status).toBe(200);
  });

  it('a client cannot send points', async () => {
    earn(3);
    const r = await post({ position: 'wing', heightIn: 76, steps: { ...zero, handle: 3 }, points: { earned: 999 } });
    expect(r.status).toBe(200);
    expect(r.body.hoops.points).toMatchObject({ earned: 3, left: 0 });
  });

  it('a part saved by a newer version is not written over (409)', async () => {
    store.builds.push({ userId: 'u1', build: { hoops: { v: 2, position: 'big' } }, updatedAt: new Date(5_000) });
    expect((await post({ position: 'wing', heightIn: 76, steps: zero })).status).toBe(409);
    expect(store.writes).toEqual([]);
  });

  it('bad JSON is 400', async () => {
    const r = await POST({ json: async () => { throw new Error('x'); } } as never);
    expect(r.status).toBe(400);
  });
});
