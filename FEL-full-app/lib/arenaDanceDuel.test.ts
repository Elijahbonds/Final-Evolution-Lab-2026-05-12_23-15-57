// MUSIC-SUITE P9 (2026-09-29): A CYPHER DUEL — owner decision #10 ("Arena dance (fixed): same house song for both
// players, accuracy-based score; own songs free play only; friend challenges same rule"). The real routes, run with auth
// and the database mocked (the fake transaction lib/arenaMusicAttempt.test.ts uses; no DATABASE_URL, no network):
//   · POST /api/arena/music-attempt takes a DANCE duel's one attempt through the same code as music's — a start recorded
//     once as dance_attempt_start with the house song it is danced to, a second 409 ONE_ATTEMPT, a finish only after a
//     start, not sooner than the song can be danced, with a checked press list, a replayed finish answering the same score;
//     TOO_LATE and a pre-house-song opponent (409 PRE_HOUSE_SONG, both refunded) as for music;
//   · POST /api/arena/submit-score: no attempt 409 NO_ATTEMPT; a started-and-left attempt submits 0 and nothing else; the
//     posted score must be judgeDanceSet's accuracy on the stored presses (else 422 SCORE_MISMATCH, nothing written); past
//     the deadline 409 EXPIRED; a pre-house-song opponent is voided and refunded; the house rival of a dance Quick Match is
//     drawn under the dance STAKE ceiling (10,000) off the 5,000 baseline, and banded on rejudged dance sets only;
//   · the whole chain — start, finish, submit taking exactly the score the finish answered — settles a human duel on the
//     two dancers' accuracy on the SAME song, whatever it is worth in points.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ tx: null as unknown, user: 'u1' as string | null, refunds: [] as string[], payouts: [] as string[] }));

vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => (h.user ? { user: { id: h.user } } : null)) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/analytics-server', () => ({ recordServerEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/db', () => ({ prisma: { $transaction: async (fn: (tx: unknown) => unknown) => fn(h.tx) } }));
vi.mock('@/lib/arena', async (orig) => ({
  ...(await orig<typeof import('@/lib/arena')>()),
  arenaPayWinner: vi.fn(async (_tx: unknown, a: { winnerId: string }) => { h.payouts.push(a.winnerId); return { payout: 90, rake: 10 }; }),
  arenaRefund: vi.fn(async (_tx: unknown, a: { userId: string }) => { h.refunds.push(a.userId); return 0; }),
}));

import {
  houseSongFor, houseSongSteps, houseSongSummary, houseSongMinFinishMs, houseSongCountInMs, houseSongSetMs, judgeDanceSet,
  dancePress, DANCE_ARENA_RULES, DANCE_ARENA_SCALE, DANCE_MAX_PRESSES, type HousePress,
  dancePressPrint, houseChartPrint, HOUSE_SONG_VERSION,
} from './babylon/dance/houseSong';
import { drawHouseScore, danceSongOfRow, DANCE_SAME_SONG_READ } from './arena-ghost';
import { beatDuration, isPressHold } from './babylon/core/DanceCore';
import {
  DANCE_ATTEMPT_START, DANCE_ATTEMPT_FINISH, MUSIC_ATTEMPT_START, HOUSE_START_MARGIN_MS, HOUSE_SET_RULES, houseSetModeOf,
  isHouseSetDuel, isDanceDuel, isMusicDuel, readHouseAttempt, houseAttemptScore, houseSetRulesFor, PRE_HOUSE_SONG_REASON,
} from './arena-music';
import { ARENA_STAKE_CEILINGS, stakeCeilingFor, checkStakeScore, SCORE_CEILINGS } from './arena-score-integrity';
import { ARENA_SCORE_BASELINES, RIVAL_BAND, RIVAL_SCORE_EVENT, RIVAL_FROM_DUEL_SCORES, RIVAL_BASELINE_FLOOR, drawRivalScore, ownDuelScores } from './arena-rivals';

interface Ev { matchId: string; userId: string | null; eventType: string; payload: string; createdAt: Date; seq: number }
interface Db { match: Record<string, unknown>; events: Ev[]; updates: Record<string, unknown>[]; locks: number; history: Record<string, unknown>[] }

