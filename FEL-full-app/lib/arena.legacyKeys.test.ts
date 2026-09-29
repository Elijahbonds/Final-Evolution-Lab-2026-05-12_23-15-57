// A DUEL STORED UNDER THE OLD KEY STILL PLAYS (HOTFIX 2026-09-24).
//
// The Academy's arena key moved from 'musicAcademy' to 'music', the key its sessions are saved under. A CompetitionMatch
// written before that still says 'musicAcademy'. Read raw, the lobby lists it under that raw key with a '#' PLAY link.
// Its stake stays locked, because nothing expired an arena duel (until MUSIC-SUITE P6's reclaim sweep,
// lib/arena-reclaim.ts, 2026-09-26). Its ghost draw also finds no sessions and falls back
// to the default baseline of 100 on a 5000-point scale. These tests run the real route handlers against an in-memory
// stand-in for the database; nothing here opens a connection. They check that an old row reads as a music duel
// everywhere, and that a new duel is stored under the new key even when an old client posts the old one.
//
// MUSIC-SUITE P6 (2026-09-26): music staking is open again (lib/stakingPause.ts), so the P1 twins that proved the paused
// refusal are gone (the pause is still proven on dance in lib/stakingPause.test.ts). A music duel's score is now the
// server's rejudge of the player's one recorded attempt (lib/arena-music.ts), so every submit below first plays a set
// (played(): the start and finish events the room posts), and a past duel counts toward the rival only when it carries
// the player's finished attempt (RIVAL_SCORE_EVENT) — the old scores stop counting.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER = 'user-1';
const HOUSE = 'house-1';

type Row = Record<string, any>;
const db = {
  matches: [] as Row[],
  sessions: [] as Array<{ userId: string; mode: string; score: number; createdAt: Date }>,
  created: [] as Row[],
  sessionQueries: [] as Row[],
  duelQueries: [] as Row[],
  events: [] as Array<{ matchId?: string; userId?: string | null; type: string; payload: Row; createdAt?: Date }>,
};

const matchesWhere = (where: Row): Row[] => db.matches.filter((m) => {
  if (where.status && m.status !== where.status) return false;
  if (where.player1Id?.not && m.player1Id === where.player1Id.not) return false;
  if (typeof where.player1Id === 'string' && m.player1Id !== where.player1Id) return false;   // MUSIC-SUITE P1: the stranded-duel query
  if (where.mode?.in && !where.mode.in.includes(m.mode)) return false;
  if (where.OR) return where.OR.some((c: Row) => Object.entries(c).every(([k, v]) => m[k] === v));
  return true;
});

const tx = {
  competitionMatch: {
    findUnique: async ({ where }: Row) => db.matches.find((m) => m.id === where.id) ?? null,
    update: async ({ where, data }: Row) => { const m = db.matches.find((x) => x.id === where.id)!; Object.assign(m, data); return m; },
    create: async ({ data }: Row) => { const m = { id: `m-${db.created.length + 1}`, ...data, createdAt: new Date() }; db.created.push(m); return m; },
    // the ghost draw's read of the player's past duels in the mode: either side, their score in, before this match —
    // and (MUSIC-SUITE P6) carrying the player's event, `events: { some }`, with the event rows it selects
    findMany: async (args: Row) => {
      db.duelQueries.push(args.where);
      const { where } = args;
      const mine = (m: Row) => where.OR.some((c: Row) => (c.player1Id
        ? m.player1Id === c.player1Id && m.player1Score !== null
        : m.player2Id === c.player2Id && m.player2Score !== null));
      const eventsOf = (m: Row, w: Row) => db.events.filter((e) => e.matchId === m.id && e.type === w.eventType && e.userId === w.userId);
      const carries = (m: Row) => !where.events?.some || eventsOf(m, where.events.some).length > 0;
      return db.matches
        .filter((m) => m.currency === where.currency && where.mode.in.includes(m.mode) && m.createdAt < where.createdAt.lt && mine(m) && carries(m))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, args.take)
        .map((m) => ({
          player1Id: m.player1Id, player1Score: m.player1Score, player2Score: m.player2Score,
          ...(args.select?.events ? { events: eventsOf(m, args.select.events.where).map((e) => ({ eventType: e.type, userId: e.userId })) } : {}),
        }));
    },
  },
  // MUSIC-SUITE P6: the player's attempt events on a duel (lib/arena-music.ts readMusicAttempt)
  matchEvent: {
    findMany: async ({ where }: Row) => db.events
      .filter((e) => e.matchId === where.matchId && e.userId === where.userId && where.eventType.in.includes(e.type))
      .map((e) => ({ eventType: e.type, payload: JSON.stringify(e.payload), createdAt: e.createdAt ?? new Date(0) })),
  },
  gameSession: {
    findMany: async (args: Row) => {
      db.sessionQueries.push(args.where);
      const { where } = args;
      return db.sessions
        .filter((s) => s.mode === where.mode && (!where.userId || s.userId === where.userId) && s.createdAt < where.createdAt.lt)
        .map((s) => ({ score: s.score }));
    },
  },
};

vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ user: { id: USER } })) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/analytics-server', () => ({ recordServerEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/wallet/wallet-service', () => ({
  applyLc: vi.fn(async () => ({ balanceAfter: 0 })),
  getOrCreateWallet: vi.fn(async () => ({})),
  WalletError: class WalletError extends Error { code = ''; },
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    competitionMatch: {
      findMany: async ({ where }: Row) => matchesWhere(where),
      findUnique: async ({ where }: Row) => db.matches.find((m) => m.id === where.id) ?? null,
    },
    user: { findMany: async () => [{ id: USER, name: 'You' }, { id: HOUSE, name: 'House' }] },
    matchEvent: { findMany: async () => [] },
    $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
  },
}));
// The house roster is find-or-create against the user table; here every rival is one house account. The pick itself
// (pickHouseRival) and the rival draw are the real ones.
vi.mock('@/lib/arena-rivals', async (importOriginal) => {
  const real = await importOriginal<typeof import('./arena-rivals')>();
  return { ...real, ensureHouseRivals: vi.fn(async () => new Map(real.HOUSE_RIVALS.map((r) => [r.key, HOUSE]))) };
});
// The LC movements and the event log have their own tests; here they only record what they were asked to do.
vi.mock('@/lib/arena', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./arena')>()),
  arenaLockEntry: vi.fn(async () => 0),
  arenaPayWinner: vi.fn(async () => ({ payout: 0, rake: 0 })),
  arenaRefund: vi.fn(async () => 0),
  appendMatchEvent: vi.fn(async (_db: unknown, matchId: string, type: string, userId: string | null, payload: Row = {}) => { db.events.push({ matchId, userId, type, payload, createdAt: new Date() }); }),
}));

import { GET as listGET } from '../app/api/arena/list/route';
import { GET as matchGET } from '../app/api/arena/[matchId]/route';
import { POST as submitPOST } from '../app/api/arena/submit-score/route';
import { POST as createPOST } from '../app/api/arena/create/route';
import { POST as quickPOST } from '../app/api/arena/quick-match/route';
import { POST as joinPOST } from '../app/api/arena/join/route';
import { recordServerEvent } from '@/lib/analytics-server';
import { ARENA_SCORE_BASELINES, RIVAL_BAND } from './arena-rivals';
import { performHitPoints } from './babylon/music/performSet';
import { houseBeatFor, houseTap, judgeHouseSet, HOUSE_SET_NOTES, HOUSE_SET_MAX } from './babylon/music/houseBeat';
import { MUSIC_ATTEMPT_START, MUSIC_ATTEMPT_FINISH } from './arena-music';
import { isStakingPaused } from './stakingPause';
import { SCORE_CEILINGS } from './arena-score-integrity';

const post = (body: unknown) => new Request('http://local.test/api/arena', { method: 'POST', body: JSON.stringify(body) }) as any;
const legacyMatch = (over: Row = {}): Row => ({
  id: 'legacy-1', mode: 'musicAcademy', currency: 'LC', status: 'WAITING', matchType: 'SCORE_DUEL',
  entryFeeCents: 50, rakePercent: 10, seed: 'legacy-seed', player1Id: 'someone-else', player2Id: null,
  player1Score: null, player2Score: null, winnerId: null, createdAt: new Date('2026-09-20T00:00:00Z'),
  updatedAt: new Date('2026-09-20T00:00:00Z'), ...over,
});

/**
 * MUSIC-SUITE P6: a set played by `userId` in duel `matchId` — the start and the finish the room posts to
 * /api/arena/music-attempt (every `every`-th charted note tapped dead on) — and the score the server will make of it.
 */
