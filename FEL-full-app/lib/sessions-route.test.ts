// POST /api/sessions, DRIVEN (no database) — MUSIC-SUITE P2 (2026-09-25).
//
// The route paid XP = 1.5 × score and shards = score / 20 with no ceiling (a perfect 5-minute music free-play set ≈ 51M
// XP), won a music set on one tap (+15 LC, the wallet's won shards, +120 season XP), and trained dance and music only in
// 'mental' off a score that saturates at 100. This drives the real handler with the session, the database and the
// services mocked, so dropping the ceiling, the music win rule or the accuracy-scaled PRQ from the route fails here —
// the pure rules in lib/session-payout.ts and lib/prq.ts have their own tests.
//
// MUSIC-SUITE P3 (2026-09-25): a CREATION session (a Studio save / render: music, score 0, metadata.kind 'creation') was
// refused as idle (sessionHasPlay), so STUDIO time never reached the streak. The last two describes drive it: it counts
// for the streak once a streak day and pays nothing, and every other session keeps today's rules.
//
// ECONOMY-SESSIONS-HARDEN (2026-09-28): every play session now finishes a run the server started. post() below opens
// one (an open, eligible SessionRun whose startedAt is `duration` seconds ago — the server's clock is the only duration
// now) and sends its runId, and the mode's score rules are opened wide here (h.rules) so these payout rules are tested
// on their own; lib/sessions/modeScoreRules.test.ts holds the real rules. The last describes drive the run itself.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  profile: {} as Record<string, unknown>,
  updates: [] as Array<Record<string, unknown>>,
  sessions: [] as Array<Record<string, unknown>>,
  lc: [] as Array<Record<string, unknown>>,
  prqRows: [] as Array<Record<string, unknown>>,
  season: [] as Array<Record<string, unknown>>,
  mastery: [] as Array<Record<string, unknown>>,
  events: [] as Array<Record<string, unknown>>,
  /** MUSIC-SUITE P2 FIX PASS: the duels the route can find (competitionMatch.findUnique), by id. */
  matches: {} as Record<string, Record<string, unknown>>,
  /** MUSIC-SUITE P3: the creation branch's conditional streak writes (prisma.playerProfile.updateMany). */
  creationWrites: [] as Array<{ where: Record<string, unknown>; data: Record<string, unknown> }>,
  /** MUSIC-SUITE P3: when set, the profile a request reads (a stale read racing another request); h.profile is the row. */
  staleRead: null as Record<string, unknown> | null,
  /** MUSIC-SUITE P6 FIX PASS: the duels' MatchEvents (attempts, the pay-once claim) and the row locks the claim took. */
  matchEvents: [] as Array<{ matchId: string; userId: string | null; eventType: string; payload: string; seq: number; createdAt: Date }>,
  locks: [] as string[],
  /** MERGE (2026-09-28): runs when the paying transaction takes a duel's row lock — a rival session committing its claim
   *  between this post's early check and its own claim (the race the lock exists for). */
  onLock: null as ((matchId: string) => void) | null,
  /** ECONOMY-SESSIONS-HARDEN: the SessionRun rows, by id; the SessionGrant ledger (unique on user, run, grant); the wallet's
   *  session earns; every write in order (to prove the ledger is written before any balance). */
  runs: {} as Record<string, Record<string, unknown>>,
  grants: [] as Array<Record<string, unknown>>,
  wallet: [] as Array<Record<string, unknown>>,
  writes: [] as string[],
  /** The score rules the route checks against (null = open: any integer score, any length, every catalogue mode). */
  rules: null as Record<string, unknown> | null,
}));

vi.mock('next-auth', () => ({ getServerSession: async () => ({ user: { id: 'u1' } }) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => {
  const runUpdateMany = async ({ where, data }: { where: { id: string; status?: string }; data: Record<string, unknown> }) => {
    const r = h.runs[where.id];
    if (!r || (where.status !== undefined && r.status !== where.status)) return { count: 0 };
    Object.assign(r, data);
    h.writes.push(`run:${String(data.status)}`);
    return { count: 1 };
  };
  const tx = {
    sessionRun: {
      updateMany: runUpdateMany,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => { Object.assign(h.runs[where.id], data); h.writes.push('run:result'); return h.runs[where.id]; },
    },
    sessionGrant: {
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
        for (const row of data) {
          if (h.grants.some((g) => g.userId === row.userId && g.runId === row.runId && g.grantType === row.grantType)) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        h.grants.push(...data.map((d) => ({ ...d })));
        h.writes.push('grants');
        return { count: data.length };
      },
      update: async ({ where, data }: { where: { userId_runId_grantType: Record<string, string> }; data: Record<string, unknown> }) => {
        const k = where.userId_runId_grantType;
        const g = h.grants.find((x) => x.userId === k.userId && x.runId === k.runId && x.grantType === k.grantType);
        if (!g) throw new Error(`no grant row ${JSON.stringify(k)}`);
        Object.assign(g, data);
        return g;
      },
    },
    playerProfile: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        h.writes.push('profile');
        h.updates.push(data);
        // MUSIC-SUITE P3: the streak fields persist, so the next request reads what this one wrote
        for (const k of ['streakDays', 'lastStreakAt', 'lastActiveAt'] as const) if (data[k] !== undefined) h.profile[k] = data[k];
        const plain = Object.fromEntries(Object.entries(data).filter(([, v]) => typeof v === 'number'));
        return { ...h.profile, ...plain, labCredits: 100 };
      },
    },
    gameSession: { create: async ({ data }: { data: Record<string, unknown> }) => { h.writes.push('session'); h.sessions.push(data); return { id: 's1', ...data }; } },
    prqEntry: { findFirst: async () => null },
    // MUSIC-SUITE P6 FIX PASS: the pay-once claim (lib/arena-music.ts claimMusicSessionPay): the duel's row lock, then its events
    competitionMatch: {
      updateMany: async ({ where }: { where: { id: string } }) => {
        h.locks.push(where.id);
        h.writes.push('duel:lock');
        h.onLock?.(where.id);
        return { count: h.matches[where.id] ? 1 : 0 };
      },
    },
    matchEvent: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const rows = h.matchEvents.filter((e) => Object.entries(where).every(([k, v]) => (e as Record<string, unknown>)[k] === v));
        return rows.length ? { id: 'e', seq: Math.max(...rows.map((e) => e.seq)) } : null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => { h.writes.push(`event:${String(data.eventType)}`); h.matchEvents.push({ ...(data as never), createdAt: new Date() }); return data; },
    },
  };
  return {
    prisma: {
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
      sessionRun: {
        findUnique: async ({ where }: { where: { id: string } }) => (h.runs[where.id] ? { ...h.runs[where.id] } : null),
        updateMany: runUpdateMany,
      },
      competitionMatch: { findUnique: async ({ where }: { where: { id: string } }) => (h.matches[where.id] ? { id: where.id, ...h.matches[where.id] } : null) },
      // MUSIC-SUITE P6 FIX PASS: readMusicAttempt / the early pay-once check read the duel's events
      matchEvent: {
        findMany: async ({ where }: { where: { matchId: string; userId: string; eventType: { in: string[] } } }) => h.matchEvents
          .filter((e) => e.matchId === where.matchId && e.userId === where.userId && where.eventType.in.includes(e.eventType))
          .sort((a, b) => a.seq - b.seq),
        findFirst: async ({ where }: { where: Record<string, unknown> }) =>
          (h.matchEvents.some((e) => Object.entries(where).every(([k, v]) => (e as Record<string, unknown>)[k] === v)) ? { id: 'e' } : null),
      },
      // MUSIC-SUITE P3: matches only while the row still has the lastStreakAt the request read (Postgres equality on a Date)
      playerProfile: {
        updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          h.creationWrites.push({ where, data });
          const seen = where.lastStreakAt;
          if (seen !== undefined && new Date(seen as Date).getTime() !== new Date(h.profile.lastStreakAt as Date).getTime()) return { count: 0 };
          Object.assign(h.profile, data);
          return { count: 1 };
        },
      },
    },
  };
});
vi.mock('@/lib/wallet/wallet-service', () => ({
  applyLc: async (_tx: unknown, a: Record<string, unknown>) => { h.writes.push('lc'); h.lc.push(a); return { balanceAfter: 100 + Number(a.delta) }; },
  // the run's wallet earns: 40 coins completed, 2 shards won (the rules' floors), priced by the real caps in wallet tests
  sessionWalletGrant: async (_tx: unknown, a: Record<string, unknown>) => {
    h.writes.push(`wallet:${String(a.reasonCode)}`);
    h.wallet.push(a);
    const won = a.reasonCode === 'MODE_SESSION_WON';
    return { currency: won ? 'shards' : 'coins', granted: won ? 2 : 40, capped: false, entryId: `e${h.wallet.length}` };
  },
}));
vi.mock('@/lib/profile-service', () => ({ getOrCreateProfile: async () => ({ ...(h.staleRead ?? h.profile) }) }));
vi.mock('@/lib/prq-entries', () => ({ createPrqEntry: async (_tx: unknown, row: Record<string, unknown>) => { h.prqRows.push(row); } }));
vi.mock('@/lib/season/season-service', () => ({
  addSeasonXp: async (a: Record<string, unknown>, o: { db?: unknown; deferTierRewards?: boolean } = {}) => { h.writes.push(`season:${o.db ? 'tx' : 'nodb'}`); h.season.push(a); return null; },
  bookSeasonTierUps: async () => {},
}));
vi.mock('@/lib/mastery/mastery-service', () => ({
  recordMastery: async (_u: string, a: Record<string, unknown>, o: { db?: unknown; emit?: boolean } = {}) => { h.writes.push(`mastery:${o.db ? 'tx' : 'nodb'}`); h.mastery.push(a); return null; },
  emitMasteryUps: async () => {},
}));
// the score rules, opened wide unless a test sets h.rules (the real table has its own tests)
vi.mock('@/lib/sessions/modeScoreRules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/sessions/modeScoreRules')>();
  const { MODE_INFO } = await import('@/lib/game-data');
  const open = Object.fromEntries(Object.keys(MODE_INFO).map((k) => [k, {
    maxScore: Number.MAX_SAFE_INTEGER, maxScorePerSecond: Number.POSITIVE_INFINITY, minDurationMs: 0, maxDurationMs: 7 * 86_400_000, enabled: true,
    measured: { runs: 0, maxScore: 0, maxScorePerSecond: 0, minSec: 0, maxSec: 0, sources: [] },
  }]));
  return {
    ...actual,
    checkRunScore: (o: Parameters<typeof actual.checkRunScore>[0]) => actual.checkRunScore(o, (h.rules ?? open) as never),
  };
});
vi.mock('@/lib/analytics-server', () => ({ recordServerEvent: async (e: Record<string, unknown>) => { h.events.push(e); } }));
vi.mock('@/lib/move/formWrite', () => ({ writeFormPlan: async () => null }));

