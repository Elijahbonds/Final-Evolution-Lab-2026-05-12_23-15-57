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
// by its creator's CANCEL. (Nothing expires an Arena duel today — expiresAt is written and never read — so there is no
// expiry path to keep working; see outbox/finish-release/musicsuite/p1/STAKING-PAUSE.md.)
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Row = Record<string, any>;
const USER = 'user-1';
const HOUSE = 'house-1';
const OTHER = 'someone-else';

const h = vi.hoisted(() => ({
  matches: [] as Row[],
  created: [] as Row[],
  events: [] as Array<{ type: string; payload: Row }>,
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
  appendMatchEvent: vi.fn(async (_db: unknown, _id: string, type: string, _u: unknown, payload: Row = {}) => { h.events.push({ type, payload }); }),
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
const PAUSED = ['music', 'dance'] as const;

beforeEach(() => {
  h.matches = []; h.created = []; h.events = []; h.locks = []; h.refunds = []; h.payouts = []; h.houseCalls = 0;
  h.userLookups = 0; h.escrowLocks = []; h.mpCreated = []; h.mpMatches = []; h.bestScores = {}; h.grants = [];
});

describe('the one list (lib/stakingPause.ts)', () => {
  it('pauses exactly music and dance, the owner\'s decision #9 of 2026-09-25', () => {
    expect([...STAKING_PAUSED].sort()).toEqual(['dance', 'music']);
    for (const m of PAUSED) expect(isStakingPaused(m), m).toBe(true);
  });

  it('reads the old spelling a stored duel or an old client carries, and pauses nothing else', () => {
    expect(isStakingPaused('musicAcademy')).toBe(true);
    for (const m of ['threePoint', 'dunkContest', 'hoops1v1', 'karateVersus', 'brainBrawl', 'training', '', null, undefined]) {
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
    expect(pausedStakeModes().map((p) => p.name).sort()).toEqual(['Groove Academy', 'The Cypher']);
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

describe('the Arena refuses a NEW stake on music or dance, and nothing is written', () => {
  for (const mode of [...PAUSED, 'musicAcademy']) {
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

describe('every other mode stakes exactly as before', () => {
  for (const mode of ['threePoint', 'hoops1v1', 'karateVersus']) {
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
    const res = await submitPOST(post({ matchId: 'd-1', score: 4000 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.settled).toBe(true);
    expect(h.events.map((e) => e.type)).toEqual(expect.arrayContaining(['SCORE_SUBMITTED', 'GHOST_SCORED']));
    // a win pays once, a loss pays the house once, a tie refunds both — one of the three, never nothing
    expect(h.payouts.length + h.refunds.length).toBeGreaterThan(0);
    expect(['SETTLED', 'VOIDED']).toContain(h.matches[0].status);
  });

  it('a human music duel settles to its winner', async () => {
    h.matches = [duel({ id: 'm-1', mode: 'music', matchType: 'SCORE_DUEL', player2Id: OTHER, player2Score: 1000 })];
    const res = await submitPOST(post({ matchId: 'm-1', score: 2000 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ settled: true, result: 'p1', iWon: true, winnerId: USER });
    expect(h.payouts).toEqual([expect.objectContaining({ winnerId: USER, feeLc: 50 })]);
    expect(h.matches[0].status).toBe('SETTLED');
  });

  it('a tied music duel stored under the old key refunds both entries', async () => {
    h.matches = [duel({ id: 'm-2', mode: 'musicAcademy', matchType: 'SCORE_DUEL', player2Id: OTHER, player2Score: 1500 })];
    const res = await submitPOST(post({ matchId: 'm-2', score: 1500 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ settled: true, result: 'tie' });
    expect(h.refunds.map((r) => r.userId).sort()).toEqual([OTHER, USER].sort());
    expect(h.matches[0].status).toBe('VOIDED');
  });

  it('the mode\'s ceiling still binds a paused mode\'s open duel: a score no set can reach is refused, nothing settles', async () => {
    h.matches = [duel()];
    const res = await submitPOST(post({ matchId: 'd-1', score: 10_000_000 }));
    expect(res.status).toBe(422);
    expect(h.events).toEqual([]);
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
    expect(body.pausedModes.map((p: Row) => p.key).sort()).toEqual(['dance', 'music']);
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
    expect(body.open.map((d: Row) => d.id)).toEqual(['open-3pt']);
    const mine = Object.fromEntries(body.mine.map((d: Row) => [d.id, d]));
    expect(mine['mine-dance']).toMatchObject({ mode: 'dance', href: '/play/dance', status: 'ACTIVE', stakingPaused: true });
    expect(mine['mine-waiting']).toMatchObject({ mode: 'music', href: '/play/music', status: 'WAITING', stakingPaused: true });
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
  it('create refuses music and dance before the eligibility lookup; a bounded unpaused mode gets past the gate', async () => {
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
