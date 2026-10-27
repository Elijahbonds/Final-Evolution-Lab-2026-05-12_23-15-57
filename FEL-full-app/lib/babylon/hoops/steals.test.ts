// lane/hoops-round2 HOP-01: the 3v3 poke reads the driver's ball like 1v1's — no coin anywhere.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { driveExposure, driveStrip, STEAL_RANGE_M, type DriveStripInput } from './steals';
import { STEAL_EXPOSURE_MIN, EXPOSURE_LATERAL_SPEED } from '../core/BasketballCore';
import { BUMP_STRIP_WINDOW_SEC } from '../core/HoopsDefense';

// driving straight at a rim up -z; lateral = x
const base: DriveStripInput = { moveExposed01: 0, velX: 0, velZ: -4, toRimX: 0, toRimZ: -6, phase: 'drive', bumpAge: Infinity, dist: 1.0 };

describe('driveExposure — the 1v1 read on the 3v3 driver', () => {
  it('a straight-line drive with the ball on his hip is protected', () => {
    expect(driveExposure(base)).toBe(0);
    expect(driveStrip(base).connects).toBe(false);
  });
  it('lateral speed exposes it like the 1v1 weave: |lateral| / EXPOSURE_LATERAL_SPEED, capped at 1', () => {
    expect(driveExposure({ ...base, velX: EXPOSURE_LATERAL_SPEED / 2 })).toBeCloseTo(0.5, 6);
    expect(driveExposure({ ...base, velX: -EXPOSURE_LATERAL_SPEED })).toBeCloseTo(1, 6);
    expect(driveExposure({ ...base, velX: 9 })).toBe(1);
    // the forward component never counts
    expect(driveExposure({ ...base, velZ: -9, velX: 0.1 })).toBeCloseTo(0.1 / EXPOSURE_LATERAL_SPEED, 6);
  });
  it('his crossover exposes it while the ball crosses (the carry move\'s own exposure)', () => {
    expect(driveExposure({ ...base, moveExposed01: 1 })).toBe(1);
    expect(driveStrip({ ...base, moveExposed01: 1 }).connects).toBe(true);
    expect(driveStrip({ ...base, moveExposed01: 0.4 }).connects).toBe(false);
  });
  it('the check and the gather are protected — even mid-crossover, even off a bump', () => {
    for (const phase of ['check', 'gather'] as const) {
      expect(driveExposure({ ...base, phase, moveExposed01: 1, velX: 5 })).toBe(0);
      expect(driveStrip({ ...base, phase, moveExposed01: 1, velX: 5, bumpAge: 0.05 }).connects).toBe(false);
    }
  });
  it('a hard bump opens the strip window in the drive (D2), and only inside it', () => {
    const on = driveStrip({ ...base, bumpAge: 0.1 });
    expect(on.connects).toBe(true); expect(on.onBump).toBe(true);
    expect(driveStrip({ ...base, bumpAge: BUMP_STRIP_WINDOW_SEC + 0.01 }).connects).toBe(false);
  });
  it('out of reach never connects', () => {
    expect(driveStrip({ ...base, moveExposed01: 1, dist: STEAL_RANGE_M }).connects).toBe(false);
    expect(driveStrip({ ...base, moveExposed01: 1, dist: STEAL_RANGE_M - 0.01 }).connects).toBe(true);
  });
  it('the threshold is 1v1\'s STEAL_EXPOSURE_MIN', () => {
    const at = EXPOSURE_LATERAL_SPEED * STEAL_EXPOSURE_MIN;
    expect(driveStrip({ ...base, velX: at + 1e-6 }).connects).toBe(true);
    expect(driveStrip({ ...base, velX: at - 1e-3 }).connects).toBe(false);
  });
});

describe('ThreeVThreeMode wiring', () => {
  const src = readFileSync(join(__dirname, '../modes/ThreeVThreeMode.ts'), 'utf8');
  it('my poke asks driveStrip, and the 30% coin flip is gone', () => {
    expect(src).toMatch(/const strip = driveStrip\(\{/);
    expect(src).toMatch(/if \(strip\.connects\) \{ driveStolen = true;/);
    expect(src).not.toMatch(/roll\(\) < 0\.3\)/);
  });
});