import { POST } from '@/app/api/sessions/route';
import { performSetMax } from '@/lib/babylon/music/performSet';
import { houseBeatFor, houseTap, judgeHouseSet, type HouseTap } from '@/lib/babylon/music/houseBeat';
import { MUSIC_ATTEMPT_START, MUSIC_ATTEMPT_FINISH, MUSIC_SESSION_PAID } from '@/lib/arena-music';
import { canonicalModeKey } from '@/lib/game-data';
import { MODE_SCORE_RULES, SCORE_COLUMN_MAX } from '@/lib/sessions/modeScoreRules';
import { ENDLESS_SESSION_CEILING, endlessCeilingFor } from '@/lib/session-payout';

let runSeq = 0;
/** ECONOMY-SESSIONS-HARDEN: an open run the server started `durationSec` ago, as POST /api/sessions/start leaves it. */
function openRun(mode: string, durationSec = 60, o: Record<string, unknown> = {}): string {
  const id = `run_test_${String(++runSeq).padStart(6, '0')}`;
  const now = Date.now();
  h.runs[id] = {
    id, userId: 'u1', mode: canonicalModeKey(mode), status: 'open', payoutEligible: true, ineligibleReason: null,
    startedAt: new Date(now - durationSec * 1000), expiresAt: new Date(now + 60 * 60 * 1000), result: null, ...o,
  };
  return id;
}

/** POST /api/sessions as the shell sends it: a run started `duration` seconds ago (unless the body names its own runId). */
async function post(body: Record<string, unknown>) {
  const b = 'runId' in body ? body : { ...body, runId: openRun(String(body.mode ?? ''), Number(body.duration ?? 60)) };
  const res = await POST({ json: async () => b } as never);
  return { status: res.status, body: await res.json(), runId: b.runId as string | null };
}

/** A music set's stats as the room sends them (the SHARED CONTRACT), perfect by default. */
function musicSet(o: Record<string, unknown> = {}) {
  const bars = Number(o.bars ?? 16), notes = Number(o.notes ?? bars * 16);
  const perfects = Number(o.perfects ?? notes), goods = Number(o.goods ?? 0);
  const accuracy = (perfects + 0.5 * goods) / notes;
  return { bars, notes, hits: perfects + goods, perfects, goods, misses: notes - perfects - goods, accuracy, grade: 'S', maxCombo: perfects + goods, arena: false, ...o };
}
/** What `notes` hit PERFECT in one combo score in PERFORM: 100 × (1 + floor(combo / 5)) each (performSet.ts:31-33). */
function perfectScore(notes: number): number {
  let s = 0;
  for (let i = 0; i < notes; i++) s += 100 * (1 + Math.floor(i / 5));
  return s;
}

beforeEach(() => {
  // streaked today already, so the only credits in play are the win's
  h.profile = { userId: 'u1', streakDays: 3, lastStreakAt: new Date(), labCredits: 100, strength: 50, speed: 50, endurance: 50, agility: 50, power: 50, flexibility: 50, recovery: 50, mental: 50 };
  for (const k of ['updates', 'sessions', 'lc', 'prqRows', 'season', 'mastery', 'events', 'creationWrites', 'grants', 'wallet', 'writes'] as const) h[k] = [];
  h.matches = {};
  h.staleRead = null;
  h.matchEvents = [];
  h.locks = [];
  h.onLock = null;
  h.runs = {};
  h.rules = null;
});

/**
 * MUSIC-SUITE P6 FIX PASS: u1's FINISHED attempt on duel `matchId` (music_attempt_start + music_attempt_finish, as the room
 * posts them) — every note of the duel's house beat dead on unless `taps` is given. Returns the server's rejudge of it.
 */
function finishedSet(matchId: string, taps?: HouseTap[]): number {
  const beat = houseBeatFor(matchId);
  const list = taps ?? beat.notes.map((n) => houseTap(n.lane, n.t));
  const seq = h.matchEvents.filter((e) => e.matchId === matchId).length;
  h.matchEvents.push(
    { matchId, userId: 'u1', eventType: MUSIC_ATTEMPT_START, payload: '{}', seq, createdAt: new Date() },
    { matchId, userId: 'u1', eventType: MUSIC_ATTEMPT_FINISH, payload: JSON.stringify({ taps: list }), seq: seq + 1, createdAt: new Date() },
  );
  return judgeHouseSet(beat, list).score;
}

/** An open LC music duel between u1 and u2 (the Arena's CompetitionMatch row). */
function musicDuel(o: Record<string, unknown> = {}) {
  return { mode: 'music', status: 'ACTIVE', currency: 'LC', player1Id: 'u1', player2Id: 'u2', ...o };
}

