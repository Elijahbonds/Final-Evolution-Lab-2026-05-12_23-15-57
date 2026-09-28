// MUSIC-SUITE P6 (2026-09-26): THE STALE-DUEL SWEEP — owner decision #30 (musicsuite/DECISIONS-2.md): "Stale duels: YES,
// ALL MODES — past expiresAt, unaccepted duels refund the creator; active duels refund whoever didn't play, or settle to
// the one side that scored; ledger-logged, tested, run on read + a scheduled route".
//
// Until now nothing read expiresAt (musicsuite/p1/STAKING-PAUSE.md 'Expiry'): a duel nobody came back to held its stakes
// forever. lib/arena-reclaim.ts is the sweep; these tests run it, and the routes around it (GET /api/arena/list, POST
// /api/arena/reclaim, submit-score, join), against the in-memory stand-in the arena route tests use — grown here to
// honour WHERE clauses (the claim is a compare-and-set, so the fake has to evaluate one), to roll a transaction back when
// it throws, and to yield between every call so two sweeps really interleave. The LC movements are the REAL arenaRefund /
// arenaPayWinner / appendMatchEvent (lib/arena.ts); only applyLc underneath is faked, as a ledger with the unique
// idempotency key WalletLedgerEntry has. No DATABASE_URL, no network.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Row = Record<string, any>;

const h = vi.hoisted(() => {
  const tick = () => new Promise<void>((r) => setImmediate(r));
  const store = {
    matches: [] as Row[],
    events: [] as Row[],
    ledger: new Map<string, { playerId: string; delta: number; reasonCode: string }>(),
    balances: {} as Record<string, number>,
    user: 'u1' as string | null,
    /** fault injection */
    failLedgerFor: null as string | null,
    beforeClaim: null as null | ((where: Row) => void),
    beforeUpdate: null as null | ((where: Row) => void),
    brokenClaim: false,
    failCandidates: false,
    hangCandidates: false,
    /** MUSIC-SUITE P6 FIX PASS: Postgres row locks — an UPDATE holds its row until the transaction ends (off: no locks). */
    noLocks: false,
    rowLocks: new Map<string, { owner: symbol; released: Promise<void> }>(),
  };

  const fieldMatch = (v: unknown, c: any): boolean => {
    if (c === null) return v === null || v === undefined;
    if (c instanceof Date) return v instanceof Date && v.getTime() === c.getTime();
    if (c && typeof c === 'object') {
      if ('in' in c) return c.in.includes(v);
      if ('not' in c) return c.not === null ? v !== null && v !== undefined : v !== c.not;
      const t = v === null || v === undefined ? NaN : new Date(v as string).getTime();
      if ('lte' in c) return t <= c.lte.getTime();
      if ('lt' in c) return t < c.lt.getTime();
      if ('gt' in c) return t > c.gt.getTime();
      if ('gte' in c) return t >= c.gte.getTime();
      throw new Error(`fake: unsupported filter ${JSON.stringify(c)}`);
    }
    return v === c;
  };
  const rowMatch = (row: Row, where: Row = {}): boolean => Object.entries(where).every(([k, c]) => {
    if (k === 'AND') return (c as Row[]).every((w) => rowMatch(row, w));
    if (k === 'OR') return (c as Row[]).some((w) => rowMatch(row, w));
    // MUSIC-SUITE P6 FIX PASS: the house draw's relation filter (events: { some: … }) on a duel's MatchEvents
    if (k === 'events') return store.events.some((e) => e.matchId === row.id && rowMatch(e, (c as Row).some));
    return fieldMatch(row[k], c);
  });
  const sortBy = (rows: Row[], orderBy?: Row) => {
    if (!orderBy) return rows;
    const [[k, dir]] = Object.entries(orderBy);
    return [...rows].sort((a, b) => {
      const x = new Date(a[k]).getTime(), y = new Date(b[k]).getTime();
      return dir === 'asc' ? x - y : y - x;
    });
  };
  const pick = (row: Row, select?: Row) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k,
    k === 'events' && select.events?.where ? store.events.filter((e) => e.matchId === row.id && rowMatch(e, select.events.where)) : row[k]])) : { ...row });

  /** MUSIC-SUITE P6 FIX PASS: take the row lock for transaction `owner` (waits while another transaction holds it). */
  const lockRows = async (owner: symbol | null, ids: string[], held: Array<() => void> | null) => {
    if (!owner || store.noLocks) return;
    for (const id of ids) {
      for (;;) {
        const l = store.rowLocks.get(id);
        if (!l || l.owner === owner) break;
        await l.released;
      }
      if (store.rowLocks.get(id)?.owner === owner) continue;
      let release!: () => void;
      const released = new Promise<void>((r) => { release = r; });
      store.rowLocks.set(id, { owner, released });
      held!.push(() => { store.rowLocks.delete(id); release(); });
    }
  };

  /** A client (the prisma client itself, or a transaction's `tx` with its undo log and its row locks). */
  const client = (undo: Array<() => void> | null, owner: symbol | null = null, held: Array<() => void> | null = null) => ({
    __undo: undo,
    competitionMatch: {
      findUnique: async ({ where }: Row) => { await tick(); const m = store.matches.find((x) => x.id === where.id); return m ? { ...m } : null; },
      findMany: async ({ where, orderBy, take, select }: Row) => {
        await tick();
        // the sweep's candidate query is the one with `expiresAt: { lte }` — fault injection targets it alone
        if (where?.expiresAt?.lte && store.failCandidates) throw new Error('candidate read failed');
        if (where?.expiresAt?.lte && store.hangCandidates) return new Promise(() => {});
        const rows = sortBy(store.matches.filter((m) => rowMatch(m, where)), orderBy);
        return (take ? rows.slice(0, take) : rows).map((r) => pick(r, select));
      },
      update: async ({ where, data }: Row) => {
        await tick();
        await lockRows(owner, [where.id], held);
        store.beforeUpdate?.(where);
        const m = store.matches.find((x) => rowMatch(x, where));
        if (!m) throw Object.assign(new Error('Record to update not found.'), { code: 'P2025' });
        const before = { ...m };
        Object.assign(m, data, { updatedAt: new Date() });
        undo?.push(() => { Object.keys(m).forEach((k) => delete m[k]); Object.assign(m, before); });
        return { ...m };
      },
      updateMany: async ({ where, data }: Row) => {
        await tick();
        await lockRows(owner, [where.id], held);
        store.beforeClaim?.(where);
        const hits = store.brokenClaim ? store.matches.filter((m) => m.id === where.id) : store.matches.filter((m) => rowMatch(m, where));
        for (const m of hits) {
          const before = { ...m };
          Object.assign(m, data, { updatedAt: new Date() });
          undo?.push(() => { Object.keys(m).forEach((k) => delete m[k]); Object.assign(m, before); });
        }
        return { count: hits.length };
      },
      create: async () => { throw new Error('fake: create not expected'); },
    },
    matchEvent: {
      findFirst: async ({ where }: Row) => {
        const mine = store.events.filter((e) => rowMatch(e, where));
        return mine.length ? { seq: Math.max(...mine.map((e) => e.seq)) } : null;
      },
      create: async ({ data }: Row) => {
        const e = { ...data, createdAt: new Date() };
        store.events.push(e);
        undo?.push(() => { store.events.splice(store.events.indexOf(e), 1); });
        return e;
      },
      findMany: async ({ where, orderBy }: Row) => { await tick(); return sortBy(store.events.filter((e) => rowMatch(e, where)), Array.isArray(orderBy) ? orderBy[0] : orderBy); },
    },
    user: { findMany: async () => [{ id: 'u1', name: 'You' }, { id: 'u2', name: 'Rival' }, { id: 'house', name: 'House' }] },
    gameSession: { findMany: async () => [] },
  });

  const prisma = {
    ...client(null),
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const undo: Array<() => void> = [];
      const held: Array<() => void> = [];
      try { return await fn(client(undo, Symbol('tx'), held)); } catch (e) { for (const u of undo.reverse()) u(); throw e; } finally { for (const r of held) r(); }
    },
  };

  /** The ledger underneath arenaRefund / arenaPayWinner: unique idempotency key, as WalletLedgerEntry has it. */
  const applyLc = async (db: Row, a: Row) => {
    await tick();
    if (store.failLedgerFor === a.playerId) throw Object.assign(new Error('ledger down'), { code: 'LEDGER_DOWN' });
    const prior = store.ledger.get(a.idempotencyKey);
    if (prior) {
      if (prior.playerId !== a.playerId) throw Object.assign(new Error('this idempotency key belongs to another wallet'), { code: 'REPLAYED_KEY' });
      return { balanceAfter: store.balances[a.playerId] ?? 0, replayed: true };
    }
    store.ledger.set(a.idempotencyKey, { playerId: a.playerId, delta: a.delta, reasonCode: a.reasonCode });
    store.balances[a.playerId] = (store.balances[a.playerId] ?? 0) + a.delta;
    db?.__undo?.push(() => { store.ledger.delete(a.idempotencyKey); store.balances[a.playerId] -= a.delta; });
    return { balanceAfter: store.balances[a.playerId], replayed: false };
  };

  return { store, prisma, applyLc };
});

vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => (h.store.user ? { user: { id: h.store.user } } : null)) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/analytics-server', () => ({ recordServerEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/db', () => ({ prisma: h.prisma }));
vi.mock('@/lib/wallet/wallet-service', () => ({
  applyLc: (db: Row, a: Row) => h.applyLc(db, a),
  WalletError: class WalletError extends Error { code = ''; },
}));

import {
  planReclaim, reclaimOne, reclaimExpiredArenaDuels, reclaimOnRead, reclaimCandidateWhere, clampReclaimBatch, isExpired,
  verifyReclaimSecret, expiredOutcomeOf, RECLAIM_MAX_BATCH, RECLAIM_ON_READ_BATCH, RECLAIM_SECRET_HEADER,
  EXPIRED_FORFEIT_REASON, EXPIRED_VOID_REASON, EXPIRED_SETTLE_REASON, GHOST_UNPLAYED, type ReclaimRow,
} from './arena-reclaim';
import { houseBeatFor, houseTap, judgeHouseSet } from './babylon/music/houseBeat';
import { drawRivalScore, ARENA_SCORE_BASELINES } from './arena-rivals';
import { POST as attemptPOST } from '../app/api/arena/music-attempt/route';
import { winnerPayout, rakeAmount, ARENA_EXPIRY_HOURS } from './arena';
import { isStakingPaused } from './stakingPause';
import { GET as listGET } from '../app/api/arena/list/route';
import { POST as reclaimPOST } from '../app/api/arena/reclaim/route';
import { POST as submitPOST } from '../app/api/arena/submit-score/route';
import { POST as joinPOST } from '../app/api/arena/join/route';

const NOW = new Date('2026-09-26T12:00:00Z');
const HOUR = 3_600_000;
const past = (hours = 1) => new Date(NOW.getTime() - hours * HOUR);
const future = (hours = 1) => new Date(NOW.getTime() + hours * HOUR);
const FEE = 50;
const RAKE = 10;

let seq = 0;
function duel(over: Row = {}): Row {
  seq += 1;
  const m = {
    id: `d${seq}`, mode: 'hoops1v1', currency: 'LC', status: 'ACTIVE', matchType: 'SCORE_DUEL', seed: `seed-${seq}`,
    entryFeeCents: FEE, rakePercent: RAKE, player1Id: 'u1', player2Id: 'u2', player1Score: null, player2Score: null,
    winnerId: null, expiresAt: past(), createdAt: new Date(NOW.getTime() - 50 * HOUR), updatedAt: new Date(NOW.getTime() - 50 * HOUR),
    ...over,
  };
  h.store.matches.push(m);
  return m;
}
const eventsOf = (id: string) => h.store.events.filter((e) => e.matchId === id).map((e) => ({ type: e.eventType, ...JSON.parse(e.payload) }));
const snapshot = () => JSON.stringify({ m: h.store.matches, e: h.store.events, l: [...h.store.ledger], b: h.store.balances });

