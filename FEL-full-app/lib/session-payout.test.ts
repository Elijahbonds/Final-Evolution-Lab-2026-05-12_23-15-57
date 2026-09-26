// lib/session-payout.ts, held to its own claims (MUSIC-SUITE P2, 2026-09-25).
//
// The ceiling is a number derived from other files, the grade bands and the dance weights are mirrors of the rooms' own,
// and the endless list names session keys — each is re-derived or re-read here, so a retune elsewhere fails in CI instead
// of quietly moving what a session pays.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  ENDLESS_SESSION_CEILING, ENDLESS_MODES, ARENA_SET_BARS, DANCE_ACCURACY_WEIGHTS, MUSIC_WIN_ACCURACY, MUSIC_WIN_MIN_BARS,
  SESSION_WIN_LC, sessionXp, sessionShards, setGrade, musicAccuracy, readMusicSet, musicSetWon, readDanceAccuracy,
  sessionWon, sessionAccuracy, isEndlessSession, sessionPayout, roomStats,
  ROOM_STATS_FORWARDED, ENDLESS_CEILING_BASIS_SEC, endlessCeilingFor, isCatalogueMode, sessionScoreCap,
} from './session-payout';
import { SCORE_CEILINGS } from './arena-score-integrity';
import { gradeFor } from './babylon/core/danceTracks';
import { accuracyOf } from './babylon/core/DanceCore';
import {
  PERFORM_SET_BARS, PERFORM_WIN_MIN_ACCURACY, PERFORM_WIN_MIN_BARS, PERFORM_STEPS_PER_BAR, performAccuracy, performGrade, performSetWon,
  performResultStats, performSetMax, performHitPoints, PerformSet, type PerformResult,
} from './babylon/music/performSet';

/** A music set's stats as the room sends them (the SHARED CONTRACT), perfect by default. */
function musicSet(o: Record<string, unknown> = {}) {
  const bars = Number(o.bars ?? 16), notes = Number(o.notes ?? bars * 16);
  const perfects = Number(o.perfects ?? notes), goods = Number(o.goods ?? 0);
  const accuracy = (perfects + 0.5 * goods) / notes;
  return { bars, notes, hits: perfects + goods, perfects, goods, misses: notes - perfects - goods, accuracy, grade: setGrade(accuracy), maxCombo: perfects + goods, arena: false, ...o };
}

describe('the endless ceiling is derived, not guessed', () => {
  it('equals what the best-paying finite rules game pays for a flawless win (the music rooms left out)', () => {
    const finite = Object.entries(SCORE_CEILINGS).filter(([mode, c]) => c.kind === 'rules' && mode !== 'music' && mode !== 'dance');
    expect(finite.length).toBeGreaterThan(10);
    const xp = Math.max(...finite.map(([, c]) => sessionXp(c.max, true)));
    const shards = Math.max(...finite.map(([, c]) => sessionShards(c.max, true)));
    expect(ENDLESS_SESSION_CEILING).toEqual({ xp, shards });
    // today that game is Iron Paradise: 9,400 points → 14,150 XP, 473 shards
    expect(SCORE_CEILINGS.training.max).toBe(9400);
    expect(ENDLESS_SESSION_CEILING).toEqual({ xp: 14_150, shards: 473 });
  });

  it('counting the music rooms would have been no ceiling at all', () => {
    expect(sessionXp(SCORE_CEILINGS.dance.max, true)).toBeGreaterThan(8 * ENDLESS_SESSION_CEILING.xp);
    expect(sessionXp(SCORE_CEILINGS.music.max, true)).toBeGreaterThan(250 * ENDLESS_SESSION_CEILING.xp);
  });

  it('the payout formula is the route\'s old one, unchanged below the ceiling', () => {
    expect(sessionXp(0, false)).toBe(10);
    expect(sessionXp(240, true)).toBe(410);          // a flawless dunk contest
    expect(sessionShards(240, true)).toBe(15);
    expect(sessionShards(0, false)).toBe(1);
    expect(SESSION_WIN_LC).toBe(15);
  });
});