/** One dance duel and its event log, shared by every route a test calls (the attempt route, then submit-score). */
function fakeDb(over: Record<string, unknown> = {}): Db {
  const db: Db = {
    match: {
      id: 'dd1', currency: 'LC', status: 'ACTIVE', matchType: 'H2H', mode: 'dance', seed: 'seed-dance-1', createdAt: new Date('2026-09-29'),
      expiresAt: new Date(Date.now() + 3_600_000), player1Id: 'u1', player2Id: 'u2', player1Score: null, player2Score: null,
      entryFeeCents: 50, rakePercent: 10, ...over,
    },
    events: [], updates: [], locks: 0, history: [],
  };
  h.tx = {
    competitionMatch: {
      updateMany: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        if (where.id !== db.match.id) return { count: 0 };
        expect(Object.keys(data)).toEqual(['updatedAt']);
        db.locks++;
        return { count: 1 };
      },
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === db.match.id ? { ...db.match } : null),
      update: async ({ data }: { data: Record<string, unknown> }) => { db.updates.push(data); Object.assign(db.match, data); return { ...db.match }; },
      // the house draw's read of this player's past dance duels (lib/arena-ghost.ts, RIVAL_FROM_DUEL_SCORES)
      findMany: async (args: Record<string, unknown>) => { db.history.push(args); return []; },
    },
    matchEvent: {
      findFirst: async ({ where }: { where: { matchId: string } }) => {
        const mine = db.events.filter((e) => e.matchId === where.matchId);
        return mine.length ? { seq: Math.max(...mine.map((e) => e.seq)) } : null;
      },
      create: async ({ data }: { data: Omit<Ev, 'createdAt'> }) => { db.events.push({ ...data, createdAt: new Date() }); },
      // (MUSIC-SUITE P9 FIX PASS: also the finish's read of this player's OTHER dance finishes — no matchId, NOT this one)
      findMany: async ({ where }: { where: { matchId?: string; NOT?: { matchId: string }; userId: string; eventType: { in: string[] } } }) => db.events
        .filter((e) => (where.matchId === undefined || e.matchId === where.matchId) && (where.NOT === undefined || e.matchId !== where.NOT.matchId)
          && e.userId === where.userId && where.eventType.in.includes(e.eventType))
        .sort((a, b) => a.seq - b.seq),
    },
    gameSession: { findMany: async () => { throw new Error('a dance rival must not be banded on free-play sessions'); } },
  };
  return db;
}

