import { describe, expect, it } from 'vitest';
import { OOP_LOB_FLIGHT_SEC, OOP_LATE_CATCH_CLIP_T, OOP_WINDUP_SEC, lobApexOver, oopThrowDue, slamImpact, whiffWhy, SLAM_HITSTOP_MS, SLAM_SHAKE, SLAM_SHAKE_MS, SLAM_HITSTOP_BIG_MS, SLAM_SHAKE_BIG, timeToFloor } from './DunkFlagship';
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
  it('Phase 3: an early take-off still gets a lob — thrown on the take-off frame to the hang beat, it is FALLING at the hand', () => {
    // the rig's early take-offs: the ball leaves the passer ~1.9 m up for a ~3.4 m catch. The old fallback (0.35 s at 0.9 × the
    // rise) met the hand still climbing; the late beat's ~0.78 s flight tops out first and drops in.
    const vyAtCatch = (y0: number, y1: number, tf: number) => (y1 - y0) / tf - (9.81 * tf) / 2;
    const tf = OOP_LATE_CATCH_CLIP_T - 0.02;
    expect(vyAtCatch(1.9, 3.4, 0.35)).toBeGreaterThan(2);    // the bullet: still rising 2.6 m/s into the hand
    expect(vyAtCatch(1.9, 3.4, tf)).toBeLessThan(-1.5);      // the lob: falling ~1.9 m/s
    expect(lobApexOver(1.9, 3.4, tf)).toBeGreaterThan(0.15); // and it topped out ~0.18 m over the catch first
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

describe('DunkFlagship Phase 2 — the landing arrives with its fall', () => {
  it('times the floor under gravity from a height and a downward speed', () => {
    expect(timeToFloor(0, 3)).toBe(0);
    expect(timeToFloor(1.2263, 0)).toBeCloseTo(0.5, 3);            // ½ g t² = 1.2263 at t 0.5
    expect(timeToFloor(0.5, 5)).toBeLessThan(0.5 / 5);             // still accelerating: sooner than at a constant 5 m/s
    expect(timeToFloor(0.5, 5)).toBeGreaterThan(0.08);
  });
});

describe('DunkFlagship Phase 3 — the passer winds up, then lobs', () => {
  it('starts the toss OOP_WINDUP_SEC before the release, and both land before the catch beat on any run that charges in time', () => {
    for (const runLeft of [3, 2, 1.2, 0.9, 0.5]) {
      const windupDue = oopThrowDue(runLeft, LOB_CATCH_CLIP_T, OOP_LOB_FLIGHT_SEC + OOP_WINDUP_SEC);
      const throwDue = oopThrowDue(runLeft, LOB_CATCH_CLIP_T, OOP_LOB_FLIGHT_SEC);
      if (throwDue) expect(windupDue).toBe(true);   // never a release before its wind-up
    }
    expect(OOP_WINDUP_SEC).toBe(0.5);               // the toss clip's arms-overhead key
  });
});

describe('DunkFlagship Phase 4 — a whiff always says why', () => {
  const toRim = { x: 0, z: -1 };   // the run goes toward −z
  it('names the side the ball went by the hand (the largest offset)', () => {
    expect(whiffWhy({ x: 0.1, y: 0.9, z: -0.2 }, toRim)).toBe('TOO HIGH');
    expect(whiffWhy({ x: 0, y: -0.8, z: 0.3 }, toRim)).toBe('TOO LOW');
    expect(whiffWhy({ x: 0.2, y: 0.3, z: -1.1 }, toRim)).toBe('OUT AHEAD');     // nearer the rim than the hand
    expect(whiffWhy({ x: -0.1, y: 0.2, z: 0.9 }, toRim)).toBe('BEHIND YOU');
    expect(whiffWhy({ x: 1.0, y: 0.2, z: 0.1 }, toRim)).toBe('WIDE');
  });
  it('reads the run\'s own direction (a run from the wing), and says NEVER IN REACH with no sample', () => {
    expect(whiffWhy({ x: -0.7, y: 0, z: -0.7 }, { x: -1, z: -1 })).toBe('OUT AHEAD');
    expect(whiffWhy(null, toRim)).toBe('NEVER IN REACH');
    expect(whiffWhy({ x: Number.NaN, y: 0, z: 0 }, toRim)).toBe('NEVER IN REACH');
  });
});
