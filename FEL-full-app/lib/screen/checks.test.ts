// The Quick Screen as the athlete sees it (SCREEN-SHIP): one band per check, the top priorities, the clean-screen rule,
// the median rep, the computed left–right gap, and a summary that carries no raw reading. Driven by PR #20's own
// synthetic athlete (lib/assess/replay) and graders.
import { describe, expect, it } from 'vitest';
import type { Lm } from '@/lib/pose/landmarks';
import { SIDE } from '@/lib/pose/landmarks';
import { shoulderFlexion } from '@/lib/assess/geometry';
import { gradeSession } from '@/lib/assess/runner';
import { gradeT1 } from '@/lib/assess/graders/t1-overhead-squat';
import { medianRep } from '@/lib/assess/reps';
import { cmj, kneeWall, ohsFront, ohsSide, singleLegSquat, syntheticCalibration } from '@/lib/assess/replay';
import type { MetricResult, TestResult } from '@/lib/assess/scoring';
import { bandCheck, checkValues, priorities, summarize, testsComplete, type CheckBand } from './checks';
import { GRADED_CHECKS, checkById, type CheckId } from './PROPOSED-thresholds';

const cal = syntheticCalibration();

/** A session from synthetic takes: clean unless told otherwise. */
function session(o: { kneeInL?: number; t3LeftKneeIn?: number; t3RightPelvicDrop?: number; tibiaR?: number; trunk?: number; heelRiseM?: number; landKneeIn?: number; dropT3?: boolean; dimT5?: boolean } = {}) {
  const cap = {
    calibration: cal,
    T1: { front: ohsFront({ kneeInL: o.kneeInL ?? 0 }).frames, side: ohsSide({ ...(o.trunk ? { trunk: o.trunk } : {}), ...(o.heelRiseM ? { heelRiseM: o.heelRiseM } : {}) }).frames },
    T2: { left: kneeWall('left', { tibiaMax: 44 }).frames, right: kneeWall('right', { tibiaMax: o.tibiaR ?? 44 }).frames },
    T3: o.dropT3 ? undefined : { left: singleLegSquat('left', { kneeIn: o.t3LeftKneeIn ?? 0 }).frames, right: singleLegSquat('right', { pelvicDrop: o.t3RightPelvicDrop ?? 0 }).frames },
    T5: cmj([0, 1, 2].map(() => ({ heightM: 0.42, ...(o.landKneeIn ? { landDepth: 0.6, landKneeIn: o.landKneeIn } : {}) }))).frames,
    takeoffLeg: 'left' as const,
  };
  const r = gradeSession(cap);
  if (o.dimT5) {
    const i = r.tests.findIndex((t) => t.id === 'T5');
    r.tests[i] = { ...r.tests[i], status: 'notScored', sides: {}, score100: null, score03: null };
  }
  return r;
}

describe('arms fall forward is MAPPED: geometry.shoulderFlexion is the arm against the torso line', () => {
  // synthetic landmarks: a vertical trunk (hip below the shoulder), the arm swung forward from the trunk's line by d
  const pose = (d: number, aspect: number): Lm[] => {
    const img: Lm[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, v: 1 }));
    const s = SIDE.left;
    const sh = { x: 0.5, y: 0.4 }, hip = { x: 0.5, y: 0.7 };
    const r = 0.25, a = (d * Math.PI) / 180;            // straight up (the torso line, extended) is d = 0
    const wr = { x: sh.x + r * Math.sin(a), y: sh.y - r * Math.cos(a) };
    // image x is normalised per axis: real x ÷ aspect
    const put = (i: number, p: { x: number; y: number }) => { img[i] = { x: 0.5 + (p.x - 0.5) / aspect, y: p.y, z: 0, v: 1 }; };
    put(s.shoulder, sh); put(s.hip, hip); put(s.wrist, wr);
    return img;
  };
  it.each([0, 5, 10, 17, 25, 40])('deviation %i° reads 180 − %i', (d) => {
    for (const aspect of [1, 4 / 3, 9 / 16]) expect(shoulderFlexion(pose(d, aspect), 'left', aspect)).toBeCloseTo(180 - d, 6);
  });
});