/** A start recorded `agoMs` before now (the song has been playing that long). `payload`: what the start recorded. */
function startedAgo(db: Db, agoMs: number, userId = 'u1', eventType = DANCE_ATTEMPT_START, payload: Record<string, unknown> = {}): void {
  db.events.push({ matchId: String(db.match.id), userId, eventType, payload: JSON.stringify(payload), createdAt: new Date(Date.now() - agoMs), seq: db.events.length });
}
function finished(db: Db, presses: HousePress[], userId = 'u1'): void {
  db.events.push({ matchId: String(db.match.id), userId, eventType: DANCE_ATTEMPT_FINISH, payload: JSON.stringify({ taps: presses }), createdAt: new Date(), seq: db.events.length });
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

const song = houseSongFor('dd1');
const PLAYED_MS = houseSongMinFinishMs(song) + 5_000;
/** A dancer on dd1's house song: every step but every `skip`-th, `lateMs` late, holds held to their end, key A. */
function presses(skip = 7, lateMs = 20): HousePress[] {
  const bd = beatDuration(song.bpm);
  const out: HousePress[] = [];
  houseSongSteps(song).forEach((s, i) => {
    if (skip > 0 && i % skip === 0) return;
    const t = s.beat * bd + lateMs / 1000;
    out.push(dancePress(t, { key: 'A' }));
    out.push(dancePress(isPressHold(s) ? (s.beat + s.pressHoldBeats!) * bd + 0.02 : t + 0.08, { key: 'A', up: true }));
  });
  return out.sort((a, b) => a.tMs - b.tMs);
}

beforeEach(() => { h.tx = null; h.user = 'u1'; h.refunds = []; h.payouts = []; });

describe('the house-set table: music and dance, one code path', () => {
  it('knows the two house-set modes by either spelling, and nothing else', () => {
    expect(houseSetModeOf('dance')).toBe('dance');
    expect(houseSetModeOf('music')).toBe('music');
    expect(houseSetModeOf('musicAcademy')).toBe('music');
    for (const m of ['threePoint', 'hoops1v1', '', null, undefined]) expect(houseSetModeOf(m as string), String(m)).toBeNull();
    expect(isHouseSetDuel('dance') && isDanceDuel('dance') && !isMusicDuel('dance')).toBe(true);
    expect(houseSetRulesFor('dance')).toBe(HOUSE_SET_RULES.dance);
    expect(houseSetRulesFor('hoops1v1')).toBeNull();
  });

  it('dance has its own event names, parser, judge, summary and words — rebuilt from the match id, never the request', () => {
    const r = HOUSE_SET_RULES.dance;
    expect([r.start, r.finish]).toEqual([DANCE_ATTEMPT_START, DANCE_ATTEMPT_FINISH]);
    expect([r.start, r.finish]).not.toContain(MUSIC_ATTEMPT_START);
    expect(r.summary('dd1')).toEqual(houseSongSummary(song));
    expect(r.summaryKey).toBe('song');
    expect(r.rules).toBe(DANCE_ARENA_RULES);
    expect(r.countInMs('dd1')).toBe(houseSongCountInMs(song));
    expect(r.setMs('dd1')).toBe(houseSongSetMs(song));
    expect(r.minFinishMs('dd1')).toBe(houseSongMinFinishMs(song));
    expect(r.judge('dd1', presses())).toBe(judgeDanceSet(song, presses()).score);
    expect(r.parse('dd1', [{ tMs: 'x' }])).toMatchObject({ ok: false, code: 'PRESSES_INVALID' });
    expect(r.legacy).toMatchObject({ code: 'PRE_HOUSE_SONG', reason: PRE_HOUSE_SONG_REASON });
    expect(r.noAttempt).toMatch(/dance/);
  });

  it('readHouseAttempt reads only the dance rows of this player, first start and first finish; houseAttemptScore scores them', async () => {
    const db = fakeDb();
    startedAgo(db, PLAYED_MS, 'u1', MUSIC_ATTEMPT_START);   // a music row on a dance duel is not a dance attempt
    let a = await readHouseAttempt(h.tx as never, 'dance', 'dd1', 'u1');
    expect(a).toEqual({ startedAt: null, finish: null });
    expect(houseAttemptScore('dance', 'dd1', a)).toMatchObject({ ok: false, code: 'NO_ATTEMPT', status: 409 });
    startedAgo(db, PLAYED_MS);
    a = await readHouseAttempt(h.tx as never, 'dance', 'dd1', 'u1');
    expect(houseAttemptScore('dance', 'dd1', a)).toEqual({ ok: true, score: 0, forfeit: true, taps: 0 });
    finished(db, presses());
    finished(db, presses(0, 0));                              // a second finish row (a race) never counts
    a = await readHouseAttempt(h.tx as never, 'dance', 'dd1', 'u1');
    expect(houseAttemptScore('dance', 'dd1', a)).toEqual({ ok: true, score: judgeDanceSet(song, presses()).score, forfeit: false, taps: presses().length });
  });
});

describe('POST /api/arena/music-attempt on a DANCE duel — the one attempt', () => {
  it('records the start once, as dance_attempt_start with the song it is danced to, and answers the song and the rules', async () => {
    const db = fakeDb();
    const r = await attempt({ matchId: 'dd1', phase: 'start', attemptId: 'room-abc-12345678' });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, phase: 'start', song: houseSongSummary(song), rules: DANCE_ARENA_RULES });
    expect(r.json.beat).toBeUndefined();
    expect(db.events.map((e) => [e.userId, e.eventType])).toEqual([['u1', DANCE_ATTEMPT_START]]);
    expect(JSON.parse(db.events[0].payload)).toEqual({ player: 'p1', ...houseSongSummary(song), attemptId: 'room-abc-12345678' });
    expect(db.locks).toBe(1);
    expect(db.updates).toEqual([]);
  });

  it('refuses a second start (a reload after START): 409 ONE_ATTEMPT {finished:false, score:0} — and a same-id retry is the same start', async () => {
    const db = fakeDb();
    expect((await attempt({ matchId: 'dd1', phase: 'start', attemptId: 'room-abc-12345678' })).status).toBe(200);
    expect(await attempt({ matchId: 'dd1', phase: 'start', attemptId: 'room-abc-12345678' })).toMatchObject({ status: 200, json: { replayed: true, song: houseSongSummary(song) } });
    expect(await attempt({ matchId: 'dd1', phase: 'start', attemptId: 'room-new-87654321' })).toMatchObject({ status: 409, json: { error: 'ONE_ATTEMPT', finished: false, score: 0 } });
    expect(db.events).toHaveLength(1);
  });

  it('a finish only after a start, not sooner than the song, once; it answers the score submit-score will require', async () => {
    const db = fakeDb();
    expect(await attempt({ matchId: 'dd1', phase: 'finish', taps: presses() })).toMatchObject({ status: 409, json: { error: 'NOT_STARTED' } });
    startedAgo(db, houseSongMinFinishMs(song) - 2_000);
    expect(await attempt({ matchId: 'dd1', phase: 'finish', taps: presses() })).toMatchObject({ status: 409, json: { error: 'FINISHED_TOO_SOON' } });
    db.events[0].createdAt = new Date(Date.now() - PLAYED_MS);
    const r = await attempt({ matchId: 'dd1', phase: 'finish', taps: presses() });
    expect(r).toMatchObject({ status: 200, json: { ok: true, phase: 'finish', taps: presses().length, score: judgeDanceSet(song, presses()).score } });
    const fin = db.events.find((e) => e.eventType === DANCE_ATTEMPT_FINISH)!;
    // (MUSIC-SUITE P9 FIX PASS: + the song and the list's fingerprint — the replay record; additive fields)
    expect(JSON.parse(fin.payload)).toEqual({ player: 'p1', v: song.v, n: presses().length, taps: presses(), songId: song.songId, print: dancePressPrint(presses()) });
    // the same list again (a lost reply): the same score; a better list: 409 ALREADY_FINISHED carrying the recorded score
    expect(await attempt({ matchId: 'dd1', phase: 'finish', taps: presses() })).toMatchObject({ status: 200, json: { replayed: true, score: r.json.score } });
    expect(await attempt({ matchId: 'dd1', phase: 'finish', taps: presses(0, 0) })).toMatchObject({ status: 409, json: { error: 'ALREADY_FINISHED', score: r.json.score } });
    expect(db.events.filter((e) => e.eventType === DANCE_ATTEMPT_FINISH)).toHaveLength(1);
  });

  it('checks the press list whole: 400 PRESSES_INVALID / TOO_MANY_PRESSES, nothing written — a fixed list is then taken', async () => {
    const db = fakeDb();
    startedAgo(db, PLAYED_MS);
    for (const taps of [undefined, 'x', [{ tMs: 'soon' }], [{ tMs: 1, move: 'dance_moonwalk_nope' }], [{ tMs: 1, up: 'yes' }], [{ lane: 'kick', tMs: 1, key: 'bad key' }]]) {
      expect((await attempt({ matchId: 'dd1', phase: 'finish', taps })).json.error, JSON.stringify(taps)).toBe('PRESSES_INVALID');
    }
    const many = Array.from({ length: DANCE_MAX_PRESSES + 1 }, (_, i) => ({ tMs: i * 10 }));
    expect(await attempt({ matchId: 'dd1', phase: 'finish', taps: many })).toMatchObject({ status: 400, json: { error: 'TOO_MANY_PRESSES' } });
    expect(db.events.filter((e) => e.eventType === DANCE_ATTEMPT_FINISH)).toHaveLength(0);
    expect((await attempt({ matchId: 'dd1', phase: 'finish', taps: presses() })).status).toBe(200);
  });

  it('TOO_LATE: a start whose song could not end before the deadline is refused, nothing used', async () => {
    const need = houseSongCountInMs(song) + houseSongSetMs(song) + HOUSE_START_MARGIN_MS;
    const db = fakeDb({ expiresAt: new Date(Date.now() + need - 5_000) });
    expect(await attempt({ matchId: 'dd1', phase: 'start' })).toMatchObject({ status: 409, json: { error: 'TOO_LATE' } });
    expect(db.events).toHaveLength(0);
    fakeDb({ expiresAt: new Date(Date.now() + need + 5_000) });
    expect((await attempt({ matchId: 'dd1', phase: 'start' })).status).toBe(200);
  });

  it('PRE_HOUSE_SONG: the opponent\'s dance score has no attempt behind it (a points total on their own pick) — both refunded at START', async () => {
    const db = fakeDb({ player2Score: 79_680 });
    const r = await attempt({ matchId: 'dd1', phase: 'start' });
    expect(r).toMatchObject({ status: 409, json: { error: 'PRE_HOUSE_SONG', refunded: true } });
    expect(String(r.json.detail)).toMatch(/house song/);
    expect(h.refunds.sort()).toEqual(['u1', 'u2']);
    expect(db.match.status).toBe('VOIDED');
    expect(db.events.map((e) => [e.eventType, JSON.parse(e.payload).reason])).toEqual([['REFUNDED', 'pre_house_song']]);
  });

  it('who may post: a player of an open, joined, unexpired Arena dance duel — a 3PT duel is still 400', async () => {
    fakeDb({ mode: 'threePoint' });
    expect(await attempt({ matchId: 'dd1', phase: 'start' })).toMatchObject({ status: 400, json: { error: 'NOT_A_MUSIC_DUEL' } });
    fakeDb({ player2Id: null, status: 'WAITING' });
    expect(await attempt({ matchId: 'dd1', phase: 'start' })).toMatchObject({ status: 409, json: { error: 'WAITING_OPPONENT' } });
    fakeDb({ expiresAt: new Date(Date.now() - 1) });
    expect(await attempt({ matchId: 'dd1', phase: 'start' })).toMatchObject({ status: 409, json: { error: 'EXPIRED' } });
    fakeDb({ currency: 'USD_CENTS' });
    expect(await attempt({ matchId: 'dd1', phase: 'start' })).toMatchObject({ status: 400, json: { error: 'WRONG_BOOK' } });
    fakeDb();
    h.user = 'u9';
    expect(await attempt({ matchId: 'dd1', phase: 'start' })).toMatchObject({ status: 403, json: { error: 'NOT_A_PLAYER' } });
  });
});

