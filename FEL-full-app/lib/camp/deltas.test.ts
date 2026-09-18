import { describe, expect, it } from 'vitest';
import { latestPerAttribute, numericDelta, prqDelta, toOutcomes } from './deltas';

const d = (s: string) => new Date(s);
describe('Camp deltas', () => {
  it('takes the latest value per attribute at or before a date', () => {
    const e = [
      { attribute: 'speed', value: 60, measuredAt: d('2026-08-01') }, { attribute: 'speed', value: 64, measuredAt: d('2026-08-20') },
      { attribute: 'power', value: 50, measuredAt: d('2026-08-10') }, { attribute: 'speed', value: 70, measuredAt: d('2026-09-01') },
    ];
    expect(latestPerAttribute(e, null)).toEqual({ speed: 70, power: 50 });
    expect(latestPerAttribute(e, d('2026-08-25'))).toEqual({ speed: 64, power: 50 });
    expect(prqDelta(latestPerAttribute(e, d('2026-08-25')), latestPerAttribute(e, null))).toEqual({ speed: 6, power: 0 });
  });
  it('only reports attributes present on both sides', () => {
    expect(prqDelta({ speed: 1 }, { speed: 2.555, mental: 9 })).toEqual({ speed: 1.56 });
  });
  it('walks nested numeric leaves and ignores flags and strings', () => {
    const a = { pillars: { power: 40, mobility: 55 }, flags: ['x'], grade: 'B' };
    const b = { pillars: { power: 46, mobility: 52 }, flags: ['x', 'y'], grade: 'A' };
    expect(numericDelta(a, b)).toEqual({ 'pillars.power': 6, 'pillars.mobility': -3 });
    expect(numericDelta(null, b)).toEqual({});
  });
  it('maps game sessions to resiliency outcomes', () => {
    expect(toOutcomes([{ mode: 'dunk', won: false, createdAt: d('2026-09-01') }])).toEqual([{ at: d('2026-09-01').getTime(), modeKey: 'dunk', outcome: 'loss' }]);
  });
});
