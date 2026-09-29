// MUSIC-SUITE P6 (2026-09-26): POST /api/arena/music-attempt — an Arena music duel's ONE attempt — run for real with
// auth and the database mocked (the fake transaction lib/arenaSubmitRoute.test.ts uses; no DATABASE_URL, no network).
// Owner decisions #12 ("one attempt, count-in") and #29 ("a reload after the count-in scores 0, said before it").
// Proven: a start is recorded once and a second is refused 409 ONE_ATTEMPT; a finish only after a start, only once,
// not sooner than the set can be played, with a checked and capped tap list; who may post (a player, of a music duel,
// in the Arena book, while it is open, joined, unexpired and unscored); and the whole chain — start, finish, and
// submit-score taking exactly the score the finish answered.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ tx: null as unknown, user: 'u1' as string | null, refunds: [] as string[] }));

vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => (h.user ? { user: { id: h.user } } : null)) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/analytics-server', () => ({ recordServerEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/db', () => ({ prisma: { $transaction: async (fn: (tx: unknown) => unknown) => fn(h.tx) } }));
vi.mock('@/lib/arena', async (orig) => ({
  ...(await orig<typeof import('@/lib/arena')>()),
  arenaPayWinner: vi.fn(async () => ({ payout: 90, rake: 10 })),
  arenaRefund: vi.fn(async (_tx: unknown, a: { userId: string }) => { h.refunds.push(a.userId); return 0; }),
}));

import {
  houseBeatFor, houseTap, judgeHouseSet, houseMinFinishMs, houseBeatSummary, HOUSE_MAX_TAPS, HOUSE_ARENA_RULES, houseCountInMs,
  houseSetMs, type HouseTap,
} from './babylon/music/houseBeat';
import { MUSIC_ATTEMPT_START, MUSIC_ATTEMPT_FINISH, HOUSE_START_RETRY_MS, HOUSE_START_MARGIN_MS } from './arena-music';

interface Ev { matchId: string; userId: string | null; eventType: string; payload: string; createdAt: Date; seq: number }
interface Db { match: Record<string, unknown>; events: Ev[]; updates: Record<string, unknown>[]; locks: number; refunds: string[] }

/** One duel and its event log, shared by every route a test calls (music-attempt, then submit-score). */
function fakeDb(over: Record<string, unknown> = {}): Db {
  const db: Db = {
    match: {
      id: 'mm1', currency: 'LC', status: 'ACTIVE', matchType: 'H2H', mode: 'music', seed: 'seed-1', createdAt: new Date('2026-09-26'),
      expiresAt: new Date(Date.now() + 3_600_000), player1Id: 'u1', player2Id: 'u2', player1Score: null, player2Score: null,
      entryFeeCents: 50, rakePercent: 10, ...over,
    },
    events: [], updates: [], locks: 0, refunds: [],
  };
  h.tx = {
    competitionMatch: {
      // MUSIC-SUITE P6 FIX PASS: the duel's row lock (lockMatchRow) — an UPDATE of updatedAt only
      updateMany: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        if (where.id !== db.match.id) return { count: 0 };
        expect(Object.keys(data)).toEqual(['updatedAt']);
        db.locks++;
        return { count: 1 };
      },
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === db.match.id ? { ...db.match } : null),
      update: async ({ data }: { data: Record<string, unknown> }) => { db.updates.push(data); Object.assign(db.match, data); return { ...db.match }; },
      findMany: async () => [],
    },
    matchEvent: {
      findFirst: async ({ where }: { where: { matchId: string } }) => {
        const mine = db.events.filter((e) => e.matchId === where.matchId);
        return mine.length ? { seq: Math.max(...mine.map((e) => e.seq)) } : null;
      },
      create: async ({ data }: { data: Omit<Ev, 'createdAt'> }) => { db.events.push({ ...data, createdAt: new Date() }); },
      findMany: async ({ where }: { where: { matchId: string; userId: string; eventType: { in: string[] } } }) => db.events
        .filter((e) => e.matchId === where.matchId && e.userId === where.userId && where.eventType.in.includes(e.eventType))
        .sort((a, b) => a.seq - b.seq),
    },
    gameSession: { findMany: async () => [] },
  };
  return db;
}

/** A start recorded `agoMs` before now (the set has been playing that long). */
function startedAgo(db: Db, agoMs: number, userId = 'u1'): void {
  db.events.push({ matchId: String(db.match.id), userId, eventType: MUSIC_ATTEMPT_START, payload: '{}', createdAt: new Date(Date.now() - agoMs), seq: db.events.length });
}