describe('the endless ceiling (owner decision #14)', () => {
  it('a perfect five-minute free-play set pays a flawless training win, not ~51M XP', async () => {
    const score = perfectScore(1840);          // 92 BPM × 5 min ≈ 115 bars × 16 notes
    expect(score).toBe(33_948_000);
    const r = await post({ mode: 'music', score, won: true, duration: 300, stats: musicSet({ bars: 115, notes: 1840 }) });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, won: true, capped: true, xp: 14_150, shards: 473, credits: 15 });
    expect(h.sessions[0]).toMatchObject({ mode: 'music', score, won: true, xp: 14_150, shards: 473, credits: 15 });
    expect(h.updates[0]).toMatchObject({ xp: { increment: 14_150 }, shards: { increment: 473 } });
  });

  it('a set with no stats is free play: capped — and, now the shell forwards them, a claimed win with no counts is none', async () => {
    // MUSIC-SUITE P2 FIX PASS: while the shell sent no stats this door kept the room's own win (it had refused every
    // honest one). 2026-09-26: GameShell sends `stats` (ROOM_STATS_FORWARDED), so a set without its counts is not a
    // client from before the contract any more — it is a claim with nothing behind it, and wins nothing
    const r = await post({ mode: 'music', score: 5_000_000, won: true, duration: 240 });
    expect(r.body).toMatchObject({ won: false, capped: true, xp: 14_150, shards: 473, credits: 0 });
    expect(h.lc).toHaveLength(0);
    // the same set WITH its counts, as the shell posts it now, keeps its win
    const withStats = await post({ mode: 'music', score: 9000, won: true, duration: 30, stats: musicSet({ bars: 8 }) });
    expect(withStats.body).toMatchObject({ won: true, credits: 15 });
  });

  // MUSIC-SUITE P6 (2026-09-26): an Arena set is played on the duel's house beat — 192 charted notes in its 32 bars
  // (lib/babylon/music/houseBeat.ts HOUSE_SET_NOTES), a perfect one 378,300 = the Arena's music ceiling. (It was 512 notes,
  // every step of the player's own grid: 2,647,100, paid 3,970,700 XP.)
  it('a real Arena set — its match found — ends itself and is paid as before (a scored game with an end card)', async () => {
    const score = perfectScore(192);
    expect(score).toBe(378_300);
    h.matches.m1 = musicDuel();
    expect(finishedSet('m1')).toBe(score);   // MUSIC-SUITE P6 FIX PASS: the room posted the finish (it does, before onEnd)
    const r = await post({ mode: 'music', score, won: true, duration: 66, arenaMatchId: 'm1', stats: musicSet({ bars: 32, notes: 192, arena: true }) });
    expect(r.body).toMatchObject({ won: true, capped: false, xp: 567_500, shards: 18_918 });
    expect(h.matchEvents.filter((e) => e.eventType === MUSIC_SESSION_PAID)).toEqual([expect.objectContaining({ matchId: 'm1', userId: 'u1' })]);
    expect(h.locks).toEqual(['m1']);   // claimed under the duel's row lock
  });

  it('P2 fix pass: ?arena=<anything> is free play — no match, someone else\'s, a dance duel, a settled one: all capped', async () => {
    // review: sessionPayout paid 3,970,700 XP / 132,358 shards for a claimed Arena set while music staking is paused
    // MERGE REVIEW (2026-09-28): since P6 a duel with no FINISHED attempt is free play whatever its row says, so without a
    // finish on file every case below was refused by the missing attempt, not by the gate it names (removing the mode,
    // currency, open-status or participant check passed). Each duel now has u1's finished, perfect house set on file and
    // the post is that house set (at its rejudge, inside the Arena's run cap): only the named gate can say no.
    const score = perfectScore(192);
    h.matches = {
      theirs: musicDuel({ player1Id: 'u7', player2Id: 'u8' }), dance: musicDuel({ mode: 'dance' }),
      done: musicDuel({ status: 'SETTLED' }), cash: musicDuel({ currency: 'USD_CENTS' }), scored: musicDuel({ player1Score: 5000 }),
    };
    for (const id of Object.keys(h.matches)) expect(finishedSet(id), id).toBe(score);
    const body = (arenaMatchId: unknown) => ({ mode: 'music', score, won: true, duration: 66, arenaMatchId, stats: musicSet({ bars: 32, notes: 192, arena: true }) });
    for (const arenaMatchId of [undefined, 'nope', 'theirs', 'dance', 'done', 'cash', 'scored', 42]) {
      const r = await post(body(arenaMatchId));
      expect(r.body, String(arenaMatchId)).toMatchObject({ paid: true, capped: true, xp: 14_150, shards: 473 });
    }
    expect(h.locks).toEqual([]);
    expect(h.matchEvents.filter((e) => e.eventType === MUSIC_SESSION_PAID)).toEqual([]);
    // the control: the same finished set on u1's own open LC music duel IS the Arena set — so the refusals above are the gates'
    h.matches.mine = musicDuel();
    finishedSet('mine');
    expect((await post(body('mine'))).body).toMatchObject({ paid: true, capped: false, xp: 567_500, shards: 18_918 });
    expect(h.locks).toEqual(['mine']);
  });

  it('a WAITING duel with no opponent is free play: the Arena will not record its score, so it can never stop uncapping', async () => {
    // review (2026-09-26): the shell now sends arenaMatchId. A music duel posted before the staking pause and never joined
    // sits WAITING (player2Id null) — submit-score 409s it (WAITING_OPPONENT) before any write, so player1Score stays null
    // for good, and every set played against it was paid 615,010 XP / 20,500 shards, even a loss, REPLAY after REPLAY
    const score = perfectScore(512);
    h.matches.lonely = musicDuel({ status: 'WAITING', player2Id: null, player1Score: null });
    for (let set = 0; set < 3; set++) {
      const r = await post({ mode: 'music', score, won: true, duration: 84, arenaMatchId: 'lonely', stats: musicSet({ bars: 32, arena: true }) });
      expect(r.body, `set ${set + 1}`).toMatchObject({ capped: true, xp: 14_150, shards: 473 });
    }
    // once someone joins it, the Arena records the set: the duel is real, and the set is an Arena set
    h.matches.joined = musicDuel({ status: 'WAITING', player2Id: 'u2', player1Score: null });
    // (MERGE with ECONOMY-SESSIONS-HARDEN, 2026-09-28: the set as the room plays it since P6 — the house beat's 192 notes,
    // posted at the rejudge. The old grid's 2,647,100 is above the Arena's music ceiling, 378,300, and a score above the
    // run's cap is SCORE_INVALID now, where P6 clamped it and paid.)
    const house = finishedSet('joined');
    const r = await post({ mode: 'music', score: house, won: true, duration: 66, arenaMatchId: 'joined', stats: musicSet({ bars: 32, notes: 192, arena: true }) });
    expect(r.body).toMatchObject({ paid: true, capped: false });
  });

  it('MUSIC-SUITE P6: a duel past its expiresAt is free play — the Arena takes no score for it, so it would uncap forever', async () => {
    // owner decision #30: submit-score 409s an expired duel (EXPIRED) before any write and the reclaim sweep settles it
    // (lib/arena-reclaim.ts) — so, like the WAITING duel above, its score slot never fills, and verifiedMusicDuel must say no
    const score = perfectScore(192);
    h.matches.lapsed = musicDuel({ expiresAt: new Date(Date.now() - 1_000) });
    h.matches.lapsedIso = musicDuel({ expiresAt: new Date(Date.now() - 60_000).toISOString() });
    for (const arenaMatchId of ['lapsed', 'lapsedIso']) {
      const r = await post({ mode: 'music', score, won: true, duration: 66, arenaMatchId, stats: musicSet({ bars: 32, notes: 192, arena: true }) });
      expect(r.body, arenaMatchId).toMatchObject({ capped: true, xp: 14_150, shards: 473 });
    }
    // the same duel with time left is an Arena set, as before (a row with no expiresAt — every test above — keeps its answer)
    h.matches.live = musicDuel({ expiresAt: new Date(Date.now() + 3_600_000) });
    finishedSet('live');
    const live = await post({ mode: 'music', score, won: true, duration: 66, arenaMatchId: 'live', stats: musicSet({ bars: 32, notes: 192, arena: true }) });
    expect(live.body).toMatchObject({ capped: false, xp: 567_500 });
  });

  it('P2 fix pass: an Arena set\'s score above what its counts allow is REJECTED now (review: 1e9 on 16 hits paid 1,500,000,050 XP)', async () => {
    // ECONOMY-SESSIONS-HARDEN: this was clamped to performSetMax(16) and paid; a score no honest run can reach is SCORE_INVALID
    h.matches.m1 = musicDuel();
    finishedSet('m1');
    const r = await post({ mode: 'music', score: 1_000_000_000, won: true, duration: 30, arenaMatchId: 'm1', stats: musicSet({ bars: 8, notes: 16, perfects: 16, arena: true }) });
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ ok: false, paid: false, reason: 'SCORE_INVALID', detail: 'above_run_cap', limit: performSetMax(16) });
    expect(h.sessions).toEqual([]);
    expect(h.updates).toEqual([]);
    // the honest set with the same counts is paid as before
    const honest = await post({ mode: 'music', score: performSetMax(16), won: true, duration: 30, arenaMatchId: 'm1', stats: musicSet({ bars: 8, notes: 16, perfects: 16, arena: true }) });
    expect(honest.body).toMatchObject({ capped: false, xp: Math.round(performSetMax(16) * 1.5) + 50 });
  });

  // ══ MUSIC-SUITE P6 FIX PASS (2026-09-26): THE FARM (the review's blocker) ══════════════════════════════════════════════
  // With music stakeable again, a 25 LC Quick Match is ACTIVE with the house seated from birth, and verifiedMusicDuel asked
  // nothing of the set: POST /api/sessions {score 378,300, stats {bars 32, notes 512, perfects 512, arena}} paid 567,500 XP
  // and 18,918 shards per call, in a loop, for 48 h — and the sweep refunded the 25 LC at expiry.
  it('P6 fix pass: the review\'s farm — no finished attempt is free play, and a second post for the same duel is free play', async () => {
    h.matches.qm = musicDuel({ player2Id: 'house' });
    const farm = { mode: 'music', score: 378_300, won: true, duration: 32, arenaMatchId: 'qm', stats: musicSet({ bars: 32, notes: 512, perfects: 512, arena: true }) };
    const unplayed = await post(farm);
    expect(unplayed.body).toMatchObject({ capped: true });                           // no attempt on file: free play
    expect(unplayed.body.xp).toBeLessThan(10_000);
    finishedSet('qm');                                                                // the one honest set
    const first = await post(farm);
    expect(first.body).toMatchObject({ capped: false, xp: 567_500 });
    for (let i = 0; i < 3; i++) {
      const again = await post(farm);
      expect(again.body, `post ${i + 2}`).toMatchObject({ capped: true });            // once per duel
      expect(again.body.xp).toBeLessThan(10_000);
    }
    expect(h.matchEvents.filter((e) => e.eventType === MUSIC_SESSION_PAID)).toHaveLength(1);
  });

  it('P6 fix pass: the paid score is capped at the server\'s REJUDGE of the recorded taps, never the posted number', async () => {
    // MERGE with ECONOMY-SESSIONS-HARDEN (2026-09-28): P6 clamped the posted 378,300 to the rejudge and paid that; the
    // hardening clamps nothing, so a posted number above the rejudge is SCORE_INVALID above_rejudge (the room posts exactly
    // the rejudge). Refused before any write, it spends neither a ledger row nor the duel's one Arena pay.
    h.matches.m2 = musicDuel();
    const beat = houseBeatFor('m2');
    const rejudged = finishedSet('m2', beat.notes.filter((_, i) => i % 3 === 0).map((n) => houseTap(n.lane, n.t)));
    expect(rejudged).toBeLessThan(100_000);
    const set = { mode: 'music', won: true, duration: 66, arenaMatchId: 'm2', stats: musicSet({ bars: 32, notes: 192, arena: true }) };
    const r = await post({ ...set, score: 378_300 });
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ ok: false, paid: false, reason: 'SCORE_INVALID', detail: 'above_rejudge', limit: rejudged });
    expect(h.runs[r.runId!]).toMatchObject({ status: 'rejected', rejectReason: 'SCORE_INVALID:above_rejudge', score: 378_300 });
    expectNothingPaid();
    expect(h.locks).toEqual([]);
    expect(h.matchEvents.filter((e) => e.eventType === MUSIC_SESSION_PAID)).toEqual([]);
    // one point over is the same refusal
    expect((await post({ ...set, score: rejudged + 1 })).body).toMatchObject({ reason: 'SCORE_INVALID', detail: 'above_rejudge', limit: rejudged });
    // the rejudge itself is paid, as the Arena set it is — the posted number was never what paid
    const honest = await post({ ...set, score: rejudged });
    expect(honest.body).toMatchObject({ paid: true, capped: false });
    expect(h.sessions).toHaveLength(1);
    expect(h.sessions[0]).toMatchObject({ score: rejudged });
    expect(honest.body.xp).toBe(Math.round(rejudged * 1.5) + 50);
    expect(h.matchEvents.filter((e) => e.eventType === MUSIC_SESSION_PAID)).toHaveLength(1);
  });

  it('P6 fix pass: a claim already on file (a session that won the race) makes this post free play', async () => {
    const set = (arenaMatchId: string) => ({ mode: 'music', score: 378_300, won: true, duration: 66, arenaMatchId, stats: musicSet({ bars: 32, notes: 192, arena: true }) });
    // on file before the post: the early check says no, and no lock is taken
    h.matches.m3 = musicDuel();
    finishedSet('m3');
    h.matchEvents.push({ matchId: 'm3', userId: 'u1', eventType: MUSIC_SESSION_PAID, payload: '{}', seq: h.matchEvents.length, createdAt: new Date() });
    const r = await post(set('m3'));
    expect(r.body).toMatchObject({ paid: true, capped: true });
    expect(h.locks).toEqual([]);
    expect(h.matchEvents.filter((e) => e.eventType === MUSIC_SESSION_PAID)).toHaveLength(1);
    // another session for the same duel claimed the pay between this post's early check and its transaction: it commits
    // while this one waits on the duel's row lock (MERGE 2026-09-28: h.onLock puts the rival exactly there — pushing it
    // after post() began landed before the early check, so only the early no was exercised)
    h.matches.m4 = musicDuel();
    finishedSet('m4');
    h.onLock = (matchId) => {
      h.onLock = null;
      h.matchEvents.push({ matchId, userId: 'u1', eventType: MUSIC_SESSION_PAID, payload: '{}', seq: h.matchEvents.length, createdAt: new Date() });
    };
    const raced = await post(set('m4'));
    expect(h.locks).toEqual(['m4']);                                                  // the early check said yes
    expect(raced.body).toMatchObject({ paid: true, capped: true });                   // the claim said no: free play
    expect(h.matchEvents.filter((e) => e.eventType === MUSIC_SESSION_PAID && e.matchId === 'm4')).toHaveLength(1);
    // and the ledger files what the run was paid: free play, no Arena note on its xp row
    const xpRow = h.grants.find((g) => g.runId === raced.runId && g.grantType === 'xp');
    expect(xpRow).toMatchObject({ amount: raced.body.xp });
    expect(xpRow?.metadata).toBeUndefined();
  });

  it('an "Arena set" longer than an Arena set is free play', async () => {
    const r = await post({ mode: 'music', score: 5_000_000, won: true, duration: 300, stats: musicSet({ bars: 64, arena: true }) });
    expect(r.body).toMatchObject({ capped: true, xp: 14_150 });
  });

  it('The Hundred is capped too; a strong real run is under the ceiling and untouched', async () => {
    const huge = await post({ mode: 'karateEndless', score: 1_000_000, won: false, duration: 1800 });
    expect(huge.body).toMatchObject({ capped: true, xp: 14_150, shards: 473 });
    const strong = await post({ mode: 'karateEndless', score: 4000, won: false, duration: 300 });
    expect(strong.body).toMatchObject({ capped: false, xp: 6010, shards: 200 });
  });

  it('a finite game is never capped, and pays exactly what it did', async () => {
    const dunk = await post({ mode: 'dunkContest', score: 240, won: true, duration: 120 });
    expect(dunk.body).toMatchObject({ won: true, capped: false, xp: 410, shards: 15, credits: 15 });
    const training = await post({ mode: 'training', score: 9400, won: true, duration: 60 });   // a flawless Iron Paradise minute
    expect(training.body).toMatchObject({ capped: false, xp: 14_150, shards: 473 });
  });

  it('a finite score above its own rules maximum is REJECTED (was paid as that maximum; before that, training 1,000,000 → 1.5M XP)', async () => {
    // ECONOMY-SESSIONS-HARDEN: "do not quietly clamp the score and still pay"
    const training = await post({ mode: 'training', score: 1_000_000, won: true, duration: 60 });
    expect(training.status).toBe(422);
    expect(training.body).toMatchObject({ paid: false, reason: 'SCORE_INVALID', detail: 'above_run_cap', limit: 9400 });
    expect(h.sessions).toEqual([]);
    expect(h.grants).toEqual([]);
  });

  it('a mode string the catalogue does not know pays nothing at all now (review: \'Music\' 34M → 51M XP + a win; then capped)', async () => {
    // ECONOMY-SESSIONS-HARDEN: no rules row = SCORE_INVALID unknown_mode (fail closed); /api/sessions/start refuses it too
    for (const mode of ['Music', 'music ', 'notAMode']) {
      h.lc = [];
      const r = await post({ mode, score: 34_000_000, won: true, duration: 300 });
      expect(r.status, mode).toBe(422);
      expect(r.body, mode).toMatchObject({ paid: false, reason: 'SCORE_INVALID', detail: 'unknown_mode' });
      expect(h.lc, mode).toEqual([]);
    }
    expect(h.sessions).toEqual([]);
  });

  it('P2 fix pass: twelve 5 s free-play sets in a minute pay no more than one flawless minute (review: ~12×)', async () => {
    const score = perfectScore(30);
    for (let i = 0; i < 12; i++) await post({ mode: 'music', score, won: false, duration: 5, stats: musicSet({ bars: 1, notes: 30, perfects: 30 }) });
    const xp = h.sessions.reduce((a, r) => a + Number(r.xp), 0), shards = h.sessions.reduce((a, r) => a + Number(r.shards), 0);
    expect(h.sessions).toHaveLength(12);
    expect(xp).toBeLessThanOrEqual(14_150);
    expect(shards).toBeLessThanOrEqual(473);
  });
});

