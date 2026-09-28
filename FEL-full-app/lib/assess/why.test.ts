// The "why" is tested, not reviewed (the Mirror's rule since program.test.ts): every sentence it can produce is swept
// for clinical vocabulary, every displayed score must carry a measured number, and every drill is a placeholder.
import { describe, expect, it } from 'vitest';
import { readFixture } from '@/lib/mirror/fixtures/load';
import { toPoseFrames } from '@/lib/mirror/fixtures';
import { concat, cmj, kneeWall, ohsSide, singleLegSquat, syntheticCalibration, type Capture } from './replay';
import { gradeT1 } from './graders/t1-overhead-squat';
import { gradeT2 } from './graders/t2-dorsiflexion';
import { gradeT3 } from './graders/t3-single-leg-squat';
import { gradeT5 } from './graders/t5-cmj';
import type { TestResult } from './scoring';
import { DRILLS, PAIN_REFERRAL, PLACEHOLDER_TAG, crossLinks, fixedStrings, reasonsFor, topFindings } from './why';

/**
 * assessment.test.ts's STILL_FORBIDDEN (the line the owner did not move), program.test.ts's words that turn coaching
 * into a claim about a body, and the lane brief's own: no score is called validated, clinical or accurate.
 */
export const FORBIDDEN = [
  'diagnos', 'disorder', 'patholog', 'injur', 'syndrome', 'therap', 'treat', 'patient', 'symptom', 'cure', 'lesion', 'tear',
  'degener', 'strain', 'impair', 'deficien', 'inhibit', 'itis', 'dysfunction', 'weak', 'tight', 'imbalance', 'risk',
  'validat', 'clinical', 'accura',
];

const cal = syntheticCalibration();
const ctx = { calibration: cal, aspect: 4 / 3 };
const fx = (name: string): Capture => ({ frames: toPoseFrames(readFixture(name)), aspect: 4 / 3, fps: 30 });
const front3 = (name: string) => concat([fx(name), fx(name), fx(name)]).frames;

/** A spread of graded tests: clean, faulted every way the graders fault, incomplete, not scored. */
function sweep(): TestResult[] {
  const out: TestResult[] = [];
  for (const [name, side] of [['squat_clean', {}], ['squat_knee_in_left', { heelRiseM: 0.05 }], ['squat_knees_in_both', { shoulderFlex: 140, trunk: 70, tibia: 30 }], ['squat_clean', { kneeFlex: 72, tibia: 22, trunk: 22 }]] as const) {
    out.push(gradeT1({ front: front3(name), side: ohsSide(side).frames }, ctx));
  }
  out.push(gradeT1({ front: front3('squat_clean'), side: ohsSide({}, { reps: 2 }).frames }, ctx));
  out.push(gradeT2({ left: kneeWall('left', { tibiaMax: 44 }).frames, right: kneeWall('right', { tibiaMax: 33 }).frames }, ctx));
  out.push(gradeT2({ left: kneeWall('left', { tibiaMax: 44 }, { perRep: (i) => (i === 1 ? { heelLiftM: 0.05 } : {}) }).frames, right: kneeWall('right').frames }, ctx));
  out.push(gradeT3({ left: singleLegSquat('left', { kneeIn: 0.06, pelvicDrop: 10 }).frames, right: singleLegSquat('right', { trunkLean: 15 }, { perRep: (i) => (i === 1 ? { touchDown: true } : {}) }).frames }, ctx));
  out.push(gradeT3({ left: singleLegSquat('left', { depth: 38 }).frames, right: singleLegSquat('right').frames }, ctx));
  out.push(gradeT5(cmj([{ heightM: 0.4, landDepth: 0.1 }, { heightM: 0.4, armSwing: true }, { heightM: 1.4 }, { heightM: 0.35, landDepth: 0.6, landKneeIn: 0.07 }]).frames, ctx));
  out.push(gradeT5(cmj([0, 1, 2].map(() => ({ heightM: 0.4, rightLateMs: 70 })), { fps: 60 }).frames, ctx));
  out.push(gradeT5(cmj([{ heightM: 0.2 }, { heightM: 0.45 }, { heightM: 0.3 }]).frames, ctx));
  return out;
}
const TESTS = sweep();
const notScored: TestResult = { ...TESTS[0], status: 'notScored', confidence: 0.42, sides: {}, score100: null, score03: null };
const pain: TestResult = { ...TESTS[0], status: 'painStop', score03: 0 };

describe('THE WHY NEVER BECOMES CLINICAL', () => {
  it('no sentence it can produce names a condition, a cause, or calls a score validated, clinical or accurate', () => {
    const strings = [
      ...fixedStrings(),
      ...[...TESTS, notScored, pain].flatMap((t) => [...reasonsFor(t), ...reasonsFor(t, { takeoffLeg: 'left' })].map((r) => r.text)),
      ...crossLinks(TESTS).map((r) => r.text), ...topFindings(TESTS, { takeoffLeg: 'right' }).map((r) => r.text),
    ];
    expect(strings.length).toBeGreaterThan(80);
    const offenders = strings.flatMap((s) => FORBIDDEN.filter((w) => s.toLowerCase().includes(w)).map((w) => `"${s}" ~ ${w}`));
    expect(offenders).toEqual([]);
  });
});

