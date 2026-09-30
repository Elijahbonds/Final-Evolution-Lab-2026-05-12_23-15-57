// MUSIC-SUITE P6 (2026-09-26): the pure rules of an Arena music attempt (lib/arena-music.ts) and the rival's filter on it
// (lib/arena-rivals.ts ownDuelScores / RIVAL_SCORE_EVENT). The routes that use them are run in lib/arenaMusicAttempt.test.ts,
// lib/arenaSubmitRoute.test.ts, lib/arena.legacyKeys.test.ts and lib/stakingPause.test.ts.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isMusicDuel, readMusicAttempt, musicAttemptScore, MUSIC_ATTEMPT_START, MUSIC_ATTEMPT_FINISH, DANCE_ATTEMPT_FINISH, type MusicAttempt,
  musicSeat, houseSeatOf, isStartReplay, cleanAttemptId, HOUSE_START_RETRY_MS, musicTapPlausibility, PLAUSIBILITY_MIN_HITS,
  PLAUSIBILITY_MIN_SPREAD_MS,
} from './arena-music';
import {
  ownDuelScores, RIVAL_SCORE_EVENT, RIVAL_FROM_DUEL_SCORES, ARENA_SCORE_BASELINES, drawRivalScore, RIVAL_BAND, RIVAL_BASELINE_FLOOR,
} from './arena-rivals';
import { houseBeatFor, houseTap, judgeHouseSet, HOUSE_ARENA_RULES, HOUSE_MAX_TAPS } from './babylon/music/houseBeat';
import { songStepTime } from './babylon/music/stepTime';
import { isStakingPaused } from './stakingPause';

describe('musicAttemptScore: what the server makes of one attempt', () => {
  const beat = houseBeatFor('m-7');
  const taps = beat.notes.filter((_, i) => i % 3 !== 0).map((n) => houseTap(n.lane, n.t - 0.01));
  const at = new Date('2026-09-26T10:00:00Z');

  it('no start: NO_ATTEMPT (409) — a score with no set behind it', () => {
    const v = musicAttemptScore('m-7', { startedAt: null, finish: null });
    expect(v).toMatchObject({ ok: false, code: 'NO_ATTEMPT', status: 409 });
  });

  it('started, never finished: 0, a forfeit (owner decision #29)', () => {
    expect(musicAttemptScore('m-7', { startedAt: at, finish: null })).toEqual({ ok: true, score: 0, forfeit: true, taps: 0 });
  });

  it('finished: judgeHouseSet on the duel\'s own beat — the match id decides the beat, not the caller', () => {
    const a: MusicAttempt = { startedAt: at, finish: { taps, at } };
    expect(musicAttemptScore('m-7', a)).toEqual({ ok: true, score: judgeHouseSet(beat, taps).score, forfeit: false, taps: taps.length });
    // the same taps on another duel are judged on that duel's beat
    expect(musicAttemptScore('m-8', a)).toMatchObject({ ok: true, score: judgeHouseSet(houseBeatFor('m-8'), taps).score });
  });

  it('isMusicDuel reads either spelling a row carries, and nothing else', () => {
    expect(isMusicDuel('music')).toBe(true);
    expect(isMusicDuel('musicAcademy')).toBe(true);
    for (const m of ['dance', 'threePoint', '', null, undefined]) expect(isMusicDuel(m as string), String(m)).toBe(false);
  });
});