describe('POST /api/arena/submit-score on a DANCE duel — the server\'s rejudge', () => {
  it('no attempt at all: 409 NO_ATTEMPT, nothing written — a dance score is no longer the client\'s number', async () => {
    const db = fakeDb();
    expect(await submit({ matchId: 'dd1', score: 4000 })).toMatchObject({ status: 409, json: { error: 'NO_ATTEMPT' } });
    expect(db.updates).toEqual([]);
    expect(db.events).toEqual([]);
  });

  it('started and left (the reload rule): only 0 is taken', async () => {
    const db = fakeDb();
    startedAgo(db, PLAYED_MS);
    expect(await submit({ matchId: 'dd1', score: 1 })).toMatchObject({ status: 422, json: { error: 'SCORE_MISMATCH' } });
    expect(await submit({ matchId: 'dd1', score: 0 })).toMatchObject({ status: 200, json: { ok: true, settled: false } });
    expect(db.match.player1Score).toBe(0);
    expect(JSON.parse(db.events.find((e) => e.eventType === 'SCORE_SUBMITTED')!.payload)).toMatchObject({ score: 0, rejudged: true, forfeit: 'unfinished_attempt' });
  });

  it('finished: the score must be judgeDanceSet\'s accuracy on the stored presses — anything else is 422, nothing written', async () => {
    const db = fakeDb();
    startedAgo(db, PLAYED_MS);
    finished(db, presses());
    const want = judgeDanceSet(song, presses()).score;
    expect(want).toBeGreaterThan(5000);
    expect(want).toBeLessThan(DANCE_ARENA_SCALE);
    const points = judgeDanceSet(song, presses()).points;
    expect(await submit({ matchId: 'dd1', score: points })).toMatchObject({ status: 422 });      // the free-play points total is refused
    expect(await submit({ matchId: 'dd1', score: want + 1 })).toMatchObject({ status: 422, json: { error: 'SCORE_MISMATCH' } });
    expect(db.updates).toEqual([]);
    const r = await submit({ matchId: 'dd1', score: want });
    expect(r).toMatchObject({ status: 200, json: { ok: true } });
    expect(db.match.player1Score).toBe(want);
    const ev = JSON.parse(db.events.find((e) => e.eventType === 'SCORE_SUBMITTED')!.payload);
    // this test's dancer is a machine (every press exactly 20 ms late): the spread read flags it for review — and the score
    // is still taken (recorded, never refused, as for music)
    expect(ev).toMatchObject({ score: want, rejudged: true, taps: presses().length, plausibility: { flagged: true } });
  });

  it('a dance score above 10,000 is refused SCORE_ABOVE_CEILING — the stake ceiling, not free play\'s', async () => {
    const db = fakeDb();
    startedAgo(db, PLAYED_MS);
    finished(db, presses());
    expect(await submit({ matchId: 'dd1', score: DANCE_ARENA_SCALE + 1 })).toMatchObject({ status: 422, json: { error: 'SCORE_ABOVE_CEILING' } });
    expect(stakeCeilingFor('dance')).toBe(ARENA_STAKE_CEILINGS.dance);
    expect(ARENA_STAKE_CEILINGS.dance.max).toBe(DANCE_ARENA_SCALE);
    expect(SCORE_CEILINGS.dance.max).toBeGreaterThan(DANCE_ARENA_SCALE);   // free play's points scale, the sessions' row
    expect(checkStakeScore({ mode: 'dance', score: DANCE_ARENA_SCALE, rejudged: DANCE_ARENA_SCALE })).toMatchObject({ ok: true, ceiling: ARENA_STAKE_CEILINGS.dance });
  });

  it('past the deadline: 409 EXPIRED, nothing written (the sweep owns it)', async () => {
    const db = fakeDb({ expiresAt: new Date(Date.now() - 1_000) });
    startedAgo(db, PLAYED_MS);
    expect(await submit({ matchId: 'dd1', score: 0 })).toMatchObject({ status: 409, json: { error: 'EXPIRED' } });
    expect(db.updates).toEqual([]);
  });

  it('a pre-house-song opponent score is never settled against: 409 PRE_HOUSE_SONG, both refunded, the duel voided', async () => {
    const db = fakeDb({ player2Score: 12_345 });
    startedAgo(db, PLAYED_MS);
    const r = await submit({ matchId: 'dd1', score: 0 });
    expect(r).toMatchObject({ status: 409, json: { error: 'PRE_HOUSE_SONG', refunded: true } });
    expect(h.refunds.sort()).toEqual(['u1', 'u2']);
    expect(db.match).toMatchObject({ status: 'VOIDED', player1Score: null });
  });

  it('THE CHAIN: two dancers on the SAME song — start, finish, submit — settle on accuracy; the better dancer takes the pot', async () => {
    const db = fakeDb();
    // u2 dances first (sloppier: every 4th step skipped, 60 ms late)
    h.user = 'u2';
    expect((await attempt({ matchId: 'dd1', phase: 'start' })).status).toBe(200);
    db.events[0].createdAt = new Date(Date.now() - PLAYED_MS);
    const theirs = await attempt({ matchId: 'dd1', phase: 'finish', taps: presses(4, 60) });
    expect((await submit({ matchId: 'dd1', score: theirs.json.score })).json).toMatchObject({ ok: true, settled: false });
    // then u1, on the same match id — so the same song and chart
    h.user = 'u1';
    const start = await attempt({ matchId: 'dd1', phase: 'start' });
    expect(start.json.song).toEqual(houseSongSummary(song));
    db.events[db.events.length - 1].createdAt = new Date(Date.now() - PLAYED_MS);
    const mine = await attempt({ matchId: 'dd1', phase: 'finish', taps: presses(7, 20) });
    expect(Number(mine.json.score)).toBeGreaterThan(Number(theirs.json.score));
    const r = await submit({ matchId: 'dd1', score: mine.json.score });
    expect(r).toMatchObject({ status: 200, json: { settled: true, result: 'p1', iWon: true, winnerId: 'u1', p1Score: mine.json.score, p2Score: theirs.json.score } });
    expect(h.payouts).toEqual(['u1']);
    expect(db.match.status).toBe('SETTLED');
  });

  it('a dance QUICK MATCH: the house is drawn under 10,000 off the 5,000 baseline, banded only on rejudged dance sets', async () => {
    const db = fakeDb({ matchType: 'GHOST_DUEL', player2Id: 'house', seed: 'seed-qm-1' });
    startedAgo(db, PLAYED_MS);
    finished(db, presses());
    const want = judgeDanceSet(song, presses()).score;
    const r = await submit({ matchId: 'dd1', score: want });
    expect(r.status).toBe(200);
    const ghost = JSON.parse(db.events.find((e) => e.eventType === 'GHOST_SCORED')!.payload);
    expect(ghost).toMatchObject({ bandCenter: 5000, bandSource: 'baseline' });
    expect(ghost.score).toBeGreaterThanOrEqual(Math.round(5000 * (1 - RIVAL_BAND)));
    expect(ghost.score).toBeLessThanOrEqual(Math.round(5000 * (1 + RIVAL_BAND)));
    // the history read asked for this player's past DANCE duels that carry their finished house-song attempt
    expect(db.history[0]).toMatchObject({ where: { events: { some: { eventType: DANCE_ATTEMPT_FINISH, userId: 'u1' } } } });
    expect(r.json).toMatchObject({ settled: true, p1Score: want, p2Score: ghost.score });
  });
});