describe('the music win (owner decision #13: grade C over at least 8 bars)', () => {
  it('one tap is not a win: no Lab Credits, no win XP, and the row every other reader trusts says so', async () => {
    const r = await post({ mode: 'music', score: 100, won: true, duration: 10, stats: musicSet({ bars: 1, notes: 16, perfects: 1 }) });
    expect(r.body).toMatchObject({ ok: true, won: false, credits: 0, xp: 160, shards: 5 });
    expect(h.lc).toEqual([]);
    expect(h.sessions[0].won).toBe(false);                 // the wallet's won earn reads this row (wallet-service.ts:251)
    expect(h.season[0]).toMatchObject({ won: false });
    expect(h.mastery[0]).toMatchObject({ won: false });
  });

  it('50 % over 8 bars wins and pays the +15 LC through the wallet', async () => {
    const r = await post({ mode: 'music', score: 9000, won: true, duration: 30, stats: musicSet({ bars: 8, notes: 128, perfects: 32, goods: 64 }) });
    expect(r.body).toMatchObject({ won: true, credits: 15 });
    expect(h.lc).toHaveLength(1);
    expect(h.lc[0]).toMatchObject({ delta: 15, reasonCode: 'SESSION_CREDITS', metadata: { mode: 'music', won: true } });
  });

  it('just under 50 %, one bar short, or too fast to be true: not a win', async () => {
    for (const [stats, duration] of [
      [musicSet({ bars: 8, notes: 128, perfects: 62, goods: 1 }), 30],   // 48.8 %
      [musicSet({ bars: 7 }), 30],                                       // flawless, 7 bars
      [musicSet({ bars: 8 }), 4],                                        // 8 bars in 4 s
    ] as const) {
      h.lc = [];
      // ECONOMY-SESSIONS-HARDEN: a score inside what the counts allow (50,000 on 63 hits was clamped; it is rejected now)
      const r = await post({ mode: 'music', score: 9_000, won: true, duration, stats });
      expect(r.body.won, JSON.stringify(stats)).toBe(false);
      expect(h.lc).toEqual([]);
    }
  });

  it('the old catalogue key follows the same rules', async () => {
    const r = await post({ mode: 'musicAcademy', score: 100, won: true, duration: 10, stats: musicSet({ bars: 1, notes: 16, perfects: 1 }) });
    expect(r.body).toMatchObject({ won: false, credits: 0 });
  });

  it('stats sent as `metadata` are read the same way', async () => {
    const r = await post({ mode: 'music', score: 9000, won: true, duration: 30, metadata: musicSet({ bars: 8 }) });
    expect(r.body).toMatchObject({ won: true, credits: 15 });
  });

  it('every other mode keeps its own win', async () => {
    const r = await post({ mode: 'dance', score: 4000, won: true, duration: 40, stats: { perfect: 10, great: 0, good: 0, miss: 0 } });
    expect(r.body).toMatchObject({ won: true, credits: 15 });
  });
});

describe('PRQ: dance trains agility + mental, music mental, both by accuracy', () => {
  it('a flawless 2-minute dance won: agility and mental +0.96, one drillResult row each', async () => {
    await post({ mode: 'dance', score: 4000, won: true, duration: 120, stats: { perfect: 16, great: 0, good: 0, miss: 0, accuracy: 100 } });
    expect(h.updates[0]).toMatchObject({ agility: 50.96, mental: 50.96 });
    expect(h.updates[0]).not.toHaveProperty('power');
    expect(h.prqRows.map((r) => r.attribute).sort()).toEqual(['agility', 'mental']);
    expect(h.prqRows.every((r) => r.source === 'drillResult' && r.sessionId === 's1')).toBe(true);
  });

  it('half the accuracy is half the gain, whatever the score', async () => {
    // (a score inside the dance maximum: 99,999 was clamped to it and is rejected now — ECONOMY-SESSIONS-HARDEN)
    await post({ mode: 'dance', score: 50_000, won: true, duration: 120, stats: { perfect: 8, great: 0, good: 0, miss: 8 } });
    expect(h.updates[0]).toMatchObject({ agility: 50.48, mental: 50.48 });
  });

  it('a music set trains mental only, by its accuracy', async () => {
    await post({ mode: 'music', score: 50_000, won: true, duration: 120, stats: musicSet({ bars: 40, notes: 640, perfects: 320, goods: 0 }) });
    expect(h.updates[0]).toMatchObject({ mental: 50.48 });       // 0.5 × 10 × 0.1 × 0.8 × 1.2
    expect(h.updates[0]).not.toHaveProperty('agility');
    expect(h.prqRows.map((r) => r.attribute)).toEqual(['mental']);
  });

  it('a session with no stats trains nothing now the shell forwards them (the old score path was the legacy door)', async () => {
    // P2 fix pass: while the shell sent none, a dance session trained by its saturating score (agility / mental +0.96);
    // 2026-09-26: GameShell sends `stats` (ROOM_STATS_FORWARDED), so no counts is no accuracy, and no accuracy trains nothing
    const r = await post({ mode: 'dance', score: 4000, won: true, duration: 120 });
    expect(r.body.ok).toBe(true);
    expect(h.updates[0]).toMatchObject({ agility: 50, mental: 50 });
    expect(h.prqRows).toEqual([]);
  });

  it('stats without counts train nothing (never the saturating score)', async () => {
    const r = await post({ mode: 'dance', score: 4000, won: true, duration: 120, stats: { bpm: 98 } });
    expect(r.body.ok).toBe(true);
    expect(h.updates[0]).toMatchObject({ agility: 50, mental: 50 });
    expect(h.prqRows).toEqual([]);
  });

  it('another mode is unchanged: the dunk contest still trains power / speed / flexibility off its score', async () => {
    await post({ mode: 'dunkContest', score: 240, won: true, duration: 120 });
    expect(h.updates[0]).toMatchObject({ power: 51.2, speed: 51.2, flexibility: 51.2 });
  });
});

