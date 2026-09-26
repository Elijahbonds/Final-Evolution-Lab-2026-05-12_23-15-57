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
}));

vi.mock('next-auth', () => ({ getServerSession: async () => ({ user: { id: 'u1' } }) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => {
  const tx = {
    playerProfile: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        h.updates.push(data);
        // MUSIC-SUITE P3: the streak fields persist, so the next request reads what this one wrote
        for (const k of ['streakDays', 'lastStreakAt', 'lastActiveAt'] as const) if (data[k] !== undefined) h.profile[k] = data[k];
        const plain = Object.fromEntries(Object.entries(data).filter(([, v]) => typeof v === 'number'));
        return { ...h.profile, ...plain, labCredits: 100 };
      },
    },
    gameSession: { create: async ({ data }: { data: Record<string, unknown> }) => { h.sessions.push(data); return { id: 's1', ...data }; } },
    prqEntry: { findFirst: async () => null },
  };
  return {
    prisma: {
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
      competitionMatch: { findUnique: async ({ where }: { where: { id: string } }) => h.matches[where.id] ?? null },
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
  applyLc: async (_tx: unknown, a: Record<string, unknown>) => { h.lc.push(a); return { balanceAfter: 100 + Number(a.delta) }; },
}));
vi.mock('@/lib/profile-service', () => ({ getOrCreateProfile: async () => ({ ...(h.staleRead ?? h.profile) }) }));
vi.mock('@/lib/prq-entries', () => ({ createPrqEntry: async (_tx: unknown, row: Record<string, unknown>) => { h.prqRows.push(row); } }));
vi.mock('@/lib/season/season-service', () => ({ addSeasonXp: async (a: Record<string, unknown>) => { h.season.push(a); return null; } }));
vi.mock('@/lib/mastery/mastery-service', () => ({ recordMastery: async (_u: string, a: Record<string, unknown>) => { h.mastery.push(a); return null; } }));
vi.mock('@/lib/analytics-server', () => ({ recordServerEvent: async (e: Record<string, unknown>) => { h.events.push(e); } }));
vi.mock('@/lib/move/formWrite', () => ({ writeFormPlan: async () => null }));

import { POST } from '@/app/api/sessions/route';
import { performSetMax } from '@/lib/babylon/music/performSet';

async function post(body: Record<string, unknown>) {
  const res = await POST({ json: async () => body } as never);
  return { status: res.status, body: await res.json() };
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
  for (const k of ['updates', 'sessions', 'lc', 'prqRows', 'season', 'mastery', 'events', 'creationWrites'] as const) h[k] = [];
  h.matches = {};
  h.staleRead = null;
});

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

  it('a set from today\'s client (no stats) is free play: capped — and, until the shell forwards stats, its room\'s win stands', async () => {
    // MUSIC-SUITE P2 FIX PASS: this refused every honest win (the card said "set won", the recap paid none of it)
    const r = await post({ mode: 'music', score: 5_000_000, won: true, duration: 240 });
    expect(r.body).toMatchObject({ won: true, capped: true, xp: 14_150, shards: 473, credits: 15 });
    expect(h.lc).toHaveLength(1);
  });

  it('a real Arena set — its match found — ends itself and is paid as before (a scored game with an end card)', async () => {
    const score = perfectScore(512);
    expect(score).toBe(2_647_100);
    h.matches.m1 = musicDuel();
    const r = await post({ mode: 'music', score, won: true, duration: 90, arenaMatchId: 'm1', stats: musicSet({ bars: 32, arena: true }) });
    expect(r.body).toMatchObject({ won: true, capped: false, xp: 3_970_700, shards: 132_358 });
  });

  it('P2 fix pass: ?arena=<anything> is free play — no match, someone else\'s, a dance duel, a settled one: all capped', async () => {
    // review: sessionPayout paid 3,970,700 XP / 132,358 shards for a claimed Arena set while music staking is paused
    const score = perfectScore(512);
    h.matches = {
      theirs: musicDuel({ player1Id: 'u7', player2Id: 'u8' }), dance: musicDuel({ mode: 'dance' }),
      done: musicDuel({ status: 'SETTLED' }), cash: musicDuel({ currency: 'USD_CENTS' }), scored: musicDuel({ player1Score: 5000 }),
    };
    for (const arenaMatchId of [undefined, 'nope', 'theirs', 'dance', 'done', 'cash', 'scored', 42]) {
      const r = await post({ mode: 'music', score, won: true, duration: 84, arenaMatchId, stats: musicSet({ bars: 32, arena: true }) });
      expect(r.body, String(arenaMatchId)).toMatchObject({ capped: true, xp: 14_150, shards: 473 });
    }
  });

  it('P2 fix pass: an Arena set\'s score is held to what its counts allow (review: 1e9 on 16 hits paid 1,500,000,050 XP)', async () => {
    h.matches.m1 = musicDuel();
    const r = await post({ mode: 'music', score: 1_000_000_000, won: true, duration: 30, arenaMatchId: 'm1', stats: musicSet({ bars: 8, notes: 16, perfects: 16, arena: true }) });
    expect(r.body).toMatchObject({ capped: false, xp: Math.round(performSetMax(16) * 1.5) + 50 });
    expect(h.sessions[0]).toMatchObject({ score: performSetMax(16) });
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

  it('P2 fix pass: a finite score above its own rules maximum is paid as that maximum (was: training 1,000,000 → 1.5M XP)', async () => {
    const training = await post({ mode: 'training', score: 1_000_000, won: true, duration: 60 });
    expect(training.body).toMatchObject({ capped: false, xp: 14_150, shards: 473 });
    expect(h.sessions[0]).toMatchObject({ score: 9400 });
  });

  it('P2 fix pass: a mode string the catalogue does not know is capped and wins nothing (review: \'Music\' 34M → 51M XP + a win)', async () => {
    for (const mode of ['Music', 'music ', 'notAMode']) {
      h.lc = [];
      const r = await post({ mode, score: 34_000_000, won: true, duration: 300 });
      expect(r.body, mode).toMatchObject({ won: false, capped: true, xp: 14_150, shards: 473, credits: 0 });
      expect(h.lc, mode).toEqual([]);
    }
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
      const r = await post({ mode: 'music', score: 50_000, won: true, duration, stats });
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
    await post({ mode: 'dance', score: 99_999, won: true, duration: 120, stats: { perfect: 8, great: 0, good: 0, miss: 8 } });
    expect(h.updates[0]).toMatchObject({ agility: 50.48, mental: 50.48 });
  });

  it('a music set trains mental only, by its accuracy', async () => {
    await post({ mode: 'music', score: 50_000, won: true, duration: 120, stats: musicSet({ bars: 40, notes: 640, perfects: 320, goods: 0 }) });
    expect(h.updates[0]).toMatchObject({ mental: 50.48 });       // 0.5 × 10 × 0.1 × 0.8 × 1.2
    expect(h.updates[0]).not.toHaveProperty('agility');
    expect(h.prqRows.map((r) => r.attribute)).toEqual(['mental']);
  });

  it('P2 fix pass: until the shell forwards stats, a session with none trains by its score as before (review: every run 0)', async () => {
    const r = await post({ mode: 'dance', score: 4000, won: true, duration: 120 });
    expect(r.body.ok).toBe(true);
    expect(h.updates[0]).toMatchObject({ agility: 50.96, mental: 50.96 });                 // HEAD's score-saturated gain
    expect(h.prqRows.map((x) => x.attribute).sort()).toEqual(['agility', 'mental']);
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