describe('the dance rival (lib/arena-rivals.ts): old dance scores stop counting, 5,000 kept, never below it', () => {
  it('bands on the player\'s own rejudged dance duels only; with none, the 5,000 baseline; a history of zeros cannot sink it', () => {
    expect(RIVAL_FROM_DUEL_SCORES.has('dance')).toBe(true);
    expect(RIVAL_SCORE_EVENT.dance).toBe(DANCE_ATTEMPT_FINISH);
    expect(RIVAL_BASELINE_FLOOR.has('dance')).toBe(true);
    expect(ARENA_SCORE_BASELINES.dance).toBe(5000);
    const rows = [
      { player1Id: 'u1', player1Score: 4355, player2Score: 1 },                                                         // pre-P9: no event
      { player1Id: 'u1', player1Score: 79_680, player2Score: 1, events: [] },                                           // an own-song total
      { player1Id: 'u1', player1Score: 8200, player2Score: 1, events: [{ eventType: DANCE_ATTEMPT_FINISH, userId: 'u1' }] },
      { player1Id: 'u1', player1Score: 7000, player2Score: 1, events: [{ eventType: MUSIC_ATTEMPT_START, userId: 'u1' }] },  // not a dance finish
    ];
    expect(ownDuelScores(rows, 'u1', DANCE_ARENA_SCALE, RIVAL_SCORE_EVENT.dance)).toEqual([8200]);
    expect(drawRivalScore({ seed: 's', mode: 'dance', playerHistory: [] })).toMatchObject({ source: 'baseline', center: 5000 });
    expect(drawRivalScore({ seed: 's', mode: 'dance', playerHistory: [0, 0, 0] })).toMatchObject({ source: 'baseline', center: 5000 });
    expect(drawRivalScore({ seed: 's', mode: 'dance', playerHistory: [8200] })).toMatchObject({ source: 'player-history', center: 8200 });
  });
});