async function attempt(body: unknown) {
  const { POST } = await import('@/app/api/arena/music-attempt/route');
  const res = await POST(new Request('http://fel.local/api/arena/music-attempt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as never);
  return { status: res.status, json: await res.json() as Record<string, unknown> };
}
async function submit(body: unknown) {
  const { POST } = await import('@/app/api/arena/submit-score/route');
  const res = await POST(new Request('http://fel.local/api/arena/submit-score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as never);
  return { status: res.status, json: await res.json() as Record<string, unknown> };
}

const beat = houseBeatFor('mm1');
const SET_PLAYED_MS = houseMinFinishMs(beat) + 5_000;
/** A decent set: every note but every seventh, 20 ms late. */
const decentTaps = (): HouseTap[] => beat.notes.filter((_, i) => i % 7 !== 0).map((n) => houseTap(n.lane, n.t + 0.02));

beforeEach(() => { h.tx = null; h.user = 'u1'; h.refunds = []; });

describe('phase: start — the one attempt', () => {
  it('records the start once, with the beat it is played on, and answers the beat and the rules line', async () => {
    const db = fakeDb();
    const r = await attempt({ matchId: 'mm1', phase: 'start' });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, phase: 'start', beat: houseBeatSummary(beat), rules: HOUSE_ARENA_RULES });
    expect(db.events).toHaveLength(1);
    expect(db.events[0]).toMatchObject({ matchId: 'mm1', userId: 'u1', eventType: MUSIC_ATTEMPT_START });
    expect(JSON.parse(db.events[0].payload)).toEqual({ player: 'p1', ...houseBeatSummary(beat) });
    expect(db.updates).toEqual([]);                                             // the duel row itself is not touched…
    expect(db.locks).toBe(1);                                                   // …only locked (MUSIC-SUITE P6 FIX PASS)
  });

  it('refuses a second start: 409 ONE_ATTEMPT (a reload after the count-in), nothing written', async () => {
    const db = fakeDb();
    expect((await attempt({ matchId: 'mm1', phase: 'start' })).status).toBe(200);
    const again = await attempt({ matchId: 'mm1', phase: 'start' });
    expect(again.status).toBe(409);
    expect(again.json.error).toBe('ONE_ATTEMPT');
    expect(String(again.json.detail)).toMatch(/scores 0/);
    expect(db.events).toHaveLength(1);
  });

  it('one attempt EACH: the other player\'s start does not use mine', async () => {
    const db = fakeDb();
    h.user = 'u2';
    expect((await attempt({ matchId: 'mm1', phase: 'start' })).status).toBe(200);
    h.user = 'u1';
    expect((await attempt({ matchId: 'mm1', phase: 'start' })).status).toBe(200);
    expect(db.events.map((e) => [e.userId, JSON.parse(e.payload).player])).toEqual([['u2', 'p2'], ['u1', 'p1']]);
  });
});

describe('phase: finish — the tap list', () => {
  it('only after a start: 409 NOT_STARTED', async () => {
    const db = fakeDb();
    const r = await attempt({ matchId: 'mm1', phase: 'finish', taps: decentTaps() });
    expect(r).toMatchObject({ status: 409, json: { error: 'NOT_STARTED' } });
    expect(db.events).toHaveLength(0);
  });

  it('records the taps and answers the score the server makes of them — the one submit-score will require', async () => {
    const db = fakeDb();
    startedAgo(db, SET_PLAYED_MS);
    const taps = decentTaps();
    const r = await attempt({ matchId: 'mm1', phase: 'finish', taps });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, phase: 'finish', taps: taps.length, score: judgeHouseSet(beat, taps).score });
    const fin = db.events.find((e) => e.eventType === MUSIC_ATTEMPT_FINISH)!;
    expect(JSON.parse(fin.payload)).toEqual({ player: 'p1', v: beat.v, n: taps.length, taps });
  });

  it('only once: a second finish (a better tap list) is 409 ALREADY_FINISHED', async () => {
    const db = fakeDb();
    startedAgo(db, SET_PLAYED_MS);
    expect((await attempt({ matchId: 'mm1', phase: 'finish', taps: decentTaps() })).status).toBe(200);
    const perfect = beat.notes.map((n) => houseTap(n.lane, n.t));
    expect(await attempt({ matchId: 'mm1', phase: 'finish', taps: perfect })).toMatchObject({ status: 409, json: { error: 'ALREADY_FINISHED' } });
    expect(db.events.filter((e) => e.eventType === MUSIC_ATTEMPT_FINISH)).toHaveLength(1);
  });

  it('not sooner than the set can be played: a finish right after the start is 409 FINISHED_TOO_SOON', async () => {
    const db = fakeDb();
    startedAgo(db, houseMinFinishMs(beat) - 2_000);
    expect(await attempt({ matchId: 'mm1', phase: 'finish', taps: decentTaps() })).toMatchObject({ status: 409, json: { error: 'FINISHED_TOO_SOON' } });
    expect(db.events.filter((e) => e.eventType === MUSIC_ATTEMPT_FINISH)).toHaveLength(0);
  });

  it(`caps the list: ${HOUSE_MAX_TAPS} taps are taken, one more is 400 TOO_MANY_TAPS and nothing is written`, async () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ lane: ['kick', 'snare', 'hats', 'perc'][i % 4], tMs: (i * 20) % 60_000 }));
    const over = fakeDb();
    startedAgo(over, SET_PLAYED_MS);
    expect(await attempt({ matchId: 'mm1', phase: 'finish', taps: many(HOUSE_MAX_TAPS + 1) })).toMatchObject({ status: 400, json: { error: 'TOO_MANY_TAPS' } });
    expect(over.events.filter((e) => e.eventType === MUSIC_ATTEMPT_FINISH)).toHaveLength(0);
    const at = fakeDb();
    startedAgo(at, SET_PLAYED_MS);
    expect((await attempt({ matchId: 'mm1', phase: 'finish', taps: many(HOUSE_MAX_TAPS) })).status).toBe(200);
  });

  it('refuses a list that does not parse (400 TAPS_INVALID) — and a refused finish can be posted again, fixed', async () => {
    const db = fakeDb();
    startedAgo(db, SET_PLAYED_MS);
    for (const taps of [undefined, 'x', [{ lane: 'cowbell', tMs: 1 }], [{ lane: 'kick', tMs: Number.MAX_SAFE_INTEGER }], [{ lane: 0, tMs: 100 }]]) {
      expect((await attempt({ matchId: 'mm1', phase: 'finish', taps })).json.error, JSON.stringify(taps)).toBe('TAPS_INVALID');
    }
    expect(db.events.filter((e) => e.eventType === MUSIC_ATTEMPT_FINISH)).toHaveLength(0);
    expect((await attempt({ matchId: 'mm1', phase: 'finish', taps: decentTaps() })).status).toBe(200);
  });
});

