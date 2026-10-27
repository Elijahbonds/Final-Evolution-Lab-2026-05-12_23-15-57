import { describe, expect, it } from 'vitest';
import { OOP_LOB_FLIGHT_SEC, lobApexOver, oopThrowDue } from './DunkFlagship';
import { LOB_CATCH_CLIP_T } from './DunkLob';

describe('DunkFlagship (b) — the alley-oop is a lob', () => {
  it('is thrown once the run left plus the catch beat fits the lob\'s flight, and at once from a short run', () => {
    expect(oopThrowDue(2.0, LOB_CATCH_CLIP_T, OOP_LOB_FLIGHT_SEC)).toBe(false);          // a long run left: not yet
    expect(oopThrowDue(OOP_LOB_FLIGHT_SEC - LOB_CATCH_CLIP_T, LOB_CATCH_CLIP_T, OOP_LOB_FLIGHT_SEC)).toBe(true);
    expect(oopThrowDue(0.05, LOB_CATCH_CLIP_T, OOP_LOB_FLIGHT_SEC)).toBe(true);           // a run that starts at the line
    expect(oopThrowDue(Number.NaN, LOB_CATCH_CLIP_T, OOP_LOB_FLIGHT_SEC)).toBe(false);
  });
  it('hangs over the catch: the passer\'s hand (1.6 m) to the catch (2.9 m) tops out well above it, where the old pass did not', () => {
    const lob = lobApexOver(1.6, 2.9, OOP_LOB_FLIGHT_SEC), bullet = lobApexOver(1.6, 2.9, 0.35);
    expect(lob).toBeGreaterThan(0.6);
    expect(bullet).toBeLessThan(0.25);   // 0.20 m: a flat pass, ~10 m/s across 3.5 m
  });
});
