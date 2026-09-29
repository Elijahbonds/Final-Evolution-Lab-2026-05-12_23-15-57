import { describe, expect, it } from 'vitest';
import { assessSquat } from '@/lib/mirror/assessment';
import type { SquatScan } from '@/lib/kitchens/squatScan';
import {
  asymmetry, band, confidenceOf, isFault, metric, mqs, score03, scorable, sideResult, weightedScore, worseSide,
  type MetricResult, type SideResult, type TestResult,
} from './scoring';
import { bandOf } from './thresholds';

const m = (score: number | null, weight = 10, fault = false, id = 'x'): MetricResult =>
  ({ id, label: id, unit: '', value: score, score, weight, fault, thresholdId: 't1.valgus' });

describe('metric bands', () => {
  it('band() is assessment.ts\'s band, number for number', () => {
    const scan: SquatScan = {
      audit: { present: true, phase: 'bottom', depth01: 1, faults: [], valgusRatio: 0, lateralDrift: 0, note: '' },
      faults: [], depthDeg: 104, valgusL: 0.21, valgusR: 0.02, trunkLeanDeg: 23, asymmetryPct: 9,
      usableFrames: 30, bottomAtMs: 900, confidence: 1,
    };
    const a = assessSquat(scan);
    expect(a.checks.find((c) => c.id === 'depth')!.score).toBe(band(104, 90, 130));
    expect(a.checks.find((c) => c.id === 'kneeTrackingL')!.score).toBe(band(0.21, 0, 0.6));
    expect(a.checks.find((c) => c.id === 'trunk')!.score).toBe(band(23, 10, 40));
  });

  it('works in both directions and clamps', () => {
    expect(band(110, 110, 70)).toBe(100);
    expect(band(90, 110, 70)).toBe(50);
    expect(band(50, 110, 70)).toBe(0);
    expect(band(0.15, 0.15, 0.7)).toBe(100);
    expect(band(0.9, 0.15, 0.7)).toBe(0);
  });

  it('a fault is the far side of the fault line, with the spec\'s own comparison', () => {
    const depth = bandOf('t1.depthKneeFlex');            // fault if < 80
    expect(isFault(79.9, depth)).toBe(true);
    expect(isFault(80, depth)).toBe(false);
    const valgus = bandOf('t1.valgus');                  // fault if > 0.8 (SCREEN-SHIP: the Squad's "over 0.8" is Red)
    expect(isFault(0.801, valgus)).toBe(true);
    expect(isFault(0.8, valgus)).toBe(false);
    expect(isFault(NaN, valgus)).toBe(false);
  });

  it('an unread value has no score and no fault', () => {
    const x = metric('d', 'Depth', '°', null, 't1.depthKneeFlex', bandOf('t1.depthKneeFlex'), 25);
    expect(x).toMatchObject({ value: null, score: null, fault: false });
  });
});

describe('the test score: 0.7·weighted mean + 0.3·worst', () => {
  it('pulls toward the worst metric', () => {
    expect(weightedScore([m(100, 30), m(100, 30), m(40, 40)])).toBe(Math.round(0.7 * 76 + 0.3 * 40));
  });

  it('weight-0 and unread metrics are left out', () => {
    expect(weightedScore([m(90, 10), m(0, 0), m(null, 10)])).toBe(90);
    expect(weightedScore([m(null)])).toBeNull();
  });
});

describe('0–3 (spec §4)', () => {
  it('3 needs ≥ 80 and no fault; a fault or 50–79 is 2; under 50 is 1; pain is 0 and overrides everything', () => {
    expect(score03({ score: 85, faults: 0, complete: true })).toBe(3);
    expect(score03({ score: 85, faults: 1, complete: true })).toBe(2);
    expect(score03({ score: 79, faults: 0, complete: true })).toBe(2);
    expect(score03({ score: 50, faults: 0, complete: true })).toBe(2);
    expect(score03({ score: 49, faults: 0, complete: true })).toBe(1);
    expect(score03({ score: 99, faults: 0, complete: true, pain: true })).toBe(0);
  });

  it('a pattern not completed is 1, whatever the reps that did count scored', () => {
    expect(score03({ score: 95, faults: 0, complete: false })).toBe(1);
    expect(score03({ score: 95, faults: 0, complete: true, capAt1: true })).toBe(1);
  });

  it('a side with no valid rep scores 0 and 1/3, it does not drop out', () => {
    const s = sideResult([m(90)], { repsValid: 0, repsTotal: 2 });
    expect(s).toMatchObject({ score100: 0, score03: 1, complete: false });
    expect(sideResult([m(90)], { repsValid: 3, repsTotal: 3 })).toMatchObject({ score100: 90, score03: 3, complete: true });
  });
});

