// A BETTER SCAN MUST NOT BUY AN EASIER GAME (2026-09-14).
//
// Tying health to PRQ is one small step from turning a fitness score into a difficulty setting: make ELITE
// meaningfully tankier and the athlete with the better scan plays a softer version of the fight, while the
// person the app calls RECOVERING — which is what it says when you are tired or coming back from
// something — gets the hardest one. That is backwards, and these tests are the guard on it: the whole
// spread is a fifth of a pool, the guest default is never a penalty, and nothing can produce an
// unplayable fighter.

import { describe, it, expect } from 'vitest';
import { prqMaxHp, prqSpeedMult, prqVitalsLine, HP_MULT, GUEST_BAND, MIN_MAX_HP, MIN_SPEED_MULT, MAX_SPEED_MULT } from './PrqVitals';
import { prqGrade } from '../../prq';

const BANDS = ['RECOVERING', 'READY', 'PRIMED', 'ELITE'] as const;

describe('PrqVitals — the pool', () => {
  it('treats a guest as READY, not as a penalty and not as zero', () => {
    expect(GUEST_BAND).toBe('READY');
    expect(HP_MULT[GUEST_BAND]).toBe(1);
    expect(prqMaxHp(100, null)).toBe(prqMaxHp(100, 'READY'));
    expect(prqMaxHp(100, undefined)).toBe(100);
  });

  // THE POINT OF THE FILE.
  it('keeps the whole spread inside a fifth of a pool', () => {
    const lo = Math.min(...BANDS.map((b) => HP_MULT[b]));
    const hi = Math.max(...BANDS.map((b) => HP_MULT[b]));
    // 1.12 - 0.92 is 0.20000000000000018 in binary floating point, so the epsilon is about the
    // arithmetic and not about the budget: the spread really is a fifth.
    expect(hi - lo).toBeLessThanOrEqual(0.2 + 1e-9);
  });

  it('never makes RECOVERING a punishment — it is when the game should be gentler, not harsher', () => {
    expect(HP_MULT.RECOVERING).toBeGreaterThan(0.85);
  });

  it('rises with the band, in order', () => {
    for (let i = 1; i < BANDS.length; i++) expect(HP_MULT[BANDS[i]]).toBeGreaterThan(HP_MULT[BANDS[i - 1]]);
  });

  it('never returns an unplayable fighter, whatever it is handed', () => {
    for (const base of [100, 0, -50, NaN, Infinity]) {
      for (const b of [...BANDS, null, undefined, 'NONSENSE' as 'READY']) {
        expect(prqMaxHp(base, b)).toBeGreaterThanOrEqual(MIN_MAX_HP);
      }
    }
  });

  it('returns whole numbers — a health pool of 106.08 is not a thing', () => {
    for (const b of BANDS) expect(Number.isInteger(prqMaxHp(100, b))).toBe(true);
  });
});

describe('PrqVitals — the speed', () => {
  // Two tables for one idea is how they end up disagreeing.
  it('reads the grade\'s own speedMult rather than a second table', () => {
    expect(prqSpeedMult(prqGrade(85))).toBeCloseTo(prqGrade(85).speedMult, 9);
    expect(prqSpeedMult(prqGrade(10))).toBeCloseTo(prqGrade(10).speedMult, 9);
  });

  it('is 1 for a guest', () => {
    expect(prqSpeedMult(null)).toBe(1);
    expect(prqSpeedMult(undefined)).toBe(1);
  });

  it('clamps rather than trusting the table to stay sane', () => {
    expect(prqSpeedMult({ speedMult: 99 })).toBe(MAX_SPEED_MULT);
    expect(prqSpeedMult({ speedMult: 0 })).toBe(MIN_SPEED_MULT);
    expect(prqSpeedMult({ speedMult: NaN })).toBe(1);
  });

  it('never lets a band stop the fighter moving', () => {
    expect(MIN_SPEED_MULT).toBeGreaterThan(0.5);
  });
});

describe('PrqVitals — the line', () => {
  it('says nothing for a guest rather than printing a zero', () => {
    expect(prqVitalsLine(null)).toBe('');
    expect(prqVitalsLine(undefined)).toBe('');
  });

  it('names the band and its vitality once', () => {
    expect(prqVitalsLine('ELITE')).toContain('ELITE');
    expect(prqVitalsLine('ELITE')).toContain('%');
  });
});
