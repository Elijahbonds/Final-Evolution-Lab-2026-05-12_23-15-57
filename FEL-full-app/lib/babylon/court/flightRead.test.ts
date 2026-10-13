import { describe, expect, it } from 'vitest';
import { apexOf, carryFlat, exitRead, flatDist, launchAngleDeg, readoutScale, speedOf, tracerLine, wholeM } from './flightRead';

describe('flight read', () => {
  it('flat distance ignores height', () => {
    expect(flatDist({ x: 0, y: 5, z: 0 }, { x: 3, y: 0, z: 4 })).toBe(5);
    expect(carryFlat({ x: 0, y: 5, z: 0 }, { x: 3, y: 0, z: 4 })).toBe(5);
  });
  it('apex is the highest sample, height over the launch', () => {
    const a = apexOf([{ x: 0, y: 0.1, z: 0 }, { x: 0, y: 12.1, z: 20 }, { x: 0, y: 3, z: 40 }])!;
    expect(a.at.z).toBe(20); expect(a.height).toBeCloseTo(12, 6);
    expect(apexOf([])).toBeNull();
    expect(apexOf([{ x: 0, y: 1, z: 0 }], 4)!.height).toBe(0);   // never negative
  });
  it('launch angle: flat 0, 45, straight up 90', () => {
    expect(launchAngleDeg({ x: 10, y: 0, z: 0 })).toBeCloseTo(0, 6);
    expect(launchAngleDeg({ x: 3, y: 5, z: 4 })).toBeCloseTo(45, 6);
    expect(launchAngleDeg({ x: 0, y: 7, z: 0 })).toBeCloseTo(90, 6);
  });
  it('the readouts are whole numbers and never negative', () => {
    expect(wholeM(-0.4)).toBe(0); expect(wholeM(12.5)).toBe(13);
    expect(tracerLine(20.6, 185.5)).toBe('APEX 21 m · CARRY 186 m');
    const r = exitRead({ x: 30, y: 30, z: 0 }, 389.6);
    expect(r.mph).toBe(Math.round(Math.hypot(30, 30) * 2.236936)); expect(r.deg).toBe(45); expect(r.ft).toBe(390);
    expect(r.lines[2]).toBe('DISTANCE 390 FT');
    expect(speedOf({ x: 3, y: 4, z: 12 })).toBe(13);
  });
  it('a readout keeps a constant size on screen, within bounds', () => {
    expect(readoutScale(0)).toBe(0.9); expect(readoutScale(1000)).toBe(9);
    expect(readoutScale(40)).toBeGreaterThan(readoutScale(20));
  });
});
