// The load-velocity line, the e1RM and the loads for a zone: the maths, on lines with a known answer.
import { describe, expect, it } from 'vitest';
import { bestPerLoad, fitProfile, loadAt, loadsForZone } from './profile';
import { MVT_SD } from './thresholds';

// a squatter whose bar slows 0.008 m/s per kg from 1.3 m/s: the 0.30 m/s MVT is reached at (1.3 − 0.3) / 0.008 = 125 kg
const line = (kg: number) => 1.3 - 0.008 * kg;

describe('the load-velocity line and the e1RM', () => {
  it('three exact loads: the line, R² = 1, the e1RM at the MVT, a band from the MVT spread alone', () => {
    const fit = fitProfile('back_squat', [60, 80, 100].map((kg) => ({ loadKg: kg, mcv: line(kg) })));
    expect(fit.ok).toBe(true);
    if (!fit.ok) return;
    expect(fit.slope).toBeCloseTo(-0.008, 6);
    expect(fit.intercept).toBeCloseTo(1.3, 4);
    expect(fit.r2).toBe(1);
    expect(fit.e1rmKg).toBe(125);
    // the MVT's own ±0.035 m/s (1 SD) over a 0.008 m/s-per-kg slope is ±4.4 kg (1 SD): ±8.6 kg at 95 %
    expect(fit.e1rmPmKg).toBeCloseTo(1.96 * (MVT_SD / 0.008), 0);
    expect(loadAt(fit, 0.7)).toBeCloseTo(75, 6);
  });

  it('each load\'s FASTEST rep is used, and the scatter widens the band', () => {
    const pts = [
      { loadKg: 60, mcv: line(60) }, { loadKg: 60, mcv: line(60) - 0.1 },      // a tired rep at 60 kg is ignored
      { loadKg: 80, mcv: line(80) + 0.03 }, { loadKg: 100, mcv: line(100) - 0.03 }, { loadKg: 110, mcv: line(110) + 0.02 },
    ];
    expect(bestPerLoad(pts).map((p) => p.loadKg)).toEqual([60, 80, 100, 110]);
    const noisy = fitProfile('back_squat', pts), clean = fitProfile('back_squat', [60, 80, 100, 110].map((kg) => ({ loadKg: kg, mcv: line(kg) })));
    expect(noisy.ok && clean.ok).toBe(true);
    if (!noisy.ok || !clean.ok) return;
    expect(noisy.r2!).toBeLessThan(1);
    expect(noisy.e1rmPmKg!).toBeGreaterThan(clean.e1rmPmKg!);
    expect(Math.abs(noisy.e1rmKg! - 125)).toBeLessThan(8);
  });

  it('two loads are enough for a line; the reps\' own ± sets its scatter', () => {
    const fit = fitProfile('bench_press', [{ loadKg: 40, mcv: 1.0, mcvPm: 0.06 }, { loadKg: 70, mcv: 0.55, mcvPm: 0.06 }]);
    expect(fit.ok).toBe(true);
    if (!fit.ok) return;
    expect(fit.r2).toBeNull();
    // bench MVT 0.17: 40 + (1.0 − 0.17) / 0.015 = 95.3 kg
    expect(fit.e1rmKg).toBeCloseTo(95.3, 1);
    expect(fit.e1rmPmKg!).toBeGreaterThan(1.96 * (MVT_SD / 0.015));
  });

  it('refuses: one load, loads too close, or a bar that did not slow', () => {
    expect(fitProfile('back_squat', [{ loadKg: 100, mcv: 0.5 }])).toMatchObject({ ok: false, why: 'few_loads' });
    expect(fitProfile('back_squat', [{ loadKg: 100, mcv: 0.5 }, { loadKg: 102, mcv: 0.48 }])).toMatchObject({ ok: false, why: 'few_loads' });
    expect(fitProfile('back_squat', [{ loadKg: 60, mcv: 0.5 }, { loadKg: 100, mcv: 0.6 }])).toMatchObject({ ok: false, why: 'not_slower' });
  });

  it('no MVT, no e1RM: a clean (ballistic) and the body-only moves still get a line', () => {
    const fit = fitProfile('power_clean', [{ loadKg: 50, mcv: 1.4 }, { loadKg: 70, mcv: 1.15 }]);
    expect(fit.ok && fit.e1rmKg).toBeNull();
  });

  it('loads for a zone: inside the zone, rounded inward to 2.5 kg, never over the e1RM', () => {
    const fit = fitProfile('back_squat', [60, 80, 100].map((kg) => ({ loadKg: kg, mcv: line(kg) })));
    if (!fit.ok) throw new Error('fit');
    // strength-speed 0.75–1.00 m/s: (1.3 − 1.0)/0.008 = 37.5 kg … (1.3 − 0.75)/0.008 = 68.75 kg → 37.5 … 67.5
    expect(loadsForZone(fit, 'strength_speed')).toEqual({ loKg: 37.5, hiKg: 67.5 });
    // absolute strength < 0.5 m/s: 100 kg … the e1RM (125)
    expect(loadsForZone(fit, 'absolute_strength')).toEqual({ loKg: 100, hiKg: 125 });
    for (const z of ['accelerative_strength', 'speed_strength', 'starting_strength'] as const) {
      const r = loadsForZone(fit, z);
      if (r) { expect(r.loKg % 2.5).toBe(0); expect(r.hiKg).toBeLessThanOrEqual(fit.e1rmKg!); }
    }
  });
});
