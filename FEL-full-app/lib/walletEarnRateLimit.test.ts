// RATE-LIMIT-WIRE (QA top-5 #4, partial): POST /api/wallet/earn is limited per user on CreditLedger's existing
// @@index([userId, createdAt]) — lib/economy withinEarnVelocity, already in the route. QA listed the route as unlimited;
// this pins that it is not: past ECONOMY_CONFIG.antiFarm.maxEarnsPerWindow positive earns in the window it answers 429.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ recent: 0, counted: [] as unknown[] }));
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ user: { id: 'u1' } })) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: async () => ({ id: 'u1', email: 'player@example.com', role: 'user' }) },
    creditLedger: {
      count: async (args: unknown) => { h.counted.push(args); return h.recent; },
      findFirst: async () => ({ id: 'already-today' }),   // the day's streak is in: an under-limit call answers duplicate
      aggregate: async () => ({ _sum: { amount: 0 } }),
    },
    playerProfile: { findUnique: async () => ({ labCredits: 0 }) },
  },
}));

import { POST } from '@/app/api/wallet/earn/route';
import { ECONOMY_CONFIG } from '@/lib/economy';

const earn = async () => {
  const res = await POST(new Request('http://fel.local/api/wallet/earn', { method: 'POST', body: JSON.stringify({ reason: 'daily_streak' }) }));
  return res.status;
};

beforeEach(() => { h.recent = 0; h.counted = []; });

describe('wallet earn is rate limited per user', () => {
  it('over the window\'s limit: 429', async () => {
    h.recent = ECONOMY_CONFIG.antiFarm.maxEarnsPerWindow;
    expect(await earn()).toBe(429);
  });
  it('normal play stays under it', async () => {
    h.recent = 2;
    expect(await earn()).not.toBe(429);
  });
  it('the count is the user\'s own rows since the window opened (the [userId, createdAt] index)', async () => {
    await earn();
    expect(h.counted[0]).toMatchObject({ where: { userId: 'u1', createdAt: { gte: expect.any(Date) } } });
  });
});
