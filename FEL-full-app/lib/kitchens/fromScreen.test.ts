import { describe, expect, it } from 'vitest';
import { MIN_FILL_CONFIDENCE, fillFromScan, fillSummary } from './fromScreen';
import type { SquatScan } from './squatScan';
import type { MovementMetrics } from '@/lib/workout/movement-screen';

const MINE: MovementMetrics = {
  jumpHeightCm: 62, depthDeg: 95, asymmetryPct: 4, valgusL: 0.1, valgusR: 0.1, cadenceSpm: 168, trunkLeanDeg: 12,
};
const scan = (o: Partial<SquatScan> = {}): SquatScan => ({
  audit: { present: true, phase: 'bottom', depth01: 1, faults: [], valgusRatio: 0, lateralDrift: 0, note: '' },
  faults: [], depthDeg: 108, valgusL: 0.42, valgusR: 0.08, trunkLeanDeg: 31, asymmetryPct: 14,
  usableFrames: 40, bottomAtMs: 900, confidence: 0.95, ...o,
});

describe('the screen fills the Fuel floor', () => {
  it('writes what the squat measured and leaves the rest alone', () => {
    const f = fillFromScan(MINE, scan());
    expect(f.applied).toBe(true);
    expect(f.metrics.valgusL).toBeCloseTo(0.42);
    expect(f.metrics.depthDeg).toBe(108);
    expect(f.metrics.jumpHeightCm).toBe(62);      // untouched
    expect(f.metrics.cadenceSpm).toBe(168);       // untouched
  });

  it('names which fields a squat cannot see, instead of implying a full scan', () => {
    const f = fillFromScan(MINE, scan());
    expect(f.stillManual).toEqual(['jumpHeightCm', 'cadenceSpm']);
    expect(fillSummary(f)).toMatch(/5 of 7/);
    expect(fillSummary(f)).toMatch(/a squat cannot see them/i);
  });

  it('a thin scan writes NOTHING — a guess must not overwrite a number typed on purpose', () => {
    const f = fillFromScan(MINE, scan({ confidence: MIN_FILL_CONFIDENCE - 0.01 }));
    expect(f.applied).toBe(false);
    expect(f.metrics).toEqual(MINE);
    expect(f.measured).toEqual([]);
    expect(fillSummary(f)).toMatch(/no scan yet/i);
  });

  it('no scan at all is the same as a thin one', () => {
    expect(fillFromScan(MINE, null).metrics).toEqual(MINE);
  });
});