beforeEach(() => {
  seq = 0;
  Object.assign(h.store, {
    matches: [], events: [], ledger: new Map(), balances: {}, user: 'u1',
    failLedgerFor: null, beforeClaim: null, beforeUpdate: null, brokenClaim: false, failCandidates: false, hangCandidates: false,
    noLocks: false, rowLocks: new Map(),
  });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('planReclaim — the rules (pure)', () => {
  const row = (over: Partial<ReclaimRow> = {}): ReclaimRow => ({
    id: 'x', mode: 'golf', currency: 'LC', status: 'ACTIVE', expiresAt: past(), player1Id: 'a', player2Id: 'b',
    player1Score: null, player2Score: null, entryFeeCents: FEE, rakePercent: RAKE, ...over,
  });

  it('WAITING (never accepted) past expiry: void, the creator refunded', () => {
    expect(planReclaim(row({ status: 'WAITING', player2Id: null }), NOW)).toEqual({ kind: 'void', refund: [{ side: 'p1', userId: 'a' }] });
  });
  it('ACTIVE, neither side scored: void, both refunded', () => {
    expect(planReclaim(row(), NOW)).toEqual({ kind: 'void', refund: [{ side: 'p1', userId: 'a' }, { side: 'p2', userId: 'b' }] });
  });
  it('ACTIVE, exactly one side scored: a forfeit win for that side — either side, and a score of 0 is a score', () => {
    expect(planReclaim(row({ player1Score: 7 }), NOW)).toEqual({ kind: 'forfeit', side: 'p1', winnerId: 'a' });
    expect(planReclaim(row({ player2Score: 0 }), NOW)).toEqual({ kind: 'forfeit', side: 'p2', winnerId: 'b' });
  });
  it('both scored while open (two submits at one instant): SETTLED on the two scores — no longer skipped for good', () => {
    // MUSIC-SUITE P6 FIX PASS: it was asserted "impossible" and left, stakes locked — two simultaneous submits made it
    expect(planReclaim(row({ player1Score: 3, player2Score: 4 }), NOW)).toEqual({ kind: 'settle', p1: 3, p2: 4, drawHouse: null });
    expect(planReclaim(row({ status: 'WAITING', player2Id: 'b' }), NOW)).toEqual({ kind: 'skip', why: 'waiting_joined' });
  });
  it('the deadline itself counts as passed; a millisecond before, it does not', () => {
    expect(planReclaim(row({ expiresAt: NOW }), NOW).kind).toBe('void');
    expect(planReclaim(row({ expiresAt: new Date(NOW.getTime() + 1) }), NOW)).toEqual({ kind: 'skip', why: 'not_expired' });
    expect(isExpired(NOW.toISOString(), NOW)).toBe(true);
    expect(isExpired(null, NOW)).toBe(false);
    expect(isExpired('not a date', NOW)).toBe(false);
  });
  it('not the Arena\'s to reclaim: the real-money book, a closed duel, a row with no deadline', () => {
    expect(planReclaim(row({ currency: 'USD_CENTS' }), NOW)).toEqual({ kind: 'skip', why: 'not_arena' });
    for (const status of ['SETTLED', 'VOIDED', 'DISPUTED', 'EXPIRED', 'SCORED']) expect(planReclaim(row({ status }), NOW)).toEqual({ kind: 'skip', why: 'closed' });
    expect(planReclaim(row({ expiresAt: null }), NOW)).toEqual({ kind: 'skip', why: 'no_expiry' });
  });
  it('a HUMAN duel nobody played: both refunded (the house-seat rule below is only for a Quick Match)', () => {
    expect(planReclaim(row({ player2Id: 'house' }), NOW)).toEqual({ kind: 'void', refund: [{ side: 'p1', userId: 'a' }, { side: 'p2', userId: 'house' }] });
  });
  // MUSIC-SUITE P6 FIX PASS — OWNER CALL (#30 on a Quick Match; GHOST_UNPLAYED): the house seat only "plays" inside the
  // player's own submit, so "nobody played" was EVERY abandoned Quick Match — quit before the card, the stake came back.
  it('a Quick Match its player never played: SETTLED to the house (GHOST_UNPLAYED = house_wins) — no free roll', () => {
    expect(GHOST_UNPLAYED).toBe('house_wins');
    expect(planReclaim(row({ matchType: 'GHOST_DUEL', player2Id: 'house' }), NOW)).toEqual({ kind: 'forfeit', side: 'p2', winnerId: 'house' });
  });
  it('a Quick Match its player DID play (a music start): the house is drawn, then the two settle', () => {
    expect(planReclaim(row({ matchType: 'GHOST_DUEL', player2Id: 'house' }), NOW, { p1: 0 })).toEqual({ kind: 'settle', p1: 0, p2: null, drawHouse: 'p2' });
    expect(planReclaim(row({ matchType: 'GHOST_DUEL', player2Id: 'house' }), NOW, { p1: 30_000 })).toEqual({ kind: 'settle', p1: 30_000, p2: null, drawHouse: 'p2' });
  });
  it('the seats the sweep COUNTS override the columns (a music start counts; a pre-house-beat score does not)', () => {
    expect(planReclaim(row({ mode: 'music' }), NOW, { p1: 0, p2: null })).toEqual({ kind: 'forfeit', side: 'p1', winnerId: 'a' });
    expect(planReclaim(row({ mode: 'music', player2Score: 150_000 }), NOW, { p1: null, p2: null })).toEqual({ kind: 'void', refund: [{ side: 'p1', userId: 'a' }, { side: 'p2', userId: 'b' }] });
    expect(planReclaim(row({ mode: 'music' }), NOW, { p1: 41_000, p2: 0 })).toEqual({ kind: 'settle', p1: 41_000, p2: 0, drawHouse: null });
  });
  it('the candidate query: open Arena duels past expiry (both-scored ones too — they settle now), optionally one player\'s', () => {
    expect(reclaimCandidateWhere(NOW)).toEqual({ currency: 'LC', status: { in: ['WAITING', 'ACTIVE'] }, expiresAt: { lte: NOW } });
    expect(reclaimCandidateWhere(NOW, 'u1').AND).toContainEqual({ OR: [{ player1Id: 'u1' }, { player2Id: 'u1' }] });
  });
  it('the batch is bounded: [1, RECLAIM_MAX_BATCH], anything unusable is the default', () => {
    expect(clampReclaimBatch(10)).toBe(10);
    expect(clampReclaimBatch(1_000)).toBe(RECLAIM_MAX_BATCH);
    for (const bad of [0, -3, NaN, 'x', undefined, null]) expect(clampReclaimBatch(bad, 25)).toBe(25);
    expect(clampReclaimBatch(7.9)).toBe(7);
  });
  it('the lobby reads the outcome back off the event a reclaim wrote — and only a reclaim\'s', () => {
    const ev = (eventType: string, payload: Row) => ({ eventType, payload: JSON.stringify(payload) });
    expect(expiredOutcomeOf(ev('REFUNDED', { reason: EXPIRED_VOID_REASON }), 'u1')).toBe('refunded');
    expect(expiredOutcomeOf(ev('SETTLED', { reason: EXPIRED_FORFEIT_REASON, winnerId: 'u1' }), 'u1')).toBe('won_by_forfeit');
    expect(expiredOutcomeOf(ev('SETTLED', { reason: EXPIRED_FORFEIT_REASON, winnerId: 'u2' }), 'u1')).toBe('lost_by_forfeit');
    expect(expiredOutcomeOf(ev('REFUNDED', { reason: 'cancelled' }), 'u1')).toBeNull();
    expect(expiredOutcomeOf(ev('REFUNDED', { reason: 'tie' }), 'u1')).toBeNull();
    expect(expiredOutcomeOf(ev('SETTLED', { winnerId: 'u1' }), 'u1')).toBeNull();
    expect(expiredOutcomeOf({ eventType: 'REFUNDED', payload: '{not json' }, 'u1')).toBeNull();
  });
});

describe('the sweep — each rule moves the Lab Credits through the normal paths, with a ledger line and a MatchEvent', () => {
  it('WAITING past expiry → VOIDED, the creator refunded the full stake (arena-refund:<id>:<creator>), nobody else paid', async () => {
    const d = duel({ status: 'WAITING', player2Id: null, mode: 'golf' });
    const s = await reclaimExpiredArenaDuels(h.prisma as never, { now: NOW });
    expect(s).toMatchObject({ scanned: 1, voided: 1, forfeits: 0, errors: 0, more: false });
    expect(d.status).toBe('VOIDED');
    expect([...h.store.ledger]).toEqual([[`arena-refund:${d.id}:u1`, { playerId: 'u1', delta: FEE, reasonCode: 'ARENA_REFUND' }]]);
    expect(h.store.balances).toEqual({ u1: FEE });
    expect(eventsOf(d.id)).toEqual([{ type: 'REFUNDED', reason: 'expired', feeLc: FEE, refunded: ['p1'], statusWas: 'WAITING', expiresAt: past().toISOString() }]);
  });

  it('ACTIVE, neither scored → VOIDED, BOTH stakes refunded in full', async () => {
    const d = duel();
    await reclaimExpiredArenaDuels(h.prisma as never, { now: NOW });
    expect(d.status).toBe('VOIDED');
    expect(d.winnerId).toBeNull();
    expect(h.store.balances).toEqual({ u1: FEE, u2: FEE });
    expect(eventsOf(d.id)).toEqual([expect.objectContaining({ type: 'REFUNDED', reason: 'expired', refunded: ['p1', 'p2'], statusWas: 'ACTIVE' })]);
  });

  it('ACTIVE, one side scored → SETTLED to that side as a forfeit win: the normal payout, key and rake', async () => {
    const d = duel({ player2Score: 9 });
    const s = await reclaimExpiredArenaDuels(h.prisma as never, { now: NOW });
    expect(s).toMatchObject({ forfeits: 1, voided: 0 });
    expect(s.results[0]).toMatchObject({ outcome: 'forfeit', winnerId: 'u2', payout: winnerPayout(FEE, RAKE), rake: rakeAmount(FEE, RAKE) });
    expect(d).toMatchObject({ status: 'SETTLED', winnerId: 'u2', player1Score: null, player2Score: 9 });
    // the same idempotency key a played-out win uses — a forfeit and a normal settle can never both pay
    expect([...h.store.ledger]).toEqual([[`arena-settle:${d.id}`, { playerId: 'u2', delta: 90, reasonCode: 'ARENA_WINNINGS' }]]);
    expect(h.store.balances).toEqual({ u2: 90 });                       // pot 100 − rake 10; the rake stays with the house
    expect(eventsOf(d.id)).toEqual([{ type: 'SETTLED', reason: 'expired_forfeit', winnerId: 'u2', payout: 90, rake: 10, p1Score: null, p2Score: 9, expiresAt: past().toISOString() }]);
  });

  it('both scored while open (two submits at one instant) SETTLES to the higher score — a tie refunds both', async () => {
    // MUSIC-SUITE P6 FIX PASS: this row was "asserted, never touched" — both stakes locked forever
    const d = duel({ player1Score: 5, player2Score: 6 });
    const t = duel({ player1Score: 4, player2Score: 4 });
    const s = await reclaimExpiredArenaDuels(h.prisma as never, { now: NOW });
    expect(s).toMatchObject({ scanned: 2, settled: 1, voided: 1 });
    expect(d).toMatchObject({ status: 'SETTLED', winnerId: 'u2' });
    expect(t.status).toBe('VOIDED');
    expect(eventsOf(d.id)).toEqual([expect.objectContaining({ type: 'SETTLED', reason: 'expired_settle', winnerId: 'u2', p1Score: 5, p2Score: 6 })]);
    expect(eventsOf(t.id)).toEqual([expect.objectContaining({ type: 'REFUNDED', reason: 'expired', tie: true, refunded: ['p1', 'p2'] })]);
    expect(h.store.balances).toEqual({ u2: 90 + 50, u1: 50 });
  });

  it('leaves alone: a duel not yet expired, a closed one, the real-money book', async () => {
    duel({ expiresAt: future(3) });
    duel({ status: 'SETTLED', winnerId: 'u1', player1Score: 3, player2Score: 1 });
    duel({ status: 'VOIDED' });
    duel({ currency: 'USD_CENTS' });
    const before = snapshot();
    expect(await reclaimExpiredArenaDuels(h.prisma as never, { now: NOW })).toMatchObject({ scanned: 0, voided: 0, forfeits: 0 });
    expect(snapshot()).toBe(before);
  });

  it('ALL MODES (#30), a paused dance duel included — the pause stops new stakes, not a refund or a payout', async () => {
    expect(isStakingPaused('dance')).toBe(true);
    const hoops = duel({ mode: 'hoops1v1', status: 'WAITING', player2Id: null });
    const dance = duel({ mode: 'dance', player1Score: 1200 });
    const music = duel({ mode: 'music' });
    const oldMusic = duel({ mode: 'musicAcademy', player2Score: 42 });
    const golfGhost = duel({ mode: 'golf', matchType: 'GHOST_DUEL', player2Id: 'house' });
    const fresh = duel({ mode: 'threePoint', expiresAt: future(10) });
    // (MUSIC-SUITE P6 FIX PASS: the old-key music duel's 42 has an attempt behind it — a house-beat score; without one it
    // would be a pre-house-beat score, which counts for nothing: see the music describe below)
    h.store.events.push({ matchId: oldMusic.id, seq: 0, eventType: 'music_attempt_start', userId: 'u2', payload: '{}', createdAt: past(40) });
    const s = await reclaimExpiredArenaDuels(h.prisma as never, { now: NOW });
    expect(s).toMatchObject({ scanned: 5, voided: 2, forfeits: 3, errors: 0 });
    expect([hoops.status, dance.status, music.status, oldMusic.status, golfGhost.status, fresh.status])
      .toEqual(['VOIDED', 'SETTLED', 'VOIDED', 'SETTLED', 'SETTLED', 'ACTIVE']);
    expect([dance.winnerId, oldMusic.winnerId, golfGhost.winnerId]).toEqual(['u1', 'u2', 'house']);
    // u1: hoops refund 50 + dance forfeit 90 + music refund 50; u2: music 50 + old-key music forfeit 90; the Quick Match
    // u1 never played goes to the house (GHOST_UNPLAYED — it used to refund both: a free roll)
    expect(h.store.balances).toEqual({ u1: 190, u2: 140, house: 90 });
  });
});

describe('idempotent and concurrency-safe', () => {
  it('a second sweep changes nothing', async () => {
    duel({ status: 'WAITING', player2Id: null });
    duel();
    duel({ player1Score: 4 });
    await reclaimExpiredArenaDuels(h.prisma as never, { now: NOW });
    const after = snapshot();
    const again = await reclaimExpiredArenaDuels(h.prisma as never, { now: new Date(NOW.getTime() + HOUR) });
    expect(again).toMatchObject({ scanned: 0, voided: 0, forfeits: 0 });
    expect(snapshot()).toBe(after);
    // and reclaiming a closed duel by id is a no-op too
    for (const m of h.store.matches) expect((await reclaimOne(h.prisma as never, m.id, NOW)).outcome).toBe('skipped');
    expect(snapshot()).toBe(after);
  });

  it('two sweeps at once: every duel is moved exactly once — the other sweep finds it claimed and moves nothing', async () => {
    const ds = [duel({ status: 'WAITING', player2Id: null }), duel(), duel({ player1Score: 4 }), duel({ player2Score: 2 })];
    const [a, b] = await Promise.all([
      reclaimExpiredArenaDuels(h.prisma as never, { now: NOW }),
      reclaimExpiredArenaDuels(h.prisma as never, { now: NOW }),
    ]);
    expect(a.voided + b.voided).toBe(2);
    expect(a.forfeits + b.forfeits).toBe(2);
    expect(a.raced + b.raced + a.skipped + b.skipped).toBe(4);           // the loser of each race moved nothing
    expect(h.store.ledger.size).toBe(1 + 2 + 1 + 1);
    expect(h.store.balances).toEqual({ u1: 50 + 50 + 90, u2: 50 + 90 });
    for (const d of ds) expect(eventsOf(d.id)).toHaveLength(1);
  });

  it('behind the claim, the ledger keys hold: even two moves that BOTH got past a (broken) claim pay each stake once', async () => {
    h.store.brokenClaim = true;                                          // the compare-and-set sabotaged: it always "wins"
    const w = duel({ status: 'WAITING', player2Id: null });
    const f = duel({ player1Score: 8 });
    const [a, b] = await Promise.all([
      reclaimExpiredArenaDuels(h.prisma as never, { now: NOW }),
      reclaimExpiredArenaDuels(h.prisma as never, { now: NOW }),
    ]);
    expect(a.voided + b.voided + a.forfeits + b.forfeits).toBeGreaterThan(2);   // the sabotage worked: a duel was moved twice
    expect(h.store.balances).toEqual({ u1: 50 + 90 });                           // and still credited once
    expect([...h.store.ledger.keys()].sort()).toEqual([`arena-refund:${w.id}:u1`, `arena-settle:${f.id}`]);
  });

  it('a row that changes between the read and the claim (a score lands) is "raced": nothing moves, the next sweep re-plans', async () => {
    const d = duel();
    h.store.beforeClaim = () => { d.player2Score = 11; h.store.beforeClaim = null; };   // u2 scores at the last instant
    const first = await reclaimExpiredArenaDuels(h.prisma as never, { now: NOW });
    expect(first.results[0]).toMatchObject({ outcome: 'raced' });
    expect(d.status).toBe('ACTIVE');
    expect(h.store.ledger.size).toBe(0);
    expect(eventsOf(d.id)).toEqual([]);
    const next = await reclaimExpiredArenaDuels(h.prisma as never, { now: NOW });
    expect(next.results[0]).toMatchObject({ outcome: 'forfeit', winnerId: 'u2' });  // not the void the stale read planned
  });

  it('a duel whose Lab Credits fail to move is rolled back whole (still open, no event) and the batch carries on', async () => {
    const bad = duel({ player1Id: 'u3', player2Id: 'u4' });
    const good = duel({ status: 'WAITING', player2Id: null });
    h.store.failLedgerFor = 'u4';                                        // u3's refund goes in, u4's throws
    const s = await reclaimExpiredArenaDuels(h.prisma as never, { now: NOW });
    expect(s).toMatchObject({ errors: 1, voided: 1 });
    expect(bad).toMatchObject({ status: 'ACTIVE', player1Score: null, player2Score: null });
    expect(eventsOf(bad.id)).toEqual([]);
    expect(h.store.balances.u3 ?? 0).toBe(0);                            // u3's half rolled back with the claim
    expect(good.status).toBe('VOIDED');
    h.store.failLedgerFor = null;
    expect((await reclaimExpiredArenaDuels(h.prisma as never, { now: NOW })).results[0]).toMatchObject({ matchId: bad.id, outcome: 'voided' });
    expect(h.store.balances).toMatchObject({ u3: 50, u4: 50 });
  });
});

describe('bounded', () => {
  it('one sweep takes at most its batch, oldest expiry first, and says when there is more', async () => {
    const ds = Array.from({ length: 60 }, (_, i) => duel({ status: 'WAITING', player2Id: null, expiresAt: past(1 + ((i * 37) % 60)) }));
    const oldestFirst = [...ds].sort((x, y) => x.expiresAt.getTime() - y.expiresAt.getTime()).map((d) => d.id);
    const one = await reclaimExpiredArenaDuels(h.prisma as never, { now: NOW, limit: 25 });
    expect(one).toMatchObject({ scanned: 25, voided: 25, more: true });
    expect(one.results.map((r) => r.matchId)).toEqual(oldestFirst.slice(0, 25));
    const two = await reclaimExpiredArenaDuels(h.prisma as never, { now: NOW, limit: 1_000 });   // clamped to 50
    expect(two).toMatchObject({ scanned: 35, voided: 35, more: false });
    expect(h.store.matches.every((m) => m.status === 'VOIDED')).toBe(true);
  });

  it('the lobby\'s sweep is the caller\'s own duels only, RECLAIM_ON_READ_BATCH at most', async () => {
    const mine = Array.from({ length: RECLAIM_ON_READ_BATCH + 2 }, () => duel({ status: 'WAITING', player2Id: null }));
    const theirs = duel({ player1Id: 'u7', player2Id: 'u8' });
    const s = await reclaimOnRead(h.prisma as never, 'u1', { now: NOW });
    expect(s).toMatchObject({ scanned: RECLAIM_ON_READ_BATCH, more: true });
    expect(mine.filter((d) => d.status === 'VOIDED')).toHaveLength(RECLAIM_ON_READ_BATCH);
    expect(theirs.status).toBe('ACTIVE');
  });

  it('the lobby\'s sweep never gets in the way: a failure is null, and a hung one is not waited for past its budget', async () => {
    duel();
    h.store.failCandidates = true;
    expect(await reclaimOnRead(h.prisma as never, 'u1', { now: NOW })).toBeNull();
    h.store.failCandidates = false;
    h.store.hangCandidates = true;
    const t0 = Date.now();
    expect(await reclaimOnRead(h.prisma as never, 'u1', { now: NOW, budgetMs: 30 })).toBeNull();
    expect(Date.now() - t0).toBeLessThan(1_000);
  });
});

describe('GET /api/arena/list — run on read, and the rows say what an expiry did', () => {
  it('reclaims the caller\'s expired duels, labels them, refreshes the wallet, and hides expired open challenges', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    const waiting = duel({ status: 'WAITING', player2Id: null, mode: 'golf' });
    const won = duel({ player1Score: 12 });
    const lost = duel({ player1Id: 'u2', player2Id: 'u1', player1Score: 3 });                 // u1 is p2 and never played
    const both = duel({ mode: 'music' });
    const live = duel({ mode: 'tennis', expiresAt: future(5) });
    const strangerExpired = duel({ player1Id: 'u9', player2Id: null, status: 'WAITING' });
    const strangerOpen = duel({ player1Id: 'u9', player2Id: null, status: 'WAITING', mode: 'skateboarding', expiresAt: future(20) });
    const res = await listGET();
    const j = await res.json() as Row;
    expect(res.status).toBe(200);
    expect(j.reclaimed).toBe(4);
    const row = (id: string) => j.mine.find((m: Row) => m.id === id);
    expect(row(waiting.id)).toMatchObject({ status: 'VOIDED', expired: 'refunded', pastExpiry: false });
    expect(row(won.id)).toMatchObject({ status: 'SETTLED', expired: 'won_by_forfeit', iWon: true });
    expect(row(lost.id)).toMatchObject({ status: 'SETTLED', expired: 'lost_by_forfeit', iWon: false });
    expect(row(both.id)).toMatchObject({ status: 'VOIDED', expired: 'refunded' });
    expect(row(live.id)).toMatchObject({ status: 'ACTIVE', expired: null, pastExpiry: false, expiresAt: future(5).toISOString() });
    // a stranger's expired post is not advertised (join refuses it) — and not swept on MY read; the live one is
    expect(j.open.map((o: Row) => o.id)).toEqual([strangerOpen.id]);
    expect(strangerExpired.status).toBe('WAITING');
    expect(h.store.balances).toEqual({ u1: 50 + 90 + 50, u2: 90 + 50 });
  });

  it('a sweep that fails never fails the lobby: the expired duel is listed as past its deadline, not playable', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    const d = duel();
    h.store.failCandidates = true;
    const res = await listGET();
    const j = await res.json() as Row;
    expect(res.status).toBe(200);
    expect(j.reclaimed).toBe(0);
    expect(j.mine[0]).toMatchObject({ id: d.id, status: 'ACTIVE', expired: null, pastExpiry: true });
  });

  it('a cancelled duel or a tie is not an expiry: those rows keep their plain label', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    const c = duel({ status: 'VOIDED', player2Id: null });
    h.store.events.push({ matchId: c.id, seq: 0, eventType: 'REFUNDED', userId: 'u1', payload: JSON.stringify({ reason: 'cancelled', feeLc: FEE }), createdAt: NOW });
    const j = await (await listGET()).json() as Row;
    expect(j.mine[0]).toMatchObject({ id: c.id, status: 'VOIDED', expired: null });
  });
});

