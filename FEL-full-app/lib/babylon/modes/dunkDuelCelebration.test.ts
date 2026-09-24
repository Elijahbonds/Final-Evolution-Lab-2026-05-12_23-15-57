// THE DUEL'S MAKE CELEBRATION (finish-release, 2026-09-24).
//
// Dunk Duel gated its crowd cheer + confetti on `dunkTotal >= 27`: the THREE-judge eruption band, left behind when the
// panel went to five judges (raw 30–50). Five judges never card a made dunk under 30, so the gate was always open and a 31
// got the same celebration as a 50. The gate is the contest's band now (BAND_TOTAL.eruption, the same one DunkMode reads),
// and this pins both the arithmetic and the duel's use of it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BAND_TOTAL, MIN_TOTAL, PERFECT_TOTAL, totalBand } from '../core/JudgePanel';

const DUEL = readFileSync(path.join(__dirname, 'DunkDuelMode.ts'), 'utf8');

describe('dunk duel: the make celebration', () => {
  it('the old 27 sits under the five-judge floor — it let every make through', () => {
    expect(MIN_TOTAL).toBeGreaterThan(27);
  });

  it('the contest band is inside the five-judge range: a floor make is not an eruption, a perfect one is', () => {
    expect(totalBand(MIN_TOTAL)).not.toBe('eruption');
    expect(totalBand(BAND_TOTAL.eruption - 1)).not.toBe('eruption');
    expect(totalBand(PERFECT_TOTAL)).toBe('eruption');
  });

  it('gates its cheer + confetti on BAND_TOTAL.eruption, never a bare number', () => {
    const gates = [...DUEL.matchAll(/if \(dunkTotal\s*>=\s*([^)]+)\)/g)].map((m) => m[1].trim());
    expect(gates).toEqual(['BAND_TOTAL.eruption']);
  });

  it('the header names the panel the duel is judged by', () => {
    const header = DUEL.slice(0, DUEL.indexOf('import '));
    expect(header).not.toMatch(/three judges/i);
    expect(header).toMatch(/five judges/i);
  });
});