describe('readMusicAttempt: the player\'s rows, first start and first finish', () => {
  const rowsDb = (rows: { eventType: string; payload: unknown; createdAt: Date }[]) => {
    const asked: Record<string, unknown>[] = [];
    return { asked, db: { matchEvent: { findMany: async (args: Record<string, unknown>) => { asked.push(args); return rows; } } } as never };
  };
  const t1 = new Date('2026-09-26T10:00:00Z'), t2 = new Date('2026-09-26T10:01:10Z'), t3 = new Date('2026-09-26T10:02:00Z');
  const beat = houseBeatFor('m-1');
  const good = beat.notes.slice(0, 10).map((n) => houseTap(n.lane, n.t));

  it('asks for this player\'s start and finish rows on this duel, in seq order', async () => {
    const { asked, db } = rowsDb([]);
    expect(await readMusicAttempt(db, 'm-1', 'u1')).toEqual({ startedAt: null, finish: null });
    expect(asked[0]).toMatchObject({ where: { matchId: 'm-1', userId: 'u1', eventType: { in: [MUSIC_ATTEMPT_START, MUSIC_ATTEMPT_FINISH] } } });
  });

  it('takes the first start and the first finish (a race that wrote two), with the stored taps', async () => {
    const { db } = rowsDb([
      { eventType: MUSIC_ATTEMPT_START, payload: '{}', createdAt: t1 },
      { eventType: MUSIC_ATTEMPT_START, payload: '{}', createdAt: t2 },
      { eventType: MUSIC_ATTEMPT_FINISH, payload: JSON.stringify({ taps: good }), createdAt: t2 },
      { eventType: MUSIC_ATTEMPT_FINISH, payload: JSON.stringify({ taps: [] }), createdAt: t3 },
    ]);
    expect(await readMusicAttempt(db, 'm-1', 'u1')).toEqual({ startedAt: t1, finish: { taps: good, at: t2 } });
  });

  it('a finish row whose taps no longer parse reads as an empty list (the set scores what an empty list scores: 0)', async () => {
    const { db } = rowsDb([
      { eventType: MUSIC_ATTEMPT_START, payload: '{}', createdAt: t1 },
      { eventType: MUSIC_ATTEMPT_FINISH, payload: '{"taps":[{"lane":"cowbell","tMs":1}]}', createdAt: t2 },
    ]);
    const a = await readMusicAttempt(db, 'm-1', 'u1');
    expect(a.finish?.taps).toEqual([]);
    expect(musicAttemptScore('m-1', a)).toMatchObject({ ok: true, score: 0, forfeit: false });
    const { db: broken } = rowsDb([{ eventType: MUSIC_ATTEMPT_FINISH, payload: 'not json', createdAt: t2 }]);
    expect((await readMusicAttempt(broken, 'm-1', 'u1')).finish?.taps).toEqual([]);
  });
});

describe('the rival: old music scores stop counting (owner decision #12)', () => {
  const rows = [
    { player1Id: 'u1', player1Score: 90_000, player2Score: 1 },                                                     // pre-P6: no events
    { player1Id: 'u1', player1Score: 0, player2Score: 1, events: [] },                                              // a forfeit: no finish
    { player1Id: 'x', player1Score: 1, player2Score: 70_000, events: [{ eventType: MUSIC_ATTEMPT_FINISH, userId: 'x' }] },   // theirs
    { player1Id: 'u1', player1Score: 12_000, player2Score: 1, events: [{ eventType: MUSIC_ATTEMPT_FINISH, userId: 'u1' }] },
    { player1Id: 'y', player1Score: 1, player2Score: 15_000, events: [{ eventType: MUSIC_ATTEMPT_FINISH, userId: 'u1' }] },
  ];

  it('music bands only on duels carrying the player\'s finished attempt', () => {
    expect(RIVAL_FROM_DUEL_SCORES.has('music')).toBe(true);
    // (MUSIC-SUITE P9, 2026-09-29: dance joined the table with its own finish event — its describe is at the end)
    expect(RIVAL_SCORE_EVENT).toEqual({ music: MUSIC_ATTEMPT_FINISH, dance: DANCE_ATTEMPT_FINISH });
    expect(ownDuelScores(rows, 'u1', Infinity, RIVAL_SCORE_EVENT.music)).toEqual([12_000, 15_000]);
  });

  it('without the event rule every score in reach counts, as before (no other mode is filtered)', () => {
    expect(ownDuelScores(rows, 'u1')).toEqual([90_000, 0, 70_000, 12_000, 15_000]);
    expect(ownDuelScores(rows, 'u1', 50_000)).toEqual([0, 12_000, 15_000]);
    expect(Object.keys(RIVAL_SCORE_EVENT)).toEqual(['music', 'dance']);   // MUSIC-SUITE P9: + dance, and only those two
  });

  it('with nothing left, the draw is the music baseline (12,000 since the P6 fix pass — see below)', () => {
    const d = drawRivalScore({ seed: 's', mode: 'music', playerHistory: ownDuelScores(rows.slice(0, 3), 'u1', Infinity, RIVAL_SCORE_EVENT.music) });
    expect(d).toMatchObject({ source: 'baseline', center: ARENA_SCORE_BASELINES.music });
    expect(ARENA_SCORE_BASELINES.music).toBe(12_000);
  });
});

/** Deterministic LCG, so the measured players are the same on every run. */
const lcg = (seed: number) => { let x = seed >>> 0; return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 2 ** 32); };

