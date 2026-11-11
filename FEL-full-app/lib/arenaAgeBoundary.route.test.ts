// ARENA-AGE-1 v5 — Cyber v4 review follow-ups 1 and 4. On a FIXED date (the rule reads the local calendar year,
// lib/age/ageRules.ts isVerifiedAdultStrict): a year gap of exactly 18 is refused 403 on all three entry routes (join,
// quick-match, create) and is sent to practice by teen-match; a gap of 19 gets through the entry routes and is sent to
// Quick Match by teen-match. An age, band or birth year sent by the client is ignored: only the DB birth year counts.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  dob: null as number | null,
  reads: [] as unknown[],
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
    user: { findUnique: async (args: unknown) => { h.reads.push(args); return { dobYear: h.dob }; } },
    competitionMatch: { count: async () => 0 },
    $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
  },
}));

import { POST as createPOST } from '../app/api/arena/create/route';
import { POST as joinPOST } from '../app/api/arena/join/route';
import { POST as quickPOST } from '../app/api/arena/quick-match/route';
import { POST as teenPOST } from '../app/api/arena/teen-match/route';

const post = (body: unknown) => new Request('http://x/api', { method: 'POST', body: JSON.stringify(body) }) as never;
// Local noon, mid-year: far from any year boundary in every time zone the suite might run in.
const NOW = new Date(2026, 5, 15, 12, 0, 0);
const EXACT_18 = 2026 - 18; // 2008: may still be 17 on this date — strict rule says not a verified adult
const JUST_19 = 2026 - 19; // 2007: verified adult

beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); });
afterAll(() => { vi.useRealTimers(); });
beforeEach(() => {
  h.reads = []; h.created = []; h.locks = []; h.lc = [];
  h.match = { id: 'd-1', currency: 'LC', status: 'WAITING', mode: 'threePoint', matchType: 'SCORE_DUEL', player1Id: 'adult-1', player2Id: null, entryFeeCents: 50, rakePercent: 10, expiresAt: new Date(NOW.getTime() + 3_600_000) };
});

describe(`a year gap of exactly 18 (born ${EXACT_18}, today ${NOW.toDateString()})`, () => {
  beforeEach(() => { h.dob = EXACT_18; });
  it('join: 403 under_18, no entry locked, the duel stays WAITING', async () => {
    const res = await joinPOST(post({ matchId: 'd-1' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'adults_only', reason: 'under_18' });
    expect(h.locks).toEqual([]);
    expect(h.match!.status).toBe('WAITING');
  });
  it('quick-match: 403 under_18, no row, no entry', async () => {
    const res = await quickPOST(post({ mode: 'threePoint', feeLc: 50 }));
    expect(res.status).toBe(403);
    expect((await res.json()).reason).toBe('under_18');
    expect(h.created).toEqual([]);
    expect(h.locks).toEqual([]);
  });
  it('create: 403 under_18', async () => {
    expect((await createPOST(post({ mode: 'threePoint', feeLc: 50 }))).status).toBe(403);
    expect(h.created).toEqual([]);
  });
  it('teen-match: 200, a free practice duel', async () => {
    const res = await teenPOST(post({ mode: 'threePoint' }));
    expect(res.status).toBe(200);
    expect(h.created[0]).toMatchObject({ matchType: 'TEEN_PRACTICE', entryFeeCents: 0, rakePercent: 0 });
  });
});

describe(`a year gap of 19 (born ${JUST_19}, today ${NOW.toDateString()})`, () => {
  beforeEach(() => { h.dob = JUST_19; });
  it('join: 200, the entry is locked', async () => {
    expect((await joinPOST(post({ matchId: 'd-1' }))).status).toBe(200);
    expect(h.locks.length).toBe(1);
  });
  it('quick-match: 200', async () => {
    expect((await quickPOST(post({ mode: 'threePoint', feeLc: 50 }))).status).toBe(200);
  });
  it('create: 200', async () => {
    expect((await createPOST(post({ mode: 'threePoint', feeLc: 50 }))).status).toBe(200);
  });
  it('teen-match: 400 use_quick_match, nothing created', async () => {
    const res = await teenPOST(post({ mode: 'threePoint' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('use_quick_match');
    expect(h.created).toEqual([]);
  });
});

describe('an age sent by the client is ignored', () => {
  const claimsAdult = { dobYear: 1990, band: 'adult', age: 30, birthYear: 1990, isAdult: true };
  beforeEach(() => { h.dob = 2026 - 15; });

  it('a teen claiming to be 30 is still refused 403 under_18 on join, quick-match and create', async () => {
    const r1 = await joinPOST(post({ matchId: 'd-1', ...claimsAdult }));
    const r2 = await quickPOST(post({ mode: 'threePoint', feeLc: 50, ...claimsAdult }));
    const r3 = await createPOST(post({ mode: 'threePoint', feeLc: 50, ...claimsAdult }));
    for (const r of [r1, r2, r3]) {
      expect(r.status).toBe(403);
      expect((await r.json()).reason).toBe('under_18');
    }
    expect(h.locks).toEqual([]);
    expect(h.created).toEqual([]);
    expect(h.lc).toEqual([]);
  });

  it('the age is read from the DB by the session user id, never from the body', async () => {
    await joinPOST(post({ matchId: 'd-1', ...claimsAdult, userId: 'adult-1' }));
    expect(h.reads.length).toBeGreaterThan(0);
    for (const r of h.reads) expect(JSON.stringify(r)).toContain('"kid"');
    for (const r of h.reads) expect(JSON.stringify(r)).not.toContain('adult-1');
  });

  it('an adult claiming to be a teen is still sent to Quick Match by teen-match', async () => {
    h.dob = 1990;
    const res = await teenPOST(post({ mode: 'threePoint', dobYear: 2026 - 15, band: 'teen', age: 15 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('use_quick_match');
    expect(h.created).toEqual([]);
  });
});
