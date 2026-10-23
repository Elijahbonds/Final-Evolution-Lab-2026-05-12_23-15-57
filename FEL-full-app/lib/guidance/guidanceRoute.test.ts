// GET /api/guidance, DRIVEN — a counsellor cannot mistake a broken read for "no history".
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  session: { user: { id: 'u1' } } as unknown,
  sessions: [] as { mode: string; createdAt: Date }[],
  cards: [] as { primary: string | null }[],
  failSessions: false,
  failCards: false,
}));

vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  prisma: {
    gameSession: {
      findMany: async () => {
        if (h.failSessions) throw new Error('gameSession unavailable');
        return h.sessions;
      },
    },
    creativeCard: {
      findMany: async () => {
        if (h.failCards) throw new Error('creativeCard unavailable');
        return h.cards;
      },
    },
  },
}));

import { GET } from '@/app/api/guidance/route';

beforeEach(() => {
  h.session = { user: { id: 'u1' } };
  h.sessions = [];
  h.cards = [];
  h.failSessions = false;
  h.failCards = false;
});

describe('GET /api/guidance', () => {
  it('returns suggestions when storage reads succeed', async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ suggestions: expect.any(Array), evidence: expect.any(Object) });
  });

  it('fails closed when session history cannot be read', async () => {
    h.failSessions = true;

    const res = await GET();

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'unavailable' });
  });

  it('fails closed when creative-card history cannot be read', async () => {
    h.failCards = true;

    const res = await GET();

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'unavailable' });
  });

  it('keeps signed-out users unauthorized, not unavailable', async () => {
    h.session = null;

    const res = await GET();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });
});