// MUSIC-SUITE P6 FIX PASS (2026-09-26): THE COLD-START BAND AND ITS FLOOR (owner decisions #12 and #13, the conflict the
// phase review measured): 5,000 was a number on the OLD scale — on the house beat a four-key masher scored 9,350–9,600 and
// won every account's first music Quick Match; and one empty finish (a real, rejudged 0) centred the band on 0.
describe('P6 fix pass: the music rival never plays below a grade-C set', () => {
  const lo = (c: number) => Math.round(c * (1 - RIVAL_BAND));
  const hi = (c: number) => Math.round(c * (1 + RIVAL_BAND));
  const SEEDS = Array.from({ length: 60 }, (_, i) => `mash-${i}`);
  const eighths = (beat: ReturnType<typeof houseBeatFor>, lanes: readonly ('kick' | 'snare' | 'hats' | 'perc')[], every: number) => {
    const out: { lane: 'kick' | 'snare' | 'hats' | 'perc'; tMs: number }[] = [];
    for (let i = 0; i < beat.setBars * beat.stepsPerBar; i += every) {
      const t = songStepTime(Math.floor(i / beat.stepsPerBar), i % beat.stepsPerBar, beat.stepsPerBar, beat.bpm, beat.swing);
      for (const lane of lanes) out.push(houseTap(lane, t));
    }
    return out;
  };

  it('the floor: a player\'s own history can raise the house, never lower it (an empty finish, a history of zeros)', () => {
    expect(RIVAL_BASELINE_FLOOR.has('music')).toBe(true);
    for (const history of [[0], [9600, 9600, 9600, 9600, 0, 0, 0, 0, 0, 0], [0, 0, 0], [4000]]) {
      const d = drawRivalScore({ seed: 'z', mode: 'music', playerHistory: history });
      expect(d.center, JSON.stringify(history)).toBe(ARENA_SCORE_BASELINES.music);
      expect(d.score).toBeGreaterThanOrEqual(lo(ARENA_SCORE_BASELINES.music));
    }
    // a real history above it is the player's own band, as before; the old key finds the same floor
    expect(drawRivalScore({ seed: 'z', mode: 'music', playerHistory: [40_000, 50_000] })).toMatchObject({ center: 45_000, source: 'player-history' });
    expect(drawRivalScore({ seed: 'z', mode: 'musicAcademy', playerHistory: [0] }).center).toBe(ARENA_SCORE_BASELINES.music);
    // every other mode is untouched: a low history is still its own centre
    expect(drawRivalScore({ seed: 'z', mode: 'threePoint', playerHistory: [2] })).toMatchObject({ center: 2, source: 'player-history' });
  });

  // (a masher's combo breaks on every extra and the spam lock makes every hit a GOOD: 50 × 192 notes = 9,600 is the most
  // any mash can score on a house beat — measured 8,600–9,600 over 200 beats after the chord rule, 6,200–6,400 for chords
  // on the quarters; the band's floor is 9,840)
  it('no masher beats the cold-start band\'s floor, on any beat: four keys on every 8th, every 16th, kick on every quarter', () => {
    const c = ARENA_SCORE_BASELINES.music;
    let worst = 0;
    for (const seed of SEEDS) {
      const beat = houseBeatFor(seed);
      for (const taps of [eighths(beat, ['kick', 'snare', 'hats', 'perc'], 2), eighths(beat, ['kick', 'snare', 'hats', 'perc'], 1).slice(0, HOUSE_MAX_TAPS), eighths(beat, ['kick'], 4), eighths(beat, ['kick', 'snare'], 4)]) {
        const r = judgeHouseSet(beat, taps);
        worst = Math.max(worst, r.score);
        expect(r.won, `${seed}: ${r.accuracy.toFixed(3)}`).toBe(false);
      }
    }
    expect(worst).toBeLessThan(lo(c));
  });

  it('a grade-C set is where the band sits: an honest beginner (±90 ms, 30 % skipped) beats its centre on most beats', () => {
    const c = ARENA_SCORE_BASELINES.music;
    const scores: number[] = [];
    for (const [k, seed] of SEEDS.entries()) {
      const beat = houseBeatFor(seed);
      const r = lcg(k + 1);
      const taps = beat.notes.filter(() => r() >= 0.3).map((n) => houseTap(n.lane, n.t + (r() * 2 - 1) * 0.09));
      scores.push(judgeHouseSet(beat, taps).score);
    }
    scores.sort((a, b) => a - b);
    expect(scores[Math.floor(scores.length / 2)]).toBeGreaterThan(c);
    expect(hi(c)).toBeLessThan(40_000);   // …and a decent player (A grade, the proof's median 38,400) clears the top
  });
});

