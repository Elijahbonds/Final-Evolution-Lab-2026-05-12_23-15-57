// STAKING PAUSED FOR MUSIC AND DANCE — MUSIC-SUITE P1 (2026-09-25).
//
// Owner decision #9 (outbox/finish-release/musicsuite/DECISIONS.md): "pause staking both now" — music AND dance come
// out of Arena Quick Match, posted duels and friend challenges; each returns when its fairness phase lands (music with
// phase 6, dance with phase 9); free play is unaffected. lib/stakingPause.ts is the one list every gate reads.
//
// What is proven here, with the real route handlers and the database, auth and LC book mocked (no DATABASE_URL, no
// network): a NEW stake or challenge on music or dance is refused before anything is written, on every route that can
// open one; every other mode still opens exactly as before; and a duel or challenge that ALREADY EXISTS on a paused mode
// still finishes — it takes its score, settles, pays or refunds a tie, and a posted duel nobody can now join is refunded
// by its creator's CANCEL. (Nothing expired an Arena duel when this was written — expiresAt was written and never read —
// so there was no expiry path to keep working; see outbox/finish-release/musicsuite/p1/STAKING-PAUSE.md. MUSIC-SUITE P6,
// 2026-09-26, owner decision #30: now the reclaim sweep reads it, in every mode, the paused ones too — a refund or a
// forfeit payout is not a new stake. lib/arena-reclaim.test.ts proves a paused dance duel reclaims like any other.)
//
// MUSIC-SUITE P6 (2026-09-26): music's fairness phase landed and its line left the list — an Arena music set is the
// duel's house beat, one recorded attempt, a server-rejudged score and a new ceiling (lib/babylon/music/houseBeat.ts,
// lib/arena-music.ts). Dance stays paused until phase 9, so the pause is proven here on dance alone; music is proven
// OPEN (a duel, a quick match, the lobby), and an existing music duel settles only on its rejudged set.
//
// MUSIC-SUITE P9 (2026-09-29): dance's fairness phase landed too (owner decision #10 — the house song, one attempt, an
// accuracy score the server rejudges: lib/babylon/dance/houseSong.ts, lib/arena-music.ts HOUSE_SET_RULES.dance), and its
// line left the list: THE REAL LIST IS EMPTY NOW (the 'P9' describe at the end runs against it, with dance open). The
// gates that read the list are still worth proving — the next mode that needs a pause goes through them — so this file
// keeps proving them on a list of its OWN: the module is mocked to read TEST_PAUSE, which holds 'dance' (the last mode
// the real list held, so every fixture below stays as it was). A dance duel now scores only from its recorded attempt,
// so the two tests that submit a dance score record one first. Friend challenges on dance stay closed on the house-set
// gate (lib/mp/match-core.ts MP_HOUSE_SET_ONLY), whatever the list says.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Row = Record<string, any>;
const USER = 'user-1';
const HOUSE = 'house-1';
const OTHER = 'someone-else';

/** MUSIC-SUITE P9: the list the gates read in this file (the real one is empty — see the header). */
const TEST_PAUSE = vi.hoisted(() => ({ modes: new Set<string>(['dance']) }));
vi.mock('./stakingPause', async (importOriginal) => {
  const real = await importOriginal<typeof import('./stakingPause')>();
  const { canonicalModeKey, MODE_INFO } = await import('./game-data');
  return {
    ...real,
    STAKING_PAUSED: TEST_PAUSE.modes,
    isStakingPaused: (mode: string | null | undefined) => TEST_PAUSE.modes.has(canonicalModeKey(mode)),
    pausedStakeModes: () => Array.from(TEST_PAUSE.modes).map((key) => ({ key, name: MODE_INFO[key]?.name ?? key, detail: real.stakingPausedDetail(key) })),
  };
});

const h = vi.hoisted(() => ({
  matches: [] as Row[],
  created: [] as Row[],
  events: [] as Array<{ matchId?: string; userId?: string | null; type: string; payload: Row }>,
  locks: [] as Row[],
  refunds: [] as Row[],
  payouts: [] as Row[],
  houseCalls: 0,
  userLookups: 0,
  escrowLocks: [] as Row[],
  mpCreated: [] as Row[],
  mpMatches: [] as Row[],
  bestScores: {} as Record<string, number>,
  grants: [] as Row[],
}));

const matchesWhere = (where: Row): Row[] => h.matches.filter((m) => {
  if (where.currency && m.currency !== where.currency) return false;
  if (where.status && m.status !== where.status) return false;
  if (where.player1Id?.not && m.player1Id === where.player1Id.not) return false;
  if (typeof where.player1Id === 'string' && m.player1Id !== where.player1Id) return false;
  if (where.mode?.in && !where.mode.in.includes(m.mode)) return false;
  if (where.OR) return where.OR.some((c: Row) => Object.entries(c).every(([k, v]) => m[k] === v));
  return true;
});

