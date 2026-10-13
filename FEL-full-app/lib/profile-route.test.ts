// GET /api/profile, DRIVEN (no database). QA P0-01 (2026-09-27).
//
// The route returned `prq: prqScore(profile)`, the mean of the random attributes a new profile is seeded with, and every
// header badge printed it. It now also returns `prqDisplay`, read from PrqEntry rows only: a user with none gets a null
// score, whatever the seeded profile says. `prq`/`grade` stay (the modes' difficulty reads them).

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
vi.mock('next-auth', () => ({ getServerSession: (...a: unknown[]) => getServerSession(...a) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

const SEEDED = { userId: 'u1', strength: 52, speed: 52, endurance: 52, agility: 52, power: 52, flexibility: 52, recovery: 52, mental: 52 };
vi.mock('@/lib/profile-service', () => ({ getOrCreateProfile: async () => ({ ...SEEDED }) }));
vi.mock('@/lib/wallet/wallet-service', () => ({ readWallet: async () => ({ coins: 0, shards: 0, lc: 500 }) }));

const prqEntryFindMany = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: {
    facilitatorProfile: { findUnique: async () => null },
    coachClient: { findFirst: async () => null },
    prqEntry: { findMany: (...a: unknown[]) => prqEntryFindMany(...a) },
  },
}));

import { GET } from '@/app/api/profile/route';

async function get() {
  const res = await GET();
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  getServerSession.mockResolvedValue({ user: { id: 'u1' } });
  prqEntryFindMany.mockReset();
});

describe('GET /api/profile: prqDisplay', () => {
  it('a user with no PrqEntry gets a null display score (the seeded 52 stays on prq only)', async () => {
    prqEntryFindMany.mockResolvedValue([]);
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.body.prqDisplay.score).toBeNull();
    expect(r.body.prqDisplay.label).toBe('PRQ —');
    expect(r.body.prqMeasured).toBe(0);
    expect(r.body.prqTotal).toBe(8);
    expect(r.body.prq).toBe(52);                 // gameplay still reads the seeded profile ([DECISION-EJ])
    expect(r.body.grade.key).toBe('READY');
  });

  it('two measured attributes: the traceable mean with 2/8 coverage', async () => {
    const at = new Date('2026-09-27T00:00:00Z');
    prqEntryFindMany.mockResolvedValue([
      { id: 'e1', attribute: 'power', value: 60, unit: 'score', source: 'manual', measuredAt: at },
      { id: 'e2', attribute: 'speed', value: 55, unit: 'score', source: 'manual', measuredAt: at },
    ]);
    const r = await get();
    expect(r.body.prqDisplay.score).toBe(57.5);
    expect(r.body.prqDisplay.badge).toBe('PRQ 58 · READY · 2/8');
    expect(r.body.prqMeasured).toBe(2);
  });

  it('a failed PrqEntry read is NOT MEASURED, not a 500 and not the seeded number', async () => {
    prqEntryFindMany.mockRejectedValue(new Error('db down'));
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.body.prqDisplay.score).toBeNull();
  });

  it('signed out is still 401', async () => {
    getServerSession.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
  });
});