describe('sessionPayout', () => {
  it('a perfect five-minute free-play set (~34M points) pays the ceiling, not ~51M XP', () => {
    // 1,840 notes at 92 BPM in 5 minutes, each 100 × (1 + floor(combo / 5)) (performSet.ts:31-33)
    let score = 0;
    for (let i = 0; i < 1840; i++) score += 100 * (1 + Math.floor(i / 5));
    expect(score).toBe(33_948_000);
    expect(sessionXp(score, true)).toBe(50_922_050);
    expect(sessionPayout({ score, won: true, endless: true })).toEqual({ xp: 14_150, shards: 473, winCredits: 15, capped: true });
  });

  it('a strong real run of The Hundred is under it and pays exactly what it did', () => {
    expect(sessionPayout({ score: 4000, won: false, endless: true })).toEqual({ xp: 6010, shards: 200, winCredits: 0, capped: false });
  });

  it('a finite game is never capped, however big the number (owner decision #14)', () => {
    expect(sessionPayout({ score: 1_000_000, won: true, endless: false })).toEqual({ xp: 1_500_050, shards: 50_003, winCredits: 15, capped: false });
  });

  it('caps XP and shards independently', () => {
    // 9,400 points without the win: 14,110 XP (under), 470 shards (under)
    expect(sessionPayout({ score: 9400, won: false, endless: true }).capped).toBe(false);
    expect(sessionPayout({ score: 9500, won: false, endless: true })).toMatchObject({ xp: 14_150, shards: 473, capped: true });
  });
});

describe('the endless modes', () => {
  it('every ENDLESS_MODES key is a key a GameShell saves sessions under', () => {
    const keys = new Set<string>();
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (!p.endsWith('.tsx')) continue;
        for (const m of readFileSync(p, 'utf8').matchAll(/<GameShell\b[^>]*?\bmode="([^"]+)"/g)) keys.add(m[1]);
      }
    };
    walk(join(process.cwd(), 'app'));
    for (const k of Object.keys(ENDLESS_MODES)) expect(keys.has(k), k).toBe(true);
  });

  it('music free play and The Hundred are endless; a VERIFIED Arena set is not', () => {
    const verified = { arenaVerified: true };
    expect(isEndlessSession('music', null, 300)).toBe(true);                               // today's client sends no stats
    expect(isEndlessSession('music', musicSet({ bars: 115 }), 300)).toBe(true);
    expect(isEndlessSession('music', musicSet({ bars: 32, arena: true }), 90, verified)).toBe(false);
    expect(isEndlessSession('music', musicSet({ bars: 33, arena: true }), 90, verified)).toBe(true);   // longer than an Arena set: free play
    expect(isEndlessSession('music', musicSet({ bars: 32, arena: true }), 5, verified)).toBe(true);    // 32 bars in 5 s: not a set at all
    expect(isEndlessSession('musicAcademy', null, 300)).toBe(true);                        // the old key keeps the music rules
    expect(isEndlessSession('karateEndless', null, 300)).toBe(true);
  });

  it('P2 fix pass: the Arena CLAIM alone (?arena=<anything>) is free play — only a match the route found lifts the cap', () => {
    // review: isEndlessSession('music', {bars 32, notes 512, perfects 512, arena true}, 84) was false → 3,970,700 XP uncapped
    expect(isEndlessSession('music', musicSet({ bars: 32, arena: true }), 84)).toBe(true);
    expect(isEndlessSession('music', musicSet({ bars: 32, arena: true }), 84, { arenaVerified: false })).toBe(true);
    expect(isEndlessSession('music', musicSet({ bars: 32 }), 84, { arenaVerified: true })).toBe(true);   // a match, no Arena set
  });

  it('the games that end themselves are not', () => {
    for (const m of ['sprint', 'freerun', 'carnival', 'football', 'snowboarding', 'skateboarding', 'surfing', 'dance', 'training', 'dunkContest', 'velocityKart', 'aeroAces']) {
      expect(isEndlessSession(m, null, 300), m).toBe(false);
    }
  });

  it('P2 fix pass: a mode the catalogue does not know is endless and wins nothing (review: \'Music\' paid 51M XP and a win)', () => {
    for (const m of ['Music', 'music ', 'MUSIC', 'notAMode', '', '__proto__']) {
      expect(isCatalogueMode(m), m).toBe(false);
      expect(isEndlessSession(m, null, 300), m).toBe(true);
      expect(sessionWon(m, true, null, 300, { score: 5000 }), m).toBe(false);
    }
    expect(isCatalogueMode('music')).toBe(true);
    expect(isCatalogueMode('musicAcademy')).toBe(true);                                    // an old spelling still resolves
  });

  it('P2 fix pass: every key a GameShell saves sessions under is a catalogue key (so no honest mode loses its win)', () => {
    const keys = new Set<string>();
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (!p.endsWith('.tsx')) continue;
        for (const m of readFileSync(p, 'utf8').matchAll(/<GameShell\b[^>]*?\bmode="([^"]+)"/g)) keys.add(m[1]);
      }
    };
    walk(join(process.cwd(), 'app'));
    walk(join(process.cwd(), 'components'));
    expect(keys.size).toBeGreaterThan(20);
    for (const k of keys) expect(isCatalogueMode(k), k).toBe(true);
  });

  it('a room may declare itself endless (the dance free-dance toggle), never finite', () => {
    expect(isEndlessSession('dance', { endless: 1 }, 60)).toBe(true);
    expect(isEndlessSession('dance', { endless: true }, 60)).toBe(true);
    expect(isEndlessSession('karateEndless', { endless: false }, 60)).toBe(true);
    expect(isEndlessSession('karateEndless', { arena: true }, 60)).toBe(true);
  });

  it('the Arena set mirror is performSet\'s', () => {
    expect(ARENA_SET_BARS).toBe(PERFORM_SET_BARS);
  });
});