describe('friend challenges: "the same rule" cannot hold on stored bests, so dance stays closed there (lib/mp/match-core.ts)', () => {
  it('the house-set gate closes dance (and a music key, were one added) whatever the pause list says; every other key is open', async () => {
    const { MP_HOUSE_SET_ONLY, isMpHouseSetOnly, isMpChallengeOpen, mpChallengeClosedDetail, MP_MODES, MP_CHALLENGE_MODES, MP_PAUSED_MODES } = await import('./mp/match-core');
    const { isStakingPaused, stakingPausedDetail } = await import('./stakingPause');
    expect([...MP_HOUSE_SET_ONLY].sort()).toEqual(['dance', 'music']);
    expect(isStakingPaused('dance')).toBe(false);          // the Arena is open…
    expect(isMpHouseSetOnly('dance')).toBe(true);          // …the friend challenge is not
    expect(isMpChallengeOpen('dance')).toBe(false);
    expect(MP_PAUSED_MODES.map((m) => m.key)).toEqual(['dance']);
    expect(MP_CHALLENGE_MODES).toHaveLength(MP_MODES.length - 1);
    for (const m of MP_CHALLENGE_MODES) expect(isMpHouseSetOnly(m.key), m.key).toBe(false);
    expect(mpChallengeClosedDetail('dance')).toMatch(/Friend challenges on The Cypher are closed: its duels are the same house song/);
    expect(mpChallengeClosedDetail('soccer')).toBe(stakingPausedDetail('soccer'));
  });

  it('joinAndSettle refuses an open dance challenge before reading anyone\'s best (nothing written, nothing paid)', async () => {
    const { joinAndSettle } = await import('./mp/service');
    const calls: string[] = [];
    const prisma = {
      mpMatch: {
        findUnique: async () => ({ id: 'mp-1', code: 'DANCE2', mode: 'dance', status: 'open', hostId: 'host', guestId: null }),
        update: async () => { calls.push('update'); return {}; },
      },
      gameSession: { findFirst: async () => { calls.push('best'); return { score: 90_000 }; } },
    };
    const r = await joinAndSettle(prisma as never, { code: 'DANCE2', guestId: 'u1', guestName: 'You' });
    expect(r).toMatchObject({ error: 'staking_paused', mode: 'dance', houseSetOnly: true });
    expect(calls).toEqual([]);
  });
});