describe('every displayed score has a reason with a measured number in it', () => {
  it('each scored test carries at least one reason, and each reason\'s numbers are in its text', () => {
    for (const t of TESTS.filter((x) => x.status === 'scored')) {
      const rs = reasonsFor(t);
      expect(rs.filter((r) => r.numbers.length > 0).length, t.id).toBeGreaterThan(0);
      for (const r of rs) for (const n of r.numbers) expect(r.text, r.text).toContain(String(n));
    }
  });

  it('a fault names its side and the rep it happened on', () => {
    const r = reasonsFor(TESTS[1]).find((x) => x.metricId === 'valgusLeft')!;
    expect(r.kind).toBe('fault');
    expect(r.text).toMatch(/^Left knee sat 0\.\d+ hip half-widths inside its hip–ankle line at the bottom on front-view rep \d \(target ≤ 0\.15, fault at 0\.35\)\. A fault here caps Overhead squat at 2\/3\./);
    const heel = reasonsFor(TESTS[1]).find((x) => x.metricId === 'heelRise')!;
    expect(heel.text).toMatch(/^The heels came up on 3 reps, first on side-view rep 1 \(target: heels down on every rep; any rep is a fault\)\./);
  });

  it('the jump reads as the spec\'s example: inches, the flight, the frame rate, the ±', () => {
    const r = reasonsFor(TESTS[TESTS.length - 1])[0];
    expect(r.text).toMatch(/^Jump \d+\.\d in \(\d+(\.\d)? cm\), best of 3: estimated from a 0\.\d+ s flight at 30 fps, ±\d(\.\d)? in\./);
    expect(reasonsFor(TESTS[TESTS.length - 3]).map((x) => x.text).join(' ')).toMatch(/not counted: your hands left your hips.*not counted: it read over 130 cm/s);
  });

  it('a test that was not scored says so with the share it read, never a number of its own', () => {
    const [r] = reasonsFor(notScored);
    expect(r).toMatchObject({ kind: 'status', numbers: [42] });
    expect(r.text).toMatch(/not scored\. The camera read 42% of it clearly and needs 60%/);
  });

  it('pain is 0/3 and the referral', () => {
    const [r] = reasonsFor(pain);
    expect(r.text).toContain('0/3, pain reported');
    expect(r.text).toContain(PAIN_REFERRAL);
  });
});

describe('drill hints are placeholders, with no doses (owner default Q7)', () => {
  it('every hint is tagged and flagged', () => {
    const hints = [...Object.values(DRILLS).flat(), ...TESTS.flatMap((t) => reasonsFor(t)).flatMap((r) => r.fix ?? [])];
    expect(hints.length).toBeGreaterThan(10);
    for (const h of hints) {
      expect(h.placeholder).toBe(true);
      expect(h.label.startsWith(`${PLACEHOLDER_TAG} `)).toBe(true);
      expect(h.label).not.toMatch(/\d\s*[×x]\s*\d|\bsets?\b|\d+\s*s\b|per side|\/side/i);
    }
    for (const r of TESTS.flatMap((t) => reasonsFor(t))) {
      if (r.fix) expect(r.text).toContain(`Fix: ${PLACEHOLDER_TAG}`);
    }
  });

  it('a clean check carries no fix', () => {
    for (const r of reasonsFor(TESTS[0])) expect(r.fix).toBeUndefined();
  });
});

describe('cross-test links connect findings (spec §6)', () => {
  const t1Heel = TESTS[1];                      // left knee in + heel up
  const t2RightTight = TESTS[5];                // right shin 33°
  const t3LeftKneeDrop = TESTS[7];              // left knee in + left pelvic drop

  it('heel rise + a restricted ankle: "most likely an ankle-range limit"', () => {
    const [l] = crossLinks([t1Heel, t2RightTight]);
    expect(l.text).toMatch(/most likely an ankle-range limit: your right shin reached only 33°/);
  });

  it('heel rise + normal ankles: weight shifting forward or balance', () => {
    const t2Free = gradeT2({ left: kneeWall('left').frames, right: kneeWall('right').frames }, ctx);
    expect(crossLinks([t1Heel, t2Free])[0].text).toMatch(/normal ankle range \(44° left, 44° right\).*weight shifting forward, or balance/);
  });

  it('knee in + pelvic drop on the same leg: hip control on that leg is the lead finding', () => {
    expect(crossLinks([t3LeftKneeDrop]).map((r) => r.text).join(' ')).toMatch(/Hip control on the left leg is the lead finding/);
  });

  it('knee in on the single-leg squat + a restricted ankle on that side', () => {
    const t2LeftTight = gradeT2({ left: kneeWall('left', { tibiaMax: 32 }).frames, right: kneeWall('right').frames }, ctx);
    expect(crossLinks([t2LeftTight, t3LeftKneeDrop]).map((r) => r.text).join(' ')).toMatch(/Ankle range may be forcing the left knee inward/);
  });

  it('knee in on landing + on the single-leg squat: a priority', () => {
    const t5 = gradeT5(cmj([0, 1, 2].map(() => ({ heightM: 0.35, landDepth: 0.6, landKneeIn: 0.07 })), { fps: 60 }).frames, ctx);
    expect(crossLinks([t3LeftKneeDrop, t5]).map((r) => r.text).join(' ')).toMatch(/left knee pattern shows up in slow and fast movement.*priority/);
  });

  it('the jumping leg is labelled and ranked first', () => {
    const top = topFindings([t2RightTight, t3LeftKneeDrop], { takeoffLeg: 'right' });
    expect(top.length).toBeLessThanOrEqual(3);
    expect(top.some((r) => /Right \(your jumping leg\)|right \(your jumping leg\)/.test(r.text))).toBe(true);
    const firstNonLink = top.find((r) => r.kind !== 'link')!;
    expect(firstNonLink.side).toBe('right');
  });
});