describe('POST /api/arena/reclaim — the scheduled route, behind ARENA_RECLAIM_SECRET', () => {
  const call = (headers: Record<string, string> = {}, body: unknown = {}) =>
    reclaimPOST(new Request('http://fel.local/api/arena/reclaim', { method: 'POST', headers, body: JSON.stringify(body) }) as never);

  it('does not exist without the env (404) — before it reads anything', async () => {
    vi.stubEnv('ARENA_RECLAIM_SECRET', '');
    duel();
    const before = snapshot();
    expect((await call({ [RECLAIM_SECRET_HEADER]: 'anything' })).status).toBe(404);
    expect(snapshot()).toBe(before);
  });

  it('refuses a missing or wrong secret (401), and moves nothing', async () => {
    vi.stubEnv('ARENA_RECLAIM_SECRET', 's3cret-for-the-scheduler');
    duel();
    const before = snapshot();
    expect((await call()).status).toBe(401);
    expect((await call({ [RECLAIM_SECRET_HEADER]: 's3cret-for-the-schedule' })).status).toBe(401);
    expect((await call({ 'x-arena-reclaim': 's3cret-for-the-scheduler' })).status).toBe(401);
    expect(snapshot()).toBe(before);
  });

  it('with the secret: sweeps the WHOLE book (every player), bounded by its clamped limit, and answers the summary', async () => {
    vi.stubEnv('ARENA_RECLAIM_SECRET', 's3cret-for-the-scheduler');
    for (let i = 0; i < 3; i++) duel({ player1Id: `p${i}`, player2Id: `q${i}`, status: 'WAITING', ...(i === 2 ? {} : { player2Id: null }) });
    duel({ player1Id: 'u7', player2Id: 'u8', player2Score: 1 });
    const r = await call({ [RECLAIM_SECRET_HEADER]: 's3cret-for-the-scheduler' }, { limit: 2 });
    const j = await r.json() as Row;
    expect(r.status).toBe(200);
    expect(j).toMatchObject({ ok: true, limit: 2, scanned: 2, more: true });
    const rest = await (await call({ [RECLAIM_SECRET_HEADER]: 's3cret-for-the-scheduler' }, { limit: 'lots' })).json() as Row;
    expect(rest).toMatchObject({ limit: 25, scanned: 2, more: false });
    // the WAITING row that somehow has a player 2 is the asserted anomaly: reported, untouched
    expect(rest.results.concat(j.results).map((x: Row) => x.outcome).sort()).toEqual(['forfeit', 'skipped', 'voided', 'voided']);
    expect(h.store.balances).toEqual({ p0: 50, p1: 50, u8: 90 });
  });

  it('the secret is compared in constant time over digests (a length difference leaks nothing, an empty one never matches)', () => {
    expect(verifyReclaimSecret('abc', 'abc')).toBe(true);
    expect(verifyReclaimSecret('abcd', 'abc')).toBe(false);
    expect(verifyReclaimSecret('', '')).toBe(false);
    expect(verifyReclaimSecret(null, 'abc')).toBe(false);
    expect(verifyReclaimSecret('abc', undefined)).toBe(false);
  });
});