describe('what did not change', () => {
  it('an idle run still records nothing', async () => {
    const r = await post({ mode: 'music', score: 0, won: false, duration: 60 });
    expect(r.body).toMatchObject({ noPlay: true, xp: 0, shards: 0, credits: 0 });
    expect(h.sessions).toEqual([]);
  });

  it('a claimed win with nothing behind it is not play in the music room', async () => {
    const r = await post({ mode: 'music', score: 0, won: true, duration: 60 });
    expect(r.body).toMatchObject({ noPlay: true });
  });
});

// ---------------------------------------------------------------------------
// MUSIC-SUITE P3 (2026-09-25): the creation session
// ---------------------------------------------------------------------------

const HOUR = 60 * 60 * 1000;
/** The player last streaked `hours` ago and has not been active since. */
function streakedAgo(hours: number, streakDays = 3) {
  const at = new Date(Date.now() - hours * HOUR);
  Object.assign(h.profile, { streakDays, lastStreakAt: at, lastActiveAt: at });
}
/** A Studio save / render as the P3 client posts it. */
function creation(o: Record<string, unknown> = {}) {
  return { mode: 'music', score: 0, duration: 420, metadata: { kind: 'creation', projectId: 'p1', reason: 'save' }, ...o };
}

describe('MUSIC-SUITE P3: a creation session (a Studio save or render)', () => {
  it('counts toward the daily streak and pays nothing: no XP, shards, LC, win, PRQ, season XP, mastery or session row', async () => {
    streakedAgo(25);
    const r = await post(creation({ won: true }));                  // a claimed win is not a win
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      ok: true, creation: true, counted: true, noOp: false, nextDueAt: null, sessionId: null,
      won: false, capped: false, xp: 0, shards: 0, credits: 0, streakDays: 4, streakBonus: 0, prqDelta: 0,
      season: null, mastery: null,
    });
    expect(r.body.prqAfter).toBe(r.body.prqBefore);
    // exactly the two streak fields, conditional on the lastStreakAt the request read; lastActiveAt left alone
    expect(h.creationWrites).toHaveLength(1);
    expect(Object.keys(h.creationWrites[0].data).sort()).toEqual(['lastStreakAt', 'streakDays']);
    expect(h.creationWrites[0].data.streakDays).toBe(4);
    expect(h.creationWrites[0].where).toMatchObject({ userId: 'u1' });
    expect(h.creationWrites[0].where.lastStreakAt).toBeInstanceOf(Date);
    expect(h.updates).toEqual([]);                                  // no XP / shards / attribute write
    expect(h.sessions).toEqual([]);                                 // no GameSession row for a score reader to misread
    expect(h.lc).toEqual([]);
    expect(h.prqRows).toEqual([]);
    expect(h.season).toEqual([]);
    expect(h.mastery).toEqual([]);
    expect(h.events.map((e) => e.name)).toEqual(['session_creation']);
    expect(h.profile.streakDays).toBe(4);
  });

  it('a second creation the same streak day is a 200 no-op — nothing written, nothing logged', async () => {
    streakedAgo(25);
    await post(creation());
    for (const reason of ['save', 'render', 'save']) {
      const again = await post(creation({ metadata: { kind: 'creation', reason } }));
      expect(again.status).toBe(200);
      expect(again.body).toMatchObject({ ok: true, creation: true, counted: false, noOp: true, xp: 0, shards: 0, credits: 0, streakDays: 4, sessionId: null });
      // MUSIC-SUITE P3 FIX PASS: a no-op says when the streak day opens (the Academy asks again then, not tomorrow)
      expect(Date.parse(again.body.nextDueAt)).toBe((h.profile.lastStreakAt as Date).getTime() + 24 * HOUR);
    }
    expect(h.creationWrites).toHaveLength(1);
    expect(h.events).toHaveLength(1);
    expect(h.profile.streakDays).toBe(4);
  });

  it('a creation on a day a set already counted is a no-op too (the day is already in the streak)', async () => {
    // beforeEach: streaked today by play
    const r = await post(creation());
    expect(r.body).toMatchObject({ counted: false, noOp: true, streakDays: 3 });
    expect(h.creationWrites).toEqual([]);
    expect(h.events).toEqual([]);
  });

  it('a gap restarts the streak at day 1, exactly as a set would', async () => {
    streakedAgo(24 * 3, 6);
    const r = await post(creation());
    expect(r.body).toMatchObject({ counted: true, streakDays: 1, credits: 0 });
  });

  it('a save and a render posted together count one streak day (the loser\'s conditional write matches nothing)', async () => {
    streakedAgo(25);
    h.staleRead = { ...h.profile };                                  // both requests read the row before either wrote
    const [a, b] = await Promise.all([post(creation()), post(creation({ metadata: { kind: 'creation', reason: 'render' } }))]);
    expect([a.body.counted, b.body.counted].sort()).toEqual([false, true]);
    expect(h.events).toHaveLength(1);
    expect(h.profile.streakDays).toBe(4);
  });

  it('the old catalogue key is the same room', async () => {
    streakedAgo(25);
    const r = await post(creation({ mode: 'musicAcademy' }));
    expect(r.body).toMatchObject({ creation: true, counted: true, xp: 0 });
  });

  it('a creation-only day keeps the streak growing: the next day\'s set continues it', async () => {
    streakedAgo(25);
    await post(creation());                                          // day 4, by making music
    const madeAt = h.profile.lastStreakAt as Date;
    Object.assign(h.profile, { lastStreakAt: new Date(madeAt.getTime() - 25 * HOUR) });   // … and that was yesterday
    const r = await post({ mode: 'dunkContest', score: 240, won: true, duration: 120 });
    expect(r.body).toMatchObject({ streakDays: 5, streakBonus: 25, credits: 15 + 25 });
  });
});

describe('MUSIC-SUITE P3: making music first never changes what a set pays', () => {
  it('the first set after a creation-opened day pays that day\'s streak LC (the creation paid none); the next set does not', async () => {
    // what the set pays with no creation first (today's rules): day 4 opened by the set itself
    streakedAgo(25);
    const plain = await post({ mode: 'music', score: 9000, won: true, duration: 30, stats: musicSet({ bars: 8 }) });
    expect(plain.body).toMatchObject({ won: true, streakDays: 4, streakBonus: 20, credits: 35 });

    // the same set after a Studio save opened the day
    for (const k of ['updates', 'sessions', 'lc', 'events'] as const) h[k] = [];
    streakedAgo(25);
    await post(creation());
    const first = await post({ mode: 'music', score: 9000, won: true, duration: 30, stats: musicSet({ bars: 8 }) });
    expect(first.body).toMatchObject({ won: true, streakDays: 4, streakBonus: 20, credits: 35 });
    expect(h.sessions[0]).toMatchObject({ credits: 35 });
    expect(h.lc[0]).toMatchObject({ delta: 35, metadata: { streakDays: 4, streakBonus: true, streakOwed: true } });
    const second = await post({ mode: 'music', score: 9000, won: true, duration: 30, stats: musicSet({ bars: 8 }) });
    expect(second.body).toMatchObject({ streakDays: 4, streakBonus: 0, credits: 15 });
  });

  it('a set on a day a set opened (no creation) pays no second streak bonus — today\'s rule', async () => {
    streakedAgo(25);
    await post({ mode: 'dunkContest', score: 240, won: true, duration: 120 });
    const again = await post({ mode: 'dunkContest', score: 240, won: true, duration: 120 });
    expect(again.body).toMatchObject({ streakBonus: 0, credits: 15 });
    expect(h.lc[1].metadata).not.toHaveProperty('streakOwed');
  });
});

