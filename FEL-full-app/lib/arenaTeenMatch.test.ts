// ARENA-AGE-1 — Cyber addendum T1 (a teen duel never debits LC) and T2 (a fixed, game-funded prize; no pot, no house
// cut, never tied to an opponent's entry). EOU-36 "teen match debits 0 LC". submit-score runs for real; the run check,
// the score ceiling and the house draw are mocked to fixed answers so only the settle decision is under test.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ house: 100, lc: [] as Array<{ delta: number; reasonCode: string; playerId: string; idempotencyKey: string }>, match: null as Record<string, any> | null, events: [] as Array<{ type: string; payload: any }>, earned: 0 }));

vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ user: { id: 'kid' } })) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/analytics-server', () => ({ recordServerEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/rate-limits/policy', () => ({ checkRateLimits: vi.fn(async () => ({ ok: true })), retryAfterHeaders: () => ({}) }));
vi.mock('@/lib/arena-duel-run', () => ({ readDuelRun: vi.fn(async (_tx: unknown, a: { postedScore: number }) => ({ ok: true, runId: 'run-1', score: a.postedScore })) }));
vi.mock('@/lib/arena-score-integrity', () => ({
  checkStakeScore: vi.fn(() => ({ ok: true, ceilingApplied: false, card: null })), killSwitchOn: () => false, STAKE_REFUSAL_STATUS: 422,
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
  arenaLockEntry: vi.fn(async () => 0),
  appendMatchEvent: vi.fn(async (_tx: unknown, _id: string, type: string, _u: unknown, payload: unknown) => { h.events.push({ type, payload }); }),
}));
const tx = {
  $queryRawUnsafe: vi.fn(async () => []),
  walletLedgerEntry: { aggregate: vi.fn(async () => ({ _sum: { delta: h.earned } })) },
  competitionMatch: {
    findUnique: async () => ({ ...h.match }),
    update: async ({ data }: { data: Record<string, unknown> }) => { Object.assign(h.match!, data); return { ...h.match }; },
  },
};
vi.mock('@/lib/db', () => ({ prisma: { $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } }));

import { POST as submitPOST } from '../app/api/arena/submit-score/route';
import { arenaPayWinner, arenaRefund, arenaLockEntry } from '@/lib/arena';
import { TEEN_PRIZE_DEFAULT } from './arena-teen';

const post = (body: unknown) => new Request('http://x/api', { method: 'POST', body: JSON.stringify(body) }) as never;
const teenMatch = (over: Record<string, unknown> = {}) => ({
  id: 't-1', currency: 'LC', status: 'ACTIVE', matchType: 'TEEN_PRACTICE', mode: 'threePoint', seed: 's', createdAt: new Date(),
  player1Id: 'kid', player2Id: 'house', player1Score: null, player2Score: null, entryFeeCents: 0, rakePercent: 0,
  expiresAt: new Date(Date.now() + 3_600_000), ...over,
});

beforeEach(() => { h.lc = []; h.events = []; h.earned = 0; h.match = teenMatch(); vi.clearAllMocks(); });

describe('a teen practice duel', () => {
  it('a win pays exactly the fixed prize, once, as ARENA_TEEN_PRIZE — no pot, no rake, no payWinner', async () => {
    h.house = 10;
    const res = await submitPOST(post({ matchId: 't-1', score: 50, runId: 'run-1' }));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j).toMatchObject({ settled: true, teenPractice: true, iWon: true, prize: TEEN_PRIZE_DEFAULT, feeLc: 0 });
    expect(j.payout).toBeUndefined();
    expect(j.rake).toBeUndefined();
    expect(h.lc).toEqual([expect.objectContaining({ playerId: 'kid', delta: TEEN_PRIZE_DEFAULT, reasonCode: 'ARENA_TEEN_PRIZE', idempotencyKey: 'arena-teen-prize:t-1' })]);
    expect(arenaPayWinner).not.toHaveBeenCalled();
    expect(arenaRefund).not.toHaveBeenCalled();
    expect(h.match!.status).toBe('SETTLED');
  });

  it('the prize does not depend on any entry: a row carrying a non-zero entry still pays only the fixed prize', async () => {
    h.house = 10; h.match = teenMatch({ entryFeeCents: 500, rakePercent: 10 });
    await submitPOST(post({ matchId: 't-1', score: 50, runId: 'run-1' }));
    expect(h.lc.map((e) => e.delta)).toEqual([TEEN_PRIZE_DEFAULT]);
  });

  it('a loss moves no Lab Credits at all (0 debit, 0 credit)', async () => {
    h.house = 500;
    const j = await (await submitPOST(post({ matchId: 't-1', score: 50, runId: 'run-1' }))).json();
    expect(j).toMatchObject({ settled: true, iWon: false, prize: 0 });
    expect(h.lc).toEqual([]);
    expect(arenaPayWinner).not.toHaveBeenCalled();
  });

  it('a tie moves no Lab Credits and voids the duel', async () => {
    h.house = 50;
    const j = await (await submitPOST(post({ matchId: 't-1', score: 50, runId: 'run-1' }))).json();
    expect(j).toMatchObject({ settled: true, result: 'tie', prize: 0 });
    expect(h.lc).toEqual([]);
    expect(arenaRefund).not.toHaveBeenCalled();
    expect(h.match!.status).toBe('VOIDED');
  });

  it('never debits: across win, loss and tie no ledger move is negative and arenaLockEntry is never called', async () => {
    for (const house of [10, 500, 50]) {
      h.house = house; h.match = teenMatch();
      await submitPOST(post({ matchId: 't-1', score: 50, runId: 'run-1' }));
    }
    expect(h.lc.every((e) => e.delta > 0)).toBe(true);
    expect(arenaLockEntry).not.toHaveBeenCalled();
  });
});
