// ARENA-AGE-1 v5 — Cyber v4 review C2: the teen daily prize cap and the open practice-duel limit are both read under
// the account's User-row lock (lib/arena-teen.ts lockTeenAccount), never under a PlayerProfile row that may not exist
// yet. The fake database below really serializes FOR UPDATE on a row that exists and locks nothing on a row that
// doesn't (as Postgres does), so these tests fail if the lock is missing, targets an absent row, or comes after the
// count or the sum.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  rows: { User: new Set<string>(), PlayerProfile: new Set<string>() } as Record<string, Set<string>>,
  tails: new Map<string, Promise<void>>(),
  ledger: [] as Array<{ delta: number; at: Date; key: string }>,
  matches: [] as Array<Record<string, unknown>>,
  calls: [] as string[],
  outsideCount: 0,
}));
const tick = () => new Promise<void>((r) => setTimeout(r, 5));

vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ user: { id: 'kid' } })) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/analytics-server', () => ({ recordServerEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/wallet/wallet-service', () => ({
  applyLc: vi.fn(async (_db: unknown, a: { delta: number; idempotencyKey: string }) => {
    h.calls.push('pay');
    await tick();
    h.ledger.push({ delta: a.delta, at: new Date(), key: a.idempotencyKey });
    return { balanceAfter: 0 };
  }),
  WalletError: class WalletError extends Error { code = ''; },
  readWallet: vi.fn(async () => ({ lc: 0 })),
}));
vi.mock('@/lib/arena-rivals', async (orig) => ({
  ...(await orig<typeof import('@/lib/arena-rivals')>()),
  ensureHouseRivals: vi.fn(async () => new Map((await orig<typeof import('@/lib/arena-rivals')>()).HOUSE_RIVALS.map((r) => [r.key, 'house']))),
}));
vi.mock('@/lib/arena', async (orig) => ({ ...(await orig<typeof import('@/lib/arena')>()), appendMatchEvent: vi.fn(async () => undefined) }));

/** One transaction against the fake DB: FOR UPDATE on an existing row waits for that row; on a missing row, no lock. */
async function runTx<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  const held: Array<() => void> = [];
  const tx = {
    $queryRawUnsafe: async (sql: string, id: string) => {
      const table = /FROM\s+"(\w+)"/.exec(sql)?.[1] ?? '?';
      h.calls.push(`lock:${table}`);
      if (!/FOR UPDATE/.test(sql) || !h.rows[table]?.has(id)) return [];
      const k = `${table}:${id}`;
      const prev = h.tails.get(k) ?? Promise.resolve();
      let release!: () => void;
      const mine = new Promise<void>((r) => { release = r; });
      h.tails.set(k, prev.then(() => mine));
      await prev;
      held.push(release);
      return [{ '?column?': 1 }];
    },
    walletLedgerEntry: {
      aggregate: async ({ where }: { where: { createdAt: { gte: Date } } }) => {
        h.calls.push('sum');
        const s = h.ledger.filter((e) => e.at >= where.createdAt.gte).reduce((n, e) => n + e.delta, 0);
        await tick();
        return { _sum: { delta: s } };
      },
    },
    competitionMatch: {
      count: async ({ where }: { where: Record<string, unknown> }) => {
        h.calls.push('count');
        const n = h.matches.filter((m) => m.player1Id === where.player1Id && m.matchType === where.matchType && m.status === 'ACTIVE').length;
        await tick();
        return n;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        h.calls.push('create');
        const m = { id: `m${h.matches.length + 1}`, ...data };
        h.matches.push(m);
        return m;
      },
    },
  };
  try { return await fn(tx); } finally { held.forEach((r) => r()); }
}

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: async () => ({ dobYear: new Date().getFullYear() - 15 }) },
    competitionMatch: { count: async () => { h.outsideCount++; return 0; } },
    $transaction: (fn: (tx: any) => Promise<unknown>) => runTx(fn),
  },
}));

import { awardTeenPrize, lockTeenAccount, TEEN_ACCOUNT_LOCK_SQL, TEEN_DAILY_CAP_DEFAULT, TEEN_MAX_OPEN } from './arena-teen';
import { POST as teenPOST } from '../app/api/arena/teen-match/route';