describe('MUSIC-SUITE P3: anything that is not a creation session keeps today\'s rules', () => {
  it('a music set with a score is a PERFORM set whatever its kind says: paid, won and recorded as before', async () => {
    const r = await post({ mode: 'music', score: 9000, won: true, duration: 30, metadata: { ...musicSet({ bars: 8 }), kind: 'creation' } });
    expect(r.body).not.toHaveProperty('creation');
    expect(r.body).toMatchObject({ won: true, credits: 15, xp: Math.min(Math.round(9000 * 1.5) + 50, 14_150 * 30 / 60) });
    expect(h.sessions).toHaveLength(1);
    expect(h.creationWrites).toEqual([]);
  });

  it('a score-0 music post of another kind is what it was: idle records nothing, a played miss-only set pays the floor', async () => {
    const idle = await post({ mode: 'music', score: 0, duration: 60, metadata: { kind: 'perform' } });
    expect(idle.body).toMatchObject({ noPlay: true, xp: 0 });
    expect(idle.body).not.toHaveProperty('creation');
    const missed = await post({ mode: 'music', score: 0, duration: 60, played: true, metadata: { kind: 'perform' } });
    expect(missed.body).toMatchObject({ won: false, xp: 10, shards: 1, credits: 0 });
    expect(h.sessions).toHaveLength(1);
    expect(h.creationWrites).toEqual([]);
  });

  it('another mode labelled a creation is that mode: idle at 0, paid as before with a score', async () => {
    streakedAgo(25);
    const idle = await post({ mode: 'dunkContest', score: 0, duration: 60, metadata: { kind: 'creation' } });
    expect(idle.body).toMatchObject({ noPlay: true, streakDays: 3 });
    const dunk = await post({ mode: 'dunkContest', score: 240, won: true, duration: 120, metadata: { kind: 'creation' } });
    expect(dunk.body).toMatchObject({ won: true, capped: false, xp: 410, shards: 15, streakDays: 4, streakBonus: 20, credits: 35 });
    expect(h.creationWrites).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ECONOMY-SESSIONS-HARDEN (2026-09-28): the run the server started
// ---------------------------------------------------------------------------

/** Nothing was paid or written by the play pipeline: no profile write, session row, LC, wallet earn, ledger row, season, mastery. */
function expectNothingPaid(label = '') {
  expect(h.updates, `${label} profile`).toEqual([]);
  expect(h.sessions, `${label} session row`).toEqual([]);
  expect(h.lc, `${label} lc`).toEqual([]);
  expect(h.wallet, `${label} wallet`).toEqual([]);
  expect(h.grants, `${label} ledger`).toEqual([]);
  expect(h.season, `${label} season`).toEqual([]);
  expect(h.mastery, `${label} mastery`).toEqual([]);
}

/** Real-shaped rules for one mode (the open table is used everywhere else in this file). */
function rules(mode: string, r: Record<string, number | boolean>) {
  h.rules = { [mode]: { maxScore: 1000, maxScorePerSecond: 50, minDurationMs: 5_000, maxDurationMs: 600_000, enabled: true, measured: { runs: 1, maxScore: 250, maxScorePerSecond: 5, minSec: 20, maxSec: 150, sources: ['test'] }, ...r } };
}

describe('ECONOMY-SESSIONS-HARDEN: a session must finish a run the server started', () => {
  it('no runId: RUN_MISSING, 400, nothing paid (the acceptance check "a missing key is rejected")', async () => {
    for (const runId of [null, undefined, '', 'short', 42, { id: 'x' }, 'x'.repeat(65)]) {
      const r = await post({ mode: 'dunkContest', score: 240, won: true, duration: 120, runId });
      expect(r.status, String(runId)).toBe(400);
      expect(r.body, String(runId)).toMatchObject({ ok: false, paid: false, reason: 'RUN_MISSING' });
    }
    expectNothingPaid();
    expect(h.events.every((e) => e.name === 'session_rejected')).toBe(true);
  });

  it('another player\'s run, or one that does not exist: RUN_UNKNOWN, 404 — and their run is left open', async () => {
    const theirs = openRun('dunkContest', 120, { userId: 'u2' });
    const r = await post({ mode: 'dunkContest', score: 240, won: true, duration: 120, runId: theirs });
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ reason: 'RUN_UNKNOWN' });
    expect(h.runs[theirs].status).toBe('open');
    const ghost = await post({ mode: 'dunkContest', score: 240, won: true, runId: 'run_does_not_exist' });
    expect(ghost.status).toBe(404);
    expectNothingPaid();
  });

  it('the same runId twice pays ONCE: the second answer is the first, word for word, with replayed: true', async () => {
    const first = await post({ mode: 'dunkContest', score: 240, won: true, duration: 120 });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ ok: true, paid: true, replayed: false, runId: first.runId, xp: 410, shards: 15, credits: 15, coins: 40, walletShards: 2 });
    const paidWrites = { updates: h.updates.length, sessions: h.sessions.length, lc: h.lc.length, wallet: h.wallet.length, grants: h.grants.length, season: h.season.length, mastery: h.mastery.length };
    const again = await post({ mode: 'dunkContest', score: 240, won: true, duration: 120, runId: first.runId });
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ ...first.body, replayed: true });
    // and a retry that changes its claim is still the first answer
    const greedy = await post({ mode: 'dunkContest', score: 999, won: true, duration: 120, runId: first.runId });
    expect(greedy.body).toEqual({ ...first.body, replayed: true });
    expect({ updates: h.updates.length, sessions: h.sessions.length, lc: h.lc.length, wallet: h.wallet.length, grants: h.grants.length, season: h.season.length, mastery: h.mastery.length }).toEqual(paidWrites);
  });

  it('two tabs finishing one run at once: one pays, the other gets its answer (the claim is conditional on status open)', async () => {
    const runId = openRun('dunkContest', 120);
    const [a, b] = await Promise.all([
      post({ mode: 'dunkContest', score: 240, won: true, duration: 120, runId }),
      post({ mode: 'dunkContest', score: 240, won: true, duration: 120, runId }),
    ]);
    expect([a.body.replayed, b.body.replayed].sort()).toEqual([false, true]);
    expect(h.sessions).toHaveLength(1);
    expect(h.updates).toHaveLength(1);
    expect(h.wallet.filter((w) => w.reasonCode === 'MODE_SESSION_COMPLETED')).toHaveLength(1);
  });

  it('a run of another mode: RUN_MODE_MISMATCH, and the run is closed (a corrected retry is refused the same way)', async () => {
    const runId = openRun('tennis', 60);
    const r = await post({ mode: 'dunkContest', score: 240, won: true, duration: 60, runId });
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ reason: 'RUN_MODE_MISMATCH', runMode: 'tennis' });
    expect(h.runs[runId].status).toBe('rejected');
    const retry = await post({ mode: 'tennis', score: 3, won: true, duration: 60, runId });
    expect(retry.body).toMatchObject({ reason: 'RUN_MODE_MISMATCH', replayed: true });
    expectNothingPaid();
  });

  it('an expired run: RUN_EXPIRED, closed as expired, never paid', async () => {
    const runId = openRun('dunkContest', 120, { expiresAt: new Date(Date.now() - 1000) });
    const r = await post({ mode: 'dunkContest', score: 240, won: true, runId });
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ reason: 'RUN_EXPIRED' });
    expect(h.runs[runId].status).toBe('expired');
    // swept to expired by a later start, with no stored answer: still RUN_EXPIRED
    const swept = openRun('dunkContest', 120, { status: 'expired' });
    expect((await post({ mode: 'dunkContest', score: 240, won: true, runId: swept })).body).toMatchObject({ reason: 'RUN_EXPIRED' });
    expectNothingPaid();
  });

  it('the duration is the SERVER\'s: a client that says 10 minutes on a run started 2 s ago is too short', async () => {
    rules('dunkContest', {});
    const r = await post({ mode: 'dunkContest', score: 240, won: true, duration: 600, runId: openRun('dunkContest', 2) });
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ reason: 'SCORE_INVALID', detail: 'too_short', limit: 5_000 });
    expectNothingPaid();
  });
});

describe('ECONOMY-SESSIONS-HARDEN FIX 1: a result outside the mode\'s rules is SCORE_INVALID — rejected, logged, never clamped', () => {
  it('above maxScore (the acceptance check "an impossible score is rejected")', async () => {
    rules('volleyball', {});                       // a mode with no derived maximum of its own, so maxScore is the only bound
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await post({ mode: 'volleyball', score: 1001, won: true, duration: 120 });
    const logged = warn.mock.calls.map((c) => c.join(' '));
    warn.mockRestore();
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ ok: false, paid: false, reason: 'SCORE_INVALID', detail: 'above_max_score', limit: 1000 });
    expect(logged.some((l) => l.includes('SCORE_INVALID above_max_score'))).toBe(true);
    expect(h.events).toContainEqual(expect.objectContaining({ name: 'session_rejected', props: expect.objectContaining({ reason: 'SCORE_INVALID', detail: 'above_max_score' }) }));
    expect(h.runs[r.runId!]).toMatchObject({ status: 'rejected', rejectReason: 'SCORE_INVALID:above_max_score', score: 1001 });
    expectNothingPaid();
    // the ceiling itself is fine
    expect((await post({ mode: 'volleyball', score: 1000, won: true, duration: 120 })).body).toMatchObject({ paid: true });
  });

  it('not a whole number, negative, not a number, or above the rate: each named, none paid', async () => {
    rules('dunkContest', {});
    const cases: Array<[unknown, number, string]> = [
      [12.5, 120, 'score_not_integer'], ['240', 120, 'score_not_integer'], [Number.NaN, 120, 'score_not_integer'], [null, 120, 'score_not_integer'],
      [-1, 120, 'score_negative'], [1000, 10, 'above_max_rate'], [240, 700, 'too_long'],
    ];
    for (const [score, duration, detail] of cases) {
      const r = await post({ mode: 'dunkContest', score, won: true, duration });
      expect(r.body, `${String(score)} in ${duration}s`).toMatchObject({ reason: 'SCORE_INVALID', detail });
    }
    expectNothingPaid();
  });

  it('a mode switched off takes no paying run', async () => {
    rules('dunkContest', { enabled: false });
    const r = await post({ mode: 'dunkContest', score: 240, won: true, duration: 120 });
    expect(r.body).toMatchObject({ reason: 'SCORE_INVALID', detail: 'mode_disabled' });
    expectNothingPaid();
  });

  it('a rejected run stays rejected: resending it with an honest score gets the same refusal back', async () => {
    rules('dunkContest', {});
    const r = await post({ mode: 'dunkContest', score: 5000, won: true, duration: 120 });
    const again = await post({ mode: 'dunkContest', score: 240, won: true, duration: 120, runId: r.runId });
    expect(again.body).toEqual({ ...r.body, replayed: true });
    expectNothingPaid();
  });

  it('XP, shards, coins or credits in the request are ignored: the server prices the run from the validated score', async () => {
    const r = await post({ mode: 'dunkContest', score: 240, won: true, duration: 120, xp: 999_999, shards: 99_999, coins: 50_000, credits: 10_000, labCredits: 1e9, walletShards: 500 });
    expect(r.body).toMatchObject({ paid: true, xp: 410, shards: 15, credits: 15, coins: 40, walletShards: 2 });
    expect(h.updates[0]).toMatchObject({ xp: { increment: 410 }, shards: { increment: 15 } });
    expect(h.lc[0]).toMatchObject({ delta: 15 });
    for (const w of h.wallet) expect(JSON.stringify(w)).not.toMatch(/999999|99999|50000|10000/);
  });
});

