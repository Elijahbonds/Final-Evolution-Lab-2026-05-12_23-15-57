import { describe, expect, it } from 'vitest';
import { LOOK_MAX_PITCH, LOOK_MAX_YAW, breathCurve, clampLook, smoothTo } from './SecondaryMotion';

describe('breathCurve', () => {
  it('starts and ends the cycle empty and peaks at the end of the inhale', () => {
    expect(breathCurve(0)).toBeCloseTo(0, 5);
    expect(breathCurve(0.4)).toBeCloseTo(1, 5);
    expect(breathCurve(1)).toBeCloseTo(0, 5);
  });
  it('is periodic and bounded', () => {
    for (let p = -2; p < 3; p += 0.05) {
      const v = breathCurve(p);
      expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1);
      expect(v).toBeCloseTo(breathCurve(p + 1), 5);
    }
  });
  it('exhales slower than it inhales (the exhale half occupies 60% of the cycle)', () => {
    // halfway down the exhale sits at 0.7, not 0.7-ish by accident
    expect(breathCurve(0.7)).toBeCloseTo(0.5, 5);
    expect(breathCurve(0.2)).toBeCloseTo(0.5, 5);
  });
});

describe('clampLook', () => {
  it('passes small angles through and clamps large ones to the neck range', () => {
    expect(clampLook(0.3, -0.2)).toEqual({ yaw: 0.3, pitch: -0.2 });
    expect(clampLook(3, 2)).toEqual({ yaw: LOOK_MAX_YAW, pitch: LOOK_MAX_PITCH });
    expect(clampLook(-3, -2)).toEqual({ yaw: -LOOK_MAX_YAW, pitch: -LOOK_MAX_PITCH });
  });
});

describe('smoothTo', () => {
  it('halves the gap every half-life regardless of frame rate', () => {
    expect(smoothTo(0, 1, 0.1, 0.1)).toBeCloseTo(0.5, 6);
    let v60 = 0; for (let i = 0; i < 6; i++) v60 = smoothTo(v60, 1, 1 / 60, 0.1);
    let v30 = 0; for (let i = 0; i < 3; i++) v30 = smoothTo(v30, 1, 1 / 30, 0.1);
    expect(v60).toBeCloseTo(v30, 6);
  });
});
