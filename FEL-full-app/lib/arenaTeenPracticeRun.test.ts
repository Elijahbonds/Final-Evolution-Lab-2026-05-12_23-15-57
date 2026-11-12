// ARENA-AGE-1 (PM review 2026-11-04, item 2a): a teen starts a practice run from the duel's link (the start body names
// arenaMatchId, so the server records it PRO/head-to-head), finishes it, and submit-score accepts it through the REAL
// lib/arena-duel-run.ts check; the win pays the fixed prize within the daily cap.
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

beforeEach(() => { h.user = 'kid'; h.dob = year - 15; h.house = 10; h.earned = 0; h.lc = []; h.runs = {}; h.match = duel(); });

describe('a teen practice duel, start to finish', () => {
  it('the practice run is accepted and the win pays the full prize', async () => {
    const id = run('r-1', 'kid', 50, { mode: 'threePoint', arenaMatchId: 't-1' });
    const res = await submitPOST(post({ matchId: 't-1', score: 50, runId: id }));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j).toMatchObject({ settled: true, teenPractice: true, iWon: true, prize: 25, feeLc: 0 });
    expect(h.lc).toEqual([expect.objectContaining({ playerId: 'kid', delta: 25, reasonCode: 'ARENA_TEEN_PRIZE' })]);
  });

  it('an unknown-age account plays the same way', async () => {
    h.dob = null;
    const id = run('r-2', 'kid', 50, { mode: 'threePoint', arenaMatchId: 't-1' });
    expect((await submitPOST(post({ matchId: 't-1', score: 50, runId: id }))).status).toBe(200);
  });

  it('near the cap the prize only fills to the cap; at the cap it is 0 and says so', async () => {
    h.earned = 90;
    const a = await (await submitPOST(post({ matchId: 't-1', score: 50, runId: run('r-3', 'kid', 50, { arenaMatchId: 't-1' }) }))).json();
    expect(a).toMatchObject({ prize: 10, prizeCapped: true });
    h.earned = 100; h.match = duel(); h.lc = [];
    const b = await (await submitPOST(post({ matchId: 't-1', score: 50, runId: run('r-4', 'kid', 50, { arenaMatchId: 't-1' }) }))).json();
    expect(b).toMatchObject({ iWon: true, prize: 0, prizeCapped: true });
    expect(h.lc).toEqual([]);
  });

  it('a free-play run (no head-to-head start) is still RUN_NOT_STAKED, even on a practice duel', async () => {
    const res = await submitPOST(post({ matchId: 't-1', score: 50, runId: run('r-5', 'kid', 50, { mode: 'threePoint', tier: 'rookie' }) }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('RUN_NOT_STAKED');
    expect(h.lc).toEqual([]);
  });
});
