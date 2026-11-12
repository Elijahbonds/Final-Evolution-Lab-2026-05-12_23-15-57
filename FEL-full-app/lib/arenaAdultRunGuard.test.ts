// ARENA-AGE-1 (PM review 2026-11-04, item 2b): nothing about practice duels opens a door for adults. A non-staked run
// is still RUN_NOT_STAKED on every entry duel; a verified adult can't post to a TEEN_PRACTICE duel (even one they
// opened before turning 18); and only the practice duel's own seat can post to it.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  user: 'kid', dob: null as number | null, house: 10, earned: 0,
  lc: [] as Array<{ delta: number; reasonCode: string; playerId: string }>,
  match: null as Record<string, any> | null, runs: {} as Record<string, Record<string, unknown>>,
}));

vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ user: { id: h.user } })) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/analytics-server', () => ({ recordServerEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/rate-limits/policy', () => ({ checkRateLimits: vi.fn(async () => ({ ok: true })), retryAfterHeaders: () => ({}) }));
// The ceiling table and the house draw are covered elsewhere; here only the RUN check (real lib/arena-duel-run.ts) and
// the settle decision are under test.
vi.mock('@/lib/arena-score-integrity', async (orig) => ({
  ...(await orig<typeof import('@/lib/arena-score-integrity')>()),
  checkStakeScore: vi.fn(() => ({ ok: true, ceilingApplied: false, card: null })), killSwitchOn: () => false,
}));
vi.mock('@/lib/arena-ghost', () => ({ drawHouseScore: vi.fn(async () => ({ score: h.house, draw: { center: h.house, source: 'test', score: h.house } })) }));
vi.mock('@/lib/wallet/wallet-service', () => ({
  applyLc: vi.fn(async (_db: unknown, a: any) => { h.lc.push(a); return { balanceAfter: 0 }; }),
  WalletError: class WalletError extends Error { code = ''; },
  readWallet: vi.fn(async () => ({ lc: 0 })),
}));
vi.mock('@/lib/arena', async (orig) => ({
  ...(await orig<typeof import('@/lib/arena')>()),
  arenaPayWinner: vi.fn(async () => ({ payout: 90, rake: 10 })),
  arenaRefund: vi.fn(async () => 0),
  appendMatchEvent: vi.fn(async () => undefined),
}));
const tx = {
  $queryRaw: vi.fn(async () => []),
  $queryRawUnsafe: vi.fn(async () => []),
  sessionRun: { findUnique: async ({ where }: { where: { id: string } }) => (h.runs[where.id] ? { ...h.runs[where.id] } : null) },
  matchEvent: { findFirst: async () => null, findMany: async () => [] },
  walletLedgerEntry: { aggregate: vi.fn(async () => ({ _sum: { delta: h.earned } })) },
  competitionMatch: {
    findUnique: async () => ({ ...h.match }),
    update: async ({ data }: { data: Record<string, unknown> }) => { Object.assign(h.match!, data); return { ...h.match }; },
  },
};
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: async () => ({ dobYear: h.dob }) },
    $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
  },
}));

import { POST as submitPOST } from '../app/api/arena/submit-score/route';
import { serverTierFor, startResult } from './sessions/runTier';
import { RUN_STATUS } from './sessions/sessionRuns';

const post = (body: unknown) => new Request('http://x/api', { method: 'POST', body: JSON.stringify(body) }) as never;
const year = new Date().getUTCFullYear();
const opened = new Date(Date.now() - 60_000);
/** A run as /api/sessions/start + finish leave it: the start body decides staked/tier (lib/sessions/runTier.ts). */
function run(id: string, userId: string, score: number, startBody: Record<string, unknown>) {
  h.runs[id] = { id, userId, mode: 'threePoint', status: RUN_STATUS.recorded, score, startedAt: new Date(), result: startResult(serverTierFor(startBody)) };
  return id;
}
const duel = (over: Record<string, unknown> = {}) => ({
  id: 't-1', currency: 'LC', status: 'ACTIVE', matchType: 'TEEN_PRACTICE', mode: 'threePoint', seed: 's', createdAt: opened,
  player1Id: 'kid', player2Id: 'house', player1Score: null, player2Score: null, entryFeeCents: 0, rakePercent: 0,
  expiresAt: new Date(Date.now() + 3_600_000), ...over,
});
import { readDuelRun } from './arena-duel-run';
import { arenaPayWinner } from '@/lib/arena';

