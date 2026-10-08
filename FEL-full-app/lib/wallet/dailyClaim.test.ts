import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@/public/_prisma/client';

// DAILY-KEY-HOTFIX (2026-09-28). Both earn routes run for real here, and so do earn() and awardCredits(). The stand-ins
// are the signed-in session and an in-memory database. The database keeps the two unique keys that matter:
// WalletLedgerEntry.idempotencyKey, and CreditLedger (userId, dedupeKey). It also rolls back a failed transaction. Every
// query yields once, so two claims sent together interleave the way two requests do.
// lib/wallet/dailyKey.integration.test.ts repeats the forged, parallel, old-key and test-account cases on a real Postgres.
//
// The evidence this answers: a1a1c5f9 item 5b on fel_dev, and production at 3a0f4edf (playtest@fel.local). A new
// client-chosen key, `…:qa-forged`, paid a second daily reward the same day, and the test account was paid at all.

const h = vi.hoisted(() => ({ db: null as unknown, session: null as unknown }));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ get prisma() { return h.db; } }));
// the wallet read's dead-buy sweep reads a dozen other tables; nothing here bought anything
vi.mock('@/lib/wallet/dead-buy-refunds', () => ({ refundDeadBuysOnRead: async () => false }));
// postLc's CreditLedger row is the lab-credit record (and carries the unique key); the house-book postings are not the subject
vi.mock('@/lib/ledger', () => ({
  postLc: async (db: { creditLedger: { create: (a: unknown) => Promise<{ id: string }> } }, i: { userId: string; amount: number; reason: string; dedupeKey?: string | null }) => {
    const row = await db.creditLedger.create({ data: { userId: i.userId, amount: i.amount, reason: i.reason, dedupeKey: i.dedupeKey ?? null }, select: { id: true } });
    return { creditLedgerId: row.id, transactionId: `tx_${row.id}` };
  },
}));

import { POST as v1Earn } from '@/app/api/v1/wallet/earn/route';
import { POST as lcEarn } from '@/app/api/wallet/earn/route';
import { dailyKey } from './dailyKey';

type Row = Record<string, any>;
const prismaUnique = (target: string) => new Prisma.PrismaClientKnownRequestError(`Unique constraint failed on the fields: (\`${target}\`)`, { code: 'P2002', clientVersion: 'test' });
const cmp = (x: unknown) => (x instanceof Date ? x.getTime() : typeof x === 'bigint' ? Number(x) : x) as number;