describe('the music set, read by the server', () => {
  it('grades on the dance room\'s bands, across the whole range', () => {
    for (let a = 0; a <= 1.0001; a += 0.0025) expect(setGrade(a), String(a)).toBe(gradeFor(a));
  });

  it('accuracy is (perfects + 0.5 × goods) / notes, 0 with no notes', () => {
    expect(musicAccuracy({ perfects: 10, goods: 10, notes: 20 })).toBe(0.75);
    expect(musicAccuracy({ perfects: 0, goods: 0, notes: 0 })).toBe(0);
  });

  it('no counts, no read', () => {
    expect(readMusicSet(null, 60)).toBeNull();
    expect(readMusicSet({ score: 5000, combo: 12, kit: '808' }, 60)).toBeNull();     // StudioMode's stats before P2
    expect(readMusicSet({ bars: 8, notes: 128, perfects: 100 }, 60)).toBeNull();       // goods missing
    expect(readMusicSet({ bars: 8, notes: 128, perfects: 'lots', goods: 0 }, 60)).toBeNull();
  });

  it('recomputes accuracy and grade; a claimed number is an issue, not a fact', () => {
    const r = readMusicSet({ ...musicSet({ bars: 8, perfects: 16, goods: 0 }), accuracy: 1, grade: 'S' }, 60)!;
    expect(r.accuracy).toBeCloseTo(16 / 128, 10);
    expect(r.grade).toBe('D');
    expect(r.ok).toBe(true);
    expect(r.issues.join(' ')).toMatch(/claimed accuracy/);
    expect(r.issues.join(' ')).toMatch(/claimed grade S/);
  });

  it('P2 fix pass: a set whose counted bars outnumber its notes is not a set (a counted bar offered a note)', () => {
    const r = readMusicSet(musicSet({ bars: 8, notes: 1, perfects: 1 }), 30)!;
    expect(r.ok).toBe(false);
    expect(r.issues.join(' ')).toMatch(/8 bars with a note, but 1 notes/);
    expect(musicSetWon(r)).toBe(false);
  });

  it('counts that cannot be true are not a set', () => {
    expect(readMusicSet(musicSet({ bars: 8, notes: 10, perfects: 11, goods: 0 }), 60)!.ok).toBe(false);   // more hits than notes
    expect(readMusicSet(musicSet({ bars: 8 }), 5)!.ok).toBe(false);                                       // 8 bars in 5 s: > 240 BPM
    expect(readMusicSet(musicSet({ bars: 8 }), 7)!.ok).toBe(true);                                        // 7 s + the rounding bar
    expect(readMusicSet(musicSet({ bars: 1, notes: 100_000, perfects: 100_000 }), 60)!.ok).toBe(false);
    expect(readMusicSet(musicSet({ bars: 0, notes: 5, perfects: 4 }), 3)!.ok).toBe(true);                // ended inside the first bar
  });

  it('a room that counts `hits` or `misses` its own way does not lose an honest win', () => {
    const r = readMusicSet(musicSet({ bars: 8, hits: 999, misses: 999, maxCombo: 999 }), 60)!;
    expect(r.ok).toBe(true);
    expect(r.issues.length).toBe(3);
    expect(musicSetWon(r)).toBe(true);
  });

  it('owner decision #13: grade C (>= 50 %) over at least 8 bars', () => {
    expect(MUSIC_WIN_ACCURACY).toBe(0.5);
    expect(MUSIC_WIN_MIN_BARS).toBe(8);
    const at = (o: Record<string, unknown>, dur = 60) => musicSetWon(readMusicSet(musicSet(o), dur));
    expect(at({ bars: 8, notes: 128, perfects: 64, goods: 0 })).toBe(true);    // exactly 50 %
    expect(at({ bars: 8, notes: 128, perfects: 32, goods: 64 })).toBe(true);   // GOODs count a half
    expect(at({ bars: 8, notes: 128, perfects: 62, goods: 1 })).toBe(false);   // 48.8 %
    expect(at({ bars: 7 })).toBe(false);                                        // flawless, one bar short
    expect(at({ bars: 1, notes: 16, perfects: 1 })).toBe(false);               // the one-tap set
    expect(at({ bars: 8 }, 5)).toBe(false);                                     // not enough time for 8 bars
    expect(musicSetWon(null)).toBe(false);
  });

  it('the session verdict: music needs the room\'s win AND the read; every other mode keeps its claim', () => {
    expect(sessionWon('music', true, musicSet({ bars: 8 }), 60)).toBe(true);
    expect(sessionWon('music', false, musicSet({ bars: 8 }), 60)).toBe(false);
    expect(sessionWon('music', true, null, 60)).toBe(false);                                 // no stats and no score
    expect(sessionWon('music', true, null, 60, { statsForwarded: true, score: 9000 })).toBe(false);   // once the shell sends them
    expect(sessionWon('musicAcademy', true, musicSet({ bars: 1, notes: 16, perfects: 1 }), 60)).toBe(false);
    expect(sessionWon('dance', true, null, 60)).toBe(true);
    expect(sessionWon('dunkContest', true, null, 60)).toBe(true);
    expect(sessionWon('dunkContest', false, null, 60)).toBe(false);
  });
});