const tx = {
  competitionMatch: {
    findUnique: async ({ where }: Row) => h.matches.find((m) => m.id === where.id) ?? null,
    update: async ({ where, data }: Row) => { const m = [...h.matches, ...h.created].find((x) => x.id === where.id)!; Object.assign(m, data); return { ...m }; },
    create: async ({ data }: Row) => { const m = { id: `new-${h.created.length + 1}`, ...data, createdAt: new Date() }; h.created.push(m); return m; },
    findMany: async () => [],      // no past duels: a music ghost draws off the baseline
  },
  gameSession: { findMany: async () => [] },   // no past sessions: a dance ghost draws off the baseline
  // MUSIC-SUITE P6: a music duel's attempt events (lib/arena-music.ts readMusicAttempt)
  matchEvent: {
    findMany: async ({ where }: Row) => h.events
      .filter((e) => e.matchId === where.matchId && e.userId === where.userId && where.eventType.in.includes(e.type))
      .map((e) => ({ eventType: e.type, payload: JSON.stringify(e.payload), createdAt: new Date(0) })),
  },
};

vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ user: { id: USER, name: 'You' } })) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/analytics-server', () => ({ recordServerEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/flags', () => ({ isRealMoneyCompetitionEnabled: () => true, FEATURE_DISABLED: { error: 'feature_disabled' } }));
vi.mock('@/lib/wallet/wallet-service', () => ({
  applyLc: vi.fn(async () => ({ balanceAfter: 0 })),
  readWallet: vi.fn(async () => ({ lc: 500, coins: 0, shards: 0 })),
  getOrCreateWallet: vi.fn(async () => ({})),
  grantServerReward: vi.fn(async (_db: unknown, g: Row) => { h.grants.push(g); return {}; }),
  WalletError: class WalletError extends Error { code = ''; },
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    competitionMatch: {
      // honours take, like the real query: MY DUELS is capped at 25 (the P1 stranded-duel hole depends on it)
      findMany: async ({ where, take }: Row) => { const rows = matchesWhere(where); return take ? rows.slice(0, take) : rows; },
      findUnique: async ({ where }: Row) => h.matches.find((m) => m.id === where.id) ?? null,
    },
    user: {
      findMany: async () => [{ id: USER, name: 'You' }, { id: HOUSE, name: 'House' }, { id: OTHER, name: 'Rival' }],
      findUnique: async () => { h.userLookups++; return { dobYear: 1990, kycStatus: 'VERIFIED', selfExcludedAt: null, declaredState: 'NY' }; },
    },
    playerProfile: { findUnique: async () => ({ labCredits: 500 }) },
    matchEvent: { findMany: async () => [] },
    mpMatch: {
      findUnique: async ({ where }: Row) => h.mpMatches.find((m) => (where.code ? m.code === where.code : m.id === where.id)) ?? null,
      update: async ({ where, data }: Row) => { const m = h.mpMatches.find((x) => x.id === where.id)!; Object.assign(m, data); return { ...m }; },
    },
    gameSession: {
      findFirst: async ({ where }: Row) => (where.userId in h.bestScores ? { score: h.bestScores[where.userId] } : null),
    },
    $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
  },
}));
vi.mock('@/lib/arena-rivals', async (importOriginal) => {
  const real = await importOriginal<typeof import('./arena-rivals')>();
  return { ...real, ensureHouseRivals: vi.fn(async () => { h.houseCalls++; return new Map(real.HOUSE_RIVALS.map((r) => [r.key, HOUSE])); }) };
});
// The LC book has its own tests; here each movement only records that it was asked for.
vi.mock('@/lib/arena', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./arena')>()),
  arenaLockEntry: vi.fn(async (_db: unknown, o: Row) => { h.locks.push(o); return 0; }),
  arenaPayWinner: vi.fn(async (_db: unknown, o: Row) => { h.payouts.push(o); return { payout: 90, rake: 10 }; }),
  arenaRefund: vi.fn(async (_db: unknown, o: Row) => { h.refunds.push(o); return 0; }),
  appendMatchEvent: vi.fn(async (_db: unknown, matchId: string, type: string, userId: string | null, payload: Row = {}) => { h.events.push({ matchId, userId, type, payload }); }),
}));
// The dark engine: eligibility and escrow have their own tests; here the gate order is what matters.
vi.mock('@/lib/competition', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./competition')>()),
  checkCompetitionEligibility: () => ({ allowed: true }),
  appendMatchEvent: vi.fn(async () => undefined),
}));
vi.mock('@/lib/stripe-helpers', () => ({
  ledgerEscrowLock: vi.fn(async (_db: unknown, o: Row) => { h.escrowLocks.push(o); return { transactionId: 'tx-1' }; }),
}));
// Creating a challenge is recorded; joinAndSettle / settleMatch stay REAL (the spread), so an existing one settles for real.
vi.mock('@/lib/mp/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./mp/service')>()),
  createOnlineChallenge: vi.fn(async (_p: unknown, a: Row) => { h.mpCreated.push(a); return { code: 'ABC234', mode: a.mode, hostScore: 10, status: 'open' }; }),
  createLocalMatch: vi.fn(async (_p: unknown, a: Row) => { h.mpCreated.push(a); return { code: 'ABC235', mode: a.mode, status: 'settled', hostScore: a.hostScore, guestScore: a.guestScore, winnerId: null }; }),
}));