describe('one band per graded check, from the synthetic athlete', () => {
  it('a clean screen: every graded check Green, complete, clean, lane dunking, no priorities, a personal best', () => {
    const s = summarize(session())!;
    expect(s.checks.map((c) => c.id)).toEqual(GRADED_CHECKS.map((c) => c.id));
    expect(s.checks.filter((c) => c.band !== 'green')).toEqual([]);
    expect(s).toMatchObject({ complete: true, clean: true, lane: 'dunking', topFlag: null, priorities: [] });
    expect(s.jumpBestIn).toBeGreaterThan(14);
  });

  it('flags: a Red OHS knee cave and a Yellow T2 gap → Red first, lane correctives from the knee cave', () => {
    const s = summarize(session({ kneeInL: 0.06, tibiaR: 38.5 }))!;   // valgus ≈ 0.84 hip half-widths (Red); gap 5.5° (Yellow)
    const b = (id: CheckId) => s.checks.find((c) => c.id === id)!;
    expect(b('ohs.kneeCave')).toMatchObject({ band: 'red', sides: { left: 'red', right: 'green' } });
    expect(b('ktw.lrGap').band).toBe('yellow');
    expect(b('ktw.shinAngle').band).toBe('green');
    expect(s.priorities[0]).toBe('ohs.kneeCave');
    expect(s).toMatchObject({ clean: false, lane: 'correctives', topFlag: 'ohs.kneeCave' });
  });

  it('the single-leg left–right gap is computed on the phone from the per-side medians (degrees), worst gap graded', () => {
    const r = session({ t3LeftKneeIn: 0.06 });                       // left FPPA ≈ 18°, right ≈ 0°
    const t3 = r.tests.find((t) => t.id === 'T3')!;
    const l = t3.sides.left!.metrics.find((m) => m.id === 'fppa')!.value!, rr = t3.sides.right!.metrics.find((m) => m.id === 'fppa')!.value!;
    const v = checkValues(checkById('sls.lrGap'), r.tests).value!;
    expect(v).toBeCloseTo(Math.abs(l - rr), 6);
    expect(v).toBeGreaterThan(10);
    expect(bandCheck(checkById('sls.lrGap'), r.tests).band).toBe('red');   // over 10°
    expect(bandCheck(checkById('sls.kneeCave'), r.tests)).toMatchObject({ band: 'yellow', sides: { left: 'yellow', right: 'green' } });
  });
});

describe('the clean-screen rule (A4-4): never on missing, partial or hidden-only data', () => {
  it('a test not scored: not complete, not clean, no all-green lane', () => {
    const s = summarize(session({ dimT5: true }))!;
    expect(s.complete).toBe(false);
    expect(s.clean).toBe(false);
    expect(s.lane).toBeNull();
    expect(s.checks.find((c) => c.id === 'jump.landingKneeCave')!.band).toBeNull();
    expect(s.jumpBestIn).toBeNull();
  });

  it('a test not run at all: not clean', () => {
    const s = summarize(session({ dropT3: true }))!;
    expect(s).toMatchObject({ complete: false, clean: false, lane: null });
  });

  it('a side short of three valid reps, or capped for balance, is not finished', () => {
    const r = session();
    const t3 = r.tests.find((t) => t.id === 'T3')!;
    const short: TestResult = { ...t3, sides: { ...t3.sides, left: { ...t3.sides.left!, repsValid: 2, complete: false } } };
    expect(testsComplete(r.tests.map((t) => (t.id === 'T3' ? short : t)))).toBe(false);
    const capped: TestResult = { ...t3, sides: { ...t3.sides, right: { ...t3.sides.right!, capReason: 'Balance lost on 1 rep' } } };
    expect(testsComplete(r.tests.map((t) => (t.id === 'T3' ? capped : t)))).toBe(false);
    expect(testsComplete(r.tests)).toBe(true);
  });

  it('with no graded check read, nothing is clean', () => {
    const empty = gradeSession({ calibration: cal });
    const s = summarize(empty)!;
    expect(s.checks.every((c) => c.band === null)).toBe(true);
    expect(s).toMatchObject({ complete: false, clean: false, lane: null, priorities: [] });
  });

  it('a pain stop is a referral, not a result: no summary at all', () => {
    const r = session();
    expect(summarize({ ...r, pain: true })).toBeNull();
  });
});