describe('dance accuracy', () => {
  it('uses DanceCore\'s own weights', () => {
    const cases = [
      { PERFECT: 10, GREAT: 0, GOOD: 0, MISS: 0 }, { PERFECT: 3, GREAT: 4, GOOD: 5, MISS: 6 },
      { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 9 }, { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 }, { PERFECT: 1, GREAT: 2, GOOD: 0, MISS: 0 },
    ];
    for (const c of cases) {
      expect(readDanceAccuracy({ perfect: c.PERFECT, great: c.GREAT, good: c.GOOD, miss: c.MISS }), JSON.stringify(c)).toBeCloseTo(accuracyOf(c), 12);
    }
    expect(DANCE_ACCURACY_WEIGHTS).toEqual({ perfect: 1, great: 0.75, good: 0.4 });
  });

  it('reads DanceMode\'s stats as it sends them today; nothing without counts', () => {
    const today = { hits: 12, rounds: 16, stars: 3, accuracy: 72, maxCombo: 9, perfect: 8, great: 2, good: 2, miss: 4, bpm: 98, difficulty: 2 };
    expect(sessionAccuracy('dance', today, 40)).toBeCloseTo((8 + 1.5 + 0.8) / 16, 12);
    expect(sessionAccuracy('dance', { accuracy: 72 }, 40)).toBeNull();
    expect(sessionAccuracy('dance', null, 40)).toBeNull();
  });

  it('music accuracy comes only from a read that can be true', () => {
    expect(sessionAccuracy('music', musicSet({ bars: 8, perfects: 64, goods: 0, notes: 128 }), 60)).toBe(0.5);
    expect(sessionAccuracy('music', musicSet({ bars: 8 }), 3)).toBeNull();
    expect(sessionAccuracy('karateEndless', musicSet(), 60)).toBeNull();
  });
});