import {
  STAKING_PAUSED, isStakingPaused, stakingPausedDetail, pausedStakeModes, STAKING_PAUSED_CODE, STAKING_PAUSED_STATUS,
} from './stakingPause';
import { ARENA_MODES, isArenaMode, isArenaStakeable, arenaStakeableModes } from './arena';
import { scoreCeilingFor } from './arena-score-integrity';
import { houseBeatFor, houseTap, judgeHouseSet } from './babylon/music/houseBeat';
import { MUSIC_ATTEMPT_START, MUSIC_ATTEMPT_FINISH, DANCE_ATTEMPT_START, DANCE_ATTEMPT_FINISH } from './arena-music';
import { houseSongFor, houseSongSteps, judgeDanceSet, dancePress } from './babylon/dance/houseSong';
import { beatDuration } from './babylon/core/DanceCore';
import { MP_MODES, MP_CHALLENGE_MODES, MP_PAUSED_MODES, isMpChallengeOpen, isValidMpMode, sessionModeFor, mpModeLabel } from './mp/match-core';
import { POST as createPOST } from '../app/api/arena/create/route';
import { POST as quickPOST } from '../app/api/arena/quick-match/route';
import { POST as joinPOST } from '../app/api/arena/join/route';
import { POST as cancelPOST } from '../app/api/arena/cancel/route';
import { POST as submitPOST } from '../app/api/arena/submit-score/route';
import { GET as listGET } from '../app/api/arena/list/route';
import { GET as configGET } from '../app/api/arena/config/route';
import { POST as compCreatePOST } from '../app/api/competition/create/route';
import { POST as compJoinPOST } from '../app/api/competition/join/route';
import { POST as mpCreatePOST } from '../app/api/v1/mp/create/route';
import { POST as mpLocalPOST } from '../app/api/v1/mp/local/route';
import { POST as mpJoinPOST } from '../app/api/v1/mp/join/route';

const post = (body: unknown) => new Request('http://local.test/api', { method: 'POST', body: JSON.stringify(body) }) as any;
const duel = (over: Row = {}): Row => ({
  id: 'd-1', mode: 'dance', currency: 'LC', status: 'ACTIVE', matchType: 'GHOST_DUEL', entryFeeCents: 50, rakePercent: 10,
  seed: 'seed-before-the-pause', player1Id: USER, player2Id: HOUSE, player1Score: null, player2Score: null, winnerId: null,
  createdAt: new Date('2026-09-24T00:00:00Z'), updatedAt: new Date('2026-09-24T00:00:00Z'), ...over,
});
const PAUSED = ['dance'] as const;   // MUSIC-SUITE P6: music left the list

/** MUSIC-SUITE P6: `userId` plays their one attempt in music duel `matchId` (every other note dead on); its rejudged score. */
function played(matchId: string, userId: string): number {
  const beat = houseBeatFor(matchId);
  const taps = beat.notes.filter((_, i) => i % 2 === 0).map((n) => houseTap(n.lane, n.t));
  h.events.push({ matchId, userId, type: MUSIC_ATTEMPT_START, payload: {} }, { matchId, userId, type: MUSIC_ATTEMPT_FINISH, payload: { taps } });
  return judgeHouseSet(beat, taps).score;
}

/** MUSIC-SUITE P9: `userId` dances their one attempt in dance duel `matchId` (every other step dead on); its rejudged score. */
function dancedHalf(matchId: string, userId: string): number {
  const song = houseSongFor(matchId);
  const bd = beatDuration(song.bpm);
  const presses = houseSongSteps(song).filter((_, i) => i % 2 === 0).map((s) => dancePress(s.beat * bd));
  h.events.push({ matchId, userId, type: DANCE_ATTEMPT_START, payload: {} }, { matchId, userId, type: DANCE_ATTEMPT_FINISH, payload: { taps: presses } });
  return judgeDanceSet(song, presses).score;
}

beforeEach(() => {
  TEST_PAUSE.modes.clear(); TEST_PAUSE.modes.add('dance');   // MUSIC-SUITE P9: this file's own list (see the header)
  h.matches = []; h.created = []; h.events = []; h.locks = []; h.refunds = []; h.payouts = []; h.houseCalls = 0;
  h.userLookups = 0; h.escrowLocks = []; h.mpCreated = []; h.mpMatches = []; h.bestScores = {}; h.grants = [];
});

