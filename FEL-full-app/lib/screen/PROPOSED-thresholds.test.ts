// The PROPOSED register (SCREEN-SHIP (b)): it says what it is, nothing in it is signed off, the draft's numbers are the
// draft's, every band word follows the draft's wording at its edges, and the Movement Screen's numbers are listed as
// they are in mirror-coach's files.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BAND_WORDS, GRADED_CHECKS, MOVEMENT_SCREEN_REGISTER, PROVISIONAL_LABEL, PREVIEW_LINE, SCREEN_CHECKS, SOURCES,
  THRESHOLDS, THRESHOLDS_VERSION, THRESHOLD_IDS, bandOf, bandWordOf, bands3Of, type BandWord, type ThresholdId,
} from './PROPOSED-thresholds';

const SRC = readFileSync(join(__dirname, 'PROPOSED-thresholds.ts'), 'utf8');

describe('the PROPOSED file says what it is', () => {
  it('opens with PROPOSED, pending Elijah (NASM-CES/PES), NOT FINAL, nothing signed off', () => {
    const head = SRC.split('\n').slice(0, 3).join(' ');
    expect(head).toMatch(/^\/\/ PROPOSED — pending Elijah \(NASM-CES\/PES\) approval\. NOT FINAL\./);
    expect(head).toMatch(/Every threshold, band, weight and drill cue the screen uses/);
    expect(head).toMatch(/Nothing in this file has been signed off\./);
    expect(head.toLowerCase()).toContain('not final');
  });

  it('every entry is signedOff: false with a known source tag; the version is bumped', () => {
    expect(THRESHOLDS_VERSION).toBe('jump-screen-0.2-proposed');
    for (const id of THRESHOLD_IDS) {
      expect(THRESHOLDS[id].signedOff, id).toBe(false);
      expect(SOURCES, id).toContain(THRESHOLDS[id].source);
    }
  });

  it('the preview label says proposed / preview', () => {
    expect(PROVISIONAL_LABEL).toBe('PROPOSED · preview');
    expect(PREVIEW_LINE).toBe('Scoring thresholds are proposed and pending coach approval');
  });
});

// the draft's rows, as the brief's CHECK → METRIC map gives them
const DRAFT: [ThresholdId, string, [string, number], [string, number]][] = [
  ['t1.valgus', 'Screening Squad 2026-09-28', ['<', 0.4], ['>', 0.8]],
  ['t1.trunkTibia', 'research-advisor-draft-2026-09-28', ['<', 15], ['>', 30]],
  ['t1.shoulderFlex', 'research-advisor-draft-2026-09-28', ['>', 170], ['<', 155]],   // d = 180 − this: d < 10, d > 25
  ['t1.heelRiseReps', 'research-advisor-draft-2026-09-28', ['<=', 0], ['>=', 1]],
  ['t2.tibia', 'research-advisor-draft-2026-09-28', ['>=', 38], ['<', 30]],
  ['t2.lrDiff', 'research-advisor-draft-2026-09-28', ['<', 5], ['>', 8]],
  ['t3.fppa', 'research-advisor-draft-2026-09-28', ['<', 10], ['>', 20]],
  ['t3.pelvicDrop', 'research-advisor-draft-2026-09-28', ['<', 5], ['>', 10]],
  ['t3.trunkLean', 'research-advisor-draft-2026-09-28', ['<', 10], ['>', 15]],
  ['t3.lrGap', 'Screening Squad 2026-09-28', ['<', 5], ['>', 10]],
  ['t5.landingValgus', 'research-advisor-draft-2026-09-28', ['<', 10], ['>', 20]],
];