describe('P6 fix pass: a seat as settlement counts it (musicSeat), the start replay, the plausibility read', () => {
  const at = new Date('2026-09-26T10:00:00Z');
  const beat = houseBeatFor('m-9');
  const taps = beat.notes.slice(0, 40).map((n) => houseTap(n.lane, n.t + 0.03));

  it('a start has played (0 unfinished, the rejudge finished); a stored score with no start is pre-house-beat; the house is its column', () => {
    expect(musicSeat('m-9', null, { startedAt: at, finish: null })).toEqual({ score: 0, legacy: false, started: true, finished: false });
    expect(musicSeat('m-9', null, { startedAt: at, finish: { taps, at } })).toMatchObject({ score: judgeHouseSet(beat, taps).score, finished: true });
    expect(musicSeat('m-9', 41_000, { startedAt: at, finish: { taps, at } })).toMatchObject({ score: 41_000, legacy: false });
    expect(musicSeat('m-9', 150_000, { startedAt: null, finish: null })).toEqual({ score: null, legacy: true, started: false, finished: false });
    expect(musicSeat('m-9', null, { startedAt: null, finish: null })).toMatchObject({ score: null, legacy: false });
    expect(musicSeat('m-9', 9_000, null)).toMatchObject({ score: 9_000, legacy: false });   // the house seat
    expect(houseSeatOf({ matchType: 'GHOST_DUEL' })).toBe('p2');
    expect(houseSeatOf({ matchType: 'H2H' })).toBeNull();
  });

  it('a start replays only for the same attemptId, unfinished, inside HOUSE_START_RETRY_MS', () => {
    const a = { startedAt: at, finish: null, startAttemptId: 'room-abc12345' };
    const t = at.getTime();
    expect(isStartReplay(a, 'room-abc12345', t + 5_000)).toBe(true);
    expect(isStartReplay(a, 'room-abc12345', t + HOUSE_START_RETRY_MS + 1)).toBe(false);   // a reload much later: no
    expect(isStartReplay(a, 'room-other999', t + 1_000)).toBe(false);                      // a reloaded room has a new id
    expect(isStartReplay(a, null, t + 1_000)).toBe(false);
    expect(isStartReplay({ ...a, finish: { taps, at } }, 'room-abc12345', t + 1_000)).toBe(false);
    expect(isStartReplay({ startedAt: at, finish: null }, 'room-abc12345', t + 1_000)).toBe(false);
    expect([cleanAttemptId('room-abc12345'), cleanAttemptId('x'), cleanAttemptId('a b c d e f g h'), cleanAttemptId(42)]).toEqual(['room-abc12345', null, null, null]);
  });

  it('readMusicAttempt carries the start\'s attemptId', async () => {
    const db = { matchEvent: { findMany: async () => [{ eventType: MUSIC_ATTEMPT_START, payload: JSON.stringify({ attemptId: 'room-abc12345' }), createdAt: at }] } } as never;
    expect(await readMusicAttempt(db, 'm-9', 'u1')).toEqual({ startedAt: at, finish: null, startAttemptId: 'room-abc12345' });
  });

  it('plausibility: a list built from the chart is flagged (spread ~0); a human spread is not; nothing is refused on it', () => {
    const exact = beat.notes.map((n) => houseTap(n.lane, n.t));
    const e = musicTapPlausibility('m-9', exact);
    expect(e).toMatchObject({ hits: exact.length, flagged: true });
    expect(e.spreadMs!).toBeLessThan(0.1);   // (houseTap rounds to 0.1 ms)
    const r = lcg(7);
    const human = beat.notes.map((n) => houseTap(n.lane, n.t + (r() * 2 - 1) * 0.03));
    const h = musicTapPlausibility('m-9', human);
    expect(h.flagged).toBe(false);
    expect(h.spreadMs!).toBeGreaterThan(PLAUSIBILITY_MIN_SPREAD_MS);
    expect(musicTapPlausibility('m-9', exact.slice(0, PLAUSIBILITY_MIN_HITS - 1)).flagged).toBe(false);   // too few to say
    expect(musicTapPlausibility('m-9', [])).toEqual({ hits: 0, spreadMs: null, flagged: false });
  });
});

describe('music is staked again, and the lobby says how (P6 step e)', () => {
  it('music is out of the pause (dance stayed paused until phase 9 — MUSIC-SUITE P9, 2026-09-29: now out too)', () => {
    expect(isStakingPaused('music')).toBe(false);
    expect(isStakingPaused('musicAcademy')).toBe(false);
    expect(isStakingPaused('dance')).toBe(false);
  });

  it('the Arena lobby shows the house-beat rules when music is picked', () => {
    const view = readFileSync(join(process.cwd(), 'components/arena-view.tsx'), 'utf8');
    expect(view).toContain("import { HOUSE_ARENA_RULES } from '@/lib/babylon/music/houseBeat';");
    expect(view).toMatch(/pickMode === 'music' && \(/);
    expect(view).toContain('Groove Academy duels: {HOUSE_ARENA_RULES}');
    expect(HOUSE_ARENA_RULES).toMatch(/same house beat/);
  });
});
