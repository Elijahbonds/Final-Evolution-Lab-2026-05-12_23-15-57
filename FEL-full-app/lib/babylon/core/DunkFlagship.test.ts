import { describe, expect, it } from 'vitest';
import { OOP_LOB_FLIGHT_SEC, lobApexOver, oopThrowDue, slamImpact, SLAM_HITSTOP_MS, SLAM_SHAKE, SLAM_SHAKE_MS, SLAM_HITSTOP_BIG_MS, SLAM_SHAKE_BIG } from './DunkFlagship';
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

describe('DunkFlagship (c) — the iron answers how hard it was hit', () => {
  it('an ordinary make keeps the shipped beat exactly', () => {
    for (const a of [0, 0.2, 0.5]) expect(slamImpact(a, false)).toEqual({ hitStopMs: SLAM_HITSTOP_MS, shake: SLAM_SHAKE, shakeMs: SLAM_SHAKE_MS });
    expect(slamImpact(Number.NaN, false).hitStopMs).toBe(SLAM_HITSTOP_MS);
  });
  it('grows with the slam, to the big beat at a perfect one, never past it', () => {
    let prev = 0;
    for (let a = 0.5; a <= 1.0001; a += 0.05) { const b = slamImpact(a, false); expect(b.hitStopMs).toBeGreaterThanOrEqual(prev); prev = b.hitStopMs; }
    expect(slamImpact(1, false)).toEqual({ hitStopMs: SLAM_HITSTOP_BIG_MS, shake: SLAM_SHAKE_BIG, shakeMs: 180 });
    expect(slamImpact(1, true).hitStopMs).toBe(SLAM_HITSTOP_BIG_MS);
    expect(slamImpact(0.6, true).hitStopMs).toBeGreaterThan(slamImpact(0.6, false).hitStopMs);   // a hang hits the iron with the body too
  });
});