describe('the MAPPED checks carry the draft\'s (or the Squad\'s) numbers', () => {
  it.each(DRAFT)('%s', (id, source, green, red) => {
    expect(THRESHOLDS[id].source).toBe(source);
    const b = bands3Of(id);
    expect([b.green.op, b.green.at]).toEqual(green);
    expect([b.red.op, b.red.at]).toEqual(red);
    // PR #20's band agrees: good = the Green edge, the fault line = the Red line, with the same comparison
    const band = bandOf(id);
    expect(band.good).toBe(green[1]);
    expect(band.fault).toBe(red[1]);
    expect(band.faultOp).toBe(red[0]);
  });

  it('the LABELS ONLY checks keep PR #20\'s band and source, with the draft\'s words', () => {
    expect(THRESHOLDS['t1.depthKneeFlex'].source).toBe('spec-TUNE-EJ');
    expect(bandOf('t1.depthKneeFlex')).toEqual({ good: 110, poor: 70, fault: 80, faultOp: '<' });
    expect(bands3Of('t1.depthKneeFlex').words).toEqual({ green: 'thighs at parallel or lower', yellow: 'a bit above parallel', red: 'well above parallel' });
    expect(THRESHOLDS['t5.landingFlex'].source).toBe('spec-TUNE-EJ');
    expect(bands3Of('t5.landingFlex').words).toEqual({ green: 'soft landing', yellow: 'somewhat stiff', red: 'locked knees' });
    expect(THRESHOLDS['t1.lateralShift'].source).toBe('repo-TUNE(elijah)');
  });

  it('three reps per check (A2-2), and the minimum valid reps stays three', () => {
    for (const id of ['t1.reps', 't2.reps', 't3.reps', 't5.reps'] as const) expect(THRESHOLDS[id].value, id).toBe(3);
    expect(THRESHOLDS['gate.minValidReps'].value).toBe(3);
  });
});

describe('a value in each band gets the right word, and the edges follow the draft\'s wording', () => {
  const word = (id: ThresholdId, v: number) => bandWordOf(v, bands3Of(id));
  const cases: [ThresholdId, [number, BandWord][]][] = [
    // "under 10° / 10 to 20° / over 20°": 10 is Yellow, 20 is Yellow, just over 20 is Red
    ['t3.fppa', [[0, 'green'], [9.99, 'green'], [10, 'yellow'], [15, 'yellow'], [20, 'yellow'], [20.01, 'red']]],
    ['t5.landingValgus', [[5, 'green'], [10, 'yellow'], [20, 'yellow'], [21, 'red']]],
    ['t1.trunkTibia', [[14.9, 'green'], [15, 'yellow'], [30, 'yellow'], [30.1, 'red']]],
    ['t1.valgus', [[0.39, 'green'], [0.4, 'yellow'], [0.8, 'yellow'], [0.81, 'red']]],
    // arms: the draft's d = 180 − shoulder flexion; d 9° Green, d 10° Yellow, d 25° Yellow, d 26° Red
    ['t1.shoulderFlex', [[171, 'green'], [170, 'yellow'], [155, 'yellow'], [154, 'red']]],
    ['t1.heelRiseReps', [[0, 'green'], [1, 'red'], [3, 'red']]],
    // "38° or more / 30 to 37° / under 30°"
    ['t2.tibia', [[44, 'green'], [38, 'green'], [37.9, 'yellow'], [30, 'yellow'], [29.9, 'red']]],
    ['t2.lrDiff', [[4.9, 'green'], [5, 'yellow'], [8, 'yellow'], [8.1, 'red']]],
    ['t3.pelvicDrop', [[4, 'green'], [5, 'yellow'], [10, 'yellow'], [11, 'red']]],
    ['t3.trunkLean', [[9, 'green'], [10, 'yellow'], [15, 'yellow'], [16, 'red']]],
    ['t3.lrGap', [[4, 'green'], [5, 'yellow'], [10, 'yellow'], [10.5, 'red']]],
    ['t1.depthKneeFlex', [[120, 'green'], [110, 'green'], [100, 'yellow'], [80, 'yellow'], [79, 'red']]],
    ['t5.landingFlex', [[0.3, 'green'], [0.25, 'green'], [0.2, 'yellow'], [0.1, 'red']]],
  ];
  it.each(cases)('%s', (id, pts) => {
    for (const [v, w] of pts) expect(word(id, v), `${id} ${v}`).toBe(w);
  });

  it('an unread value has no word', () => {
    expect(bandWordOf(null, bands3Of('t3.fppa'))).toBeNull();
    expect(bandWordOf(NaN, bands3Of('t3.fppa'))).toBeNull();
  });

  it('Red is "priority to work on"', () => {
    expect(BAND_WORDS).toEqual({ green: 'Good to go', yellow: 'Worth working on', red: 'Priority to work on' });
  });
});