describe('who may post, and on what', () => {
  it('not signed in: 401', async () => {
    fakeDb();
    h.user = null;
    expect((await attempt({ matchId: 'mm1', phase: 'start' })).status).toBe(401);
  });

  it('a bad body: 400 (no matchId, an unknown phase)', async () => {
    fakeDb();
    expect((await attempt({ phase: 'start' })).status).toBe(400);
    expect((await attempt({ matchId: 'mm1', phase: 'restart' })).status).toBe(400);
    expect((await attempt({ matchId: 'x'.repeat(65), phase: 'start' })).status).toBe(400);
  });

  it('not a player in the duel: 403 NOT_A_PLAYER, nothing written', async () => {
    const db = fakeDb();
    h.user = 'u9';
    expect(await attempt({ matchId: 'mm1', phase: 'start' })).toMatchObject({ status: 403, json: { error: 'NOT_A_PLAYER' } });
    expect(db.events).toHaveLength(0);
  });

  it('not a music duel: 400 NOT_A_MUSIC_DUEL (a 3PT duel has no house beat); the old key "musicAcademy" is a music duel', async () => {
    const db = fakeDb({ mode: 'threePoint' });
    expect(await attempt({ matchId: 'mm1', phase: 'start' })).toMatchObject({ status: 400, json: { error: 'NOT_A_MUSIC_DUEL' } });
    expect(db.events).toHaveLength(0);
    fakeDb({ mode: 'musicAcademy' });
    expect((await attempt({ matchId: 'mm1', phase: 'start' })).status).toBe(200);
  });

  it('no such duel 404; not the Arena book 400 WRONG_BOOK', async () => {
    fakeDb();
    expect((await attempt({ matchId: 'nope', phase: 'start' })).status).toBe(404);
    fakeDb({ currency: 'USD_CENTS' });
    expect(await attempt({ matchId: 'mm1', phase: 'start' })).toMatchObject({ status: 400, json: { error: 'WRONG_BOOK' } });
  });

  it('a closed duel, one with no opponent yet, an expired one, one I have scored: 409, nothing written', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ status: 'SETTLED' }, 'NOT_SUBMITTABLE'],
      [{ status: 'WAITING', player2Id: null }, 'WAITING_OPPONENT'],   // submit-score would refuse the score: the attempt waits too
      [{ expiresAt: new Date(Date.now() - 1000) }, 'EXPIRED'],
      [{ player1Score: 0 }, 'ALREADY_SCORED'],
    ];
    for (const [over, code] of cases) {
      const db = fakeDb(over);
      expect(await attempt({ matchId: 'mm1', phase: 'start' }), code).toMatchObject({ status: 409, json: { error: code } });
      expect(db.events, code).toHaveLength(0);
    }
    const noExpiry = fakeDb({ expiresAt: null });                    // a row with no expiry is not expired
    expect((await attempt({ matchId: 'mm1', phase: 'start' })).status).toBe(200);
    expect(noExpiry.events).toHaveLength(1);
  });
});