function makeDb() {
  const s = { users: [] as Row[], wallets: [] as Row[], entries: [] as Row[], events: [] as Row[], credits: [] as Row[], seq: 0 };
  // Under next dev the cached client throws P2002 from ANOTHER copy of the generated client, so it is not an instanceof
  // the Prisma class the wallet code imports (measured on :3100: the losing claim of two was a 500). With this set, the
  // database throws that kind of refusal: the code, without the class.
  const refusals = { foreignClass: false };
  const unique = (target: string) => (refusals.foreignClass
    ? Object.assign(new Error(`Unique constraint failed on the fields: (\`${target}\`)`), { code: 'P2002' })
    : prismaUnique(target));
  // a latch on the daily's same-day lookup: held until `need` claims reach it, so claims sent together all get past it
  const latch = { need: 0, arrived: 0, open: [] as Array<() => void> };
  const arrive = async () => {
    if (!latch.need) return;
    latch.arrived++;
    if (latch.arrived >= latch.need) { latch.open.splice(0).forEach((go) => go()); return; }
    await new Promise<void>((go) => latch.open.push(go));
  };
  const id = (p: string) => `${p}${++s.seq}`;
  const yieldNow = () => Promise.resolve();
  const match = (row: Row, where: Row = {}): boolean => Object.entries(where).every(([k, c]) => {
    if (k === 'wallet') { const w = s.wallets.find((x) => x.id === row.walletId); return !!w && match(w, c); }
    const v = row[k];
    if (c === null || typeof c !== 'object' || c instanceof Date) return cmp(v) === cmp(c);
    if ('not' in c && cmp(v) === cmp(c.not)) return false;
    if ('gte' in c && !(cmp(v) >= cmp(c.gte))) return false;
    if ('gt' in c && !(cmp(v) > cmp(c.gt))) return false;
    if ('lt' in c && !(cmp(v) < cmp(c.lt))) return false;
    if ('in' in c && !c.in.includes(v)) return false;
    if ('startsWith' in c && !(typeof v === 'string' && v.startsWith(c.startsWith))) return false;
    return true;
  });
  const byCreated = (dir: 'asc' | 'desc') => (a: Row, b: Row) => (dir === 'asc' ? 1 : -1) * (a.createdAt.getTime() - b.createdAt.getTime());
  const api = (undo: Array<() => void> | null): Row => ({
    user: { findUnique: async ({ where }: Row) => { await yieldNow(); const u = s.users.find((x) => x.id === where.id); return u ? { ...u } : null; } },
    wallet: {
      findUnique: async ({ where }: Row) => { await yieldNow(); const w = s.wallets.find((x) => (where.playerId ? x.playerId === where.playerId : x.id === where.id)); return w ? { ...w } : null; },
      create: async ({ data }: Row) => {
        await yieldNow();
        if (s.wallets.some((x) => x.playerId === data.playerId)) throw unique('playerId');
        const w = { id: id('w'), playerId: data.playerId, coins: 0n, shards: 0n, lc: 0n, version: 0n, updatedAt: new Date() };
        s.wallets.push(w); undo?.push(() => s.wallets.splice(s.wallets.indexOf(w), 1));
        return { ...w };
      },
      update: async ({ where, data }: Row) => {
        await yieldNow();
        const w = s.wallets.find((x) => x.id === where.id)!;
        for (const [k, v] of Object.entries(data)) { const inc = BigInt((v as Row).increment); w[k] += inc; undo?.push(() => { w[k] -= inc; }); }
        return { ...w };
      },
    },
    walletLedgerEntry: {
      findUnique: async ({ where }: Row) => { await yieldNow(); return s.entries.find((e) => e.idempotencyKey === where.idempotencyKey) ?? null; },
      findFirst: async ({ where }: Row) => { await arrive(); await yieldNow(); return s.entries.filter((e) => match(e, where)).sort(byCreated('asc'))[0] ?? null; },
      count: async ({ where }: Row) => { await yieldNow(); return s.entries.filter((e) => match(e, where)).length; },
      aggregate: async ({ where }: Row) => { await yieldNow(); return { _sum: { delta: s.entries.filter((e) => match(e, where)).reduce((a, e) => a + e.delta, 0n) } }; },
      create: async ({ data }: Row) => {
        await yieldNow();
        if (s.entries.some((e) => e.idempotencyKey === data.idempotencyKey)) throw unique('idempotencyKey');
        const e = { id: id('le'), createdAt: new Date(), ...data };
        s.entries.push(e); undo?.push(() => s.entries.splice(s.entries.indexOf(e), 1));
        return e;
      },
    },
    perfEarnEvent: {
      create: async ({ data }: Row) => { await yieldNow(); const e = { id: id('ev'), createdAt: new Date(), rejectedReason: null, resolvedEntryId: null, ...data }; s.events.push(e); return e; },
      update: async ({ where, data }: Row) => { await yieldNow(); const e = s.events.find((x) => x.id === where.id)!; Object.assign(e, data); return e; },
      count: async ({ where }: Row) => { await yieldNow(); return s.events.filter((e) => match(e, where)).length; },
    },
    rewardRule: { findUnique: async () => { await yieldNow(); return null; } },
    creditLedger: {
      create: async ({ data }: Row) => {
        await yieldNow();
        if (data.dedupeKey != null && s.credits.some((c) => c.userId === data.userId && c.dedupeKey === data.dedupeKey)) throw unique('userId,dedupeKey');
        const c = { id: id('cl'), createdAt: new Date(), balanceAfter: 0, ...data };
        s.credits.push(c);
        return c;
      },
      findFirst: async ({ where, orderBy }: Row) => { await yieldNow(); return s.credits.filter((c) => match(c, where)).sort(byCreated(orderBy?.createdAt === 'desc' ? 'desc' : 'asc'))[0] ?? null; },
      count: async ({ where }: Row) => { await yieldNow(); return s.credits.filter((c) => match(c, where)).length; },
      aggregate: async ({ where }: Row) => { await yieldNow(); const rows = s.credits.filter((c) => match(c, where)); return { _sum: { amount: rows.length ? rows.reduce((a, c) => a + c.amount, 0) : null } }; },
    },
    $transaction: async (fn: (tx: Row) => Promise<unknown>) => {
      const log: Array<() => void> = [];
      try { return await fn(api(log)); } catch (e) { for (const u of log.reverse()) u(); throw e; }
    },
  });
  return { s, latch, refusals, client: api(null) };
}