describe('what is never a grade', () => {
  it('jump height has no band word: no register entry grades it', () => {
    const h = SCREEN_CHECKS.find((c) => c.id === 'jump.height')!;
    expect(h).toMatchObject({ map: 'NO BAND', status: 'personal-best', thresholdId: null });
    expect(GRADED_CHECKS.map((c) => c.id)).not.toContain('jump.height');
    for (const id of THRESHOLD_IDS) {
      const t = THRESHOLDS[id] as { unit: string; bands3?: unknown; label: string };
      if (/height/i.test(t.label) && /cm|in\b/.test(t.unit)) expect(t.bands3, id).toBeUndefined();
    }
  });

  it('the landing weight shift is hidden in v1: kept as data only, never graded', () => {
    const w = SCREEN_CHECKS.find((c) => c.id === 'jump.landingWeightShift')!;
    expect(w).toMatchObject({ map: 'HIDDEN', status: 'hidden-v1', thresholdId: null });
    expect(w.draftOnly?.cue).toBe('Single-leg hops and sticks');
    expect(GRADED_CHECKS.map((c) => c.id)).not.toContain('jump.landingWeightShift');
  });

  it('every graded check has three bands and a cue; the rest have none', () => {
    for (const c of SCREEN_CHECKS) {
      if (c.status === 'graded') { expect(c.thresholdId, c.id).not.toBeNull(); expect(bands3Of(c.thresholdId!).cue.length, c.id).toBeGreaterThan(5); }
      else expect(c.thresholdId, c.id).toBeNull();
    }
  });

  it('the left–right gap on the single-leg squat reads degrees only: each contributing metric is in degrees', () => {
    const gap = SCREEN_CHECKS.find((c) => c.id === 'sls.lrGap')!;
    expect(gap.metrics).toEqual(['fppa', 'pelvicDrop', 'trunkLean']);
    for (const id of ['t3.fppa', 't3.pelvicDrop', 't3.trunkLean'] as const) expect(THRESHOLDS[id].unit, id).toBe('deg');
    expect(gap.thresholdId).toBe('t3.lrGap');
    expect(THRESHOLDS['t3.lrGap'].unit).toBe('deg');
    // the hip-half-width set exists for the record and is used by nothing
    expect(SCREEN_CHECKS.some((c) => c.thresholdId === 't3.lrGapHalfWidths')).toBe(false);
  });
});

describe('the Movement Screen (PR #22) is listed, unchanged', () => {
  it('each listed source exists in its file, with the values the listing quotes', async () => {
    const sg = await import('@/lib/mirror/stationGraders');
    const as = await import('@/lib/mirror/assessment');
    const sc = await import('@/lib/mirror/screenClaims');
    const sr = await import('@/lib/mirror/screenReward');
    const la = await import('@/lib/mirror/lungeAudit');
    const mp = await import('@/lib/coach/mirrorToProgram');
    expect(sg.STATION_THRESHOLDS.shoulderLevel.flagAt).toBe(0.08);
    expect(sg.STATION_THRESHOLDS.kneeWindow.flagAt).toBe(0.5);
    expect(sg.STATION_THRESHOLDS.headFloat.flagAt).toBe(0.12);
    expect(sg.STATION_THRESHOLDS.heelLine.flagAt).toBe(10);
    expect(sg.STATION_THRESHOLDS.heelLine.asymmetryAt).toBe(8);
    expect(as.MIN_GRADEABLE_CONFIDENCE).toBe(0.6);
    expect(sc.MIN_READABLE_CAMERA_CHECKS).toBe(3);
    expect(sc.MIN_READABLE_CAMERA_STATIONS).toBe(2);
    expect(sr.MIN_CHECKS_FOR_REWARD).toBe(3);
    expect(la.LUNGE_THRESHOLDS).toMatchObject({ kneeInWarn: 0.3, hipDropWarn: 0.18, torsoDriftWarn: 0.4, wobbleWarn: 0.035 });
    expect(mp.CORRECTIVE_REST_SECONDS).toBe(30);
    expect(MOVEMENT_SCREEN_REGISTER.map((m) => m.where).join(' ')).toMatch(/stationGraders[\s\S]*mirrorToProgram/);
  });
});