describe('asymmetry and the worse side', () => {
  const side = (score100: number): SideResult => ({ score100, score03: 2, metrics: [], repsValid: 3, repsTotal: 3, complete: true });

  it('flags at 15 points apart and names the weaker side', () => {
    expect(asymmetry(side(80), side(65))).toMatchObject({ flagged: true, pointsDiff: 15, weaker: 'right' });
    expect(asymmetry(side(80), side(66)).flagged).toBe(false);
  });

  it('or when the metric\'s own limit is crossed', () => {
    const a = asymmetry(side(80), side(78), { id: 'lr', label: 'L/R', unit: '°', value: 6, limit: 5, thresholdId: 't2.lrDiff', crossed: true });
    expect(a.flagged).toBe(true);
    expect(a.metric).toMatchObject({ value: 6, limit: 5 });
    expect(a.metric).not.toHaveProperty('crossed');
  });

  it('a sided test is its worse side', () => {
    expect(worseSide({ left: side(90), right: side(60) }).score100).toBe(60);
  });
});

describe('confidence', () => {
  it('is the passing share of frames, scaled down under the 24 Hz gate', () => {
    expect(confidenceOf(90, 100, 30)).toBe(0.9);
    expect(confidenceOf(90, 100, 12)).toBe(0.45);
    expect(confidenceOf(0, 0, 30)).toBe(0);
  });

  it('under 0.6 is not scorable (MIN_GRADEABLE_CONFIDENCE)', () => {
    expect(scorable(0.6)).toBe(true);
    expect(scorable(0.59)).toBe(false);
  });
});

describe('MQS (spec §5.1)', () => {
  const t = (id: TestResult['id'], score100: number, o: Partial<TestResult> = {}): TestResult => ({
    id, status: 'scored', confidence: 1, sides: {}, score100, score03: score100 >= 80 ? 3 : score100 >= 50 ? 2 : 1,
    asymmetry: null, thresholdsUsed: [], provisional: true, frames: { passing: 1, total: 1 }, frozen: [], ...o,
  });

  it('none with fewer than three scored tests', () => {
    expect(mqs([t('T1', 90), t('T2', 80)], 'quick')).toBeNull();
    expect(mqs([t('T1', 90), t('T2', 80), t('T3', 0, { status: 'notScored', score100: null })], 'quick')).toBeNull();
  });

  it('0.7·mean + 0.3·min, labelled Quick, with the FMS-style total', () => {
    const q = mqs([t('T1', 90), t('T2', 80), t('T3', 60), t('T5', 70)], 'quick')!;
    expect(q.value).toBe(Math.round(0.7 * 75 + 0.3 * 60));
    expect(q.label).toBe('Quick');
    expect(q.band).toBe('PRIMED');
    expect(q).toMatchObject({ fmsTotal: 3 + 3 + 2 + 2, fmsMax: 12 });
  });

  it('−5 per asymmetry flag, at most three', () => {
    const flag = { asymmetry: { flagged: true, pointsDiff: 20, weaker: 'left' as const } };
    const base = mqs([t('T1', 80), t('T2', 80), t('T3', 80)], 'full')!.value;
    expect(mqs([t('T1', 80), t('T2', 80, flag), t('T3', 80, flag)], 'full')!.value).toBe(base - 10);
    const five = ['T1', 'T2', 'T3', 'T5', 'T7'].map((id) => t(id as TestResult['id'], 80, flag));
    expect(mqs(five, 'full')!.value).toBe(80 - 15);
  });

  it('a pain stop is a referral, not a score', () => {
    expect(mqs([t('T1', 90), t('T2', 80), t('T3', 80), t('T5', 0, { status: 'painStop', score03: 0 })], 'quick')).toBeNull();
  });
});
