import { describe, expect, it } from 'vitest';
import {
  computeBaseline, compareToBaseline, compareToRecent, describeBaseline, recordCheckValues, readCheckValues,
  type BaselineSessionRow,
} from './baselines';

function row(patternId: string, daysAgo: number, values: Record<string, number> | null, extraFaultCounts: Record<string, unknown> = {}): BaselineSessionRow {
  const faultCounts = values == null ? extraFaultCounts : recordCheckValues(extraFaultCounts, values);
  return { patternId, createdAt: new Date(Date.now() - daysAgo * 86_400_000), faultCounts };
}

describe('recordCheckValues / readCheckValues', () => {
  it('is additive: existing zone-keyed counts survive untouched', () => {
    const existing = { kneeIn: 2, hipDrop: 0 };
    const merged = recordCheckValues(existing, { 'carry.hipHike:left': 0.12 });
    expect(merged.kneeIn).toBe(2);
    expect(merged.hipDrop).toBe(0);
    expect(readCheckValues(merged)).toEqual({ 'carry.hipHike:left': 0.12 });
    // the original object passed in is not mutated
    expect(existing).toEqual({ kneeIn: 2, hipDrop: 0 });
  });

  it('reads null off a row that never stored any (an old session, or one with no faultCounts at all)', () => {
    expect(readCheckValues({ kneeIn: 1 })).toBeNull();
    expect(readCheckValues(null)).toBeNull();
    expect(readCheckValues(undefined)).toBeNull();
    expect(readCheckValues('not an object')).toBeNull();
  });

  it('drops non-numeric or non-finite junk rather than propagating it into a median', () => {
    const merged = recordCheckValues({}, { good: 1 });
    (merged._checkValues as Record<string, unknown>).bad = 'nope';
    (merged._checkValues as Record<string, unknown>).nan = NaN;
    expect(readCheckValues(merged)).toEqual({ good: 1 });
  });
});

describe('computeBaseline', () => {
  it('is the median of the first 3 readable sessions, oldest first, however many rows are handed in', () => {
    const history = [
      row('carry', 10, { hipHike: 0.10 }),
      row('carry', 9, { hipHike: 0.14 }),
      row('carry', 8, { hipHike: 0.30 }),
      row('carry', 1, { hipHike: 0.90 }),   // a 4th, much later session — must NOT move the baseline
    ];
    const b = computeBaseline('carry', history);
    expect(b.sessionsUsed).toBe(3);
    expect(b.checks.hipHike.median).toBeCloseTo(0.14, 5);   // median of [0.10, 0.14, 0.30]
    expect(b.checks.hipHike.n).toBe(3);
  });

  it('does not care what order the rows arrive in — it sorts by createdAt itself', () => {
    const history = [
      row('carry', 1, { hipHike: 0.90 }),
      row('carry', 10, { hipHike: 0.10 }),
      row('carry', 8, { hipHike: 0.30 }),
      row('carry', 9, { hipHike: 0.14 }),
    ];
    expect(computeBaseline('carry', history).checks.hipHike.median).toBeCloseTo(0.14, 5);
  });

  it('only counts sessions of the SAME pattern', () => {
    const history = [
      row('squat', 10, { kneeIn: 5 }),
      row('carry', 9, { hipHike: 0.2 }),
      row('carry', 8, { hipHike: 0.2 }),
    ];
    const b = computeBaseline('carry', history);
    expect(b.sessionsUsed).toBe(2);
    expect(b.checks.kneeIn).toBeUndefined();
  });

  it('skips a session that recorded nothing at all (every check came back unreadable that day)', () => {
    const history = [
      row('carry', 10, { hipHike: 0.10 }),
      row('carry', 9, null),                 // no faultCounts._checkValues written
      row('carry', 8, {}),                   // wrote an empty bag — same idea
      row('carry', 7, { hipHike: 0.20 }),
      row('carry', 6, { hipHike: 0.30 }),
    ];
    const b = computeBaseline('carry', history);
    expect(b.sessionsUsed).toBe(3);          // the 3 that actually recorded something
    expect(b.checks.hipHike.median).toBeCloseTo(0.20, 5);
  });

  it("a check missing from one of the first 3 sessions still gets a baseline from however many DID have it", () => {
    const history = [
      row('carry', 10, { hipHike: 0.10 }),                              // shoulderShrug unreadable this session
      row('carry', 9, { hipHike: 0.20, shoulderShrug: 0.05 }),
      row('carry', 8, { hipHike: 0.30, shoulderShrug: 0.09 }),
    ];
    const b = computeBaseline('carry', history);
    expect(b.checks.hipHike.n).toBe(3);
    expect(b.checks.shoulderShrug.n).toBe(2);
    expect(b.checks.shoulderShrug.median).toBeCloseTo(0.07, 5);
  });

  it('an athlete with no history yet gets an empty baseline, not a crash', () => {
    const b = computeBaseline('carry', []);
    expect(b.sessionsUsed).toBe(0);
    expect(b.checks).toEqual({});
  });
});

