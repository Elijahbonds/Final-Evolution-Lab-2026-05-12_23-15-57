// VEHICLE MOTION tests (10-phase pass, phase 9): the pure maths behind the wheel spin, the steer, the
// suspension bob, the exhaust rate and the prop blur.

import { describe, expect, it } from 'vitest';
import {
  BOB, EXHAUST_RATE, PROP_BLUR, RIVAL_STEER_RATE, WHEEL_STEER_LOCK,
  bobAmp, bobFreq, exhaustRate, frontWheelAngle, propBlurK, rivalSteer, wheelAngle, wrapPi,
} from './vehicleMotion';

describe('frontWheelAngle', () => {
  it('follows the applied steer and clamps at the lock', () => {
    expect(frontWheelAngle(0)).toBe(0);
    expect(frontWheelAngle(0.5)).toBeCloseTo(WHEEL_STEER_LOCK / 2, 6);
    expect(frontWheelAngle(1)).toBeCloseTo(WHEEL_STEER_LOCK, 6);
    expect(frontWheelAngle(-1)).toBeCloseTo(-WHEEL_STEER_LOCK, 6);
    expect(frontWheelAngle(3)).toBeCloseTo(WHEEL_STEER_LOCK, 6);   // clamped, not amplified
  });
});

describe('wheelAngle', () => {
  it('turns one revolution per circumference travelled', () => {
    expect(wheelAngle(Math.PI * 2 * 0.32, 0.32)).toBeCloseTo(0, 6);        // one full turn wraps to 0
    expect(wheelAngle((Math.PI * 0.32) / 2, 0.32)).toBeCloseTo(Math.PI / 2, 6);  // a quarter turn
  });
  it('a fatter tyre turns slower for the same road speed', () => {
    expect(wheelAngle(0.5, 0.32)).toBeLessThan(wheelAngle(0.5, 0.28));
  });
  it('never runs away on a long race', () => {
    const a = wheelAngle(1e6, 0.28);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(Math.PI * 2);
  });
});

describe('wrapPi / rivalSteer', () => {
  it('reads a wrap past ±π as the small turn, not the big one', () => {
    expect(wrapPi(-Math.PI - 0.1)).toBeCloseTo(Math.PI - 0.1, 5);
    expect(wrapPi(Math.PI + 0.1)).toBeCloseTo(-Math.PI + 0.1, 5);
  });
  it('maps turn rate onto the lock and clamps', () => {
    expect(rivalSteer(0)).toBe(0);
    expect(rivalSteer(RIVAL_STEER_RATE / 2)).toBeCloseTo(0.5, 6);
    expect(rivalSteer(RIVAL_STEER_RATE * 3)).toBe(1);
    expect(rivalSteer(-RIVAL_STEER_RATE * 3)).toBe(-1);
  });
});

describe('suspension bob', () => {
  it('is silent at a standstill on tarmac and alive at speed', () => {
    expect(bobAmp(0, false)).toBe(0);
    expect(bobAmp(1, false)).toBeCloseTo(BOB.roadAmp, 6);
  });
  it('is bigger off-road than on, but stays a bob and not a hop', () => {
    expect(bobAmp(1, true)).toBeGreaterThan(bobAmp(1, false));
    expect(bobAmp(1, true)).toBeLessThan(0.08);
  });
  it('quickens with speed within its bounds', () => {
    expect(bobFreq(0)).toBe(BOB.freqIdle);
    expect(bobFreq(1)).toBe(BOB.freqTop);
    expect(bobFreq(3)).toBe(BOB.freqTop);   // clamped
  });
});

describe('exhaustRate', () => {
  it('putters at idle and streams at full throttle', () => {
    expect(exhaustRate(0)).toBe(EXHAUST_RATE.idle);
    expect(exhaustRate(1)).toBe(EXHAUST_RATE.full);
    expect(exhaustRate(0.5)).toBeCloseTo((EXHAUST_RATE.idle + EXHAUST_RATE.full) / 2, 6);
  });
  it('stays inside the particle budget (rate × longest life < capacity)', () => {
    expect(EXHAUST_RATE.full * 0.5).toBeLessThan(48);
  });
});

describe('propBlurK', () => {
  const FROM = 34, TO = 58;
  it('is clear below the gate and fully smeared past it', () => {
    expect(propBlurK(0, FROM, TO)).toBe(0);
    expect(propBlurK(FROM, FROM, TO)).toBe(0);
    expect(propBlurK(TO, FROM, TO)).toBe(1);
    expect(propBlurK(TO * 2, FROM, TO)).toBe(1);
  });
  it('ramps linearly between', () => {
    expect(propBlurK((FROM + TO) / 2, FROM, TO)).toBeCloseTo(0.5, 6);
  });
  it('the disc never reads as a solid plate and the blades never vanish outright', () => {
    expect(PROP_BLUR.discAlpha).toBeLessThan(0.7);
    expect(PROP_BLUR.bladeFade).toBeLessThan(1);
  });
});