describe('ECONOMY-SESSIONS-HARDEN FIX 2: one run id keys every grant, and the ledger is written before any balance', () => {
  it('an eligible run files xp, shards, prq, LC, wallet coins, won shards, season XP and mastery — then pays, in one transaction', async () => {
    const r = await post({ mode: 'dunkContest', score: 240, won: true, duration: 120 });
    const id = r.runId!;
    expect(h.grants.map((g) => g.grantType).sort()).toEqual(['mastery', 'prq', 'season_xp', 'shards', 'wallet_coins', 'wallet_lc', 'wallet_shards', 'xp']);
    expect(h.grants.every((g) => g.userId === 'u1' && g.runId === id)).toBe(true);
    expect(h.grants.find((g) => g.grantType === 'xp')).toMatchObject({ amount: 410 });
    expect(h.grants.find((g) => g.grantType === 'wallet_coins')).toMatchObject({ amount: 40 });
    expect(h.grants.find((g) => g.grantType === 'wallet_shards')).toMatchObject({ amount: 2 });
    // claim, then the ledger, then balances; season and mastery inside the transaction; the answer stored last
    expect(h.writes).toEqual(['run:paid', 'grants', 'profile', 'session', 'lc', 'wallet:MODE_SESSION_COMPLETED', 'wallet:MODE_SESSION_WON', 'season:tx', 'mastery:tx', 'run:result']);
    // every wallet movement is keyed by the run
    expect(h.lc[0]).toMatchObject({ idempotencyKey: `run:${id}:lc` });
    expect(h.wallet.map((w) => w.idempotencyKey)).toEqual([`run:${id}:coins`, `run:${id}:won`]);
    expect(h.runs[id]).toMatchObject({ status: 'paid', score: 240, sessionId: 's1' });
    expect((h.runs[id].result as { body: unknown }).body).toEqual(r.body);
  });

  it('a lost run pays no won shards, and files none', async () => {
    await post({ mode: 'dunkContest', score: 120, won: false, duration: 120 });
    expect(h.wallet.map((w) => w.reasonCode)).toEqual(['MODE_SESSION_COMPLETED']);
    expect(h.grants.map((g) => g.grantType)).not.toContain('wallet_shards');
  });

  it('a ledger row already there for the run stops the payout before any balance moves', async () => {
    const runId = openRun('dunkContest', 120);
    h.grants.push({ userId: 'u1', runId, grantType: 'xp', amount: 410 });
    const r = await post({ mode: 'dunkContest', score: 240, won: true, duration: 120, runId });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ paid: false, reason: 'RUN_IN_FLIGHT' });
    expect(h.updates).toEqual([]);
    expect(h.sessions).toEqual([]);
    expect(h.wallet).toEqual([]);
  });
});

describe('ECONOMY-SESSIONS-HARDEN FIX 3: agent, playtest and test-account runs record the score and pay nothing', () => {
  for (const reason of ['AGENT', 'PLAYTEST', 'TEST_ACCOUNT'] as const) {
    it(`${reason}: paid: false, the score recorded on the run, no session row, no ledger row, no season or mastery`, async () => {
      const runId = openRun('dunkContest', 120, { payoutEligible: false, ineligibleReason: reason });
      // nothing in the finish can switch it on
      const r = await post({ mode: 'dunkContest', score: 240, won: true, duration: 120, runId, playtest: false, agent: 0, payoutEligible: true, role: 'player' });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ ok: true, paid: false, reason, score: 240, won: true, sessionId: null, xp: 0, shards: 0, credits: 0, coins: 0 });
      expect(h.runs[runId]).toMatchObject({ status: 'recorded', score: 240 });
      expectNothingPaid(reason);
      // and a retry is the same answer
      expect((await post({ mode: 'dunkContest', score: 240, won: true, runId })).body).toEqual({ ...r.body, replayed: true });
    });
  }

  it('an unpaid run is still validated: an impossible score is SCORE_INVALID, not "recorded"', async () => {
    rules('dunkContest', {});
    const runId = openRun('dunkContest', 120, { payoutEligible: false, ineligibleReason: 'AGENT' });
    const r = await post({ mode: 'dunkContest', score: 99_999, won: true, duration: 120, runId });
    expect(r.body).toMatchObject({ reason: 'SCORE_INVALID', detail: 'above_max_score' });
  });
});

// ---------------------------------------------------------------------------
// MERGE (2026-09-28): MUSIC-SUITE P6's Arena music rules inside ECONOMY-SESSIONS-HARDEN's run
// ---------------------------------------------------------------------------

describe('MERGE: the Arena music rules live inside the run the server started', () => {
  const PAID = (e: { eventType: string }) => e.eventType === MUSIC_SESSION_PAID;
  /** A house set on duel `id` (perfect, or every `every`-th note), posted as the room posts it: at the rejudge. */
  function arenaSet(id: string, every = 1) {
    h.matches[id] = musicDuel();
    const house = finishedSet(id, houseBeatFor(id).notes.filter((_, i) => i % every === 0).map((n) => houseTap(n.lane, n.t)));
    return { house, body: { mode: 'music', score: house, won: true, duration: 66, arenaMatchId: id, stats: musicSet({ bars: 32, notes: 192, arena: true }) } };
  }

  it('on the real table — music fail closed as landed, or its derived row since owner decision #2 — a creation session still keeps the streak: it needs no run, and pays nothing', async () => {
    h.rules = MODE_SCORE_RULES as Record<string, unknown>;
    streakedAgo(25);
    const r = await post(creation({ runId: undefined }));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, creation: true, counted: true, streakDays: 4, xp: 0, shards: 0, credits: 0, sessionId: null });
    expect(h.profile.streakDays).toBe(4);
    expectNothingPaid();
  });

  // OWNER RULING (2026-09-29): this REPLACES d31eba5d's "while music is FAIL CLOSED (no MEASURED_RUNS row) nothing of it
  // pays". That test pinned the as-landed a1a1c5f9 table (music one of the unmeasured keys; a rule-less run 422 no_rules,
  // run 'rejected'). Owner decision #2 (2026-09-28) gave music a derived row and decision #1 records a rule-less run unpaid,
  // so no code could satisfy both; asked, the owner kept the decisions and had the old test replaced. What the real table
  // does now is held here, so the P6 Arena pay path — live with music's row — is tested on the REAL table, not only on
  // the open one or a synthetic rules() row. (A rule-less run recorded unpaid is held below: NO_RULES, and the NO_RULES
  // Arena set that never makes the pay-once claim.)
  it('OWNER DECISIONS #1 + #2 on the REAL table: music has its derived row, a verified Arena set pays once, and a second post or free play is held by the endless ceiling', async () => {
    expect(MODE_SCORE_RULES.music).toMatchObject({ maxScoreFrom: 'derived', maxScore: SCORE_COLUMN_MAX, enabled: true });
    h.rules = MODE_SCORE_RULES as Record<string, unknown>;          // the real table, not the open one
    const { house, body } = arenaSet('m1');
    const first = await post(body);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ ok: true, paid: true, capped: false, xp: 567_500, shards: 18_918 });
    expect(h.runs[first.runId!]).toMatchObject({ status: 'paid', score: house });
    expect(h.grants.find((g) => g.grantType === 'xp')).toMatchObject({ amount: 567_500, metadata: { arenaSet: true, arenaMatchId: 'm1', rejudged: house } });
    expect(h.matchEvents.filter(PAID)).toHaveLength(1);
    // a NEW run for the same duel: free play at the endless ceiling, no second claim
    const again = await post(body);
    expect(again.body).toMatchObject({ ok: true, paid: true, capped: true });
    expect(again.body.xp).toBeLessThanOrEqual(endlessCeilingFor(66, true).xp);
    expect(again.body.xp).toBeLessThanOrEqual(ENDLESS_SESSION_CEILING.xp);
    // free play with no duel: paid, held by the endless ceiling, never a lock or a claim
    const free = await post({ mode: 'music', score: 9000, won: true, duration: 30, stats: musicSet({ bars: 8 }) });
    expect(free.body).toMatchObject({ ok: true, paid: true, capped: true, xp: endlessCeilingFor(30, true).xp });
    expect(h.locks).toEqual(['m1']);
    expect(h.matchEvents.filter(PAID)).toHaveLength(1);
    // the mode's own per-set bound still refuses a score its hits cannot make (sessionScoreCap → above_run_cap)
    const forged = await post({ mode: 'music', score: performSetMax(128) + 1, won: true, duration: 30, stats: musicSet({ bars: 8 }) });
    expect(forged.body).toMatchObject({ ok: false, paid: false, reason: 'SCORE_INVALID', detail: 'above_run_cap', limit: performSetMax(128) });
  });

  it('once music is measured, the mode\'s rules still come first: an Arena set outside them is refused before its duel is read', async () => {
    rules('music', { maxScore: 400_000, maxScorePerSecond: 10_000, minDurationMs: 30_000, maxDurationMs: 600_000 });
    const { body } = arenaSet('m1');
    const early = await post({ ...body, duration: 10 });            // 10 s on the SERVER's clock: too short
    expect(early.body).toMatchObject({ reason: 'SCORE_INVALID', detail: 'too_short', limit: 30_000 });
    expect(h.locks).toEqual([]);
    expect(h.matchEvents.filter(PAID)).toEqual([]);
    expectNothingPaid();
    const ok = await post(body);                                    // the same set, inside the rules: the Arena set, once
    expect(ok.body).toMatchObject({ paid: true, capped: false, xp: 567_500, shards: 18_918 });
    expect(h.matchEvents.filter(PAID)).toHaveLength(1);
  });

  it('the duel\'s one pay is claimed inside the run\'s transaction — after the run, before the ledger — and the xp row names the duel', async () => {
    const { house, body } = arenaSet('m1');
    const r = await post(body);
    expect(r.body).toMatchObject({ paid: true, capped: false, xp: 567_500 });
    expect(h.writes.slice(0, 4)).toEqual(['run:paid', 'duel:lock', `event:${MUSIC_SESSION_PAID}`, 'grants']);
    expect(h.grants.find((g) => g.grantType === 'xp')).toMatchObject({ amount: 567_500, metadata: { arenaSet: true, arenaMatchId: 'm1', rejudged: house } });
    expect(h.runs[r.runId!]).toMatchObject({ status: 'paid', score: house, sessionId: 's1' });
  });

  it('a retried Arena run is the first answer: no second claim, no second lock, nothing paid twice', async () => {
    const { body } = arenaSet('m1');
    const first = await post(body);
    const again = await post({ ...body, runId: first.runId });
    expect(again.body).toEqual({ ...first.body, replayed: true });
    expect(h.locks).toEqual(['m1']);
    expect(h.matchEvents.filter(PAID)).toHaveLength(1);
    expect(h.sessions).toHaveLength(1);
    // a NEW run for the same duel is the second post P6 names: free play at the endless ceiling
    const second = await post(body);
    expect(second.body).toMatchObject({ paid: true, capped: true });
    expect(second.body.xp).toBeLessThan(20_000);
    expect(h.matchEvents.filter(PAID)).toHaveLength(1);
  });

  it('an agent / playtest run of a staked set is validated, recorded, and never spends the player\'s one Arena pay for the duel', async () => {
    const { house, body } = arenaSet('m1', 2);                      // a half set: its rejudge is well under the ceiling
    const greedy = await post({ ...body, score: house + 1, runId: openRun('music', 66, { payoutEligible: false, ineligibleReason: 'AGENT' }) });
    expect(greedy.body).toMatchObject({ reason: 'SCORE_INVALID', detail: 'above_rejudge' });
    for (const reason of ['AGENT', 'PLAYTEST'] as const) {
      const r = await post({ ...body, runId: openRun('music', 66, { payoutEligible: false, ineligibleReason: reason }) });
      expect(r.body, reason).toMatchObject({ ok: true, paid: false, reason, score: house, xp: 0 });
    }
    expect(h.locks).toEqual([]);
    expect(h.matchEvents.filter(PAID)).toEqual([]);
    expectNothingPaid();
    const paid = await post(body);
    expect(paid.body).toMatchObject({ paid: true, capped: false, xp: Math.round(house * 1.5) + 50 });
    expect(h.matchEvents.filter(PAID)).toHaveLength(1);
  });

  it('a STARTED attempt that never finished is no Arena set: free play at the endless ceiling, never refused as above a rejudge of 0', async () => {
    // P6: the payout needs a FINISHED attempt (the reload rule scores an unfinished one 0 at settlement — that is the
    // duel's business; this session is free play). Without the finish gate it would be "verified" with a rejudge of 0.
    h.matches.m1 = musicDuel();
    h.matchEvents.push({ matchId: 'm1', userId: 'u1', eventType: MUSIC_ATTEMPT_START, payload: '{}', seq: 0, createdAt: new Date() });
    const r = await post({ mode: 'music', score: 60_000, won: true, duration: 66, arenaMatchId: 'm1', stats: musicSet({ bars: 32, notes: 192, arena: true }) });
    expect(r.body).toMatchObject({ paid: true, capped: true });                       // an Arena set would pay 90,050 XP
    expect(r.body.xp).toBeLessThan(20_000);
    expect(h.locks).toEqual([]);
    expect(h.matchEvents.filter(PAID)).toEqual([]);
  });

  it('a verified Arena set is held to the Arena\'s music ceiling through the run cap (the tighter cap), before the rejudge is read', async () => {
    const { house, body } = arenaSet('m1');
    expect(house).toBe(378_300);
    // counts that would allow the old grid's 2,647,100 (512 hits): the Arena ceiling is the run cap, SCORE_INVALID above_run_cap
    const r = await post({ ...body, score: perfectScore(512), stats: musicSet({ bars: 32, notes: 512, arena: true }) });
    expect(r.body).toMatchObject({ reason: 'SCORE_INVALID', detail: 'above_run_cap', limit: 378_300 });
    expectNothingPaid();
    expect(h.matchEvents.filter(PAID)).toEqual([]);
  });

  it('the duel gates hold inside the run: no opponent, past expiresAt or already scored is free play — no lock, no claim', async () => {
    const { body } = arenaSet('m1');
    for (const [label, row] of [
      ['no opponent', { status: 'WAITING', player2Id: null }],
      ['expired', { expiresAt: new Date(Date.now() - 1_000) }],
      ['scored', { player1Score: 378_300 }],
    ] as const) {
      h.matches.m1 = musicDuel(row);
      const r = await post(body);
      expect(r.body, label).toMatchObject({ paid: true, capped: true });
    }
    expect(h.locks).toEqual([]);
    expect(h.matchEvents.filter(PAID)).toEqual([]);
  });
});