describe('compareToBaseline', () => {
  const baseline = computeBaseline('carry', [
    row('carry', 10, { hipHike: 0.20, rhythm: 0.80 }),
    row('carry', 9, { hipHike: 0.20, rhythm: 0.80 }),
    row('carry', 8, { hipHike: 0.20, rhythm: 0.80 }),
  ]);

  it('reports "building" with the count so far when fewer than 3 sessions exist for this check', () => {
    const partial = computeBaseline('carry', [row('carry', 1, { hipHike: 0.5 })]);
    const cmp = compareToBaseline(0.5, 'hipHike', 'lowerIsBetter', partial);
    expect(cmp).toEqual({ kind: 'building', sessionsUsed: 1, need: 3 });
  });

  it('reports "building" (0/3) with no baseline object at all', () => {
    expect(compareToBaseline(0.5, 'hipHike', 'lowerIsBetter', undefined)).toEqual({ kind: 'building', sessionsUsed: 0, need: 3 });
  });

  it('a value near the median reads "same" regardless of direction', () => {
    expect(compareToBaseline(0.205, 'hipHike', 'lowerIsBetter', baseline)).toMatchObject({ kind: 'compared', status: 'same' });
    expect(compareToBaseline(0.805, 'rhythm', 'higherIsBetter', baseline)).toMatchObject({ kind: 'compared', status: 'same' });
  });

  it('lowerIsBetter: a smaller value than the baseline is "better", a bigger one "worse"', () => {
    expect(compareToBaseline(0.05, 'hipHike', 'lowerIsBetter', baseline)).toMatchObject({ status: 'better' });
    expect(compareToBaseline(0.50, 'hipHike', 'lowerIsBetter', baseline)).toMatchObject({ status: 'worse' });
  });

  it('higherIsBetter: a bigger value than the baseline is "better", a smaller one "worse" (steadiness-style checks)', () => {
    expect(compareToBaseline(0.95, 'rhythm', 'higherIsBetter', baseline)).toMatchObject({ status: 'better' });
    expect(compareToBaseline(0.10, 'rhythm', 'higherIsBetter', baseline)).toMatchObject({ status: 'worse' });
  });

  it('never returns an ok/fault/unreadable status — only a comparison (baselines never pay or grade)', () => {
    const cmp = compareToBaseline(999, 'hipHike', 'lowerIsBetter', baseline);
    expect(cmp).not.toHaveProperty('status', 'ok');
    expect(cmp).not.toHaveProperty('status', 'fault');
    expect(cmp).not.toHaveProperty('status', 'unreadable');
  });
});

describe('describeBaseline', () => {
  it('renders the building phrase with the n/3 count', () => {
    expect(describeBaseline({ kind: 'building', sessionsUsed: 2, need: 3 })).toBe('building your baseline (2/3)');
  });

  it('renders a compared phrase with both values', () => {
    expect(describeBaseline({ kind: 'compared', status: 'better', value: 0.10, baselineValue: 0.20 }))
      .toBe('vs your baseline: better (0.10 vs 0.20)');
  });

  it('takes a custom number formatter (a check with its own display unit)', () => {
    const s = describeBaseline({ kind: 'compared', status: 'worse', value: 12.4, baselineValue: 9.1 }, (n) => `${n.toFixed(0)}%`);
    expect(s).toBe('vs your baseline: worse (12% vs 9%)');
  });
});

// MIRROR-PROGRESS (plan Phase 4, 2026-10-07): "vs your last 3" — the recent comparison beside the fixed baseline
describe('compareToRecent', () => {
  it('nothing before it: first', () => {
    expect(compareToRecent(0.75, [], 'higherIsBetter', 0.1)).toEqual({ kind: 'first' });
    expect(compareToRecent(0.75, [NaN, Infinity], 'higherIsBetter', 0.1)).toEqual({ kind: 'first' });
  });

  it('reads only the newest 3 priors, averaged', () => {
    const c = compareToRecent(0.75, [0.0, 0.5, 0.5, 0.5], 'higherIsBetter', 0.1);
    expect(c).toEqual({ kind: 'compared', status: 'better', value: 0.75, recentMean: 0.5, n: 3 });
  });

  it('within the absolute band is the same; outside it, the direction decides', () => {
    expect(compareToRecent(0.55, [0.5, 0.5, 0.5], 'higherIsBetter', 0.1)).toMatchObject({ status: 'same' });
    expect(compareToRecent(0.6, [0.5, 0.5, 0.5], 'higherIsBetter', 0.1)).toMatchObject({ status: 'same' });
    expect(compareToRecent(0.35, [0.5, 0.5, 0.5], 'higherIsBetter', 0.1)).toMatchObject({ status: 'worse' });
    expect(compareToRecent(0.5, [1.0, 1.0], 'lowerIsBetter', 0.25)).toMatchObject({ status: 'better', n: 2 });
    expect(compareToRecent(1.5, [1.0], 'lowerIsBetter', 0.25)).toMatchObject({ status: 'worse', n: 1 });
  });

  it('an absolute band, not the baseline\'s relative one: a small share near zero is not "25% worse"', () => {
    expect(compareToRecent(0.05, [0.04], 'lowerIsBetter', 0.1)).toMatchObject({ status: 'same' });
  });
});
