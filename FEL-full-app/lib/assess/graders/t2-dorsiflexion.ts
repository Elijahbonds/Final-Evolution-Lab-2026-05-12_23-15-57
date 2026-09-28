// T2 — ankle dorsiflexion, the weight-bearing lunge (knee to wall), each side, side-on (spec §4 T2).
//
// The camera reads the TESTED shin's angle from vertical at its furthest-forward point, and only with the heel down: a
// rock whose heel lifted is not a measurement of the ankle, so it is not scored (it is named, so the athlete knows why
// it did not count). Each side is the median of its best three heel-down rocks. The tested side faces the lens, so the
// shin measured is the near one.
//
// THE HEEL LINE IS READ FROM THIS TEST, not from the calibration: the athlete walks to a wall for T2, and a body a
// step nearer the lens has its floor lower in the image. The heel is flat at the start of every rock, so the heel's own
// low line over the test (its 90th-percentile y) is the floor it has to stay on.
//
// Pure.
import { SIDE, type PoseFrame } from '@/lib/pose/landmarks';
import type { Side } from '../protocol';
import { facingSign, passes, smooth, tibiaAngle } from '../geometry';
import { aroundPeak, bestReps, medianRep, segmentRocks } from '../reps';
import {
  asymmetry, confidenceOf, isFault, metric, poseHz, scorable, sideResult, worseSide,
  type FrozenRep, type SideResult, type TestResult,
} from '../scoring';
import { bandOf, isProvisional, th, type ThresholdId } from '../thresholds';
import type { GradeContext } from './t1-overhead-squat';

export type T2Capture = Partial<Record<Side, readonly PoseFrame[]>>;

export const T2_THRESHOLDS: ThresholdId[] = [
  'gate.minConfidence', 'gate.visibilityScoring', 'gate.minValidReps', 'gate.minPoseHz', 'geom.heelRise',
  't2.repRise', 't2.tibia', 't2.lrDiff', 'score.bands03', 'score.asymmetryPoints',
];

const points = (s: Side) => [SIDE[s].hip, SIDE[s].knee, SIDE[s].ankle, SIDE[s].heel, SIDE[s].footIndex];

/** A rock that did not count, and why. */
export interface T2Rejected { side: Side; rep: number; heelLiftPct: number }

export interface T2Side { result: SideResult; passing: number; total: number; rejected: T2Rejected[]; frozen: FrozenRep[]; tibiaAtBest: number | null }

function gradeSide(raw: readonly PoseFrame[], s: Side, ctx: GradeContext): T2Side {
  const frames = smooth(raw);
  const aspect = ctx.aspect, vis = th('gate.visibilityScoring');
  const bodyH = ctx.calibration.side?.bodyHeight ?? ctx.calibration.front?.bodyHeight ?? NaN;
  const ok = frames.map((f) => f.present && passes(f.image, points(s), 'side', vis));
  const faces = frames.filter((_, i) => ok[i]).map((f) => facingSign(f.image));
  const facing: 1 | -1 = faces.filter((x) => x > 0).length >= faces.length / 2 ? 1 : -1;
  const samples = frames.map((f, i) => ({ i, t: f.t, v: ok[i] ? tibiaAngle(f.image, s, aspect, facing) : NaN }));
  const reps = segmentRocks(samples, { rise: th('t2.repRise') });
  // the heel's own floor line over this test
  const heelYs = frames.filter((_, i) => ok[i]).map((f) => f.image[SIDE[s].heel].y).sort((a, b) => a - b);
  const heelFloor = heelYs.length ? heelYs[Math.min(heelYs.length - 1, Math.floor(0.9 * (heelYs.length - 1)))] : NaN;
  const rejected: T2Rejected[] = [];
  const valid: { rep: number; value: number; frame: number }[] = [];
  for (const rep of reps) {
    const lift = (heelFloor - frames[rep.bottom].image[SIDE[s].heel].y) / bodyH;
    if (lift > th('geom.heelRise')) rejected.push({ side: s, rep: rep.index, heelLiftPct: Math.round(lift * 1000) / 10 });
    else valid.push({ rep: rep.index, value: aroundPeak(frames, rep.bottom, (i) => samples[i].v, (i) => ok[i]), frame: rep.bottom });
  }
  const best = bestReps(valid.map((v) => v.value));
  const med = medianRep(valid.map((v) => v.value), best);
  const b = bandOf('t2.tibia');
  const m = metric('tibia', 'Shin angle, heel down', '°', med ? med.value : null, 't2.tibia', b, 100, {
    side: s, ...(med ? { rep: valid[med.at].rep } : {}),
  });
  const frozen: FrozenRep[] = [];
  if (m.fault && valid.length) {
    const worst = valid.reduce((a, c) => (c.value < a.value ? c : a));
    frozen.push({ metric: 'tibia', side: s, rep: worst.rep, image: frames[worst.frame].image.map((l) => ({ ...l })), aspect });
  }
  return {
    result: sideResult([m], { repsValid: valid.length, repsTotal: reps.length }),
    passing: ok.filter(Boolean).length, total: frames.length, rejected, frozen, tibiaAtBest: med ? med.value : null,
  };
}

export function gradeT2(cap: T2Capture, ctx: GradeContext): TestResult & { t2: { rejected: T2Rejected[]; lrDiffDeg: number | null } } {
  const L = cap.left ? gradeSide(cap.left, 'left', ctx) : null;
  const R = cap.right ? gradeSide(cap.right, 'right', ctx) : null;
  const passing = (L?.passing ?? 0) + (R?.passing ?? 0), total = (L?.total ?? 0) + (R?.total ?? 0);
  const rate = ctx.poseHz ?? poseHz(cap.left ?? cap.right ?? []);
  const confidence = confidenceOf(passing, total, rate);
  const rejected = [...(L?.rejected ?? []), ...(R?.rejected ?? [])];
  const lrDiffDeg = L?.tibiaAtBest != null && R?.tibiaAtBest != null ? Math.abs(L.tibiaAtBest - R.tibiaAtBest) : null;
  const base = { id: 'T2' as const, thresholdsUsed: T2_THRESHOLDS, provisional: isProvisional(T2_THRESHOLDS), frames: { passing, total } };
  if (!L || !R || !scorable(confidence)) {
    return { ...base, status: 'notScored', confidence, sides: {}, score100: null, score03: null, asymmetry: null, frozen: [], t2: { rejected, lrDiffDeg } };
  }
  const sides = { left: L.result, right: R.result };
  const lr = bandOf('t2.lrDiff');
  const asym = asymmetry(L.result, R.result, lrDiffDeg === null ? undefined : {
    id: 'lrDiff', label: 'Left–right shin difference', unit: '°', value: lrDiffDeg, limit: lr.fault!, thresholdId: 't2.lrDiff', crossed: isFault(lrDiffDeg, lr),
  });
  return { ...base, status: 'scored', confidence, sides, ...worseSide(sides), asymmetry: asym, frozen: [...L.frozen, ...R.frozen], t2: { rejected, lrDiffDeg } };
}
