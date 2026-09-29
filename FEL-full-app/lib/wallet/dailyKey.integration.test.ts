// DAILY-KEY-HOTFIX (2026-09-28): the daily rewards against a REAL Postgres. The unit cases (dailyClaim.test.ts), run
// through the real route handlers, the real earn() / awardCredits() and the real Prisma client. Only the signed-in session
// is mocked.
//
// Opt-in and local-only, like sessionRuns.integration.test.ts. It runs when DAILY_IT=1 (or SESSIONS_IT=1) and
// DATABASE_URL points at a database on 127.0.0.1 / localhost that is not fel_dev or fel: a throwaway one with this
// schema applied. It is skipped everywhere else, CI included. What the in-memory database cannot show, this does: the
// unique WalletLedgerEntry.idempotencyKey and CreditLedger (userId, dedupeKey) really refuse the second of two claims
// sent together, and the loser answers already claimed, not a 500.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const DB_URL = process.env.DATABASE_URL ?? '';
const LOCAL_DB = /^postgres(?:ql)?:\/\/[^/]*@(?:127\.0\.0\.1|localhost)(?::\d+)?\/(?!fel_dev(?:[?]|$)|fel(?:[?]|$))[\w-]+(?:\?.*)?$/.test(DB_URL);
const RUN = (process.env.DAILY_IT === '1' || process.env.SESSIONS_IT === '1') && LOCAL_DB;

