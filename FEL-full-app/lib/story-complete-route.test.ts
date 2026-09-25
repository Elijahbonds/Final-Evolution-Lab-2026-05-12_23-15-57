// POST /api/story/complete, DRIVEN (no database).
//
// HOTFIX (2026-09-24): the route's mode check had no test of its own — the review restored the route to its
// score-only version and every story test stayed green. This drives the real handler with the database, the session
// and the reward mocked, so dropping the mode check, the win check or the `won` column from the read fails here.
// HOTFIX (2026-09-24): and one session completes one node — a reuse is refused as what it is, never reported done.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
vi.mock('next-auth', () => ({ getServerSession: (...a: unknown[]) => getServerSession(...a) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

const findFirst = vi.fn();
const progressCreate = vi.fn();
const progressBySession = vi.fn();
const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ storyNodeProgress: { create: progressCreate } }));
vi.mock('@/lib/db', () => ({
  prisma: {
    gameSession: { findFirst: (...a: unknown[]) => findFirst(...a) },
    storyNodeProgress: { findUnique: (...a: unknown[]) => progressBySession(...a) },
    $transaction: (fn: never) => transaction(fn),
  },
}));

let completed = new Set<string>();
vi.mock('@/lib/story-service', () => ({
  loadProgressionInput: async () => ({ completedNodeIds: new Set(completed), prqOverall: 0, lessonsCompleted: 0 }),
}));
const award = vi.fn();
vi.mock('@/lib/story-economy', () => ({ awardStoryReward: (...a: unknown[]) => award(...a) }));

import { POST } from '@/app/api/story/complete/route';

type Row = { mode: string; score: number; won: boolean };
/** The session table: the route's `select` decides which columns come back, exactly as Prisma would. */
function sessionRow(row: Row | null) {
  findFirst.mockImplementation(async ({ select }: { select: Record<string, boolean> }) =>
    row ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k as keyof Row]])) : null);
}
async function complete(nodeId: string, sessionId: string | null = 's1') {
  const res = await POST({ json: async () => ({ nodeId, ...(sessionId ? { sessionId } : {}) }) } as never);
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  getServerSession.mockResolvedValue({ user: { id: 'u1' } });
  findFirst.mockReset(); progressCreate.mockReset(); award.mockReset(); transaction.mockClear();
  progressBySession.mockReset(); progressBySession.mockResolvedValue(null);
  completed = new Set();
});

describe('POST /api/story/complete', () => {
  it('a Ones game clears the first node of the campaign — and pays once', async () => {
    sessionRow({ mode: 'hoops1v1', score: 11, won: true });
    const r = await complete('blacktop.r1');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, rewardLC: 15 });
    expect(progressCreate).toHaveBeenCalledWith({ data: { userId: 'u1', nodeId: 'blacktop.r1', sessionId: 's1', score: 11 } });
    expect(award).toHaveBeenCalledTimes(1);
    // the read asks for the columns the verdict needs, and only this user's session
    expect(findFirst.mock.calls[0][0]).toEqual({ where: { id: 's1', userId: 'u1' }, select: { mode: true, score: true, won: true } });
  });

  it('a big score in another mode completes nothing', async () => {
    sessionRow({ mode: 'karateEndless', score: 99_999, won: false });
    const r = await complete('blacktop.r1');
    expect(r.status).toBe(422);
    expect(r.body).toEqual({ error: 'Session mode does not match node', required: 'hoops1v1', achieved: 'karateEndless' });
    expect(transaction).not.toHaveBeenCalled();
    expect(award).not.toHaveBeenCalled();
  });

  it('under the target is refused with the numbers', async () => {
    sessionRow({ mode: 'hoops1v1', score: 2, won: false });
    const r = await complete('blacktop.r1');
    expect(r.status).toBe(422);
    expect(r.body).toEqual({ error: 'Score below target', required: 4, achieved: 2 });
  });

  it('a bare win boss refuses a loss, however close', async () => {
    completed = new Set(['tennis.r1', 'tennis.r2', 'tennis.r3']);
    sessionRow({ mode: 'tennis', score: 3, won: false });
    const lost = await complete('tennis.boss');
    expect(lost.status).toBe(422);
    expect(lost.body).toEqual({ error: 'Not a win', required: 'win', achieved: 'loss' });
    expect(award).not.toHaveBeenCalled();
  });

  it('a win boss with a fallback: the win pays, the fallback score pays, a loss under it is refused with both lines', async () => {
    completed = new Set(['blacktop.r1', 'blacktop.r2', 'blacktop.r3']);
    sessionRow({ mode: 'hoops1v1', score: 9, won: false });
    const short = await complete('blacktop.boss');
    expect(short.status).toBe(422);
    expect(short.body).toEqual({ error: 'Not a win', required: 'win', achieved: 'loss', orScore: 10, score: 9 });
    expect(award).not.toHaveBeenCalled();

    sessionRow({ mode: 'hoops1v1', score: 10, won: false });
    const close = await complete('blacktop.boss');
    expect(close.status).toBe(200);
    expect(close.body).toMatchObject({ ok: true, rewardLC: 50, badge: { name: 'Asphalt Proof' } });

    sessionRow({ mode: 'hoops1v1', score: 11, won: true });
    const won = await complete('blacktop.boss');
    expect(won.status).toBe(200);
    expect(won.body).toMatchObject({ ok: true, rewardLC: 50 });
  });

  it('a session that already completed another node completes nothing more', async () => {
    sessionRow({ mode: 'hoops1v1', score: 11, won: true });
    progressBySession.mockResolvedValue({ nodeId: 'blacktop.r1' });
    completed = new Set(['blacktop.r1']);
    const r = await complete('blacktop.r2');
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: 'Session already used', nodeId: 'blacktop.r1' });
    expect(progressBySession.mock.calls[0][0]).toEqual({ where: { sessionId: 's1' }, select: { nodeId: true } });
    expect(transaction).not.toHaveBeenCalled();
    expect(award).not.toHaveBeenCalled();
  });

  it('the same session on the same node again is the idempotent "already completed"', async () => {
    sessionRow({ mode: 'hoops1v1', score: 11, won: true });
    progressBySession.mockResolvedValue({ nodeId: 'blacktop.r1' });
    completed = new Set(['blacktop.r1']);
    const r = await complete('blacktop.r1');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, alreadyCompleted: true });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('a race the check missed: the sessionId key refuses, the node key is the idempotent success', async () => {
    sessionRow({ mode: 'hoops1v1', score: 11, won: true });
    progressCreate.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002', meta: { target: ['sessionId'] } }));
    const raced = await complete('blacktop.r1');
    expect(raced.status).toBe(409);
    expect(raced.body).toEqual({ error: 'Session already used' });

    progressCreate.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002', meta: { target: ['userId', 'nodeId'] } }));
    const again = await complete('blacktop.r1');
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ ok: true, alreadyCompleted: true });
  });

  it('no session at all completes nothing', async () => {
    const r = await complete('blacktop.r1', null);
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ error: 'Session mode does not match node', achieved: null });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('a session that is not this user\'s is not found', async () => {
    sessionRow(null);
    const r = await complete('blacktop.r1');
    expect(r.status).toBe(404);
  });
});
