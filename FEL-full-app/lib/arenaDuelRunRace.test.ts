// ARENA-SETTLE-SERVER (PM ruling 2026-10-15): one run, submitted to two duels at the same instant, settles exactly one.
// lib/arena-duel-run.ts locks the SessionRun row (SELECT … FOR UPDATE) before its "already used" read. This fake plays
// Postgres the way that matters: a transaction's writes are seen by others only when it commits, and a FOR UPDATE row
// lock is held until the holder's transaction ends. With the lock switched off (the control) both submits settle, so the
// test is known to bite.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;
const h = vi.hoisted(() => ({
  matches: [] as Row[],
  events: [] as Row[],
  runs: {} as Record<string, Row>,
  locks: new Map<string, Promise<void>>(),
  lockOn: true,
  payouts: [] as Row[],
}));
const tick = () => new Promise<void>((r) => setImmediate(r));

function txClient(pending: Row[], held: Array<() => void>) {
  return {
    $queryRaw: async (sql: TemplateStringsArray, ...vals: unknown[]) => {
      if (!h.lockOn || !sql.join('?').includes('FOR UPDATE')) return [];
      const id = String(vals[0]);
      while (h.locks.has(id)) await h.locks.get(id);
      let release!: () => void;
      h.locks.set(id, new Promise<void>((r) => { release = r; }));
      held.push(() => { h.locks.delete(id); release(); });
      return [{ id }];
    },
    sessionRun: { findUnique: async ({ where }: Row) => { await tick(); return h.runs[where.id] ? { ...h.runs[where.id] } : null; } },
    competitionMatch: {
      findUnique: async ({ where }: Row) => { await tick(); const m = h.matches.find((x) => x.id === where.id); return m ? { ...m } : null; },
      update: async ({ where, data }: Row) => { const m = h.matches.find((x) => x.id === where.id)!; Object.assign(m, data); return { ...m }; },
    },
    matchEvent: {
      // committed rows only: another transaction's uncommitted SCORE_SUBMITTED is invisible, as under READ COMMITTED
      findFirst: async ({ where }: Row) => {
        await tick();
        return h.events.find((e) => e.userId === where.userId && e.eventType === where.eventType && e.matchId !== where.matchId?.not
          && String(e.payload).includes(where.payload.contains)) ?? null;
      },
      create: async ({ data }: Row) => { pending.push(data); return data; },
      findMany: async () => [],
    },
    gameSession: { findMany: async () => [] },
  };
}

vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ user: { id: 'u1' } })) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/analytics-server', () => ({ recordServerEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => unknown) => {
      const pending: Row[] = []; const held: Array<() => void> = [];
      try { const out = await fn(txClient(pending, held)); h.events.push(...pending); return out; } finally { for (const r of held) r(); }
    },
  },
}));
vi.mock('@/lib/arena', async (orig) => ({
  ...(await orig<typeof import('@/lib/arena')>()),
  arenaPayWinner: vi.fn(async (_tx: unknown, o: Row) => { h.payouts.push(o); return { payout: 90, rake: 10 }; }),
  arenaRefund: vi.fn(async () => 0),
}));

import { POST } from '@/app/api/arena/submit-score/route';

const duel = (id: string): Row => ({
  id, currency: 'LC', status: 'ACTIVE', matchType: 'H2H', mode: 'hoops1v1', seed: `seed-${id}`, createdAt: new Date('2026-09-01'),
  expiresAt: null, player1Id: 'u1', player2Id: 'u2', player1Score: null, player2Score: 5, entryFeeCents: 50, rakePercent: 10,
});
const submit = (matchId: string) => POST(new Request('http://fel.local/api/arena/submit-score', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matchId, score: 11, runId: 'r1' }),
}) as never).then(async (r) => ({ status: r.status, json: await r.json() as Row }));

beforeEach(() => {
  h.matches = [duel('m1'), duel('m2')]; h.events = []; h.locks = new Map(); h.lockOn = true; h.payouts = [];
  h.runs = { r1: { id: 'r1', userId: 'u1', mode: 'hoops1v1', status: 'paid', score: 11, startedAt: new Date('2026-09-02') } };
});

describe('one run, two duels, the same instant', () => {
  it('exactly one settles; the other is refused 409 RUN_ALREADY_USED and its duel stays open', async () => {
    const [a, b] = await Promise.all([submit('m1'), submit('m2')]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect([a, b].filter((r) => r.json.settled === true)).toHaveLength(1);
    expect([a, b].find((r) => r.status === 409)!.json.error).toBe('RUN_ALREADY_USED');
    expect(h.payouts).toHaveLength(1);
    expect(h.matches.filter((m) => m.status === 'SETTLED')).toHaveLength(1);
    expect(h.matches.filter((m) => m.status === 'ACTIVE' && m.player1Score === null)).toHaveLength(1);
  });

  it('control: without the row lock both read "unused" first and the one run pays two duels', async () => {
    h.lockOn = false;
    const [a, b] = await Promise.all([submit('m1'), submit('m2')]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(h.payouts).toHaveLength(2);
  });
});
