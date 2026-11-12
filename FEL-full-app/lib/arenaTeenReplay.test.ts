// ARENA-AGE-1 v5 — Cyber v4 review follow-ups 2 and 3, through the REAL submit-score route and the REAL
// lib/arena-duel-run.ts check: a settled practice duel takes no second score (NOT_SUBMITTABLE), one run can't count in
// two practice duels (RUN_ALREADY_USED), and a practice win's prize is paid once per duel (idempotency key
// arena-teen-prize:<matchId>, honoured by the fake wallet the way wallet-service's unique key is).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  house: 10, earned: 0,
  lc: [] as Array<{ delta: number; reasonCode: string; playerId: string; idempotencyKey: string }>,
  keys: new Set<string>(),
  matches: {} as Record<string, Record<string, any>>,
  runs: {} as Record<string, Record<string, unknown>>,
  events: [] as Array<{ matchId: string; eventType: string; userId: string | null; payload: string }>,
}));

vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ user: { id: 'kid' } })) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/analytics-server', () => ({ recordServerEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/rate-limits/policy', () => ({ checkRateLimits: vi.fn(async () => ({ ok: true })), retryAfterHeaders: () => ({}) }));
vi.mock('@/lib/arena-score-integrity', async (orig) => ({
  ...(await orig<typeof import('@/lib/arena-score-integrity')>()),
  checkStakeScore: vi.fn(() => ({ ok: true, ceilingApplied: false, card: null })), killSwitchOn: () => false,
}));
vi.mock('@/lib/arena-ghost', () => ({ drawHouseScore: vi.fn(async () => ({ score: h.house, draw: { center: h.house, source: 'test', score: h.house } })) }));
vi.mock('@/lib/wallet/wallet-service', () => ({
  // A replayed idempotency key is a no-op, as the unique key makes it in wallet-service.
  applyLc: vi.fn(async (_db: unknown, a: any) => {
    if (h.keys.has(a.idempotencyKey)) return { balanceAfter: 0, replayed: true };
    h.keys.add(a.idempotencyKey); h.lc.push(a); return { balanceAfter: 0 };
  }),
  WalletError: class WalletError extends Error { code = ''; },
  readWallet: vi.fn(async () => ({ lc: 0 })),
}));
vi.mock('@/lib/arena', async (orig) => ({
  ...(await orig<typeof import('@/lib/arena')>()),
  arenaPayWinner: vi.fn(async () => ({ payout: 90, rake: 10 })),
  arenaRefund: vi.fn(async () => 0),
  appendMatchEvent: vi.fn(async (_tx: unknown, matchId: string, eventType: string, userId: string | null, payload: unknown) => {
    h.events.push({ matchId, eventType, userId, payload: JSON.stringify(payload ?? {}) });
  }),
}));
const tx = {
  $queryRaw: vi.fn(async () => []),
  $queryRawUnsafe: vi.fn(async () => []),
  sessionRun: { findUnique: async ({ where }: { where: { id: string } }) => (h.runs[where.id] ? { ...h.runs[where.id] } : null) },
  matchEvent: {
    findFirst: async ({ where }: { where: { userId: string; eventType: string; matchId: { not: string }; payload: { contains: string } } }) =>
      h.events.find((e) => e.userId === where.userId && e.eventType === where.eventType && e.matchId !== where.matchId.not && e.payload.includes(where.payload.contains)) ?? null,
    findMany: async () => [],
  },
  walletLedgerEntry: { aggregate: vi.fn(async () => ({ _sum: { delta: h.earned } })) },
  competitionMatch: {
    findUnique: async ({ where }: { where: { id: string } }) => (h.matches[where.id] ? { ...h.matches[where.id] } : null),
    update: async ({ where, data }: { where: { id: string; status?: { in: string[] } }; data: Record<string, unknown> }) => {
      const m = h.matches[where.id];
      if (!m || (where.status && !where.status.in.includes(m.status))) throw Object.assign(new Error('not found'), { code: 'P2025' });
      Object.assign(m, data); return { ...m };
    },
  },
};
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: async () => ({ dobYear: new Date().getFullYear() - 15 }) },
    $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
  },
}));