let db: ReturnType<typeof makeDb>;
let n = 0;
const addUser = (email: string, role = 'player') => { const u = { id: `u${++n}_${email.split('@')[0]}`, email, role }; db.s.users.push(u); return u; };
const as = (u: { id: string }) => { h.session = { user: { id: u.id } }; };
const clock = (iso: string) => vi.setSystemTime(new Date(iso));

async function call(fn: (r: never) => Promise<Response>, path: string, body: unknown) {
  const res = await fn(new Request(`http://127.0.0.1:3100${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) as never);
  return { status: res.status, body: (await res.json()) as Row };
}
/** What the wallet chip sends (components/dual-wallet-chip.tsx), with any key. */
const daily = (key?: string, payload: Row = {}) => call(v1Earn, '/api/v1/wallet/earn', {
  ...(key === undefined ? {} : { idempotency_key: key }), event_type: 'daily_first_session', payload: { source: 'wallet-chip', ...payload },
});
const streak = (body: Row = {}) => call(lcEarn, '/api/wallet/earn', { reason: 'daily_streak', ...body });

const walletOf = (e: Row) => db.s.wallets.find((w) => w.id === e.walletId);
const dailyRows = (u: { id: string }) => db.s.entries.filter((e) => walletOf(e)?.playerId === u.id && e.reasonCode === 'DAILY_FIRST_SESSION');
const entriesOf = (u: { id: string }) => db.s.entries.filter((e) => walletOf(e)?.playerId === u.id);
const coins = (u: { id: string }) => Number(db.s.wallets.find((w) => w.playerId === u.id)?.coins ?? 0);
const streakRows = (u: { id: string }) => db.s.credits.filter((c) => c.userId === u.id && c.reason === 'DAILY_STREAK');

/** A daily claim written before this fix, under the chip's own key, at `createdAt`. */
function seedOldDaily(u: { id: string }, key: string, createdAt: Date) {
  let w = db.s.wallets.find((x) => x.playerId === u.id);
  if (!w) { w = { id: `w_${u.id}`, playerId: u.id, coins: 0n, shards: 0n, lc: 0n, version: 0n, updatedAt: createdAt }; db.s.wallets.push(w); }
  w.coins += 100n;
  db.s.entries.push({ id: `old_${key}`, walletId: w.id, currency: 'coins', delta: 100n, balanceAfter: w.coins, reasonCode: 'DAILY_FIRST_SESSION', source: 'gameplay', idempotencyKey: key, metadata: {}, createdAt });
}

const savedAllowlist = process.env.FEL_TEST_ACCOUNTS;
beforeEach(() => {
  db = makeDb();
  h.db = db.client;
  delete process.env.FEL_TEST_ACCOUNTS;
  vi.useFakeTimers({ toFake: ['Date'] });
  clock('2026-07-15T10:00:00-07:00');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (savedAllowlist === undefined) delete process.env.FEL_TEST_ACCOUNTS; else process.env.FEL_TEST_ACCOUNTS = savedAllowlist;
});

describe('daily_first_session (POST /api/v1/wallet/earn → earn()): once per player per PT day, whatever the key', () => {
  it('FORGED KEY: the real key pays once; its `:qa-forged` twin, a key of any other shape and no key are already claimed, with no new ledger row', async () => {
    const u = addUser('player@example.test'); as(u);
    const real = `daily_first_session:2026-07-15:${u.id}`;
    const first = await daily(real, { day: '2026-07-15' });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ granted: { coins: 100, shards: 0 }, replayed: false, already_claimed: false, rejected: null });
    expect(coins(u)).toBe(100);
    // the eye's 5b, then the other shapes a client can send; the payload's day is the client's and keys nothing
    for (const key of [`${real}:qa-forged`, 'anything-at-all', `daily_first_session:2026-07-16:${u.id}`, undefined]) {
      const again = await daily(key, { day: '2099-01-01' });
      expect(again.status, String(key)).toBe(200);
      expect(again.body, String(key)).toMatchObject({ granted: { coins: 0, shards: 0 }, already_claimed: true, replayed: true, rejected: null, entry_id: first.body.entry_id });
    }
    expect(dailyRows(u)).toHaveLength(1);
    expect(dailyRows(u)[0].idempotencyKey).toBe(dailyKey('daily_first_session', u.id, new Date()));   // the server's key
    expect(coins(u)).toBe(100);
  });

  it('a missing key is not a 400 for a daily (the server makes the key), and it pays the day once', async () => {
    const u = addUser('nokey@example.test'); as(u);
    expect((await daily(undefined)).body).toMatchObject({ granted: { coins: 100 }, already_claimed: false });
    expect((await daily(undefined)).body).toMatchObject({ granted: { coins: 0 }, already_claimed: true });
    expect(dailyRows(u)).toHaveLength(1);
  });

  it.each([
    ['PST (non-DST)', '2026-01-15T23:59:59-08:00', '2026-01-16T00:00:01-08:00'],
    ['PDT (DST)', '2026-07-15T23:59:59-07:00', '2026-07-16T00:00:01-07:00'],
    ['spring forward', '2026-03-08T23:59:59-07:00', '2026-03-09T00:00:01-07:00'],
    ['fall back', '2026-11-01T23:59:59-08:00', '2026-11-02T00:00:01-08:00'],
  ])('PT BOUNDARY, %s: 23:59:59 and 00:00:01 the next PT day are two claims, two credits', async (_label, before, after) => {
    const u = addUser('late@example.test'); as(u);
    clock(before);
    expect((await daily('k1')).body).toMatchObject({ granted: { coins: 100 }, already_claimed: false });
    clock(after);
    expect((await daily('k1')).body).toMatchObject({ granted: { coins: 100 }, already_claimed: false });   // same client key, new day
    expect(dailyRows(u)).toHaveLength(2);
    expect(coins(u)).toBe(200);
  });

  it.each([
    ['PDT: 16:59 and 17:01 straddle UTC midnight', '2026-07-15T16:59:00-07:00', '2026-07-15T17:01:00-07:00'],
    ['PST: 15:59 and 16:01 straddle UTC midnight', '2026-01-15T15:59:00-08:00', '2026-01-15T16:01:00-08:00'],
    ['PST: 16:59 and 17:01', '2026-01-15T16:59:00-08:00', '2026-01-15T17:01:00-08:00'],
  ])('PT BOUNDARY, %s: one PT day, one credit', async (_label, before, after) => {
    const u = addUser('evening@example.test'); as(u);
    clock(before);
    const utcDay = new Date().toISOString().slice(0, 10);
    expect((await daily(`daily_first_session:${utcDay}:${u.id}`)).body).toMatchObject({ granted: { coins: 100 } });
    clock(after);
    // the client's own day moved on with UTC (a browser in UTC), and it sends that day's key
    const nextUtc = new Date().toISOString().slice(0, 10);
    expect((await daily(`daily_first_session:${nextUtc}:${u.id}`)).body).toMatchObject({ granted: { coins: 0 }, already_claimed: true });
    expect(dailyRows(u)).toHaveLength(1);
    expect(coins(u)).toBe(100);
  });

  it('PARALLEL: two claims together with two different client keys → one credit, one already claimed, one row, no 500', async () => {
    const u = addUser('twotabs@example.test'); as(u);
    db.latch.need = 2;   // both claims are past "already claimed today?" before either writes: the insert decides
    const [a, b] = await Promise.all([daily(`daily_first_session:2026-07-15:${u.id}`), daily(`daily_first_session:2026-07-15:${u.email}`)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const answers = [a.body, b.body].sort((x, y) => y.granted.coins - x.granted.coins);
    expect(answers[0]).toMatchObject({ granted: { coins: 100 }, already_claimed: false, rejected: null });
    expect(answers[1]).toMatchObject({ granted: { coins: 0, shards: 0 }, already_claimed: true, replayed: true, rejected: null, entry_id: answers[0].entry_id });
    expect(dailyRows(u)).toHaveLength(1);
    expect(coins(u)).toBe(100);
    // both reached the insert, and the unique key refused the second: it was not the payload-hash replay check (which
    // used to refuse BOTH and credit nothing)
    expect(db.s.events.map((e) => e.rejectedReason).sort()).toEqual(['already_claimed', null]);
  });

  it('PARALLEL, the refusal from another copy of the Prisma client (next dev) → still one credit and one already claimed, never a 500', async () => {
    const u = addUser('devtabs@example.test'); as(u);
    db.refusals.foreignClass = true;
    db.latch.need = 2;
    const r = await Promise.all([daily(`daily_first_session:2026-07-15:${u.id}`), daily()]);
    expect(r.map((x) => x.status)).toEqual([200, 200]);
    expect(r.map((x) => x.body.granted.coins).sort()).toEqual([0, 100]);
    expect(r.filter((x) => x.body.already_claimed)).toHaveLength(1);
    expect(dailyRows(u)).toHaveLength(1);
    expect(db.s.events.map((e) => e.rejectedReason).sort()).toEqual(['already_claimed', null]);
  });

  it('PARALLEL, the same client key twice (two tabs of one browser) → one credit, one already claimed', async () => {
    const u = addUser('sametabs@example.test'); as(u);
    const key = `daily_first_session:2026-07-15:${u.id}`;
    const r = await Promise.all([daily(key, { day: '2026-07-15' }), daily(key, { day: '2026-07-15' })]);
    expect(r.map((x) => x.body.granted.coins).sort()).toEqual([0, 100]);
    expect(r.map((x) => x.body.rejected)).toEqual([null, null]);   // neither is replay_detected
    expect(dailyRows(u)).toHaveLength(1);
  });

  it.each([
    ['the id variant, browser in PT', (u: Row) => `daily_first_session:2026-07-15:${u.id}`, '2026-07-15T08:05:00-07:00'],
    ['the email variant, browser in PT', (u: Row) => `daily_first_session:2026-07-15:${u.email}`, '2026-07-15T08:05:00-07:00'],
    ['the id variant, browser ahead of PT (its day is tomorrow)', (u: Row) => `daily_first_session:2026-07-16:${u.id}`, '2026-07-15T18:30:00-07:00'],
    ['the eye\'s forged key', (u: Row) => `daily_first_session:2026-07-15:${u.id}:qa-forged`, '2026-07-15T09:00:00-07:00'],
  ])('OLD KEY: a claim made earlier this PT day under %s → a new claim is already claimed', async (_label, keyOf, when) => {
    const u = addUser('earlybird@example.test'); as(u);
    seedOldDaily(u, keyOf(u), new Date(when));
    clock('2026-07-15T21:00:00-07:00');
    const r = await daily(`daily_first_session:2026-07-15:${u.id}:another`);
    expect(r.body).toMatchObject({ granted: { coins: 0, shards: 0 }, already_claimed: true, entry_id: `old_${keyOf(u)}` });
    expect(dailyRows(u)).toHaveLength(1);
    expect(coins(u)).toBe(100);
  });

  it('OLD KEY: yesterday\'s claim (by PT) does not block today', async () => {
    const u = addUser('yesterday@example.test'); as(u);
    seedOldDaily(u, `daily_first_session:2026-07-14:${u.id}`, new Date('2026-07-14T20:00:00-07:00'));
    clock('2026-07-15T12:00:00-07:00');
    expect((await daily()).body).toMatchObject({ granted: { coins: 100 }, already_claimed: false });
    expect(dailyRows(u)).toHaveLength(2);
  });

  it('OLD KEY: a browser ahead of PT filed last night\'s claim under today\'s date; that key is today\'s, so today pays nothing (under-pays, never twice)', async () => {
    const u = addUser('ahead@example.test'); as(u);
    seedOldDaily(u, `daily_first_session:2026-07-15:${u.id}`, new Date('2026-07-14T23:30:00-07:00'));
    clock('2026-07-15T12:00:00-07:00');
    expect((await daily()).body).toMatchObject({ granted: { coins: 0 }, already_claimed: true });
    clock('2026-07-16T12:00:00-07:00');
    expect((await daily()).body).toMatchObject({ granted: { coins: 100 }, already_claimed: false });
    expect(dailyRows(u)).toHaveLength(2);
  });

  it('the day\'s key held by ANOTHER wallet (filed before the fix) pays nothing and leaks nothing: replayed_key', async () => {
    const victim = addUser('victim@example.test');
    const squatter = addUser('squatter@example.test');
    seedOldDaily(squatter, dailyKey('daily_first_session', victim.id, new Date('2026-07-15T12:00:00-07:00')), new Date('2026-07-14T12:00:00-07:00'));
    as(victim);
    clock('2026-07-15T12:00:00-07:00');
    const r = await daily();
    expect(r.body).toMatchObject({ granted: { coins: 0, shards: 0 }, entry_id: null, rejected: 'replayed_key' });
    expect(entriesOf(victim)).toHaveLength(0);
  });

  it('a non-daily event may not file under a daily key (it would squat on a player\'s daily): reserved_key, no row', async () => {
    const squatter = addUser('squat2@example.test'); as(squatter);
    const r = await call(v1Earn, '/api/v1/wallet/earn', { idempotency_key: 'daily_first_session:2026-07-16:u_victim', event_type: 'dunk_routine_completed', payload: {} });
    expect(r.body).toMatchObject({ granted: { coins: 0, shards: 0 }, rejected: 'reserved_key' });
    expect(entriesOf(squatter)).toHaveLength(0);
  });

  it('NON-DAILY events are unchanged: keyed by the client, a key replay answers the original grant, a missing key is 400', async () => {
    const u = addUser('dunker@example.test'); as(u);
    const body = { idempotency_key: 'k_routine_1', event_type: 'dunk_routine_completed', payload: {} };
    expect((await call(v1Earn, '/api/v1/wallet/earn', body)).body).toMatchObject({ granted: { coins: 60 }, replayed: false, already_claimed: false });
    expect((await call(v1Earn, '/api/v1/wallet/earn', body)).body).toMatchObject({ granted: { coins: 60 }, replayed: true, already_claimed: false });
    expect(entriesOf(u).map((e) => e.idempotencyKey)).toEqual(['k_routine_1']);
    expect(coins(u)).toBe(60);
    const missing = await call(v1Earn, '/api/v1/wallet/earn', { event_type: 'dunk_routine_completed', payload: {} });
    expect(missing).toEqual({ status: 400, body: { error: 'missing_idempotency_key_or_event_type' } });
    const noType = await call(v1Earn, '/api/v1/wallet/earn', { idempotency_key: 'k' });
    expect(noType.status).toBe(400);
    // the session earns stay the run's (ECONOMY-SESSIONS-HARDEN)
    expect((await call(v1Earn, '/api/v1/wallet/earn', { idempotency_key: 'k_s', event_type: 'mode_session_completed', payload: {} })).body).toMatchObject({ rejected: 'paid_by_session_run' });
  });
});

describe('daily_streak (POST /api/wallet/earn → awardCredits): once per player per PT day, keyed by the server', () => {
  it('FORGED INPUTS: a second claim the same PT day with its own key, day, now and amount is a duplicate, 0 awarded, no new row', async () => {
    const u = addUser('streaker@example.test'); as(u);
    const forged = { dedupeKey: 'streak:2026-07-20', idempotency_key: 'streak:2026-07-20', day: '2026-07-20', now: '2026-07-20T12:00:00Z', amount: 9999 };
    const first = await streak(forged);
    expect(first.body).toMatchObject({ ok: true, awarded: 5, duplicate: false });
    expect(streakRows(u).map((c) => c.dedupeKey)).toEqual(['streak:2026-07-15']);   // the server's day, not the body's
    const again = await streak(forged);
    expect(again.body).toMatchObject({ ok: true, awarded: 0, duplicate: true, balance: 5 });
    expect((await streak({ dedupeKey: 'streak:2026-07-15:x', day: '2026-07-16' })).body).toMatchObject({ awarded: 0, duplicate: true });
    expect(streakRows(u)).toHaveLength(1);
    // a reason with a suffix is not the reason: 400, nothing written
    expect((await call(lcEarn, '/api/wallet/earn', { reason: 'daily_streak:forged' })).status).toBe(400);
    expect(db.s.credits.filter((c) => c.userId === u.id)).toHaveLength(1);
  });

  it.each([
    ['PST (non-DST)', '2026-01-15T23:59:59-08:00', '2026-01-16T00:00:01-08:00'],
    ['PDT (DST)', '2026-07-15T23:59:59-07:00', '2026-07-16T00:00:01-07:00'],
  ])('PT BOUNDARY, %s: 23:59:59 and 00:00:01 the next PT day are two credits', async (_label, before, after) => {
    const u = addUser('latestreak@example.test'); as(u);
    clock(before);
    expect((await streak()).body).toMatchObject({ awarded: 5, duplicate: false });
    clock(after);
    expect((await streak()).body).toMatchObject({ duplicate: false });
    expect(streakRows(u)).toHaveLength(2);
    expect(streakRows(u).map((c) => c.dedupeKey)).toEqual([`streak:${before.slice(0, 10)}`, `streak:${after.slice(0, 10)}`]);
  });

  it.each([
    ['PDT: 16:59 and 17:01 straddle UTC midnight', '2026-07-15T16:59:00-07:00', '2026-07-15T17:01:00-07:00'],
    ['PST: 15:59 and 16:01 straddle UTC midnight', '2026-01-15T15:59:00-08:00', '2026-01-15T16:01:00-08:00'],
    ['PST: 16:59 and 17:01', '2026-01-15T16:59:00-08:00', '2026-01-15T17:01:00-08:00'],
  ])('PT BOUNDARY, %s: one PT day, one credit', async (_label, before, after) => {
    const u = addUser('evestreak@example.test'); as(u);
    clock(before);
    expect((await streak()).body).toMatchObject({ awarded: 5 });
    clock(after);
    expect((await streak()).body).toMatchObject({ awarded: 0, duplicate: true });
    expect(streakRows(u)).toHaveLength(1);
  });

  it('PARALLEL: two claims together → one credit, one duplicate, one row, no 500', async () => {
    const u = addUser('twostreak@example.test'); as(u);
    const [a, b] = await Promise.all([streak({ dedupeKey: 'a' }), streak({ dedupeKey: 'b' })]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.body.awarded, b.body.awarded].sort()).toEqual([0, 5]);
    expect([a.body.duplicate, b.body.duplicate].sort()).toEqual([false, true]);
    expect(streakRows(u)).toHaveLength(1);
  });

  it('PARALLEL, the refusal from another copy of the Prisma client (next dev) → one credit, one duplicate, never a 500', async () => {
    const u = addUser('devstreak@example.test'); as(u);
    db.refusals.foreignClass = true;
    const [a, b] = await Promise.all([streak(), streak()]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.body.awarded, b.body.awarded].sort()).toEqual([0, 5]);
    expect([a.body.duplicate, b.body.duplicate].sort()).toEqual([false, true]);
    expect(streakRows(u)).toHaveLength(1);
  });

  it.each([
    ['after 17:00 PDT, when the UTC key named tomorrow', 'streak:2026-07-16', '2026-07-15T18:00:00-07:00'],
    ['in the morning, when the UTC key named today', 'streak:2026-07-15', '2026-07-15T09:00:00-07:00'],
  ])('OLD UTC KEY: a streak written earlier this PT day %s → a new claim the same PT day does not pay', async (_label, key, when) => {
    const u = addUser('oldstreak@example.test'); as(u);
    db.s.credits.push({ id: 'old_streak', userId: u.id, amount: 5, reason: 'DAILY_STREAK', dedupeKey: key, balanceAfter: 5, createdAt: new Date(when) });
    clock('2026-07-15T20:00:00-07:00');
    expect((await streak()).body).toMatchObject({ ok: true, awarded: 0, duplicate: true, balance: 5 });
    expect(streakRows(u)).toHaveLength(1);
  });
});

describe('TEST ACCOUNTS get 0 from both wallet earn routes (as their session runs do)', () => {
  beforeEach(() => { vi.stubEnv('NODE_ENV', 'production'); });
  const cases: Array<[string, (u: Row) => void, string]> = [
    ['by FEL_TEST_ACCOUNTS email (any case)', (u) => { process.env.FEL_TEST_ACCOUNTS = `someone@else.test, ${u.email.toUpperCase()}`; }, 'player'],
    ['by FEL_TEST_ACCOUNTS id', (u) => { process.env.FEL_TEST_ACCOUNTS = u.id; }, 'player'],
    ['by User.role test', () => { process.env.FEL_TEST_ACCOUNTS = 'someone@else.test'; }, 'test'],
  ];

  it.each(cases)('%s: daily_first_session, a forged key and a non-daily event pay 0 with the marker, and nothing is written', async (_label, list, role) => {
    const u = addUser('playtest@fel.local', role); list(u); as(u);
    for (const body of [
      { idempotency_key: `daily_first_session:2026-07-15:${u.id}`, event_type: 'daily_first_session', payload: { day: '2026-07-15' } },
      { idempotency_key: `daily_first_session:2026-07-15:${u.id}:qa-forged`, event_type: 'daily_first_session', payload: {} },
      { event_type: 'daily_first_session', payload: {} },
      { idempotency_key: 'k_routine', event_type: 'dunk_routine_completed', payload: {} },
    ]) {
      const r = await call(v1Earn, '/api/v1/wallet/earn', body);
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ granted: { coins: 0, shards: 0 }, rejected: 'test_account', reason: 'TEST_ACCOUNT', entry_id: null, replayed: false, already_claimed: false, balances: { coins: 0, shards: 0 } });
    }
    expect(entriesOf(u)).toHaveLength(0);
    expect(db.s.events).toHaveLength(0);   // earn() never ran
    expect(db.s.wallets.filter((w) => w.playerId === u.id)).toHaveLength(0);   // not even a wallet row was made
  });

  it.each(cases)('%s: daily_streak, forged or not, awards 0 with the marker and writes no CreditLedger row', async (_label, list, role) => {
    const u = addUser('playtest@fel.local', role); list(u); as(u);
    expect((await streak()).body).toMatchObject({ ok: true, awarded: 0, duplicate: false, rejected: 'test_account', balance: 0 });
    expect((await streak({ dedupeKey: 'streak:2026-07-16', day: '2026-07-16', amount: 500 })).body).toMatchObject({ awarded: 0, rejected: 'test_account' });
    expect(db.s.credits).toHaveLength(0);
  });

  it('a test account\'s balance is reported, unchanged, from its wallet row', async () => {
    const u = addUser('qa@fel.local', 'qa'); as(u);
    seedOldDaily(u, 'daily_first_session:2026-07-14:x', new Date('2026-07-14T12:00:00-07:00'));
    expect((await daily()).body).toMatchObject({ granted: { coins: 0 }, rejected: 'test_account', balances: { coins: 100 } });
    expect(coins(u)).toBe(100);
    expect(entriesOf(u)).toHaveLength(1);
  });

  it('a NORMAL account (arena-coins@fel.local, role player, not on the list) is paid exactly once for each daily', async () => {
    process.env.FEL_TEST_ACCOUNTS = 'playtest@fel.local,u_someone_else';
    const u = addUser('arena-coins@fel.local'); as(u);
    expect((await daily(`daily_first_session:2026-07-15:${u.id}`)).body).toMatchObject({ granted: { coins: 100 }, already_claimed: false, rejected: null });
    expect((await daily(`daily_first_session:2026-07-15:${u.id}:qa-forged`)).body).toMatchObject({ granted: { coins: 0 }, already_claimed: true });
    expect(coins(u)).toBe(100);
    expect(dailyRows(u)).toHaveLength(1);
    expect((await streak()).body).toMatchObject({ awarded: 5, duplicate: false });
    expect((await streak()).body).toMatchObject({ awarded: 0, duplicate: true });
    expect(streakRows(u)).toHaveLength(1);
  });
});
