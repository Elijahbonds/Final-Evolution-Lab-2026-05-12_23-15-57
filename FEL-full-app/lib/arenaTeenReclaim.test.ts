// ARENA-AGE-1: an expired teen practice duel (never played) is closed by the reclaim sweep with ZERO ledger writes
// (applyLc refuses a 0 move, and nothing was locked) and no prize; an adult duel's reclaim is unchanged.
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ lc: [] as unknown[], events: [] as Array<{ type: string; payload: any }> }));
vi.mock('@/lib/wallet/wallet-service', () => ({
  applyLc: vi.fn(async (_d: unknown, a: unknown) => { h.lc.push(a); return { balanceAfter: 0 }; }),
  WalletError: class WalletError extends Error { code = ''; },
}));
vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/lib/arena', async (orig) => ({
  ...(await orig<typeof import('@/lib/arena')>()),
  appendMatchEvent: vi.fn(async (_tx: unknown, _id: string, type: string, _u: unknown, payload: unknown) => { h.events.push({ type, payload }); }),
}));

import { reclaimOne } from './arena-reclaim';

function db(row: Record<string, unknown>) {
  const state = { ...row };
  const tx = {
    competitionMatch: {
      findUnique: async () => ({ ...state }),
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (where.status !== state.status) return { count: 0 };
        Object.assign(state, data); return { count: 1 };
      },
    },
  };
  return { state, db: { competitionMatch: { findMany: async () => [] }, $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } };
}

describe('reclaim of a teen practice duel', () => {
  it('voids it with no Lab Credits moved and no prize', async () => {
    const past = new Date(Date.now() - 60_000);
    const { state, db: d } = db({
      id: 't-9', currency: 'LC', status: 'ACTIVE', matchType: 'TEEN_PRACTICE', mode: 'threePoint', player1Id: 'kid', player2Id: 'house',
      player1Score: null, player2Score: null, entryFeeCents: 0, rakePercent: 0, expiresAt: past, seed: 's', createdAt: past,
    });
    const r = await reclaimOne(d as never, 't-9');
    expect(r).toMatchObject({ outcome: 'voided', refunded: [] });
    expect(state.status).toBe('VOIDED');
    expect(h.lc).toEqual([]);
    expect(h.events.map((e) => e.payload.reason)).toEqual(['teen_practice_expired']);
  });
});
