// ARENA-AGE-1 — Cyber addendum T3: the teen daily prize cap is enforced on the SERVER, under the player's row lock
// (lib/economy-caps-db.ts lockPlayerForDailyCap), per UTC day; the prize and cap are server settings with safe fallbacks.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ ledger: [] as Array<{ delta: number; at: Date }>, order: [] as string[] }));
vi.mock('@/lib/wallet/wallet-service', () => ({
  applyLc: vi.fn(async (_db: unknown, a: { delta: number }) => { h.order.push('pay'); h.ledger.push({ delta: a.delta, at: new Date() }); return { balanceAfter: 0 }; }),
}));

import { awardTeenPrize, teenPrizeFor, teenPrizeLc, teenDailyCapLc, TEEN_PRIZE_DEFAULT, TEEN_DAILY_CAP_DEFAULT } from './arena-teen';
import { utcDayStart } from './economy-caps';

const tx = {
  $queryRawUnsafe: vi.fn(async (sql: string) => { h.order.push(sql.includes('FOR UPDATE') ? 'lock' : 'sql'); return []; }),
  walletLedgerEntry: {
    aggregate: vi.fn(async ({ where }: { where: { createdAt: { gte: Date }; reasonCode: string } }) => {
      h.order.push('sum');
      expect(where.reasonCode).toBe('ARENA_TEEN_PRIZE');
      return { _sum: { delta: h.ledger.filter((e) => e.at >= where.createdAt.gte).reduce((s, e) => s + e.delta, 0) } };
    }),
  },
};

beforeEach(() => { h.ledger = []; h.order = []; });

describe('teen daily prize cap', () => {
  it('defaults are 25 per win and 100 per day (PM 2026-11-04, pending Elijah approval)', () => {
    expect(TEEN_PRIZE_DEFAULT).toBe(25);
    expect(TEEN_DAILY_CAP_DEFAULT).toBe(100);
  });

  it('ten wins in one UTC day pay at most the cap', async () => {
    let total = 0;
    for (let i = 0; i < 10; i++) total += (await awardTeenPrize(tx, { userId: 'kid', matchId: `m${i}` })).awarded;
    expect(total).toBe(TEEN_DAILY_CAP_DEFAULT);
    expect(h.ledger.reduce((s, e) => s + e.delta, 0)).toBeLessThanOrEqual(TEEN_DAILY_CAP_DEFAULT);
  });

  it('the row lock is taken before the sum is read, every time', async () => {
    await awardTeenPrize(tx, { userId: 'kid', matchId: 'a' });
    expect(h.order.slice(0, 2)).toEqual(['lock', 'sum']);
  });

  it('at the cap it pays nothing and says capped', async () => {
    h.ledger = [{ delta: 100, at: new Date() }];
    expect(await awardTeenPrize(tx, { userId: 'kid', matchId: 'z' })).toEqual({ awarded: 0, capped: true });
  });

  it('a partial last prize fills exactly to the cap', () => {
    expect(teenPrizeFor(90, 25, 100)).toBe(10);
    expect(teenPrizeFor(0, 25, 100)).toBe(25);
    expect(teenPrizeFor(150, 25, 100)).toBe(0);
  });

  it('yesterday\'s prizes do not count toward today (UTC day)', async () => {
    h.ledger = [{ delta: 100, at: new Date(utcDayStart(new Date()).getTime() - 1000) }];
    expect((await awardTeenPrize(tx, { userId: 'kid', matchId: 'y' })).awarded).toBe(25);
  });

  it('settings: valid overrides apply; junk, zero, negative or huge values fall back', () => {
    expect(teenPrizeLc({ TEEN_ARENA_PRIZE_LC: '10' })).toBe(10);
    expect(teenDailyCapLc({ TEEN_ARENA_DAILY_LC_CAP: '50' })).toBe(50);
    for (const bad of ['', 'abc', '0', '-5', '2.5', '100000']) {
      expect(teenPrizeLc({ TEEN_ARENA_PRIZE_LC: bad })).toBe(25);
      expect(teenDailyCapLc({ TEEN_ARENA_DAILY_LC_CAP: bad })).toBe(100);
    }
  });
});
