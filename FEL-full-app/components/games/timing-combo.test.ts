// MUSIC-SUITE P6 (2026-09-25): THE CYPHER'S SESSION ROW CARRIES ITS BEST STREAK. The timing host posted the clean-hit
// count as maxCombo for every mode (P2 report, 'Dance maxCombo on the session row'); dance sends its real best streak.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { timingMaxCombo } from './timing-combo';
import { stripComments } from '@/lib/testing/sourceScan';

const src = (rel: string) => stripComments(readFileSync(join(__dirname, '..', '..', rel), 'utf8'));

describe('timingMaxCombo', () => {
  it("dance: the run's best streak, not its clean hits (40 clean, one miss mid-run, chained 20 at best)", () => {
    // the stats DanceMode.ts ends with (hits = PERFECT + GREAT + GOOD, maxCombo = DanceCore's best streak)
    const dance = { hits: 40, rounds: 41, stars: 4, accuracy: 88, maxCombo: 20, perfect: 22, great: 12, good: 6, miss: 1 };
    expect(timingMaxCombo(dance)).toBe(20);
    expect(timingMaxCombo({ ...dance, maxCombo: 40, miss: 0, rounds: 40 })).toBe(40);   // a clean run: the two agree
  });

  it('a dance with no streak at all posts 0, never its hit count', () => {
    expect(timingMaxCombo({ hits: 0, rounds: 12, maxCombo: 0 })).toBe(0);
    expect(timingMaxCombo({ hits: 3, rounds: 12, maxCombo: 0 })).toBe(0);   // taken at its word, not "0 means missing"
  });

  it('the other five timing modes send no maxCombo and post their clean hits exactly as before', () => {
    expect(timingMaxCombo({ hits: 7, rounds: 10 })).toBe(7);          // what n('hits') gave
    expect(timingMaxCombo({ homers: 3, outs: 2 })).toBe(0);
    expect(timingMaxCombo({})).toBe(0);
    expect(timingMaxCombo(null)).toBe(0);
    expect(timingMaxCombo(undefined)).toBe(0);
  });

  it('a malformed figure is clamped or ignored, never NaN', () => {
    expect(timingMaxCombo({ hits: 5, maxCombo: 12.7 })).toBe(12);
    expect(timingMaxCombo({ hits: 5, maxCombo: -3 })).toBe(0);
    expect(timingMaxCombo({ hits: 5, maxCombo: Number.NaN })).toBe(5);
    expect(timingMaxCombo({ hits: 5, maxCombo: '9' })).toBe(5);        // only a number is a streak
  });

  it('the host posts it, and dance is still the one timing mode that sends its own', () => {
    const host = src('components/games/timing-babylon.tsx');
    expect(host).toContain('maxCombo: timingMaxCombo(st)');
    expect(host).not.toContain("maxCombo: n('hits')");
    expect(src('lib/babylon/modes/DanceMode.ts')).toContain('maxCombo: r.maxCombo,');
    for (const f of ['lib/babylon/modes/NetSportMode.ts', 'lib/babylon/modes/TennisMode.ts', 'lib/babylon/modes/VolleyballMode.ts', 'lib/babylon/modes/precisionModes.ts']) {
      expect(src(f), f).not.toMatch(/maxCombo/);   // tennis, volleyball, golf, derby, penalty: unchanged rows
    }
  });
});
