import { describe, expect, it } from 'vitest';
import { ASSESSMENT_DISCLAIMER, MIN_GRADEABLE_CONFIDENCE, assessSquat, gradeOf } from './assessment';
import type { SquatScan } from '@/lib/kitchens/squatScan';

const scan = (o: Partial<SquatScan> = {}): SquatScan => ({
  audit: { present: true, phase: 'bottom', depth01: 1, faults: [], valgusRatio: 0, lateralDrift: 0, note: '' },
  faults: [], depthDeg: 92, valgusL: 0.02, valgusR: 0.02, trunkLeanDeg: 11, asymmetryPct: 2,
  usableFrames: 30, bottomAtMs: 900, confidence: 1, ...o,
});

/**
 * THE LINE THE OWNER MOVED, and the line he did not. "Assess", "measure", "score" and "grade" are the product now.
 * A word that names a condition, claims a cause inside the body, or implies a clinician is still out — a phone on a
 * shelf cannot support one, whatever the product wants to say.
 */
const STILL_FORBIDDEN = [
  'diagnos', 'disorder', 'patholog', 'injur', 'syndrome', 'therap', 'treat', 'patient', 'symptom',
  'cure', 'lesion', 'tear', 'degener', 'strain', 'impair', 'deficien', 'inhibit', 'itis',
];

describe('the Mirror grades what it watched', () => {
  it('a clean squat grades high and a collapsing one does not', () => {
    expect(assessSquat(scan()).grade).toBe('ELITE');
    const bad = assessSquat(scan({ depthDeg: 128, valgusL: 0.55, valgusR: 0.5, trunkLeanDeg: 38, asymmetryPct: 18 }));
    expect(bad.grade).toBe('RECOVERING');
    expect(bad.score).toBeLessThan(20);
  });

  it('one bad check cannot hide behind four good ones', () => {
    const oneLeak = assessSquat(scan({ valgusL: 0.6 }));
    expect(oneLeak.worst).toBe('kneeTrackingL');
    expect(oneLeak.score).toBeLessThan(85);          // the mean alone would have called this ~80
    expect(oneLeak.headline).toMatch(/left knee/i);
  });

  it('names the worst check on the side it actually happened', () => {
    expect(assessSquat(scan({ valgusR: 0.6 })).worst).toBe('kneeTrackingR');
    expect(assessSquat(scan({ trunkLeanDeg: 39 })).worst).toBe('trunk');
    expect(assessSquat(scan({ asymmetryPct: 19 })).worst).toBe('symmetry');
    expect(assessSquat(scan({ depthDeg: 129 })).worst).toBe('depth');
  });

  it('refuses to grade what the camera barely saw, and says what to do instead', () => {
    const thin = assessSquat(scan({ confidence: 0.3 }));
    expect(thin.provisional).toBe(true);
    expect(thin.headline).toMatch(/in frame|in shot/i);
    expect(assessSquat(scan({ confidence: MIN_GRADEABLE_CONFIDENCE })).provisional).toBe(false);
  });

  it('every score carries the number it came from — never a grade without a reason', () => {
    for (const c of assessSquat(scan()).checks) {
      expect(Number.isFinite(c.value)).toBe(true);
      expect(c.line.length).toBeGreaterThan(10);
    }
  });

  it('grades on the same bands as the rest of the app', () => {
    expect(gradeOf(80)).toBe('ELITE'); expect(gradeOf(60)).toBe('PRIMED');
    expect(gradeOf(40)).toBe('READY'); expect(gradeOf(39)).toBe('RECOVERING');
  });

  it('NEVER names a condition, a cause or a clinician — the line that did not move', () => {
    const cases = [scan(), scan({ valgusL: 0.6 }), scan({ depthDeg: 129, asymmetryPct: 19, trunkLeanDeg: 39 }),
      scan({ confidence: 0.2 })];
    const offenders: string[] = [];
    for (const s of cases) {
      const a = assessSquat(s);
      for (const str of [a.headline, ...a.checks.map((c) => c.line)]) {
        for (const bad of STILL_FORBIDDEN) if (str.toLowerCase().includes(bad)) offenders.push(`"${str}" ~ "${bad}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the disclaimer says what this IS, and what it is not', () => {
    expect(ASSESSMENT_DISCLAIMER).toMatch(/movement assessment/i);
    expect(ASSESSMENT_DISCLAIMER).toMatch(/single camera/i);
    expect(ASSESSMENT_DISCLAIMER).toMatch(/not a medical diagnosis/i);
    expect(ASSESSMENT_DISCLAIMER).toMatch(/clinician/i);
  });
});