describe('roomStats', () => {
  it('takes GameResult.stats, or `metadata`, and only a plain object', () => {
    expect(roomStats({ stats: { bars: 8 } })).toEqual({ bars: 8 });
    expect(roomStats({ metadata: { bars: 9 } })).toEqual({ bars: 9 });
    expect(roomStats({ stats: [1, 2] })).toBeNull();
    expect(roomStats({ stats: 'bars=8' })).toBeNull();
    expect(roomStats(null)).toBeNull();
    expect(roomStats({})).toBeNull();
  });
});

// THE SHARED CONTRACT (phase 2): the room decides its card's W with performSet.performSetWon and posts
// performResultStats(result) as GameResult.stats; the server re-reads those stats. The two rules must be one rule.
describe('the server mirrors the room (lib/babylon/music/performSet.ts)', () => {
  /** A room result as PerformSet reports it: notes = perfects + goods + misses (performSet.ts PerformResult). */
  function roomResult(bars: number, perfects: number, goods: number, misses: number, arena = false): PerformResult {
    const notes = perfects + goods + misses, accuracy = performAccuracy(perfects, goods, notes);
    return {
      score: 0, bars, notes, hits: perfects + goods, perfects, goods, misses, accuracy, grade: performGrade(accuracy),
      maxCombo: perfects + goods, arena, extras: 3, won: performSetWon({ accuracy, bars }),
    };
  }

  it('the same thresholds', () => {
    expect(MUSIC_WIN_ACCURACY).toBe(PERFORM_WIN_MIN_ACCURACY);
    expect(MUSIC_WIN_MIN_BARS).toBe(PERFORM_WIN_MIN_BARS);
  });

  it('the same accuracy and grade', () => {
    for (let a = 0; a <= 1.0001; a += 0.0025) expect(setGrade(a), String(a)).toBe(performGrade(a));
    for (const [p, g, n] of [[0, 0, 0], [3, 4, 10], [64, 0, 128], [32, 64, 128], [10, 10, 20], [7, 3, 11]]) {
      expect(musicAccuracy({ perfects: p, goods: g, notes: n })).toBeCloseTo(performAccuracy(p, g, n), 12);
    }
  });

  it('the stats the room posts read back clean, and every verdict agrees', () => {
    for (const bars of [0, 1, 7, 8, 9, 32, 115]) {
      for (const [p, g, m] of [[0, 0, 0], [1, 0, 15], [64, 0, 64], [62, 1, 65], [32, 64, 32], [128, 0, 0], [40, 40, 48]]) {
        const r = roomResult(bars, p * Math.max(1, bars), g * Math.max(1, bars), m * Math.max(1, bars));
        const duration = bars * 2.61 + 4;   // 92 BPM plus a count-in
        const read = readMusicSet(performResultStats(r), duration);
        const at = `${bars} bars, ${r.perfects}/${r.goods}/${r.misses}`;
        expect(read, at).not.toBeNull();
        if (bars > 0 && r.notes > 0) expect(read!.issues, at).toEqual([]);
        expect(musicSetWon(read), at).toBe(r.won);
        expect(sessionWon('music', r.won, performResultStats(r), duration), at).toBe(r.won);
      }
    }
  });

  it('a real Arena set the room posts is an Arena set to the server — once the route has found its match', () => {
    const r = roomResult(32, 512, 0, 0, true);
    expect(isEndlessSession('music', performResultStats(r), 90, { arenaVerified: true })).toBe(false);
    expect(isEndlessSession('music', performResultStats(r), 90)).toBe(true);
  });

  it('P2 fix pass: one on-time tap after eight silent bars is not a win on either side (review: S, won, both)', () => {
    // PLAY on the empty grid, 8 bars of rests, one cell on, one tap dead on its note, END SET 20 ms later (92 BPM)
    const step = 60 / 92 / 4, at = (i: number) => 0.05 + i * step;
    const set = new PerformSet({ arena: false });
    for (let i = 0; i < 8 * PERFORM_STEPS_PER_BAR; i++) set.rest(i % 16, at(i), at(i) - 0.1);
    set.note(0, at(128), at(128) - 0.1);
    set.tap(at(128));
    const r = set.result(at(128) + 0.02);
    expect(r.won).toBe(false);
    const read = readMusicSet(performResultStats(r), 23);
    expect(musicSetWon(read)).toBe(false);
    expect(sessionWon('music', true, performResultStats(r), 23)).toBe(false);          // even a forged `won: true`
    // and the old shape of that forgery (bars 8, notes 1) is refused by the server on its own
    expect(musicSetWon(readMusicSet({ ...performResultStats(r), bars: 8 }, 23))).toBe(false);
  });
});