const h = vi.hoisted(() => ({ userId: '' }));
vi.mock('next-auth', () => ({ getServerSession: async () => (h.userId ? { user: { id: h.userId } } : null) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

type Json = Record<string, any>;
let prisma: any;
let v1Earn: (req: any) => Promise<Response>;
let lcEarn: (req: Request) => Promise<Response>;
let earn: typeof import('./wallet-service').earn;
let awardCredits: typeof import('@/lib/economy').awardCredits;
let ptDay: typeof import('./dailyKey').ptDay;
const TAG = `dk${Date.now().toString(36)}`;
const ARENA = 'arena-coins@fel.local';
const users: Record<string, { id: string; email: string }> = {};

async function call(fn: (r: any) => Promise<Response>, url: string, body: unknown) {
  const res = await fn(new Request(`http://127.0.0.1:3100${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: res.status, body: (await res.json()) as Json };
}
const as = (who: string) => { h.userId = users[who].id; };
const daily = (key?: string) => call(v1Earn, '/api/v1/wallet/earn', { ...(key === undefined ? {} : { idempotency_key: key }), event_type: 'daily_first_session', payload: { source: 'wallet-chip' } });
const streak = (body: Json = {}) => call(lcEarn, '/api/wallet/earn', { reason: 'daily_streak', ...body });
const dailyRows = (who: string) => prisma.walletLedgerEntry.count({ where: { wallet: { playerId: users[who].id }, reasonCode: 'DAILY_FIRST_SESSION' } });
const walletRows = (who: string) => prisma.walletLedgerEntry.count({ where: { wallet: { playerId: users[who].id } } });
const events = (who: string) => prisma.perfEarnEvent.count({ where: { playerId: users[who].id } });
const streakRows = (who: string) => prisma.creditLedger.count({ where: { userId: users[who].id, reason: 'DAILY_STREAK' } });
const coins = async (who: string) => Number((await prisma.wallet.findUnique({ where: { playerId: users[who].id } }))?.coins ?? 0);

describe.skipIf(!RUN)('DAILY-KEY-HOTFIX against a real throwaway Postgres (DAILY_IT=1)', () => {
  beforeAll(async () => {
    ({ prisma } = await import('@/lib/db'));
    ({ POST: v1Earn } = await import('@/app/api/v1/wallet/earn/route'));
    ({ POST: lcEarn } = await import('@/app/api/wallet/earn/route'));
    ({ earn } = await import('./wallet-service'));
    ({ awardCredits } = await import('@/lib/economy'));
    ({ ptDay } = await import('./dailyKey'));
    // the database this touches, said out loud before anything is written
    const [{ db }] = await prisma.$queryRawUnsafe('SELECT current_database() AS db');
    expect(db).not.toMatch(/^fel(_dev)?$/);
    await prisma.user.deleteMany({ where: { email: ARENA } });   // a leftover from an earlier run of this file, in this throwaway DB
    const who = ['forger', 'twotabs1', 'twotabs2', 'twotabs3', 'oldid', 'oldemail', 'edge', 'streak', 'streakpar', 'streakold', 'streakedge', 'listed', 'listedid', 'tester'];
    for (const w of who) {
      const u = await prisma.user.create({ data: { email: `${TAG}-${w}@example.test`, password: 'x', role: w === 'tester' ? 'test' : 'player' } });
      users[w] = { id: u.id, email: u.email };
    }
    const a = await prisma.user.create({ data: { email: ARENA, password: 'x', role: 'player' } });
    users.arena = { id: a.id, email: a.email };
  });

  afterAll(async () => {
    delete process.env.FEL_TEST_ACCOUNTS;
    if (!prisma) return;
    await prisma.user.deleteMany({ where: { OR: [{ email: { startsWith: `${TAG}-` } }, { email: ARENA }] } });
    await prisma.$disconnect();
  });

  it('FORGED KEY (daily_first_session): pays once; `:qa-forged`, any other key and no key are already claimed, and no row is written', async () => {
    as('forger');
    const real = `daily_first_session:${ptDay()}:${users.forger.id}`;
    const first = await daily(real);
    expect(first.body).toMatchObject({ granted: { coins: 100, shards: 0 }, replayed: false, already_claimed: false, rejected: null });
    for (const key of [`${real}:qa-forged`, `${TAG}-anything`, undefined]) {
      const r = await daily(key);
      expect(r.status, String(key)).toBe(200);
      expect(r.body, String(key)).toMatchObject({ granted: { coins: 0, shards: 0 }, already_claimed: true, replayed: true, entry_id: first.body.entry_id });
    }
    expect(await dailyRows('forger')).toBe(1);
    expect(await coins('forger')).toBe(100);
  });

  it('PARALLEL (daily_first_session): four claims together, four different keys → one credit, three already claimed, one row, no 500', async () => {
    for (const w of ['twotabs1', 'twotabs2', 'twotabs3']) {
      as(w);
      const r = await Promise.all([1, 2, 3, 4].map((i) => daily(`daily_first_session:${ptDay()}:${users[w].id}:tab${i}`)));
      expect(r.map((x) => x.status), w).toEqual([200, 200, 200, 200]);
      expect(r.map((x) => x.body.granted.coins).sort((p, q) => p - q), w).toEqual([0, 0, 0, 100]);
      expect(r.filter((x) => x.body.already_claimed).length, w).toBe(3);
      expect(r.map((x) => x.body.rejected), w).toEqual([null, null, null, null]);   // never replay_detected
      expect(await dailyRows(w), w).toBe(1);
      expect(await coins(w), w).toBe(100);
    }
  });

  it('OLD KEY (daily_first_session): a claim made earlier today under the chip\'s old key (id or email, the browser\'s day) → already claimed', async () => {
    for (const [w, keyOf] of [
      ['oldid', (u: { id: string }) => `daily_first_session:2099-12-31:${u.id}`],   // a browser whose day was not PT's
      ['oldemail', (u: { email: string }) => `daily_first_session:${ptDay()}:${u.email}`],
    ] as const) {
      const u = users[w];
      const wallet = await prisma.wallet.create({ data: { playerId: u.id, coins: BigInt(100), version: BigInt(1) } });
      await prisma.walletLedgerEntry.create({ data: { walletId: wallet.id, currency: 'coins', delta: BigInt(100), balanceAfter: BigInt(100), reasonCode: 'DAILY_FIRST_SESSION', source: 'gameplay', idempotencyKey: keyOf(u as never), metadata: {} } });
      h.userId = u.id;
      expect((await daily()).body, w).toMatchObject({ granted: { coins: 0, shards: 0 }, already_claimed: true });
      expect(await dailyRows(w), w).toBe(1);
      expect(await coins(w), w).toBe(100);
    }
  });

  it('PT BOUNDARY (earn(), server clock): 23:59:59 / 00:00:01 PT are two credits; 16:59 / 17:01 PDT are one', async () => {
    const u = users.edge;
    const at = (iso: string) => earn(prisma, { playerId: u.id, idempotencyKey: 'same-client-key', eventType: 'daily_first_session', payload: {}, now: new Date(iso) });
    expect((await at('2026-01-15T23:59:59-08:00')).granted.coins).toBe(100);
    expect((await at('2026-01-16T00:00:01-08:00')).granted.coins).toBe(100);
    expect((await at('2026-07-15T23:59:59-07:00')).granted.coins).toBe(100);
    expect((await at('2026-07-16T00:00:01-07:00')).granted.coins).toBe(100);
    expect((await at('2026-08-15T16:59:00-07:00')).granted.coins).toBe(100);
    expect(await at('2026-08-15T17:01:00-07:00')).toMatchObject({ granted: { coins: 0 }, alreadyClaimed: true });
    const keys = (await prisma.walletLedgerEntry.findMany({ where: { wallet: { playerId: u.id } }, select: { idempotencyKey: true } })).map((r: Json) => r.idempotencyKey).sort();
    expect(keys).toEqual(['2026-01-15', '2026-01-16', '2026-07-15', '2026-07-16', '2026-08-15'].map((d) => `daily_first_session:${d}:${u.id}`));
  });

  it('FORGED INPUTS (daily_streak): a second claim today with its own dedupeKey, day, now and amount is a duplicate, no row', async () => {
    as('streak');
    const forged = { dedupeKey: 'streak:2099-01-01', idempotency_key: 'streak:2099-01-01', day: '2099-01-01', now: '2099-01-01T12:00:00Z', amount: 9999 };
    expect((await streak(forged)).body).toMatchObject({ ok: true, awarded: 5, duplicate: false });
    expect((await prisma.creditLedger.findMany({ where: { userId: users.streak.id } })).map((r: Json) => r.dedupeKey)).toEqual([`streak:${ptDay()}`]);
    expect((await streak(forged)).body).toMatchObject({ ok: true, awarded: 0, duplicate: true });
    expect((await streak()).body).toMatchObject({ awarded: 0, duplicate: true });
    expect(await streakRows('streak')).toBe(1);
  });

  it('PARALLEL (daily_streak): three claims together → one credit, two duplicates, one row, no 500', async () => {
    as('streakpar');
    const r = await Promise.all([1, 2, 3].map((i) => streak({ dedupeKey: `x${i}` })));
    expect(r.map((x) => x.status)).toEqual([200, 200, 200]);
    expect(r.map((x) => x.body.awarded).sort((p, q) => p - q)).toEqual([0, 0, 5]);
    expect(await streakRows('streakpar')).toBe(1);
  });

  it('OLD UTC KEY (daily_streak): a streak written earlier today under the UTC key that named tomorrow → no pay today', async () => {
    const u = users.streakold;
    await prisma.creditLedger.create({ data: { userId: u.id, amount: 5, reason: 'DAILY_STREAK', dedupeKey: 'streak:2099-12-31', balanceAfter: 5 } });
    as('streakold');
    expect((await streak()).body).toMatchObject({ ok: true, awarded: 0, duplicate: true, balance: 5 });
    expect(await streakRows('streakold')).toBe(1);
  });

  it('PT BOUNDARY (awardCredits, the streak key): 23:59:59 / 00:00:01 PT are two credits; 16:59 / 17:01 PDT are one', async () => {
    const id = users.streakedge.id;
    const at = (iso: string) => awardCredits(prisma, id, { kind: 'daily_streak', now: new Date(iso) });
    expect((await at('2026-01-15T23:59:59-08:00')).awarded).toBe(true);
    expect((await at('2026-01-16T00:00:01-08:00')).awarded).toBe(true);
    expect((await at('2026-08-15T16:59:00-07:00')).awarded).toBe(true);
    expect(await at('2026-08-15T17:01:00-07:00')).toMatchObject({ awarded: false, duplicate: true });
    const keys = (await prisma.creditLedger.findMany({ where: { userId: id }, select: { dedupeKey: true } })).map((r: Json) => r.dedupeKey).sort();
    expect(keys).toEqual(['streak:2026-01-15', 'streak:2026-01-16', 'streak:2026-08-15']);
  });

  it('TEST ACCOUNTS (by FEL_TEST_ACCOUNTS email, by id, by role test): both routes pay 0 with the marker and write nothing, forged key or not', async () => {
    process.env.FEL_TEST_ACCOUNTS = `${users.listed.email.toUpperCase()},${users.listedid.id},someone-else@fel.local`;
    try {
      for (const w of ['listed', 'listedid', 'tester']) {
        as(w);
        for (const key of [`daily_first_session:${ptDay()}:${users[w].id}`, `daily_first_session:${ptDay()}:${users[w].id}:qa-forged`]) {
          const r = await daily(key);
          expect(r.status, w).toBe(200);
          expect(r.body, w).toMatchObject({ granted: { coins: 0, shards: 0 }, rejected: 'test_account', reason: 'TEST_ACCOUNT', entry_id: null });
        }
        expect((await streak()).body, w).toMatchObject({ ok: true, awarded: 0, rejected: 'test_account' });
        expect(await walletRows(w), w).toBe(0);
        expect(await events(w), w).toBe(0);
        expect(await prisma.creditLedger.count({ where: { userId: users[w].id } }), w).toBe(0);
      }
    } finally {
      delete process.env.FEL_TEST_ACCOUNTS;
    }
  });

  it('a NORMAL account (arena-coins@fel.local, role player, not on the list) is paid exactly once for each daily', async () => {
    process.env.FEL_TEST_ACCOUNTS = `${users.listed.email},playtest@fel.local`;
    try {
      as('arena');
      expect((await daily(`daily_first_session:${ptDay()}:${users.arena.id}`)).body).toMatchObject({ granted: { coins: 100 }, already_claimed: false, rejected: null });
      expect((await daily(`daily_first_session:${ptDay()}:${users.arena.id}:qa-forged`)).body).toMatchObject({ granted: { coins: 0 }, already_claimed: true });
      expect(await dailyRows('arena')).toBe(1);
      expect(await coins('arena')).toBe(100);
      expect((await streak()).body).toMatchObject({ awarded: 5, duplicate: false });
      expect((await streak()).body).toMatchObject({ awarded: 0, duplicate: true });
      expect(await streakRows('arena')).toBe(1);
    } finally {
      delete process.env.FEL_TEST_ACCOUNTS;
    }
  });
});