describe('the whole chain: start, finish, submit', () => {
  it('submit-score takes exactly the score the finish answered, and nothing else', async () => {
    const db = fakeDb({ player2Score: 1000 });
    startedAgo(db, SET_PLAYED_MS * 2, 'u2');   // (P6 fix pass: the opponent's 1,000 is a house-beat score — their attempt is on file)
    expect((await attempt({ matchId: 'mm1', phase: 'start' })).status).toBe(200);
    db.events.find((e) => e.userId === 'u1')!.createdAt = new Date(Date.now() - SET_PLAYED_MS);   // …the set plays…
    const fin = await attempt({ matchId: 'mm1', phase: 'finish', taps: decentTaps() });
    const score = Number(fin.json.score);
    expect(score).toBeGreaterThan(1000);
    expect((await submit({ matchId: 'mm1', score: score + 100 })).json.error).toBe('SCORE_MISMATCH');
    const ok = await submit({ matchId: 'mm1', score });
    expect(ok.status).toBe(200);
    expect(ok.json).toMatchObject({ settled: true, result: 'p1', iWon: true });
    // …and the attempt is spent: the duel settled, so no new start
    expect(await attempt({ matchId: 'mm1', phase: 'start' })).toMatchObject({ status: 409, json: { error: 'NOT_SUBMITTABLE' } });
  });

  it('a reload after the count-in: the second start is refused, and the duel settles with 0', async () => {
    const db = fakeDb({ player2Score: 1000 });
    startedAgo(db, SET_PLAYED_MS * 2, 'u2');
    expect((await attempt({ matchId: 'mm1', phase: 'start' })).status).toBe(200);
    const reloaded = await attempt({ matchId: 'mm1', phase: 'start' });                           // the reloaded room
    expect(reloaded.json).toMatchObject({ error: 'ONE_ATTEMPT', finished: false, score: 0 });     // …told what to post: 0
    expect((await submit({ matchId: 'mm1', score: 800 })).json.error).toBe('SCORE_MISMATCH');
    const r = await submit({ matchId: 'mm1', score: 0 });
    expect(r.json).toMatchObject({ settled: true, result: 'p2' });
    expect(db.match.player1Score).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// MUSIC-SUITE P6 FIX PASS (2026-09-26): the review's findings on this route, each proven here.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('P6 fix pass: a lost reply is not a lost attempt (attemptId)', () => {
  it('a start repeated with the SAME attemptId, unfinished, inside the retry window answers the first start (nothing new written)', async () => {
    const db = fakeDb();
    expect((await attempt({ matchId: 'mm1', phase: 'start', attemptId: 'room-abc12345' })).status).toBe(200);
    expect(JSON.parse(db.events[0].payload)).toMatchObject({ attemptId: 'room-abc12345' });
    const again = await attempt({ matchId: 'mm1', phase: 'start', attemptId: 'room-abc12345' });
    expect(again).toMatchObject({ status: 200, json: { ok: true, replayed: true, beat: houseBeatSummary(beat) } });
    expect(db.events).toHaveLength(1);
  });

  it('…but not another page\'s id, not with no id, and not once the window has passed: 409 ONE_ATTEMPT', async () => {
    const db = fakeDb();
    expect((await attempt({ matchId: 'mm1', phase: 'start', attemptId: 'room-abc12345' })).status).toBe(200);
    expect((await attempt({ matchId: 'mm1', phase: 'start', attemptId: 'room-new99999' })).json.error).toBe('ONE_ATTEMPT');
    expect((await attempt({ matchId: 'mm1', phase: 'start' })).json.error).toBe('ONE_ATTEMPT');
    db.events[0].createdAt = new Date(Date.now() - HOUSE_START_RETRY_MS - 1_000);
    expect((await attempt({ matchId: 'mm1', phase: 'start', attemptId: 'room-abc12345' })).json.error).toBe('ONE_ATTEMPT');
    expect(db.events).toHaveLength(1);
  });

  it('ONE_ATTEMPT says what the used attempt scores: 0 unfinished (#29), the rejudge finished — the room posts that', async () => {
    const db = fakeDb();
    startedAgo(db, SET_PLAYED_MS);
    expect(await attempt({ matchId: 'mm1', phase: 'start' })).toMatchObject({ status: 409, json: { error: 'ONE_ATTEMPT', finished: false, score: 0 } });
    const fin = await attempt({ matchId: 'mm1', phase: 'finish', taps: decentTaps() });
    expect(await attempt({ matchId: 'mm1', phase: 'start' })).toMatchObject({ status: 409, json: { error: 'ONE_ATTEMPT', finished: true, score: fin.json.score } });
  });

  it('a finish repeated with the SAME taps answers the recorded score again; different taps are ALREADY_FINISHED', async () => {
    const db = fakeDb();
    startedAgo(db, SET_PLAYED_MS);
    const taps = decentTaps();
    const first = await attempt({ matchId: 'mm1', phase: 'finish', taps });
    const again = await attempt({ matchId: 'mm1', phase: 'finish', taps });
    expect(again).toMatchObject({ status: 200, json: { ok: true, replayed: true, score: first.json.score } });
    expect(db.events.filter((e) => e.eventType === MUSIC_ATTEMPT_FINISH)).toHaveLength(1);
    expect((await attempt({ matchId: 'mm1', phase: 'finish', taps: taps.slice(1) })).json.error).toBe('ALREADY_FINISHED');
  });
});

describe('P6 fix pass: a start the deadline cannot hold, and a duel from before the house beat', () => {
  it('TOO_LATE: a start whose set could not end before the deadline is refused, nothing used', async () => {
    const need = houseCountInMs(beat) + houseSetMs(beat) + HOUSE_START_MARGIN_MS;
    const db = fakeDb({ expiresAt: new Date(Date.now() + need - 5_000) });
    expect(await attempt({ matchId: 'mm1', phase: 'start' })).toMatchObject({ status: 409, json: { error: 'TOO_LATE' } });
    expect(db.events).toHaveLength(0);
    const ok = fakeDb({ expiresAt: new Date(Date.now() + need + 5_000) });
    expect((await attempt({ matchId: 'mm1', phase: 'start' })).status).toBe(200);
    expect(ok.events).toHaveLength(1);
  });

  it('PRE_HOUSE_BEAT: the opponent\'s stored score has no attempt behind it — both refunded at START, the duel voided', async () => {
    const db = fakeDb({ player2Score: 150_000 });                  // u2 posted on their own grid, before phase 6
    const r = await attempt({ matchId: 'mm1', phase: 'start' });
    expect(r).toMatchObject({ status: 409, json: { error: 'PRE_HOUSE_BEAT', refunded: true } });
    expect(h.refunds.sort()).toEqual(['u1', 'u2']);
    expect(db.match.status).toBe('VOIDED');
    expect(db.events.map((e) => [e.eventType, JSON.parse(e.payload).reason])).toEqual([['REFUNDED', 'pre_house_beat']]);
    // an opponent WITH an attempt behind their score is a house-beat score: the start goes ahead
    const fresh = fakeDb({ player2Score: 40_000 });
    startedAgo(fresh, SET_PLAYED_MS * 2, 'u2');
    expect((await attempt({ matchId: 'mm1', phase: 'start' })).status).toBe(200);
  });

  it('submit-score is the backstop: a pre-house-beat opponent score is never settled against (409 PRE_HOUSE_BEAT, both refunded)', async () => {
    const db = fakeDb({ player2Score: 150_000 });
    startedAgo(db, SET_PLAYED_MS);                                   // u1 started before the check existed (or raced it)
    const r = await submit({ matchId: 'mm1', score: 0 });
    expect(r).toMatchObject({ status: 409, json: { error: 'PRE_HOUSE_BEAT', refunded: true } });
    expect(h.refunds.sort()).toEqual(['u1', 'u2']);
    expect(db.match).toMatchObject({ status: 'VOIDED', player1Score: null });
  });
});
