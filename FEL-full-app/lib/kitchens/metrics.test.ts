import { describe, expect, it } from 'vitest';
import { defaultMetrics } from '@/lib/workout/movement-screen';
import { snapshotFromTree } from './buildSnapshot';
import { clampMetric, clearMetrics, loadMetrics, METRIC_FIELDS, METRICS_STORAGE_KEY, metricsEqual, sanitizeMetrics, saveMetrics } from './metrics';

function fakeStorage(seed: Record<string, string> = {}) {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    dump: () => Object.fromEntries(m),
  };
}

describe('FEL Kitchens — Your Build scan input (metrics)', () => {
  it('covers every movement-screen metric once, with the defaults inside each range', () => {
    const d = defaultMetrics();
    expect(METRIC_FIELDS.map((f) => f.key).sort()).toEqual(Object.keys(d).sort());
    for (const f of METRIC_FIELDS) { expect(d[f.key]).toBeGreaterThanOrEqual(f.min); expect(d[f.key]).toBeLessThanOrEqual(f.max); }
  });

  it('clamps into range and snaps to the step', () => {
    expect(clampMetric('valgusL', 1.7)).toBe(1);
    expect(clampMetric('valgusL', -0.2)).toBe(0);
    expect(clampMetric('valgusL', 0.333)).toBe(0.35);
    expect(clampMetric('jumpHeightCm', 40.6)).toBe(41);
    expect(clampMetric('cadenceSpm', 500)).toBe(200);
  });

  it('sanitises any stored shape: strings coerce, junk falls back to the defaults', () => {
    const d = defaultMetrics();
    expect(sanitizeMetrics(null)).toEqual(d);
    expect(sanitizeMetrics({ jumpHeightCm: '55', valgusR: 'nope', asymmetryPct: Infinity, extra: 1 })).toEqual({ ...d, jumpHeightCm: 55 });
    expect(metricsEqual(sanitizeMetrics({}), d)).toBe(true);
    expect(metricsEqual({ ...d, depthDeg: 100 }, d)).toBe(false);
  });

  it('round-trips through the per-viewer storage key and survives a corrupt entry', () => {
    const s = fakeStorage();
    expect(loadMetrics(s)).toEqual(defaultMetrics());
    saveMetrics({ ...defaultMetrics(), valgusL: 0.8, asymmetryPct: 99 }, s);
    expect(Object.keys(s.dump())).toEqual([METRICS_STORAGE_KEY]);
    expect(loadMetrics(s)).toEqual({ ...defaultMetrics(), valgusL: 0.8, asymmetryPct: 30 });
    s.setItem(METRICS_STORAGE_KEY, '{not json');
    expect(loadMetrics(s)).toEqual(defaultMetrics());
    clearMetrics(s);
    expect(s.dump()).toEqual({});
    expect(loadMetrics(null)).toEqual(defaultMetrics());
  });

  it('the entered metrics drive the snapshot\'s leak', () => {
    const d = defaultMetrics();
    expect(snapshotFromTree({ prq0to100: 70, metrics: d }).leak).toBe('mid-back'); // the defaults' weakest pillar is mobility
    expect(snapshotFromTree({ prq0to100: 70, metrics: { ...d, valgusR: 0.7 } }).leak).toBe('knee-valgus');
    expect(snapshotFromTree({ prq0to100: 70, metrics: { ...d, asymmetryPct: 18 } }).leak).toBe('hip-drop');
    expect(snapshotFromTree({ prq0to100: 70, metrics: { ...d, depthDeg: 120, trunkLeanDeg: 45 } }).leak).toBe('ankle'); // posture weakest
  });
});