describe('the top priorities: Red before Yellow, then PR #20\'s metric weight, then check order', () => {
  const cb = (id: CheckId, band: CheckBand['band']): CheckBand => ({ id, band });
  it('a later Red outranks an earlier Yellow', () => {
    expect(priorities([cb('ohs.forwardLean', 'yellow'), cb('jump.stiffLanding', 'red')])).toEqual(['jump.stiffLanding', 'ohs.forwardLean']);
  });
  it('ties in a band break by weight (depth 25 before forward lean 15), then check order', () => {
    expect(priorities([cb('ohs.forwardLean', 'yellow'), cb('ohs.depth', 'yellow')])).toEqual(['ohs.depth', 'ohs.forwardLean']);
    // equal weights (15, 15): check order
    expect(priorities([cb('ohs.heelLift', 'red'), cb('ohs.armsForward', 'red')])).toEqual(['ohs.armsForward', 'ohs.heelLift']);
  });
  it('at most two, and Green or unread never rank', () => {
    const p = priorities([cb('ohs.kneeCave', 'red'), cb('ohs.depth', 'red'), cb('ohs.heelLift', 'red'), cb('ktw.shinAngle', 'green'), cb('ktw.lrGap', null)]);
    expect(p).toHaveLength(2);
    expect(p).not.toContain('ktw.shinAngle');
    expect(p).not.toContain('ktw.lrGap');
  });
});

describe('three reps, graded on the median rep (A2-2)', () => {
  it('medianRep of three reps is the middle one, and names it', () => {
    expect(medianRep([12, 30, 20], [0, 1, 2])).toEqual({ value: 20, at: 2 });
  });
  it('the overhead squat\'s trunk-against-shin is the median of its three side reps', () => {
    const trunks = [30, 55, 42];
    const side = ohsSide({}, { reps: 3, perRep: (i) => ({ trunk: trunks[i] }) }).frames;
    const t1 = gradeT1({ front: ohsFront().frames, side }, { calibration: cal, aspect: 4 / 3 });
    const m = t1.sides.both!.metrics.find((x: MetricResult) => x.id === 'trunkTibia')!;
    const per = [0, 1, 2].map((i) => gradeT1({ front: ohsFront().frames, side: ohsSide({ trunk: trunks[i] }, { reps: 3 }).frames }, { calibration: cal, aspect: 4 / 3 })
      .sides.both!.metrics.find((x: MetricResult) => x.id === 'trunkTibia')!.value!);
    const sorted = [...per].sort((a, b) => a - b);
    expect(m.value!).toBeCloseTo(sorted[1], 0);
    expect(m.rep).toBe(3);                                 // the 42° rep is the middle one
  });
});

describe('the summary keeps no reading (A2-3, gate 5)', () => {
  it('only band words, ids, the lane and the one personal best: no per-rep value, no metric value, no frame', () => {
    const s = summarize(session({ kneeInL: 0.06 }))!;
    const json = JSON.stringify({ ...s, thresholdsVersion: undefined });
    expect(Object.keys(s).sort()).toEqual(['checks', 'clean', 'complete', 'jumpBestIn', 'lane', 'priorities', 'thresholdsVersion', 'topFlag', 'v']);
    for (const c of s.checks) expect(Object.keys(c).every((k) => ['id', 'band', 'sides'].includes(k))).toBe(true);
    // the only numbers in it: the version and the personal best
    const numbers = json.match(/-?\d+(\.\d+)?/g)!;
    expect(numbers.map(Number).sort()).toEqual([1, s.jumpBestIn!].sort());
    expect(json).not.toMatch(/image|frames|landmark|frozen|value|score|rep"/);
  });
});