import { POST as submitPOST } from '../app/api/arena/submit-score/route';
import { awardTeenPrize, TEEN_PRIZE_DEFAULT } from './arena-teen';
import { serverTierFor, startResult } from './sessions/runTier';
import { RUN_STATUS } from './sessions/sessionRuns';

const post = (body: unknown) => new Request('http://x/api', { method: 'POST', body: JSON.stringify(body) }) as never;
const opened = new Date(Date.now() - 60_000);
function run(id: string, matchId: string, score = 50) {
  h.runs[id] = { id, userId: 'kid', mode: 'threePoint', status: RUN_STATUS.recorded, score, startedAt: new Date(), result: startResult(serverTierFor({ mode: 'threePoint', arenaMatchId: matchId })) };
  return id;
}
function duel(id: string) {
  h.matches[id] = {
    id, currency: 'LC', status: 'ACTIVE', matchType: 'TEEN_PRACTICE', mode: 'threePoint', seed: 's', createdAt: opened,
    player1Id: 'kid', player2Id: 'house', player1Score: null, player2Score: null, entryFeeCents: 0, rakePercent: 0,
    expiresAt: new Date(Date.now() + 3_600_000),
  };
  return id;
}

beforeEach(() => { h.house = 10; h.earned = 0; h.lc = []; h.keys = new Set(); h.matches = {}; h.runs = {}; h.events = []; });

describe('practice replay', () => {
  it('a second submit to a settled practice duel is refused NOT_SUBMITTABLE and pays nothing more', async () => {
    duel('t-1'); const r = run('r-1', 't-1');
    expect((await submitPOST(post({ matchId: 't-1', score: 50, runId: r }))).status).toBe(200);
    expect(h.matches['t-1'].status).toBe('SETTLED');
    const again = await submitPOST(post({ matchId: 't-1', score: 50, runId: r }));
    expect(again.status).toBe(409);
    expect((await again.json()).error).toBe('NOT_SUBMITTABLE');
    expect(h.lc.length).toBe(1);
  });

  it('the same run on a new practice duel is RUN_ALREADY_USED and pays nothing', async () => {
    duel('t-1'); const r = run('r-1', 't-1');
    expect((await submitPOST(post({ matchId: 't-1', score: 50, runId: r }))).status).toBe(200);
    duel('t-2');
    const res = await submitPOST(post({ matchId: 't-2', score: 50, runId: r }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('RUN_ALREADY_USED');
    expect(h.matches['t-2'].status).toBe('ACTIVE');
    expect(h.lc.length).toBe(1);
  });
});

describe('the prize is paid once per duel', () => {
  it('a practice win pays the fixed prize once, keyed arena-teen-prize:<matchId>', async () => {
    duel('t-1');
    await submitPOST(post({ matchId: 't-1', score: 50, runId: run('r-1', 't-1') }));
    await submitPOST(post({ matchId: 't-1', score: 50, runId: run('r-2', 't-1') }));
    expect(h.lc).toEqual([expect.objectContaining({ playerId: 'kid', delta: TEEN_PRIZE_DEFAULT, reasonCode: 'ARENA_TEEN_PRIZE', idempotencyKey: 'arena-teen-prize:t-1' })]);
  });

  it('awarding the same duel twice moves Lab Credits once (the key is per match, not per call)', async () => {
    await awardTeenPrize(tx, { userId: 'kid', matchId: 't-9' });
    await awardTeenPrize(tx, { userId: 'kid', matchId: 't-9' });
    expect(h.lc.map((e) => e.idempotencyKey)).toEqual(['arena-teen-prize:t-9']);
    await awardTeenPrize(tx, { userId: 'kid', matchId: 't-10' });
    expect(h.lc.map((e) => e.idempotencyKey)).toEqual(['arena-teen-prize:t-9', 'arena-teen-prize:t-10']);
  });
});