// ── MUSIC-SUITE P9 FIX PASS (2026-09-29) ─────────────────────────────────────────────────────────────────────────────
describe('P9 FIX PASS: which room is posting', () => {
  it('a room that is not the duel\'s is 400 WRONG_ROOM with nothing recorded; the right room, or none named, goes on', async () => {
    let db = fakeDb();
    expect(await attempt({ matchId: 'dd1', phase: 'start', attemptId: 'room-abc-12345678', room: 'music' })).toMatchObject({ status: 400, json: { error: 'WRONG_ROOM' } });
    expect(db.events).toHaveLength(0);
    expect(await attempt({ matchId: 'dd1', phase: 'start', room: 'jukebox' })).toMatchObject({ status: 400 });
    expect(db.events).toHaveLength(0);
    expect(await attempt({ matchId: 'dd1', phase: 'start', attemptId: 'room-abc-12345678', room: 'dance' })).toMatchObject({ status: 200, json: { song: houseSongSummary(song) } });
    // a music duel refuses the Cypher the same way (its finish would have burnt the attempt on a 400)
    db = fakeDb({ mode: 'music' });
    expect(await attempt({ matchId: 'dd1', phase: 'start', room: 'dance' })).toMatchObject({ status: 400, json: { error: 'WRONG_ROOM' } });
    expect(db.events).toHaveLength(0);
  });

  it('both rooms name themselves on every post', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    expect(readFileSync(join(process.cwd(), 'lib/babylon/modes/DanceMode.ts'), 'utf8')).toContain("postArenaAttempt((u, i) => fetch(u, i), { ...body, room: 'dance' })");
    expect(readFileSync(join(process.cwd(), 'lib/babylon/music/StudioMode.tsx'), 'utf8')).toContain("postArenaAttempt((u, i) => fetch(u, i), { ...body, room: 'music' })");
  });
});

describe('P9 FIX PASS: a dance set is judged on the song and chart its START recorded, or not at all', () => {
  it('a start that recorded this chart (and v1) finishes and submits as ever', async () => {
    const db = fakeDb();
    startedAgo(db, PLAYED_MS, 'u1', DANCE_ATTEMPT_START, { v: HOUSE_SONG_VERSION, chart: houseChartPrint(houseSongSteps(song)) });
    const r = await attempt({ matchId: 'dd1', phase: 'finish', taps: presses() });
    expect(r).toMatchObject({ status: 200, json: { score: judgeDanceSet(song, presses()).score } });
    expect((await submit({ matchId: 'dd1', score: r.json.score })).status).toBe(200);
  });

  it('a start that recorded ANOTHER chart: the finish and the submit refuse (an error, logged) and nothing is written or settled', async () => {
    const db = fakeDb();
    startedAgo(db, PLAYED_MS, 'u1', DANCE_ATTEMPT_START, { v: HOUSE_SONG_VERSION, chart: 'deadbeef' });
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await attempt({ matchId: 'dd1', phase: 'finish', taps: presses() })).status).toBe(500);
    expect(db.events.filter((e) => e.eventType === DANCE_ATTEMPT_FINISH)).toHaveLength(0);
    finished(db, presses());
    const sub = await submit({ matchId: 'dd1', score: judgeDanceSet(song, presses()).score });
    expect(sub.status).toBe(500);
    expect(db.updates).toEqual([]);
    expect(h.payouts).toEqual([]);
    expect(err.mock.calls.some((c) => String(c.map(String).join(' ')).includes('HOUSE_SONG') || String(c[1]).includes('HOUSE-SONG'))).toBe(true);
    err.mockRestore();
  });

  it('a start recorded on a version this build cannot build refuses too — never judged on this build\'s version', async () => {
    const db = fakeDb();
    startedAgo(db, PLAYED_MS, 'u1', DANCE_ATTEMPT_START, { v: HOUSE_SONG_VERSION + 1 });
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await attempt({ matchId: 'dd1', phase: 'finish', taps: presses() })).status).toBe(500);
    expect(db.events.filter((e) => e.eventType === DANCE_ATTEMPT_FINISH)).toHaveLength(0);
    err.mockRestore();
  });
});