describe('the expiry rule on the routes that take a stake or a score', () => {
  const post = (fn: (r: never) => Promise<Response>, body: unknown) =>
    fn(new Request('http://fel.local/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as never)
      .then(async (r) => ({ status: r.status, json: await r.json() as Row }));

  it('submit-score refuses a duel past expiresAt (409 EXPIRED) in any mode, and writes nothing', async () => {
    for (const mode of ['hoops1v1', 'golf', 'dance']) {
      const d = duel({ mode, expiresAt: new Date(Date.now() - 1) });
      const before = snapshot();
      const r = await post(submitPOST, { matchId: d.id, score: 3 });
      expect(r, mode).toMatchObject({ status: 409, json: { error: 'EXPIRED' } });
      expect(snapshot()).toBe(before);
    }
  });

  it('submit-score, the instant of expiry: a sweep that closed the duel after the read makes the score write match no row — 409, nothing paid', async () => {
    const d = duel({ expiresAt: new Date(Date.now() + HOUR), player2Score: 7 });   // u2 is in; u1 posts the second score
    h.store.beforeUpdate = (where) => {
      if (where.id === d.id && 'player1Score' in where) Object.assign(d, { status: 'SETTLED', winnerId: 'u2' });   // the sweep's forfeit landed first
    };
    const r = await post(submitPOST, { matchId: d.id, score: 7 });              // a tie — would have refunded BOTH on top of the forfeit
    expect(r).toMatchObject({ status: 409, json: { error: 'NOT_SUBMITTABLE' } });
    expect(d.player1Score).toBeNull();
    expect(h.store.ledger.size).toBe(0);
    expect(eventsOf(d.id)).toEqual([]);
  });

  it('submit-score before expiry is unchanged: the second score settles the duel as it always did', async () => {
    const d = duel({ expiresAt: new Date(Date.now() + HOUR), player2Score: 5 });
    const r = await post(submitPOST, { matchId: d.id, score: 8 });
    expect(r).toMatchObject({ status: 200, json: { settled: true, winnerId: 'u1', payout: 90 } });
    expect(d).toMatchObject({ status: 'SETTLED', player1Score: 8 });
    // and a sweep afterwards finds nothing to do
    expect((await reclaimExpiredArenaDuels(h.prisma as never, { now: new Date(Date.now() + 2 * HOUR) })).scanned).toBe(0);
  });

  it('join refuses a posted duel past its expiry (409 EXPIRED) before locking the joiner\'s stake', async () => {
    const d = duel({ player1Id: 'u9', player2Id: null, status: 'WAITING', expiresAt: new Date(Date.now() - 1) });
    const before = snapshot();
    expect(await post(joinPOST, { matchId: d.id })).toMatchObject({ status: 409, json: { error: 'EXPIRED' } });
    expect(snapshot()).toBe(before);
  });

  it('ARENA_EXPIRY_HOURS is still the deadline create and quick-match write (48 h) — the sweep reads it, it does not move it', () => {
    expect(ARENA_EXPIRY_HOURS).toBe(48);
  });
});

describe('the lobby row (components/arena-view.tsx) — "expired — refunded", "won by forfeit", no PLAY past the deadline', () => {
  it('labels a reclaimed duel by what the expiry did, and an open one past its deadline as settling, with no PLAY', async () => {
    const { duelRowView, timeLeft } = await import('../components/arena-view');
    const at = NOW.getTime();
    const base = { status: 'ACTIVE', mySubmitted: false, expiresAt: future(5).toISOString(), expired: null, pastExpiry: false };
    expect(duelRowView(base, at)).toMatchObject({ meta: { label: 'Live — play your round' }, playable: true, left: '5h left' });
    expect(duelRowView({ ...base, status: 'VOIDED', expired: 'refunded' }, at)).toMatchObject({ meta: { label: 'Expired — refunded' }, playable: false, left: null });
    expect(duelRowView({ ...base, status: 'SETTLED', expired: 'won_by_forfeit' }, at)).toMatchObject({ meta: { label: 'Won by forfeit' }, playable: false });
    expect(duelRowView({ ...base, status: 'SETTLED', expired: 'lost_by_forfeit' }, at).meta.label).toBe('Expired — forfeited');
    expect(duelRowView({ ...base, expiresAt: past().toISOString(), pastExpiry: true }, at)).toMatchObject({ meta: { label: 'Expired — settling' }, playable: false, left: null });
    // a cancel or a tie keeps the plain label; a row from an older server (no expiry fields) is exactly what it was
    expect(duelRowView({ ...base, status: 'VOIDED' }, at).meta.label).toBe('Refunded');
    expect(duelRowView({ status: 'ACTIVE', mySubmitted: false }, at)).toMatchObject({ meta: { label: 'Live — play your round' }, playable: true, left: null });
    expect([timeLeft(future(0.5).toISOString(), at), timeLeft(future(30).toISOString(), at), timeLeft(past().toISOString(), at)]).toEqual(['30m left', '1d 6h left', null]);
  });

  it('the page says it in words, and refreshes the wallet when a read reclaimed something', () => {
    const view = readFileSync(join(process.cwd(), 'components/arena-view.tsx'), 'utf8');
    expect(view).toMatch(/Nobody played before the deadline/);
    expect(view).toMatch(/took the pot by forfeit/);
    expect(view).toMatch(/Number\(j\.reclaimed\) > 0[\s\S]{0,200}WALLET_REFRESH_EVENT/);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// MUSIC-SUITE P6 FIX PASS (2026-09-26): the review's blockers on the sweep and the routes around it, each run here.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
const ev = (matchId: string, userId: string, eventType: string, payload: Row = {}, at = past(30)) =>
  h.store.events.push({ matchId, seq: h.store.events.filter((e) => e.matchId === matchId).length, eventType, userId, payload: JSON.stringify(payload), createdAt: at });
const START = 'music_attempt_start', FINISH = 'music_attempt_finish';
/** A decent set on this duel's house beat (every note but every fourth, 20 ms late) and what the server makes of it. */
const setOn = (matchId: string) => {
  const beat = houseBeatFor(matchId);
  const taps = beat.notes.filter((_, i) => i % 4 !== 0).map((n) => houseTap(n.lane, n.t + 0.02));
  return { taps, score: judgeHouseSet(beat, taps).score };
};

describe('P6 fix pass: decision #29 — a music attempt started (or finished) and never submitted is SCORED by the sweep', () => {
  it('a Quick Match, started and left (a reload, a closed tab): the player scores 0, the house is drawn, the house wins — no refund', async () => {
    const d = duel({ mode: 'music', matchType: 'GHOST_DUEL', player2Id: 'house' });
    ev(d.id, 'u1', START);
    const s = await reclaimExpiredArenaDuels(h.prisma as never, { now: NOW });
    expect(s).toMatchObject({ settled: 1, voided: 0 });
    const ghost = drawRivalScore({ seed: d.seed, mode: 'music', playerHistory: [] });
    expect(d).toMatchObject({ status: 'SETTLED', winnerId: 'house', player1Score: 0, player2Score: ghost.score });
    expect(eventsOf(d.id).at(-1)).toMatchObject({ type: 'SETTLED', reason: EXPIRED_SETTLE_REASON, p1Score: 0, p2Score: ghost.score, houseDrawn: 'p2', bandSource: 'baseline', bandCenter: ARENA_SCORE_BASELINES.music });
    expect(h.store.balances).toEqual({ house: 90 });                       // no 50 back to u1 (it used to be refunded in full)
  });

  it('a Quick Match, finished and never submitted (compared with the ghost and held back): settled on the REJUDGE', async () => {
    const d = duel({ mode: 'music', matchType: 'GHOST_DUEL', player2Id: 'house' });
    const set = setOn(d.id);
    ev(d.id, 'u1', START); ev(d.id, 'u1', FINISH, { taps: set.taps });
    const ghost = drawRivalScore({ seed: d.seed, mode: 'music', playerHistory: [] }).score;
    expect(set.score).toBeGreaterThan(ghost);                              // a decent set beats the cold-start house
    await reclaimExpiredArenaDuels(h.prisma as never, { now: NOW });
    expect(d).toMatchObject({ status: 'SETTLED', winnerId: 'u1', player1Score: set.score, player2Score: ghost });
    expect(h.store.balances).toEqual({ u1: 90 });                          // a win the player chose not to post is still theirs
  });

  it('the house\'s draw is the one submit-score makes: the same seed, the same banding (a rejudged history above the floor)', async () => {
    const past1 = duel({ mode: 'music', status: 'SETTLED', player1Score: 60_000, player2Score: 1, expiresAt: past(100), createdAt: past(120) });
    ev(past1.id, 'u1', FINISH, { taps: [] });
    const d = duel({ mode: 'music', matchType: 'GHOST_DUEL', player2Id: 'house' });
    ev(d.id, 'u1', START);
    await reclaimExpiredArenaDuels(h.prisma as never, { now: NOW });
    const ghost = drawRivalScore({ seed: d.seed, mode: 'music', playerHistory: [60_000] });
    expect(ghost.source).toBe('player-history');
    expect(d).toMatchObject({ status: 'SETTLED', winnerId: 'house', player2Score: ghost.score });
  });

  it('a Quick Match its player never STARTED is the house\'s too (GHOST_UNPLAYED), in music as in golf', async () => {
    const m = duel({ mode: 'music', matchType: 'GHOST_DUEL', player2Id: 'house' });
    const g = duel({ mode: 'golf', matchType: 'GHOST_DUEL', player2Id: 'house' });
    await reclaimExpiredArenaDuels(h.prisma as never, { now: NOW });
    expect([m.winnerId, g.winnerId]).toEqual(['house', 'house']);
    expect(eventsOf(g.id)).toEqual([expect.objectContaining({ type: 'SETTLED', reason: EXPIRED_FORFEIT_REASON, winnerId: 'house', unplayedQuickMatch: true })]);
    expect(h.store.balances).toEqual({ house: 180 });
  });

  it('a human duel: a start has PLAYED — started-and-left (0) beats never-showed; finished beats started-and-left', async () => {
    const a = duel({ mode: 'music' });
    ev(a.id, 'u1', START);                                                 // u1 left after START; u2 never came
    const b = duel({ mode: 'music' });
    const set = setOn(b.id);
    ev(b.id, 'u1', START); ev(b.id, 'u1', FINISH, { taps: set.taps });    // u1 finished (never posted)
    ev(b.id, 'u2', START);                                                 // u2 left after START
    await reclaimExpiredArenaDuels(h.prisma as never, { now: NOW });
    expect(a).toMatchObject({ status: 'SETTLED', winnerId: 'u1' });
    const settles = (id: string) => eventsOf(id).filter((e) => e.type === 'SETTLED');
    expect(settles(a.id)).toEqual([expect.objectContaining({ reason: EXPIRED_FORFEIT_REASON, winnerId: 'u1' })]);
    expect(b).toMatchObject({ status: 'SETTLED', winnerId: 'u1', player1Score: set.score, player2Score: 0 });
    expect(settles(b.id)).toEqual([expect.objectContaining({ reason: EXPIRED_SETTLE_REASON, p1Score: set.score, p2Score: 0 })]);
  });

  it('decision #12 at the deadline: a stored score with no attempt behind it (pre-house-beat) counts for nothing', async () => {
    const d = duel({ mode: 'music', player2Score: 150_000 });             // u2's own-grid score from before phase 6
    await reclaimExpiredArenaDuels(h.prisma as never, { now: NOW });
    expect(d.status).toBe('VOIDED');                                       // it used to win u2 the pot by forfeit
    expect(eventsOf(d.id)).toEqual([expect.objectContaining({ type: 'REFUNDED', reason: 'expired', legacyScores: ['p2'] })]);
    expect(h.store.balances).toEqual({ u1: 50, u2: 50 });
  });

  it('the lobby reads a deadline settle back as won / lost at the deadline', () => {
    const e = (payload: Row) => ({ eventType: 'SETTLED', payload: JSON.stringify(payload) });
    expect(expiredOutcomeOf(e({ reason: EXPIRED_SETTLE_REASON, winnerId: 'u1' }), 'u1')).toBe('won_at_deadline');
    expect(expiredOutcomeOf(e({ reason: EXPIRED_SETTLE_REASON, winnerId: 'house' }), 'u1')).toBe('lost_at_deadline');
  });
});

describe('P6 fix pass: races the review found, run with the fake\'s row locks', () => {
  const post = (fn: (r: never) => Promise<Response>, body: unknown) =>
    fn(new Request('http://fel.local/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as never)
      .then(async (r) => ({ status: r.status, json: await r.json() as Row }));

  it('two starts at once: WITHOUT the row lock both got 200 (two live attempts) — with it, one start and a 409 ONE_ATTEMPT', async () => {
    h.store.noLocks = true;                                                // the old read-then-insert, as it raced
    const raced = duel({ mode: 'music', expiresAt: future(10) });
    const [a, b] = await Promise.all([post(attemptPOST, { matchId: raced.id, phase: 'start' }), post(attemptPOST, { matchId: raced.id, phase: 'start' })]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(h.store.events.filter((e) => e.matchId === raced.id && e.eventType === START)).toHaveLength(2);
    h.store.noLocks = false;                                               // lockMatchRow, as shipped
    const d = duel({ mode: 'music', expiresAt: future(10) });
    const [x, y] = await Promise.all([post(attemptPOST, { matchId: d.id, phase: 'start' }), post(attemptPOST, { matchId: d.id, phase: 'start' })]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
    expect([x.json.error, y.json.error]).toContain('ONE_ATTEMPT');
    expect(h.store.events.filter((e) => e.matchId === d.id && e.eventType === START)).toHaveLength(1);
  });

  it('two submits at once: the later one reads the other score back from its own write, and the duel SETTLES', async () => {
    const d = duel({ expiresAt: future(10) });
    const [a, b] = await Promise.all([
      (async () => { h.store.user = 'u1'; return post(submitPOST, { matchId: d.id, score: 5 }); })(),
      (async () => { await new Promise((r) => setImmediate(r)); h.store.user = 'u2'; return post(submitPOST, { matchId: d.id, score: 9 }); })(),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.json.settled, b.json.settled].filter(Boolean)).toHaveLength(1);
    expect(d).toMatchObject({ status: 'SETTLED', winnerId: 'u2', player1Score: 5, player2Score: 9 });
    expect(h.store.balances).toEqual({ u2: 90 });
  });
});

describe('P6 fix pass: the deadline starts again at the JOIN (the creator gets a window to play)', () => {
  const post = (fn: (r: never) => Promise<Response>, body: unknown) =>
    fn(new Request('http://fel.local/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as never)
      .then(async (r) => ({ status: r.status, json: await r.json() as Row }));

  it('a duel joined 10 minutes before its old deadline: the joiner plays at once, and the creator is NOT forfeited at that deadline', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    const d = duel({ mode: 'hoops1v1', status: 'WAITING', player1Id: 'u9', player2Id: null, expiresAt: new Date(NOW.getTime() + 10 * 60_000) });
    h.store.user = 'u1';
    expect((await post(joinPOST, { matchId: d.id })).status).toBe(200);
    expect(new Date(d.expiresAt).getTime()).toBe(NOW.getTime() + ARENA_EXPIRY_HOURS * HOUR);
    expect((await post(submitPOST, { matchId: d.id, score: 7 })).status).toBe(200);        // the joiner plays at once
    const oldDeadline = new Date(NOW.getTime() + 11 * 60_000);
    expect((await reclaimExpiredArenaDuels(h.prisma as never, { now: oldDeadline })).scanned).toBe(0);
    expect(d).toMatchObject({ status: 'ACTIVE', winnerId: null });                           // the creator can still play
    // …and at the NEW deadline, a creator who never came back loses by forfeit, as #30 says
    const s = await reclaimExpiredArenaDuels(h.prisma as never, { now: new Date(NOW.getTime() + ARENA_EXPIRY_HOURS * HOUR) });
    expect(s.forfeits).toBe(1);
    expect(d).toMatchObject({ status: 'SETTLED', winnerId: 'u1' });
  });
});

describe('P6 fix pass: the lobby row says an attempt is used, and a deadline settle', () => {
  it('ACTIVE, unsubmitted, attempt used: labelled, PLAY kept (the room posts the used attempt); settled-at-deadline labels', async () => {
    const { duelRowView } = await import('../components/arena-view');
    const at = NOW.getTime();
    const base = { status: 'ACTIVE', mySubmitted: false, expiresAt: future(5).toISOString(), expired: null, pastExpiry: false };
    expect(duelRowView({ ...base, musicAttempt: 'started' }, at)).toMatchObject({ meta: { label: 'Attempt used — PLAY posts it' }, playable: true });
    expect(duelRowView({ ...base, musicAttempt: null }, at).meta.label).toBe('Live — play your round');
    expect(duelRowView({ ...base, status: 'SETTLED', expired: 'won_at_deadline' }, at).meta.label).toBe('Won at the deadline');
    expect(duelRowView({ ...base, status: 'SETTLED', expired: 'lost_at_deadline' }, at).meta.label).toBe('Lost at the deadline');
    const view = readFileSync(join(process.cwd(), 'components/arena-view.tsx'), 'utf8');
    expect(view).toMatch(/the \{d\.feeLc\} LC stake went to the house/);
  });
});