const post = (body: unknown) => new Request('http://x/api', { method: 'POST', body: JSON.stringify(body) }) as never;

beforeEach(() => {
  // The account exists (User row) but has never had a PlayerProfile: the case a profile-row lock can't protect.
  h.rows = { User: new Set(['kid']), PlayerProfile: new Set() };
  h.tails = new Map(); h.ledger = []; h.matches = []; h.calls = []; h.outsideCount = 0;
});

describe('C2a: the teen daily prize cap is read under the User-row lock', () => {
  it('the lock is the User row, by the session user id, FOR UPDATE', async () => {
    expect(TEEN_ACCOUNT_LOCK_SQL).toMatch(/^SELECT 1 FROM "User" WHERE "id" = \$1 FOR UPDATE$/);
    const seen: unknown[][] = [];
    await lockTeenAccount({ $queryRawUnsafe: async (...a: unknown[]) => { seen.push(a); return []; } }, 'kid');
    expect(seen).toEqual([[TEEN_ACCOUNT_LOCK_SQL, 'kid']]);
  });

  it('the lock is taken before the sum and the payment', async () => {
    await runTx((tx) => awardTeenPrize(tx, { userId: 'kid', matchId: 'a' }));
    expect(h.calls).toEqual(['lock:User', 'sum', 'pay']);
  });

  it('two wins submitted at the same instant near the cap pay only what fits (no profile row yet)', async () => {
    h.ledger = [{ delta: 90, at: new Date(), key: 'earlier' }];
    const [a, b] = await Promise.all([
      runTx((tx) => awardTeenPrize(tx, { userId: 'kid', matchId: 'x1' })),
      runTx((tx) => awardTeenPrize(tx, { userId: 'kid', matchId: 'x2' })),
    ]);
    expect(a.awarded + b.awarded).toBe(10);
    expect(h.ledger.reduce((n, e) => n + e.delta, 0)).toBe(TEEN_DAILY_CAP_DEFAULT);
  });

  it('ten wins at once from zero pay exactly the daily cap, never more', async () => {
    const out = await Promise.all(Array.from({ length: 10 }, (_, i) => runTx((tx) => awardTeenPrize(tx, { userId: 'kid', matchId: `w${i}` }))));
    expect(out.reduce((n, r) => n + r.awarded, 0)).toBe(TEEN_DAILY_CAP_DEFAULT);
  });
});

describe('C2b: the open practice-duel count runs inside the locked create transaction', () => {
  it('order is lock (User) → count → create, all on the transaction; nothing counted outside it', async () => {
    const res = await teenPOST(post({ mode: 'threePoint' }));
    expect(res.status).toBe(200);
    expect(h.calls).toEqual(['lock:User', 'count', 'create']);
    expect(h.outsideCount).toBe(0);
  });

  it('at the limit: 409 TOO_MANY_OPEN with the same body as before, and no duel is created', async () => {
    h.matches = Array.from({ length: TEEN_MAX_OPEN }, (_, i) => ({ id: `o${i}`, player1Id: 'kid', matchType: 'TEEN_PRACTICE', status: 'ACTIVE' }));
    const res = await teenPOST(post({ mode: 'threePoint' }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'TOO_MANY_OPEN', detail: 'Finish one of your practice duels first.' });
    expect(h.matches.length).toBe(TEEN_MAX_OPEN);
    expect(h.calls).not.toContain('create');
  });

  it('two requests at once with one slot left: exactly one duel opens, the other gets 409', async () => {
    h.matches = Array.from({ length: TEEN_MAX_OPEN - 1 }, (_, i) => ({ id: `o${i}`, player1Id: 'kid', matchType: 'TEEN_PRACTICE', status: 'ACTIVE' }));
    const res = await Promise.all([teenPOST(post({ mode: 'threePoint' })), teenPOST(post({ mode: 'threePoint' }))]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(h.matches.length).toBe(TEEN_MAX_OPEN);
  });
});