describe('the one list (lib/stakingPause.ts)', () => {
  it('pauses exactly dance now: music came back with MUSIC-SUITE phase 6 (owner decisions #9 and #12)', async () => {
    // MUSIC-SUITE P9 (2026-09-29): and dance with phase 9 (#10) — the REAL list is empty; this file's TEST_PAUSE holds dance
    const real = await vi.importActual<typeof import('./stakingPause')>('./stakingPause');
    expect([...real.STAKING_PAUSED]).toEqual([]);
    for (const m of ['dance', 'music', 'musicAcademy']) expect(real.isStakingPaused(m), m).toBe(false);
    expect(real.pausedStakeModes()).toEqual([]);
    expect([...STAKING_PAUSED].sort()).toEqual(['dance']);   // the test's own list, which the gates below read
    for (const m of PAUSED) expect(isStakingPaused(m), m).toBe(true);
    expect(isStakingPaused('music')).toBe(false);
  });

  it('reads the old spelling a stored duel or an old client carries, and pauses nothing else', () => {
    expect(isStakingPaused('musicAcademy')).toBe(false);   // P6: music's old key is open with it
    for (const m of ['music', 'threePoint', 'dunkContest', 'hoops1v1', 'karateVersus', 'brainBrawl', 'training', '', null, undefined]) {
      expect(isStakingPaused(m as string), String(m)).toBe(false);
    }
  });

  it('a paused mode is still an Arena mode with a ceiling, so a duel opened before the pause can still take a score', () => {
    for (const m of PAUSED) {
      expect(isArenaMode(m), m).toBe(true);
      expect(scoreCeilingFor(m), m).not.toBeNull();
      expect(isArenaStakeable(m), m).toBe(false);
    }
  });

  it('every other Arena mode can still be staked', () => {
    expect(arenaStakeableModes()).toEqual(ARENA_MODES.filter((m) => !PAUSED.includes(m as never)));
    expect(arenaStakeableModes()).toHaveLength(ARENA_MODES.length - PAUSED.length);
    for (const m of arenaStakeableModes()) expect(isArenaStakeable(m), m).toBe(true);
  });

  it('tells the player which mode, why, and that free play and their open duels are fine', () => {
    expect(stakingPausedDetail('dance')).toContain('The Cypher');
    expect(stakingPausedDetail('musicAcademy')).toContain('Groove Academy');
    expect(stakingPausedDetail('music')).toMatch(/Free play is open/);
    expect(stakingPausedDetail('music')).toMatch(/still plays and settles/);
    expect(pausedStakeModes().map((p) => p.name).sort()).toEqual(['The Cypher']);
    expect(STAKING_PAUSED_CODE).toBe('STAKING_PAUSED');
    expect(STAKING_PAUSED_STATUS).toBe(409);
  });

  it('free play never reads it: no play route, game or session path imports the pause', () => {
    const ROOT = path.resolve(__dirname, '..');
    const files = [
      'app/play/music/page.tsx', 'app/play/music/_components/loader.tsx', 'app/play/dance/page.tsx', 'app/play/dance/_components/loader.tsx',
      'components/games/game-shell.tsx', 'app/api/sessions/route.ts', 'lib/babylon/music/StudioMode.tsx', 'lib/babylon/modes/DanceMode.ts',
    ];
    for (const f of files) {
      const abs = path.join(ROOT, f);
      expect(fs.existsSync(abs), `${f} exists`).toBe(true);
      expect(fs.readFileSync(abs, 'utf8'), f).not.toMatch(/stakingPause|isStakingPaused|STAKING_PAUSED/);
    }
  });
});