beforeEach(() => { h.user = 'adult'; h.dob = year - 30; h.house = 10; h.earned = 0; h.lc = []; h.runs = {}; vi.mocked(arenaPayWinner).mockClear(); });

describe('adults and staked duels', () => {
  for (const matchType of ['GHOST_DUEL', 'SCORE_DUEL', 'H2H']) {
    it(`${matchType}: a non-staked (free-play) run is refused RUN_NOT_STAKED and nothing settles`, async () => {
      h.match = duel({ matchType, player1Id: 'adult', player2Id: 'house', entryFeeCents: 50, rakePercent: 10 });
      const res = await submitPOST(post({ matchId: 't-1', score: 50, runId: run('a-1', 'adult', 50, { mode: 'threePoint', tier: 'rookie' }) }));
      expect(res.status).toBe(422);
      expect((await res.json()).error).toBe('RUN_NOT_STAKED');
      expect(arenaPayWinner).not.toHaveBeenCalled();
      expect(h.match!.player1Score).toBeNull();
    });
  }

  it('a staked run on an entry duel still settles as before (the check is unchanged for adults)', async () => {
    h.match = duel({ matchType: 'GHOST_DUEL', player1Id: 'adult', entryFeeCents: 50, rakePercent: 10 });
    const res = await submitPOST(post({ matchId: 't-1', score: 50, runId: run('a-2', 'adult', 50, { arenaMatchId: 't-1' }) }));
    expect(res.status).toBe(200);
    expect(arenaPayWinner).toHaveBeenCalledTimes(1);
  });
});

describe('adults and practice duels', () => {
  it('a verified adult in the practice seat (opened it at 17) is refused 403 before any write, even with a staked run', async () => {
    h.match = duel({ player1Id: 'adult' });
    const res = await submitPOST(post({ matchId: 't-1', score: 50, runId: run('a-3', 'adult', 50, { arenaMatchId: 't-1' }) }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('PRACTICE_UNDER_18_ONLY');
    expect(h.lc).toEqual([]);
    expect(h.match!.player1Score).toBeNull();
  });

  it('an adult who is not in the practice duel is NOT_A_PLAYER', async () => {
    h.match = duel();
    const res = await submitPOST(post({ matchId: 't-1', score: 50, runId: run('a-4', 'adult', 50, { arenaMatchId: 't-1' }) }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('NOT_A_PLAYER');
  });

  it('readDuelRun: only player 1 of a practice duel may post to it (the house seat and anyone else are NOT_PRACTICE_SEAT)', async () => {
    run('a-5', 'house', 50, { arenaMatchId: 't-1' });
    const v = await readDuelRun(tx, { runId: 'a-5', userId: 'house', match: duel(), postedScore: 50 });
    expect(v).toMatchObject({ ok: false, code: 'NOT_PRACTICE_SEAT', status: 403 });
  });

  it('readDuelRun: an entry duel ignores the practice rule entirely (non-staked run → RUN_NOT_STAKED, as before)', async () => {
    run('a-6', 'adult', 50, { tier: 'rookie' });
    const v = await readDuelRun(tx, { runId: 'a-6', userId: 'adult', match: duel({ matchType: 'GHOST_DUEL', player1Id: 'adult' }), postedScore: 50 });
    expect(v).toMatchObject({ ok: false, code: 'RUN_NOT_STAKED' });
  });
});