function played(matchId: string, userId: string, every = 2): number {
  const beat = houseBeatFor(matchId);
  const taps = beat.notes.filter((_, i) => i % every === 0).map((n) => houseTap(n.lane, n.t));
  db.events.push(
    { matchId, userId, type: MUSIC_ATTEMPT_START, payload: { player: 'p1' }, createdAt: new Date(0) },
    { matchId, userId, type: MUSIC_ATTEMPT_FINISH, payload: { player: 'p1', taps }, createdAt: new Date(60_000) },
  );
  return judgeHouseSet(beat, taps).score;
}
/** A past duel whose score came from a finished house-beat attempt by `userId` (what the rival bands on). */
const finished = (matchId: string, userId: string) => db.events.push({ matchId, userId, type: MUSIC_ATTEMPT_FINISH, payload: { taps: [] } });

beforeEach(() => {
  db.matches = []; db.sessions = []; db.created = []; db.sessionQueries = []; db.duelQueries = []; db.events = [];
  vi.mocked(recordServerEvent).mockClear();
});

describe('an arena duel stored as "musicAcademy"', () => {
  it('lists as a music duel with a working PLAY link, in the open lobby and in my duels', async () => {
    db.matches = [legacyMatch(), legacyMatch({ id: 'legacy-2', player1Id: USER, player2Id: HOUSE, status: 'ACTIVE' })];
    const body = await (await listGET()).json();
    expect(body.open).toHaveLength(1);
    expect(body.mine).toHaveLength(1);
    for (const row of [body.open[0], body.mine[0]]) {
      expect(row.mode).toBe('music');
      expect(row.name).toBe('Groove Academy');
      expect(row.href).toBe('/play/music');
    }
  });

  // MUSIC-SUITE P6: music staking is open again (P1 hid a paused music duel from OPEN CHALLENGES and flagged mine).
  it('with music staking open again: advertised in OPEN CHALLENGES, and MY DUELS carries no paused flag', async () => {
    expect(isStakingPaused('musicAcademy')).toBe(false);
    db.matches = [legacyMatch(), legacyMatch({ id: 'legacy-2', player1Id: USER, player2Id: HOUSE, status: 'ACTIVE' })];
    const body = await (await listGET()).json();
    expect(body.open.map((d: Row) => d.id)).toEqual(['legacy-1']);
    expect(body.mine[0]).toMatchObject({ mode: 'music', name: 'Groove Academy', href: '/play/music', status: 'ACTIVE', stakingPaused: false });
  });

  it('opens as a music duel on its own page', async () => {
    db.matches = [legacyMatch({ player1Id: USER, player2Id: HOUSE, status: 'ACTIVE' })];
    const body = await (await matchGET(post({}), { params: { matchId: 'legacy-1' } })).json();
    expect(body).toMatchObject({ mode: 'music', name: 'Groove Academy', href: '/play/music' });
  });

  // Owner, 2026-09-24: "Cap only Arena sets". Free play has no end and saves under 'music' too, so the rival is banded on
  // the player's past Arena music scores (either key, either side), never on their sessions.
  it("draws its house rival from the player's past Arena music scores, never their free-play sessions", async () => {
    db.matches = [
      legacyMatch({ matchType: 'GHOST_DUEL', status: 'ACTIVE', player1Id: USER, player2Id: HOUSE }),
      legacyMatch({ id: 'past-1', status: 'SETTLED', player1Id: USER, player2Id: HOUSE, player1Score: 42_000, player2Score: 4100, createdAt: new Date('2026-09-19T00:00:00Z') }),
      legacyMatch({ id: 'past-2', mode: 'music', status: 'SETTLED', player1Id: 'someone-else', player2Id: USER, player1Score: 9000, player2Score: 44_000, createdAt: new Date('2026-09-18T00:00:00Z') }),
    ];
    finished('past-1', USER); finished('past-2', USER);
    db.sessions = [{ userId: USER, mode: 'music', score: 1_900_000, createdAt: new Date('2026-09-19T12:00:00Z') }];   // a long free set
    const res = await submitPOST(post({ matchId: 'legacy-1', score: played('legacy-1', USER) }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.settled).toBe(true);
    expect(db.sessionQueries).toEqual([]);
    expect(db.duelQueries.map((w) => w.mode.in)).toEqual([['music', 'musicAcademy']]);
    const ghost = db.events.find((e) => e.type === 'GHOST_SCORED')!.payload;
    expect(ghost.bandSource).toBe('player-history');
    expect(ghost.bandCenter).toBe(43_000);   // (MUSIC-SUITE P6 FIX PASS: scores above the music floor, 12,000 — below it the floor holds)
  });

  it('with no past Arena music score, draws off the music baseline, not the default 100, however long the free sets', async () => {
    db.matches = [legacyMatch({ matchType: 'GHOST_DUEL', status: 'ACTIVE', player1Id: USER, player2Id: HOUSE })];
    db.sessions = [{ userId: USER, mode: 'music', score: 1_900_000, createdAt: new Date('2026-09-19T00:00:00Z') }];
    await submitPOST(post({ matchId: 'legacy-1', score: played('legacy-1', USER, 5) }));
    const ghost = db.events.find((e) => e.type === 'GHOST_SCORED')!.payload;
    expect(ghost.bandSource).toBe('baseline');
    expect(ghost.bandCenter).toBe(ARENA_SCORE_BASELINES.music);
    expect(ghost.score).toBeGreaterThanOrEqual(Math.floor(ARENA_SCORE_BASELINES.music * (1 - RIVAL_BAND)));
  });
});

describe('a staked music rival and endless free play', () => {
  // A player who hits every note PERFECT but drops the combo every 40 notes, over a set of `notes` notes.
  const setScore = (notes: number) => { let t = 0; for (let i = 0; i < notes; i++) t += performHitPoints(true, i % 40); return t; };
  const arenaSet = setScore(HOUSE_SET_NOTES);   // a 32-bar Arena set on the house beat (MUSIC-SUITE P6: 192 notes)
  const freeSet = setScore(1300);               // about 80 bars of free play at the same accuracy

  it('a history of long free sets never lifts the rival above what a 32-bar set reaches at the same accuracy', async () => {
    expect(freeSet).toBeGreaterThan(2 * arenaSet);   // the scale gap the rival must not see
    db.matches = [
      legacyMatch({ mode: 'music', matchType: 'GHOST_DUEL', status: 'ACTIVE', player1Id: USER, player2Id: HOUSE }),
      legacyMatch({ id: 'past-1', mode: 'music', status: 'SETTLED', player1Id: USER, player2Id: HOUSE, player1Score: arenaSet, player2Score: 1, createdAt: new Date('2026-09-19T00:00:00Z') }),
      // a score from before the Arena capped the set: above today's ceiling, so no staked set can reach it and it is left out
      legacyMatch({ id: 'past-0', mode: 'music', status: 'SETTLED', player1Id: USER, player2Id: HOUSE, player1Score: 9_000_000, player2Score: 1, createdAt: new Date('2026-09-10T00:00:00Z') }),
    ];
    finished('past-1', USER); finished('past-0', USER);
    db.sessions = Array.from({ length: 10 }, (_, i) => ({ userId: USER, mode: 'music', score: freeSet, createdAt: new Date(Date.parse('2026-09-19T01:00:00Z') + i) }));
    const res = await submitPOST(post({ matchId: 'legacy-1', score: played('legacy-1', USER) }));
    expect(res.status).toBe(200);
    const ghost = db.events.find((e) => e.type === 'GHOST_SCORED')!.payload;
    expect(ghost.bandCenter).toBe(arenaSet);
    expect(ghost.score).toBeLessThanOrEqual(Math.round(arenaSet * (1 + RIVAL_BAND)));
  });

  // Owner decision #12: "old music duel scores stop counting; 5,000 baseline kept until real scores exist".
  it('P6: only a duel with the player\'s own FINISHED attempt bands the rival — old scores, forfeits and the other side\'s attempt do not', async () => {
    db.matches = [
      legacyMatch({ mode: 'music', matchType: 'GHOST_DUEL', status: 'ACTIVE', player1Id: USER, player2Id: HOUSE }),
      legacyMatch({ id: 'old', mode: 'music', status: 'SETTLED', player1Id: USER, player2Id: HOUSE, player1Score: 90_000, player2Score: 1, createdAt: new Date('2026-09-19T03:00:00Z') }),
      legacyMatch({ id: 'forfeit', mode: 'music', status: 'SETTLED', player1Id: USER, player2Id: HOUSE, player1Score: 0, player2Score: 1, createdAt: new Date('2026-09-19T02:00:00Z') }),
      legacyMatch({ id: 'theirs', mode: 'music', status: 'SETTLED', player1Id: 'someone-else', player2Id: USER, player1Score: 1, player2Score: 70_000, createdAt: new Date('2026-09-19T01:00:00Z') }),
      legacyMatch({ id: 'good', mode: 'music', status: 'SETTLED', player1Id: USER, player2Id: HOUSE, player1Score: 30_000, player2Score: 1, createdAt: new Date('2026-09-18T00:00:00Z') }),
    ];
    db.events.push({ matchId: 'forfeit', userId: USER, type: MUSIC_ATTEMPT_START, payload: {} });   // started, never finished
    finished('theirs', 'someone-else');                                                            // the opponent finished, not me
    finished('good', USER);
    const res = await submitPOST(post({ matchId: 'legacy-1', score: played('legacy-1', USER) }));
    expect(res.status).toBe(200);
    expect(db.duelQueries[0].events).toEqual({ some: { eventType: MUSIC_ATTEMPT_FINISH, userId: USER } });   // asked of the database
    expect(db.events.find((e) => e.type === 'GHOST_SCORED')!.payload).toMatchObject({ bandSource: 'player-history', bandCenter: 30_000 });
  });

  it('P6: a player with only pre-P6 music duels meets the music baseline (12,000 since the P6 fix pass), as a first duel does', async () => {
    db.matches = [
      legacyMatch({ mode: 'music', matchType: 'GHOST_DUEL', status: 'ACTIVE', player1Id: USER, player2Id: HOUSE }),
      legacyMatch({ id: 'old-1', mode: 'music', status: 'SETTLED', player1Id: USER, player2Id: HOUSE, player1Score: 250_000, player2Score: 1, createdAt: new Date('2026-09-19T00:00:00Z') }),
      legacyMatch({ id: 'old-2', mode: 'musicAcademy', status: 'SETTLED', player1Id: HOUSE, player2Id: USER, player1Score: 1, player2Score: 180_000, createdAt: new Date('2026-09-18T00:00:00Z') }),
    ];
    await submitPOST(post({ matchId: 'legacy-1', score: played('legacy-1', USER) }));
    expect(db.events.find((e) => e.type === 'GHOST_SCORED')!.payload).toMatchObject({ bandSource: 'baseline', bandCenter: 12_000 });
    expect(ARENA_SCORE_BASELINES.music).toBe(12_000);
  });

  // The ghost's score is drawn from the same banding; a player whose every set was perfect draws a band centred on the
  // ceiling, up to 18 % above it. The house is held to the ceiling — the house beat's maximum, the same for every beat.
  it('P6: the house rival never posts above the house-beat ceiling, however good the player\'s history', async () => {
    let clamped = 0;
    for (let i = 0; i < 12; i++) {
      db.matches = [
        legacyMatch({ id: `g-${i}`, seed: `ghost-seed-${i}`, mode: 'music', matchType: 'GHOST_DUEL', status: 'ACTIVE', player1Id: USER, player2Id: HOUSE }),
        legacyMatch({ id: `best-${i}`, mode: 'music', status: 'SETTLED', player1Id: USER, player2Id: HOUSE, player1Score: HOUSE_SET_MAX, player2Score: 1, createdAt: new Date('2026-09-19T00:00:00Z') }),
      ];
      db.events = [];
      finished(`best-${i}`, USER);
      const res = await submitPOST(post({ matchId: `g-${i}`, score: played(`g-${i}`, USER) }));
      expect(res.status).toBe(200);
      const ghost = db.events.find((e) => e.type === 'GHOST_SCORED')!.payload;
      expect(ghost.bandCenter).toBe(HOUSE_SET_MAX);
      expect(ghost.score, `seed ${i}`).toBeLessThanOrEqual(SCORE_CEILINGS.music.max);
      if (ghost.drawnAboveCeiling) clamped++;
    }
    expect(SCORE_CEILINGS.music.max).toBe(HOUSE_SET_MAX);
    expect(clamped).toBeGreaterThan(0);   // some draws went over, and each was held to the ceiling
  });

  it('another mode still bands its rival on the player\'s sessions', async () => {
    db.matches = [legacyMatch({ mode: 'threePoint', matchType: 'GHOST_DUEL', status: 'ACTIVE', player1Id: USER, player2Id: HOUSE })];
    db.sessions = [{ userId: USER, mode: 'threePoint', score: 14, createdAt: new Date('2026-09-19T00:00:00Z') }];
    await submitPOST(post({ matchId: 'legacy-1', score: 12 }));
    expect(db.duelQueries).toEqual([]);
    expect(db.sessionQueries.map((w) => w.mode)).toEqual(['threePoint', 'threePoint']);
    expect(db.events.find((e) => e.type === 'GHOST_SCORED')!.payload).toMatchObject({ bandSource: 'player-history', bandCenter: 14 });
  });
});

describe('a new duel', () => {
  it('is stored under the session key even when an old client posts "musicAcademy" (music staking is open again, P6)', async () => {
    const res = await createPOST(post({ mode: 'musicAcademy', feeLc: 50 }));
    expect(res.status).toBe(200);
    expect(db.created).toHaveLength(1);
    expect(db.created[0].mode).toBe('music');
    expect((await res.json()).mode).toBe('music');
  });

  it('is stored as posted when the client posts the current key, and an unknown key is still refused', async () => {
    await createPOST(post({ mode: 'music', feeLc: 50 }));
    expect(db.created[0].mode).toBe('music');
    const bad = await createPOST(post({ mode: 'notAMode', feeLc: 50 }));
    expect(bad.status).toBe(400);
    expect(db.created).toHaveLength(1);
  });
});

// HOTFIX (2026-09-24): quick-match got the same normalisation as create, and it is the path that makes GHOST_DUEL rows,
// the rows the ghost draw reads. Join was the one arena route still answering with the raw stored key.
describe('a quick match', () => {
  it('is stored, logged and answered under the session key when an old client posts "musicAcademy"', async () => {
    const res = await quickPOST(post({ mode: 'musicAcademy', feeLc: 50 }));
    expect(res.status).toBe(200);
    expect(db.created).toHaveLength(1);
    expect(db.created[0]).toMatchObject({ mode: 'music', matchType: 'GHOST_DUEL', status: 'ACTIVE', player1Id: USER, player2Id: HOUSE });
    expect(db.events.find((e) => e.type === 'CREATED')!.payload.mode).toBe('music');
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, mode: 'music', href: '/play/music' });
  });

  it("then settles against a rival drawn from the player's past Arena music scores", async () => {
    await quickPOST(post({ mode: 'musicAcademy', feeLc: 50 }));
    db.matches = db.created.map((m) => ({ ...m, player1Score: null, player2Score: null, createdAt: new Date('2026-09-20T00:00:00Z') }));
    db.matches.push(legacyMatch({ id: 'past-1', mode: 'music', status: 'SETTLED', player1Id: USER, player2Id: HOUSE, player1Score: 48_000, player2Score: 4700, createdAt: new Date('2026-09-19T00:00:00Z') }));
    finished('past-1', USER);
    db.sessions = [{ userId: USER, mode: 'music', score: 14_800, createdAt: new Date('2026-09-19T00:00:00Z') }];
    const res = await submitPOST(post({ matchId: db.matches[0].id, score: played(db.matches[0].id, USER) }));
    expect(res.status).toBe(200);
    expect(db.sessionQueries).toEqual([]);
    expect(db.events.find((e) => e.type === 'GHOST_SCORED')!.payload).toMatchObject({ bandSource: 'player-history', bandCenter: 48_000 });
  });

  it('refuses an unknown mode and stores nothing', async () => {
    const res = await quickPOST(post({ mode: 'notAMode', feeLc: 50 }));
    expect(res.status).toBe(400);
    expect(db.created).toHaveLength(0);
  });
});

describe('joining a duel stored as "musicAcademy"', () => {
  it('answers and logs it as a music duel (music staking is open again, P6)', async () => {
    db.matches = [legacyMatch()];
    const res = await joinPOST(post({ matchId: 'legacy-1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, mode: 'music', status: 'ACTIVE' });
    const joined = vi.mocked(recordServerEvent).mock.calls.map((c) => c[0] as { name: string; props: Row }).find((e) => e.name === 'arena_match_joined')!;
    expect(joined.props.mode).toBe('music');
    expect(db.matches[0].mode).toBe('musicAcademy');   // the stored row is read through the alias, never rewritten
  });
});