describe('P9 FIX PASS: a replayed press list is recorded (never refused)', () => {
  it('a finish that repeats this player\'s finish in another duel on the same song, press for press, is marked replayOf', async () => {
    const db = fakeDb();
    db.events.push({ matchId: 'dd0', userId: 'u1', eventType: DANCE_ATTEMPT_FINISH, createdAt: new Date(Date.now() - 86_400_000), seq: -1,
      payload: JSON.stringify({ songId: song.songId, print: dancePressPrint(presses()), taps: presses() }) });
    startedAgo(db, PLAYED_MS);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const r = await attempt({ matchId: 'dd1', phase: 'finish', taps: presses() });
    expect(r.status).toBe(200);                                                      // recorded, never refused (decision #40)
    const fin = db.events.find((e) => e.eventType === DANCE_ATTEMPT_FINISH && e.matchId === 'dd1')!;
    expect(JSON.parse(fin.payload)).toMatchObject({ songId: song.songId, print: dancePressPrint(presses()), replayOf: 'dd0' });
    expect(warn.mock.calls.some((c) => String(c[0]).includes('repeats'))).toBe(true);
    warn.mockRestore();
  });

  it('a different list, or the same list on another player, is not marked', async () => {
    const db = fakeDb();
    db.events.push({ matchId: 'dd0', userId: 'u2', eventType: DANCE_ATTEMPT_FINISH, createdAt: new Date(), seq: -1,
      payload: JSON.stringify({ songId: song.songId, print: dancePressPrint(presses()) }) });
    startedAgo(db, PLAYED_MS);
    expect((await attempt({ matchId: 'dd1', phase: 'finish', taps: presses() })).status).toBe(200);
    expect(JSON.parse(db.events.find((e) => e.eventType === DANCE_ATTEMPT_FINISH && e.matchId === 'dd1')!.payload).replayOf).toBeUndefined();
  });
});

describe('P9 FIX PASS: a dance house rival is banded on the duel\'s own song (lib/arena-ghost.ts)', () => {
  const idOn = (songId: string): string => { for (let i = 0; i < 500; i++) if (houseSongFor(`qm-${i}`).songId === songId) return `qm-${i}`; throw new Error(songId); };
  /** A player who dances WARMUP well (9,000s) and EVOLUTION badly (4,000s): ten finished dance duels, five of each. */
  function history(): Record<string, unknown>[] {
    return Array.from({ length: 10 }, (_, i) => {
      const onWarmup = i % 2 === 0;
      return {
        id: `past-${i}`, player1Id: 'u1', player1Score: onWarmup ? 9_000 + i : 4_000 + i, player2Score: 1,
        events: [{ eventType: DANCE_ATTEMPT_FINISH, userId: 'u1', payload: JSON.stringify({ songId: onWarmup ? 'warmup' : 'evolution' }) }],
      };
    });
  }
  const tx = (rows: Record<string, unknown>[], seen: Record<string, unknown>[] = []) => ({
    competitionMatch: { findMany: async (args: Record<string, unknown>) => { seen.push(args); return rows; } },
    gameSession: { findMany: async () => { throw new Error('never sessions'); } },
  });

  it('the same player history draws different centres on WARMUP and EVOLUTION (it drew one cross-song centre)', async () => {
    const seen: Record<string, unknown>[] = [];
    const w = await drawHouseScore(tx(history(), seen), { mode: 'dance', seed: 's1', createdAt: new Date(), id: idOn('warmup') }, 'u1', DANCE_ARENA_SCALE);
    const e = await drawHouseScore(tx(history()), { mode: 'dance', seed: 's1', createdAt: new Date(), id: idOn('evolution') }, 'u1', DANCE_ARENA_SCALE);
    expect(w.draw).toMatchObject({ source: 'player-history' });
    expect(w.draw.center).toBeGreaterThanOrEqual(9_000);                    // only the WARMUP sets
    expect(e.draw.center).toBeLessThan(w.draw.center - 3_000);              // the EVOLUTION sets (floored at the baseline)
    expect(seen[0]).toMatchObject({ take: DANCE_SAME_SONG_READ });
    // a song this player has never danced in a duel: the cold-start baseline, not their other songs
    const c = await drawHouseScore(tx(history()), { mode: 'dance', seed: 's1', createdAt: new Date(), id: idOn('canals') }, 'u1', DANCE_ARENA_SCALE);
    expect(c.draw).toMatchObject({ source: 'baseline', center: 5_000 });
  });

  it('a past duel\'s song is its finish\'s recorded songId, else its match id\'s pick', () => {
    expect(danceSongOfRow({ id: 'x', events: [{ payload: JSON.stringify({ songId: 'battle' }) }] })).toBe('battle');
    expect(danceSongOfRow({ id: 'x', events: [{ payload: { songId: 'canals' } }] })).toBe('canals');
    expect(danceSongOfRow({ id: 'dd1', events: [{ payload: '{}' }] })).toBe(houseSongFor('dd1').songId);
    expect(danceSongOfRow({})).toBeNull();
  });

  it('music (and every other mode) reads exactly as before: ten rows, no song filter', async () => {
    const seen: Record<string, unknown>[] = [];
    await drawHouseScore(tx([], seen), { mode: 'music', seed: 's1', createdAt: new Date(), id: 'mm1' }, 'u1', 1e9);
    expect(seen[0]).toMatchObject({ take: 10 });
    expect((seen[0] as { select: Record<string, unknown> }).select.id).toBeUndefined();
  });
});
