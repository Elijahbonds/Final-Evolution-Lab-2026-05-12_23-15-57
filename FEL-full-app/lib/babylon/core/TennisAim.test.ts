import { describe, it, expect } from 'vitest';
import { timingAimOffset, aimFor, landingFor, windDrift, meterBandsFor, TIMING_AIM, WIND_DRIFT_MAX } from './TennisAim';
import { TENNIS, SWING_BANDS } from './RallyCore';

describe('TennisAim — the Wii read', () => {
  it('timing bends the aim: early pulls left, late pushes right, perfect bends nothing', () => {
    expect(timingAimOffset(0)).toBe(0); expect(timingAimOffset(SWING_BANDS.perfect * 0.9)).toBe(0);
    expect(timingAimOffset(-SWING_BANDS.ok)).toBeCloseTo(-TIMING_AIM, 5);
    expect(timingAimOffset(SWING_BANDS.ok * 0.5)).toBeCloseTo(TIMING_AIM * 0.5, 5);
    expect(timingAimOffset(-9)).toBeCloseTo(-TIMING_AIM, 5);   // never past the edge
    expect(aimFor(0.8, SWING_BANDS.ok)).toBe(1);               // clamped to the court
  });
  it('the landing ring is the plan: the aim moves it across, the shot moves it deep or short', () => {
    const from = { x: 0, y: 1, z: TENNIS.halfLength * 0.85 };
    const l = landingFor(TENNIS, from, -1, -1, 'drive')!, r = landingFor(TENNIS, from, -1, 1, 'drive')!;
    expect(r.x - l.x).toBeGreaterThan(TENNIS.halfWidth);
    const drop = landingFor(TENNIS, from, -1, 0, 'drop')!, lob = landingFor(TENNIS, from, -1, 0, 'lob')!;
    expect(Math.abs(drop.z)).toBeLessThan(Math.abs(lob.z));
    expect(landingFor(TENNIS, from, -1, 0, 'drive', 'miss')).toBeNull();
  });
  it('wind drifts a flight sideways, more on a long hang, never past the cap', () => {
    const fast = windDrift({ x: 3, z: 0 }, 0.8), slow = windDrift({ x: 3, z: 0 }, 1.6);
    expect(slow.x).toBeGreaterThan(fast.x); expect(windDrift({ x: 40, z: 0 }, 2).x).toBe(WIND_DRIFT_MAX);
    expect(windDrift({ x: -3, z: 0 }, 1).x).toBeLessThan(0);
  });
  it('the meter bands sit inside the window and nest: perfect inside good inside ok', () => {
    const b = meterBandsFor(1.2);
    expect(b.perfectFrom).toBeGreaterThan(b.goodFrom); expect(b.goodFrom).toBeGreaterThan(b.okFrom); expect(b.perfectFrom).toBeLessThan(1);
    expect(meterBandsFor(0.5).okFrom).toBeLessThan(meterBandsFor(2).okFrom);   // a fast ball's bands are wider on the meter
  });
});
