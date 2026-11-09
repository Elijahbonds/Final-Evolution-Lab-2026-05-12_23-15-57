// ARENA-AGE-1 — Cyber F1 fix 1 / addendum T5 (and EOU-36 "403 on adult route"): the adult entry routes (create, join,
// quick-match) refuse a teen, an unknown age and a failed age read with 403 adults_only and a plain reason, BEFORE any
// row is created or any Lab Credits move; a verified adult still gets through. The practice route refuses an adult.
// Routes run for real; auth and the database are mocked (no DATABASE_URL, no network).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  dob: null as number | null | 'throw',
  created: [] as Record<string, unknown>[],
  locks: [] as unknown[],
  lc: [] as unknown[],
  match: null as Record<string, unknown> | null,
}));

vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ user: { id: 'kid' } })) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/analytics-server', () => ({ recordServerEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/wallet/wallet-service', () => ({
  applyLc: vi.fn(async (_db: unknown, a: unknown) => { h.lc.push(a); return { balanceAfter: 0 }; }),
  WalletError: class WalletError extends Error { code = ''; },
  readWallet: vi.fn(async () => ({ lc: 0 })),
}));
vi.mock('@/lib/arena-rivals', async (orig) => ({
  ...(await orig<typeof import('@/lib/arena-rivals')>()),
  ensureHouseRivals: vi.fn(async () => new Map((await orig<typeof import('@/lib/arena-rivals')>()).HOUSE_RIVALS.map((r) => [r.key, 'house']))),
}));
vi.mock('@/lib/arena', async (orig) => ({
  ...(await orig<typeof import('@/lib/arena')>()),
  arenaLockEntry: vi.fn(async (_tx: unknown, o: unknown) => { h.locks.push(o); return 0; }),
  appendMatchEvent: vi.fn(async () => undefined),
}));
const tx = {
  $queryRawUnsafe: async () => [],
  competitionMatch: {
    count: async () => 0,
    create: async ({ data }: { data: Record<string, unknown> }) => { h.created.push(data); return { id: `m${h.created.length}`, ...data }; },
    findUnique: async () => (h.match ? { ...h.match } : null),
    update: async ({ data }: { data: Record<string, unknown> }) => ({ ...h.match, ...data }),
  },
};
vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: async () => {
        if (h.dob === 'throw') throw new Error('db down');
        return { dobYear: h.dob };
      },
    },
    competitionMatch: { count: async () => 0 },
    $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
  },
}));

import { POST as createPOST } from '../app/api/arena/create/route';
import { POST as joinPOST } from '../app/api/arena/join/route';
import { POST as quickPOST } from '../app/api/arena/quick-match/route';
import { POST as teenPOST } from '../app/api/arena/teen-match/route';

const post = (body: unknown) => new Request('http://x/api', { method: 'POST', body: JSON.stringify(body) }) as never;
const year = new Date().getUTCFullYear();
const TEEN = year - 15;
const ADULT = year - 30;

beforeEach(() => {
  h.created = []; h.locks = []; h.lc = [];
  h.match = { id: 'd-1', currency: 'LC', status: 'WAITING', mode: 'threePoint', matchType: 'SCORE_DUEL', player1Id: 'adult-1', player2Id: null, entryFeeCents: 50, rakePercent: 10, expiresAt: new Date(Date.now() + 3_600_000) };
});

const refusals: Array<[string, number | null | 'throw', string]> = [
  ['a teen (15)', TEEN, 'under_18'],
  ['an unknown age (no birth year)', null, 'age_unknown'],
  ['a failed age read', 'throw', 'age_unknown'],
];

describe.each(refusals)('%s', (_label, dob, reason) => {
  beforeEach(() => { h.dob = dob; });

  it('create: 403 adults_only with a plain reason, no row, no LC', async () => {
    const res = await createPOST(post({ mode: 'threePoint', feeLc: 50 }));
    expect(res.status).toBe(403);
    const j = await res.json();
    expect(j).toMatchObject({ error: 'adults_only', reason });
    expect(typeof j.message).toBe('string');
    expect(j.message.length).toBeGreaterThan(20);
    if (reason === 'age_unknown') expect(j.addBirthYear).toBe('/age?next=%2Farena');
    expect(h.created).toEqual([]);
    expect(h.locks).toEqual([]);
    expect(h.lc).toEqual([]);
  });

  it('quick-match: 403 before the house roster, no row, no LC on either seat', async () => {
    const res = await quickPOST(post({ mode: 'threePoint', feeLc: 50 }));
    expect(res.status).toBe(403);
    expect((await res.json()).reason).toBe(reason);
    expect(h.created).toEqual([]);
    expect(h.locks).toEqual([]);
  });

  it('join: 403, the joiner\'s LC never moves and the duel stays WAITING', async () => {
    const res = await joinPOST(post({ matchId: 'd-1' }));
    expect(res.status).toBe(403);
    expect((await res.json()).reason).toBe(reason);
    expect(h.locks).toEqual([]);
    expect(h.match!.status).toBe('WAITING');
  });

  it('teen-match: opens a practice duel (the server picked the mode, not the client)', async () => {
    const res = await teenPOST(post({ mode: 'threePoint', feeLc: 500 }));
    expect(res.status).toBe(200);
    expect(h.created[0]).toMatchObject({ matchType: 'TEEN_PRACTICE', entryFeeCents: 0, rakePercent: 0 });
  });
});

describe('a verified adult', () => {
  beforeEach(() => { h.dob = ADULT; });
  it('still creates, quick-matches and joins entry duels', async () => {
    expect((await createPOST(post({ mode: 'threePoint', feeLc: 50 }))).status).toBe(200);
    expect((await quickPOST(post({ mode: 'threePoint', feeLc: 50 }))).status).toBe(200);
    expect((await joinPOST(post({ matchId: 'd-1' }))).status).toBe(200);
    expect(h.locks.length).toBe(4); // create 1 + quick 2 + join 1
  });
  it('is sent to Quick Match by the practice route (no free-prize door for adults)', async () => {
    const res = await teenPOST(post({ mode: 'threePoint' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('use_quick_match');
    expect(h.created).toEqual([]);
  });
});

describe('the exact 18th-birthday year is still refused (strict rule, lib/age/ageRules.ts)', () => {
  it('a year gap of exactly 18 is not a verified adult', async () => {
    h.dob = year - 18;
    const res = await createPOST(post({ mode: 'threePoint', feeLc: 50 }));
    expect(res.status).toBe(403);
  });
});