describe('the Arena refuses a NEW stake on dance, and nothing is written', () => {
  for (const mode of PAUSED) {
    it(`POST DUEL on "${mode}": 409 STAKING_PAUSED, no row, no event, no Lab Credits locked`, async () => {
      const res = await createPOST(post({ mode, feeLc: 50 }));
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toBe('STAKING_PAUSED');
      expect(body.detail).toMatch(/paused/);
      expect(h.created).toEqual([]);
      expect(h.events).toEqual([]);
      expect(h.locks).toEqual([]);
    });

    it(`QUICK MATCH on "${mode}": 409 STAKING_PAUSED before the house roster is touched — neither seat locked`, async () => {
      const res = await quickPOST(post({ mode, feeLc: 50 }));
      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe('STAKING_PAUSED');
      expect(h.houseCalls).toBe(0);
      expect(h.created).toEqual([]);
      expect(h.locks).toEqual([]);
    });
  }

  it('ACCEPT on a dance duel posted before the pause: 409, the joiner\'s LC never moves, the row stays WAITING', async () => {
    h.matches = [duel({ status: 'WAITING', matchType: 'SCORE_DUEL', player1Id: OTHER, player2Id: null })];
    const res = await joinPOST(post({ matchId: 'd-1' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('STAKING_PAUSED');
    expect(h.locks).toEqual([]);
    expect(h.matches[0]).toMatchObject({ status: 'WAITING', player2Id: null });
  });

  it('an unknown mode is still an unknown mode, not a paused one', async () => {
    const res = await createPOST(post({ mode: 'notAMode', feeLc: 50 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_mode');
  });
});

describe('every other mode stakes exactly as before — music again too (P6)', () => {
  for (const mode of ['threePoint', 'hoops1v1', 'karateVersus', 'music']) {
    it(`POST DUEL and QUICK MATCH on "${mode}" open, and lock the stake`, async () => {
      const a = await createPOST(post({ mode, feeLc: 50 }));
      expect(a.status).toBe(200);
      const b = await quickPOST(post({ mode, feeLc: 50 }));
      expect(b.status).toBe(200);
      expect(h.created.map((m) => m.mode)).toEqual([mode, mode]);
      expect(h.created.map((m) => m.matchType)).toEqual(['SCORE_DUEL', 'GHOST_DUEL']);
      expect(h.locks).toHaveLength(3);   // the poster; then the quick matcher and the house
    });
  }

  it('P6: an old client posting "musicAcademy" opens a music duel and a music quick match, stored under "music"', async () => {
    const a = await createPOST(post({ mode: 'musicAcademy', feeLc: 50 }));
    const b = await quickPOST(post({ mode: 'musicAcademy', feeLc: 50 }));
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(h.created.map((m) => m.mode)).toEqual(['music', 'music']);
    expect(h.locks).toHaveLength(3);
  });

  it('P6: ACCEPT on a posted music duel joins and locks the joiner\'s stake', async () => {
    h.matches = [duel({ mode: 'music', status: 'WAITING', matchType: 'SCORE_DUEL', player1Id: OTHER, player2Id: null })];
    const res = await joinPOST(post({ matchId: 'd-1' }));
    expect(res.status).toBe(200);
    expect(h.locks).toEqual([expect.objectContaining({ userId: USER, feeLc: 50 })]);
    expect(h.matches[0]).toMatchObject({ status: 'ACTIVE', player2Id: USER });
  });

  it('ACCEPT on a threePoint duel still joins and locks the joiner\'s stake', async () => {
    h.matches = [duel({ mode: 'threePoint', status: 'WAITING', matchType: 'SCORE_DUEL', player1Id: OTHER, player2Id: null })];
    const res = await joinPOST(post({ matchId: 'd-1' }));
    expect(res.status).toBe(200);
    expect(h.locks).toEqual([expect.objectContaining({ userId: USER, feeLc: 50 })]);
    expect(h.matches[0]).toMatchObject({ status: 'ACTIVE', player2Id: USER });
  });
});

describe('a duel that already exists on a paused mode still finishes', () => {
  it('a dance QUICK MATCH opened before the pause takes the score, draws the house and settles', async () => {
    h.matches = [duel()];
    // MUSIC-SUITE P9: a dance score now comes only from the duel's one recorded attempt on its house song, rejudged
    const score = dancedHalf('d-1', USER);
    const res = await submitPOST(post({ matchId: 'd-1', score }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.settled).toBe(true);
    expect(h.events.map((e) => e.type)).toEqual(expect.arrayContaining(['SCORE_SUBMITTED', 'GHOST_SCORED']));
    // a win pays once, a loss pays the house once, a tie refunds both — one of the three, never nothing
    expect(h.payouts.length + h.refunds.length).toBeGreaterThan(0);
    expect(['SETTLED', 'VOIDED']).toContain(h.matches[0].status);
  });

  // MUSIC-SUITE P6: a music duel (open again, no longer paused) settles on the player's rejudged attempt
  it('a human music duel settles to its winner — on the set the server rejudged', async () => {
    h.matches = [duel({ id: 'm-1', mode: 'music', matchType: 'SCORE_DUEL', player2Id: OTHER, player2Score: 1000 })];
    h.events.push({ matchId: 'm-1', userId: OTHER, type: MUSIC_ATTEMPT_START, payload: {} });   // (P6 fix pass: a house-beat score)
    const score = played('m-1', USER);
    expect(score).toBeGreaterThan(1000);
    const res = await submitPOST(post({ matchId: 'm-1', score }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ settled: true, result: 'p1', iWon: true, winnerId: USER });
    expect(h.payouts).toEqual([expect.objectContaining({ winnerId: USER, feeLc: 50 })]);
    expect(h.matches[0].status).toBe('SETTLED');
  });

  it('a tied music duel stored under the old key refunds both entries', async () => {
    const score = played('m-2', USER);
    h.events.push({ matchId: 'm-2', userId: OTHER, type: MUSIC_ATTEMPT_START, payload: {} });
    h.matches = [duel({ id: 'm-2', mode: 'musicAcademy', matchType: 'SCORE_DUEL', player2Id: OTHER, player2Score: score })];
    const res = await submitPOST(post({ matchId: 'm-2', score }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ settled: true, result: 'tie' });
    expect(h.refunds.map((r) => r.userId).sort()).toEqual([OTHER, USER].sort());
    expect(h.matches[0].status).toBe('VOIDED');
  });

  it('the mode\'s ceiling still binds a paused mode\'s open duel: a score no set can reach is refused, nothing settles', async () => {
    h.matches = [duel()];
    dancedHalf('d-1', USER);   // MUSIC-SUITE P9: with its attempt recorded, the ceiling is what refuses it (422), not NO_ATTEMPT
    h.events = h.events.filter((e) => e.type === DANCE_ATTEMPT_START || e.type === DANCE_ATTEMPT_FINISH);
    const res = await submitPOST(post({ matchId: 'd-1', score: 10_000_000 }));
    expect(res.status).toBe(422);
    expect(h.events.map((e) => e.type)).toEqual([DANCE_ATTEMPT_START, DANCE_ATTEMPT_FINISH]);   // nothing written past the attempt
    expect(h.payouts).toEqual([]);
  });

  it('a dance duel posted before the pause, which nobody can now join, is refunded by its creator\'s CANCEL', async () => {
    h.matches = [duel({ status: 'WAITING', matchType: 'SCORE_DUEL', player2Id: null })];
    const res = await cancelPOST(post({ matchId: 'd-1' }));
    expect(res.status).toBe(200);
    expect(h.refunds).toEqual([expect.objectContaining({ userId: USER, matchId: 'd-1', feeLc: 50 })]);
    expect(h.matches[0].status).toBe('VOIDED');
  });
});

describe('the Arena lobby', () => {
  it('offers only stakeable modes, and names the paused ones', async () => {
    const body = await (await configGET()).json();
    const keys = body.modes.map((m: Row) => m.key);
    for (const m of PAUSED) expect(keys).not.toContain(m);
    expect(keys).toEqual(arenaStakeableModes());
    expect(body.pausedModes.map((p: Row) => p.key).sort()).toEqual(['dance']);
    expect(keys).toContain('music');   // P6: offered again
  });

  it('does not advertise a paused duel nobody can accept, and keeps mine with its PLAY link and a paused flag', async () => {
    h.matches = [
      duel({ id: 'open-dance', status: 'WAITING', matchType: 'SCORE_DUEL', player1Id: OTHER, player2Id: null }),
      duel({ id: 'open-music-old', mode: 'musicAcademy', status: 'WAITING', matchType: 'SCORE_DUEL', player1Id: OTHER, player2Id: null }),
      duel({ id: 'open-3pt', mode: 'threePoint', status: 'WAITING', matchType: 'SCORE_DUEL', player1Id: OTHER, player2Id: null }),
      duel({ id: 'mine-dance', status: 'ACTIVE' }),
      duel({ id: 'mine-waiting', mode: 'music', status: 'WAITING', matchType: 'SCORE_DUEL', player2Id: null }),
    ];
    const body = await (await listGET()).json();
    expect(body.open.map((d: Row) => d.id)).toEqual(['open-music-old', 'open-3pt']);   // P6: a music duel can be accepted again
    const mine = Object.fromEntries(body.mine.map((d: Row) => [d.id, d]));
    expect(mine['mine-dance']).toMatchObject({ mode: 'dance', href: '/play/dance', status: 'ACTIVE', stakingPaused: true });
    expect(mine['mine-waiting']).toMatchObject({ mode: 'music', href: '/play/music', status: 'WAITING', stakingPaused: false });
  });

  // P1 review hole: MY DUELS keeps only the 25 most recently updated duels, and a paused WAITING duel (which nobody can
  // join any more) would fall off with its CANCEL — the only way its stake comes back.
  it('keeps a paused WAITING duel in MY DUELS even behind 30 newer duels, so its CANCEL is always there', async () => {
    const old = duel({ id: 'old-paused', mode: 'dance', status: 'WAITING', matchType: 'SCORE_DUEL', player2Id: null });
    const newer = Array.from({ length: 30 }, (_, i) => duel({ id: `newer-${i}`, mode: 'threePoint', status: 'SETTLED' }));
    h.matches = [...newer, old];
    const body = await (await listGET()).json();
    expect(body.mine.map((d: Row) => d.id)).toContain('old-paused');
  });
});

describe('friend challenges (/multiplayer)', () => {
  it('dance is still a challenge key (its label and creator cards read it) but no NEW challenge can be made on it', () => {
    expect(isValidMpMode('dance')).toBe(true);
    expect(mpModeLabel('dance')).toBe('The Cypher');
    expect(isMpChallengeOpen('dance')).toBe(false);
    expect(MP_PAUSED_MODES.map((m) => m.key)).toEqual(['dance']);
    expect(MP_CHALLENGE_MODES.map((m) => m.key)).not.toContain('dance');
  });

  it('every other challenge mode stays open', () => {
    expect(MP_CHALLENGE_MODES).toHaveLength(MP_MODES.length - 1);
    for (const m of MP_CHALLENGE_MODES) {
      expect(isMpChallengeOpen(m.key), m.key).toBe(true);
      expect(isStakingPaused(sessionModeFor(m.key)), m.key).toBe(false);
    }
  });

  it('CREATE CHALLENGE on dance: 409 STAKING_PAUSED, nothing created; on threepoint it is created', async () => {
    const res = await mpCreatePOST(post({ mode: 'dance' }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'STAKING_PAUSED' });
    expect(h.mpCreated).toEqual([]);
    const ok = await mpCreatePOST(post({ mode: 'threepoint' }));
    expect(ok.status).toBe(200);
    expect(h.mpCreated.map((a) => a.mode)).toEqual(['threepoint']);
  });

  it('pass-and-play on dance: 409, no match recorded and no coins or shards; on soccer it records', async () => {
    const res = await mpLocalPOST(post({ mode: 'dance', hostScore: 10, guestScore: 5, guestName: 'P2' }));
    expect(res.status).toBe(409);
    expect(h.mpCreated).toEqual([]);
    const ok = await mpLocalPOST(post({ mode: 'soccer', hostScore: 3, guestScore: 1, guestName: 'P2' }));
    expect(ok.status).toBe(200);
    expect(h.mpCreated.map((a) => a.mode)).toEqual(['soccer']);
  });

  // P1 review hole: accepting settles on the guest's ALL-TIME best, which own-song dance free play after the pause can
  // inflate to the 79,680 ceiling — the song-decides duel the pause exists to stop. Accepting is refused; nothing was
  // locked on a friend challenge, so the host's challenge just stays open (no row changes, no grants).
  it('a dance challenge posted before the pause can no longer be accepted: 409, no settle, no grants; soccer still settles', async () => {
    h.mpMatches = [
      { id: 'mp-1', code: 'DANCE2', mode: 'dance', kind: 'online', status: 'open', hostId: OTHER, hostName: 'Rival', hostScore: 3000, guestId: null, guestScore: null },
      { id: 'mp-2', code: 'SOCCR2', mode: 'soccer', kind: 'online', status: 'open', hostId: OTHER, hostName: 'Rival', hostScore: 1, guestId: null, guestScore: null },
    ];
    h.bestScores = { [USER]: 4200 };
    const res = await mpJoinPOST(post({ code: 'DANCE2' }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'staking_paused' });
    expect(h.mpMatches[0]).toMatchObject({ status: 'open', guestId: null });
    expect(h.grants).toEqual([]);
    const ok = await mpJoinPOST(post({ code: 'SOCCR2' }));
    expect(ok.status).toBe(200);
  });
});

describe('the dark real-money engine reads the same list', () => {
  it('create refuses dance before the eligibility lookup; a bounded unpaused mode gets past the gate', async () => {
    for (const mode of PAUSED) {
      const res = await compCreatePOST(post({ mode, matchType: 'SCORE_DUEL', entryFeeCents: 500 }));
      expect(res.status, mode).toBe(409);
      expect((await res.json()).error).toBe('STAKING_PAUSED');
    }
    expect(h.userLookups).toBe(0);
    expect(h.escrowLocks).toEqual([]);
    expect(h.created).toEqual([]);
    const ok = await compCreatePOST(post({ mode: 'skateboard', matchType: 'SCORE_DUEL', entryFeeCents: 500 }));
    expect(ok.status).toBe(200);
    expect(h.userLookups).toBe(1);
    expect(h.created.map((m) => m.mode)).toEqual(['skateboard']);
    expect(h.escrowLocks).toHaveLength(1);
  });

  // MUSIC-SUITE P6 FIX PASS (2026-09-26): the pause WAS this engine's only guard for music. Unpaused, music reached create
  // and join again — and this engine's submit-score cannot rejudge (SCORE_NOT_REJUDGED, lib/arena-score-integrity.ts), with
  // no expiry on an H2H match: both escrows locked for good. A REJUDGED_STAKE_MODES mode is refused before any escrow.
  it('P6 fix pass: music (either key) is refused at create and join — NOT_STAKEABLE_HERE, before any escrow or lookup', async () => {
    expect(isStakingPaused('music')).toBe(false);
    for (const mode of ['music', 'musicAcademy']) {
      const res = await compCreatePOST(post({ mode, matchType: 'SCORE_DUEL', entryFeeCents: 500 }));
      expect(res.status, mode).toBe(400);
      expect((await res.json()).error).toBe('NOT_STAKEABLE_HERE');
    }
    expect(h.userLookups).toBe(0);
    expect(h.created).toEqual([]);
    h.matches = [duel({ id: 'c-music', mode: 'music', currency: 'USD', status: 'WAITING', matchType: 'SCORE_DUEL', player1Id: OTHER, player2Id: null })];
    const bad = await compJoinPOST(post({ matchId: 'c-music' }));
    expect(bad.status).toBe(400);
    expect(h.escrowLocks).toEqual([]);
    expect(h.matches[0]).toMatchObject({ status: 'WAITING', player2Id: null });
  });

  it('join refuses a paused-mode match before the escrow lock, and still joins another mode', async () => {
    h.matches = [
      duel({ id: 'c-dance', currency: 'USD', status: 'WAITING', matchType: 'SCORE_DUEL', player1Id: OTHER, player2Id: null }),
      duel({ id: 'c-skate', mode: 'skateboard', currency: 'USD', status: 'WAITING', matchType: 'SCORE_DUEL', player1Id: OTHER, player2Id: null }),
    ];
    const bad = await compJoinPOST(post({ matchId: 'c-dance' }));
    expect(bad.status).toBe(409);
    expect(h.escrowLocks).toEqual([]);
    expect(h.matches[0]).toMatchObject({ status: 'WAITING', player2Id: null });
    const ok = await compJoinPOST(post({ matchId: 'c-skate' }));
    expect(ok.status).toBe(200);
    expect(h.escrowLocks).toHaveLength(1);
  });
});

// MUSIC-SUITE P9 (2026-09-29), owner decisions #9 and #10: DANCE IS STAKED AGAIN. Run against the real (empty) list — this
// file's TEST_PAUSE emptied to match it — with the same routes and mocks as above: a new dance stake opens and locks like
// any mode's, the lobby offers it, the dark engine refuses it for the reason it refuses music (its submit-score cannot
// rejudge a set: NOT_STAKEABLE_HERE), and a friend challenge on it stays closed on the house-set gate with its own words.
describe('P9: dance is staked again — the real list is empty', () => {
  beforeEach(() => { TEST_PAUSE.modes.clear(); });

  it('the real list and this file\'s agree now: nothing is paused', async () => {
    const real = await vi.importActual<typeof import('./stakingPause')>('./stakingPause');
    expect([...real.STAKING_PAUSED]).toEqual([...STAKING_PAUSED]);
    expect(isStakingPaused('dance')).toBe(false);
    expect(arenaStakeableModes()).toEqual([...ARENA_MODES]);
  });

  it('POST DUEL and QUICK MATCH on "dance" open and lock the stake; ACCEPT on a posted dance duel joins', async () => {
    const a = await createPOST(post({ mode: 'dance', feeLc: 50 }));
    const b = await quickPOST(post({ mode: 'dance', feeLc: 50 }));
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(h.created.map((m) => [m.mode, m.matchType])).toEqual([['dance', 'SCORE_DUEL'], ['dance', 'GHOST_DUEL']]);
    expect(h.locks).toHaveLength(3);
    h.matches = [duel({ status: 'WAITING', matchType: 'SCORE_DUEL', player1Id: OTHER, player2Id: null })];
    const j = await joinPOST(post({ matchId: 'd-1' }));
    expect(j.status).toBe(200);
    expect(h.matches[0]).toMatchObject({ status: 'ACTIVE', player2Id: USER });
  });

  it('the lobby offers dance and names nothing paused; an open dance challenge is listed to accept', async () => {
    const body = await (await configGET()).json();
    expect(body.modes.map((m: Row) => m.key)).toContain('dance');
    expect(body.pausedModes).toEqual([]);
    h.matches = [duel({ id: 'open-dance', status: 'WAITING', matchType: 'SCORE_DUEL', player1Id: OTHER, player2Id: null })];
    const list = await (await listGET()).json();
    expect(list.open.map((d: Row) => d.id)).toEqual(['open-dance']);
  });

  it('a dance duel settles only on its rejudged house-song set: a points score with no attempt is refused (409 NO_ATTEMPT)', async () => {
    h.matches = [duel({ id: 'dq-1' })];
    const refused = await submitPOST(post({ matchId: 'dq-1', score: 4000 }));
    expect(refused.status).toBe(409);
    expect((await refused.json()).error).toBe('NO_ATTEMPT');
    expect(h.payouts.length + h.refunds.length).toBe(0);
    const score = dancedHalf('dq-1', USER);
    const ok = await submitPOST(post({ matchId: 'dq-1', score }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).settled).toBe(true);
  });

  it('the dark real-money engine refuses dance (either way in) before any escrow or lookup: 400 NOT_STAKEABLE_HERE', async () => {
    const res = await compCreatePOST(post({ mode: 'dance', matchType: 'SCORE_DUEL', entryFeeCents: 500 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('NOT_STAKEABLE_HERE');
    expect(h.userLookups).toBe(0);
    expect(h.created).toEqual([]);
    h.matches = [duel({ id: 'c-dance', currency: 'USD', status: 'WAITING', matchType: 'SCORE_DUEL', player1Id: OTHER, player2Id: null })];
    const bad = await compJoinPOST(post({ matchId: 'c-dance' }));
    expect(bad.status).toBe(400);
    expect(h.escrowLocks).toEqual([]);
  });

  it('friend challenges on dance stay closed (the house-set gate), with words that say why; soccer still opens', async () => {
    expect(isMpChallengeOpen('dance')).toBe(false);
    const res = await mpCreatePOST(post({ mode: 'dance' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('STAKING_PAUSED');
    expect(body.detail).toMatch(/Friend challenges on The Cypher are closed/);
    expect(body.detail).toMatch(/same house song/);
    expect((await mpLocalPOST(post({ mode: 'dance', hostScore: 10, guestScore: 5, guestName: 'P2' }))).status).toBe(409);
    expect(h.mpCreated).toEqual([]);
    h.mpMatches = [{ id: 'mp-1', code: 'DANCE2', mode: 'dance', kind: 'online', status: 'open', hostId: OTHER, hostName: 'Rival', hostScore: 3000, guestId: null, guestScore: null }];
    h.bestScores = { [USER]: 90_000 };
    const join = await mpJoinPOST(post({ code: 'DANCE2' }));
    expect(join.status).toBe(409);
    expect((await join.json()).detail).toMatch(/Friend challenges on The Cypher are closed/);
    expect(h.mpMatches[0]).toMatchObject({ status: 'open', guestId: null });
    expect(h.grants).toEqual([]);
    expect((await mpCreatePOST(post({ mode: 'soccer' }))).status).toBe(200);
  });
});