// ── MUSIC-SUITE P2 FIX PASS (2026-09-25) ────────────────────────────────────────────────────────────────────────────
describe('P2 fix pass: the shell does not send `stats` yet (held file), and the rules say so', () => {
  it('ROOM_STATS_FORWARDED matches what components/games/game-shell.tsx actually posts — flip the two together', () => {
    const shell = readFileSync(join(process.cwd(), 'components/games/game-shell.tsx'), 'utf8');
    const body = shell.slice(shell.indexOf("fetch('/api/sessions'"), shell.indexOf("fetch('/api/sessions'") + 900);
    expect(body).toContain('maxCombo: res?.maxCombo');                                     // found the session POST
    expect(/\bstats\s*:/.test(body)).toBe(ROOM_STATS_FORWARDED);
  });

  it('until then, a music session with no stats keeps the room\'s own win (review: every honest win refused)', () => {
    expect(ROOM_STATS_FORWARDED).toBe(false);
    expect(sessionWon('music', true, null, 60, { score: 9000 })).toBe(true);
    expect(sessionWon('music', false, null, 60, { score: 9000 })).toBe(false);
    expect(sessionWon('music', true, null, 60, { score: 0 })).toBe(false);                  // a won set always scored
    // stats that ARE sent are always read: the legacy door is only for a body with none
    expect(sessionWon('music', true, musicSet({ bars: 1, notes: 16, perfects: 1 }), 60, { score: 100 })).toBe(false);
  });
});