describe('OWNER DECISION (2026-09-28): a mode with no rules row is recorded unpaid; Prove It pays the played floor', () => {
  it('NO_RULES: ok, paid: false, the score recorded on the run — nothing paid, nothing filed, no session row', async () => {
    rules('volleyball', {});                                          // tennis has no row in this table
    const r = await post({ mode: 'tennis', score: 3, won: true, duration: 60 });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, paid: false, reason: 'NO_RULES', score: 3, won: true, sessionId: null, xp: 0, coins: 0 });
    expect(h.runs[r.runId!]).toMatchObject({ status: 'recorded', score: 3 });
    expectNothingPaid('NO_RULES');
    expect(h.events).toContainEqual(expect.objectContaining({ name: 'session_unpaid', props: expect.objectContaining({ reason: 'NO_RULES' }) }));
  });

  it('NO_RULES still checks what it can: a whole number, not negative — and its own per-run cap', async () => {
    rules('volleyball', {});
    for (const [score, detail] of [[2.5, 'score_not_integer'], [-4, 'score_negative']] as const) {
      const r = await post({ mode: 'tennis', score, won: true, duration: 60 });
      expect(r.status, String(score)).toBe(422);
      expect(r.body, String(score)).toMatchObject({ reason: 'SCORE_INVALID', detail });
    }
    const capped = await post({ mode: 'tennis', score: 5, won: true, duration: 60 });   // tennis: 4 games at most (the rules)
    expect(capped.body).toMatchObject({ reason: 'SCORE_INVALID', detail: 'above_run_cap', limit: 4 });
    expectNothingPaid();
  });

  it('a key the catalogue does not know is still refused (it is not NO_RULES)', async () => {
    rules('volleyball', {});
    expect((await post({ mode: 'notAMode', score: 1, duration: 60 })).body).toMatchObject({ reason: 'SCORE_INVALID', detail: 'unknown_mode' });
  });

  it('payFloorOnly (Prove It): paid as a score of 0 and no win — 10 XP, 1 shard, the streak — no coins, won shards, season XP or mastery; the score stays on the history row', async () => {
    rules('dunkduel', { maxScore: 120, payFloorOnly: true, minDurationMs: 2_000 });
    const r = await post({ mode: 'dunkduel', score: 96, won: true, duration: 60, played: true });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, paid: true, won: false, xp: 10, shards: 1, credits: 0, coins: 0, walletShards: 0, season: null, mastery: null });
    expect(h.sessions[0]).toMatchObject({ mode: 'dunkduel', score: 96, won: false, xp: 10, shards: 1 });
    expect(h.wallet).toEqual([]);
    expect(h.season).toEqual([]);
    expect(h.mastery).toEqual([]);
    expect(h.grants.map((g) => g.grantType).sort()).toEqual(['prq', 'shards', 'xp']);
    // its streak day still counts and pays its Lab Credits
    for (const k of ['sessions', 'grants', 'lc'] as const) h[k] = [];
    h.profile.lastStreakAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const next = await post({ mode: 'dunkduel', score: 96, won: true, duration: 60, played: true });
    expect(next.body).toMatchObject({ won: false, xp: 10, streakDays: 4, streakBonus: 20, credits: 20 });
    expect(h.lc[0]).toMatchObject({ delta: 20 });
  });

  it('Prove It on the REAL table: the exported dunkduel row pays the played floor (review: every other Prove It test used a synthetic row)', async () => {
    h.rules = MODE_SCORE_RULES as Record<string, unknown>;          // the real table: derivedRule must carry payFloorOnly through
    const r = await post({ mode: 'dunkduel', score: 96, won: true, duration: 60, played: true });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, paid: true, won: false, xp: 10, shards: 1, credits: 0, coins: 0, walletShards: 0, season: null, mastery: null });
    expect(h.sessions[0]).toMatchObject({ mode: 'dunkduel', score: 96, won: false, xp: 10, shards: 1 });
    expect(h.wallet).toEqual([]);
    expect(h.season).toEqual([]);
    expect(h.mastery).toEqual([]);
    expect(h.grants.map((g) => g.grantType).sort()).toEqual(['prq', 'shards', 'xp']);
  });

  it('rebased onto MUSIC-SUITE P6: a NO_RULES Arena music set is recorded unpaid and never makes the duel\'s pay-once claim — the honest paid post still gets it', async () => {
    rules('volleyball', {});                                          // music has no row in this table
    h.matches.m1 = musicDuel();
    const house = finishedSet('m1');
    const body = { mode: 'music', score: house, won: true, duration: 66, arenaMatchId: 'm1', stats: musicSet({ bars: 32, notes: 192, arena: true }) };
    const r = await post(body);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, paid: false, reason: 'NO_RULES', score: house, sessionId: null, xp: 0 });
    expect(h.runs[r.runId!]).toMatchObject({ status: 'recorded', score: house });
    expect(h.locks).toEqual([]);
    expect(h.matchEvents.filter((e) => e.eventType === MUSIC_SESSION_PAID)).toEqual([]);
    expect(h.writes.filter((w) => w.startsWith('duel:') || w.startsWith('event:'))).toEqual([]);
    expectNothingPaid('NO_RULES arena set');
    // the duel's one Arena pay is still there for the paid post (open rules: music has its row)
    h.rules = null;
    const paid = await post(body);
    expect(paid.body).toMatchObject({ paid: true, capped: false, xp: 567_500 });
    expect(h.matchEvents.filter((e) => e.eventType === MUSIC_SESSION_PAID)).toHaveLength(1);
  });
});

describe('FOLLOW-UP (2026-09-29): the finite pay cap on skateboarding and surfing', () => {
  it('a forged skate run is recorded as sent and paid the cap (capped: true); an honest strong run is paid in full', async () => {
    const forged = await post({ mode: 'skateboarding', score: 400_000_000, won: true, duration: 90 });
    expect(forged.body).toMatchObject({ paid: true, capped: true, xp: 485_042, shards: 16_169 });
    expect(h.sessions[0]).toMatchObject({ score: 400_000_000, xp: 485_042 });
    expect(h.updates[0]).toMatchObject({ xp: { increment: 485_042 } });
    const honest = await post({ mode: 'skateboarding', score: 80_832, won: true, duration: 90 });
    expect(honest.body).toMatchObject({ capped: false, xp: 121_298 });
    // another finite mode is untouched
    expect((await post({ mode: 'snowboarding', score: 400_000, won: true, duration: 90 })).body).toMatchObject({ capped: false, xp: 600_050 });
  });
});