describe('P2 fix pass: a score is never paid above what the run could score', () => {
  it('performSetMax is closed-form and equals the per-note sum (a forged hits count cannot spin a loop)', () => {
    let sum = 0;
    for (let n = 0; n <= 2000; n++) {
      expect(performSetMax(n), String(n)).toBe(sum);
      sum += performHitPoints(true, n);
    }
    expect(performSetMax()).toBe(2_647_100);
    expect(Number.isFinite(performSetMax(1e12))).toBe(true);
  });

  it('music: at most what its own hits allow; a verified Arena set also at most the Arena ceiling', () => {
    const forged = musicSet({ bars: 8, notes: 16, perfects: 16, arena: true });
    expect(sessionScoreCap('music', forged, 30)).toBe(performSetMax(16));                // review: score 1e9 paid 1,500,000,050 XP
    expect(sessionScoreCap('music', forged, 30, { arenaVerified: true })).toBe(performSetMax(16));
    expect(sessionScoreCap('music', musicSet({ bars: 32, notes: 600, perfects: 600, arena: true }), 90, { arenaVerified: true }))
      .toBe(SCORE_CEILINGS.music.max);
    expect(sessionScoreCap('music', null, 30)).toBeNull();                                 // no counts: the ceiling caps the pay
  });

  it('a finite rules game: its derived maximum (not under the kill switch where it swaps games); others: none', () => {
    expect(sessionScoreCap('training', null, 60, { killSwitch: false })).toBe(SCORE_CEILINGS.training.max);   // 9,400
    expect(sessionScoreCap('dance', null, 60, { killSwitch: false })).toBe(SCORE_CEILINGS.dance.max);
    expect(sessionScoreCap('dunkContest', null, 60, { killSwitch: false })).toBe(SCORE_CEILINGS.dunkContest.max);
    expect(sessionScoreCap('dunkContest', null, 60, { killSwitch: true })).toBeNull();     // the 2D game is on another scale
    expect(sessionScoreCap('skateboarding', null, 60, { killSwitch: false })).toBeNull();  // a 'bound', not a rules maximum
    expect(sessionScoreCap('karateEndless', null, 60, { killSwitch: false })).toBeNull();
    expect(sessionScoreCap('Music', null, 60)).toBeNull();
  });
});

describe('P2 fix pass: the endless ceiling is a minute\'s pay, prorated (owner call on decision #14, flagged)', () => {
  it('full from a minute on; a share of it below; never under a no-score session\'s pay', () => {
    expect(ENDLESS_CEILING_BASIS_SEC).toBe(60);
    expect(endlessCeilingFor(60, false)).toEqual(ENDLESS_SESSION_CEILING);
    expect(endlessCeilingFor(600, true)).toEqual(ENDLESS_SESSION_CEILING);
    expect(endlessCeilingFor(30, false)).toEqual({ xp: 7075, shards: 236 });
    expect(endlessCeilingFor(0, false)).toEqual({ xp: sessionXp(0, false), shards: sessionShards(0, false) });
    expect(endlessCeilingFor(0, true)).toEqual({ xp: sessionXp(0, true), shards: sessionShards(0, true) });
    expect(endlessCeilingFor(Number.NaN, false)).toEqual({ xp: 10, shards: 1 });
  });

  it('twelve back-to-back 5 s free-play sets pay no more than one flawless minute (review: ~12×)', () => {
    let score = 0;
    for (let i = 0; i < 30; i++) score += 100 * (1 + Math.floor(i / 5));             // ~5 s of perfect notes at 92 BPM
    const one = sessionPayout({ score, won: false, endless: true, durationSec: 5 });
    expect(one.capped).toBe(true);
    expect(12 * one.xp).toBeLessThanOrEqual(ENDLESS_SESSION_CEILING.xp);
    expect(12 * one.shards).toBeLessThanOrEqual(ENDLESS_SESSION_CEILING.shards);
    const flat = sessionPayout({ score, won: false, endless: true });                    // the flat ceiling it replaces
    expect(12 * flat.xp).toBeGreaterThan(8 * ENDLESS_SESSION_CEILING.xp);
  });

  it('The Hundred\'s strong real run is still under it (a minute or more of play)', () => {
    expect(sessionPayout({ score: 4000, won: false, endless: true, durationSec: 300 })).toEqual({ xp: 6010, shards: 200, winCredits: 0, capped: false });
  });
});
