// T1 — overhead squat: three reps facing the camera, then three side-on (spec §4 T1).
//
// Front reps read the knees (knee-inside ratio, each knee) and the sideways weight shift; side reps read depth (knee
// flexion, and the hip crease against the knee line), trunk against shin, whether the arms stay overhead, and the heels.
// Each view's reps are segmented on the hip drop, every rep is scored, and each metric is the median over that view's
// best three reps (reps.ts). The heels are the exception the spec names: a heel that rises on ANY rep is a fault.
//
// Pure: frames and the athlete's calibration in, a TestResult out.
import { SIDE, type PoseFrame } from '@/lib/pose/landmarks';
import type { Side } from '../protocol';
import { type Calibration } from '../calibration';
import {
  facingSign, heelHeight, hipAboveKnee, hipDrop, kneeFlexion, kneeInsideRatio, nearSide, passes, shoulderFlexion, smooth,
  trunkTibiaDiff, weightShift,
} from '../geometry';
import { aroundPeak, bestReps, medianRep, segment, type Rep } from '../reps';
import {
  confidenceOf, metric, poseHz, scorable, sideResult, weightedScore, worseSide,
  type FrozenRep, type MetricResult, type TestResult,
} from '../scoring';
import { bandOf, isProvisional, th, type ThresholdId } from '../thresholds';

export interface GradeContext {
  calibration: Calibration;
  aspect: number;
  /** Pose frames per second; read from the frames when not given. */
  poseHz?: number;
}

export interface T1Capture { front: readonly PoseFrame[]; side: readonly PoseFrame[] }

export const T1_THRESHOLDS: ThresholdId[] = [
  'gate.minConfidence', 'gate.visibilityScoring', 'gate.minValidReps', 'gate.minPoseHz', 'geom.heelRise',
  't1.repEnter', 't1.repExit', 't1.repMinPeak', 't1.depthKneeFlex', 't1.hipCrease', 't1.trunkTibia', 't1.shoulderFlex',
  't1.heelRiseReps', 't1.valgus', 't1.lateralShift', 't1.weights', 'score.meanWorst', 'score.bands03',
];

const FRONT_POINTS = [23, 24, 25, 26, 27, 28];
const sidePoints = (s: Side) => [SIDE[s].shoulder, SIDE[s].hip, SIDE[s].knee, SIDE[s].ankle, SIDE[s].wrist, SIDE[s].heel, SIDE[s].footIndex];
const repThresholds = () => ({ enter: th('t1.repEnter'), exit: th('t1.repExit'), minPeak: th('t1.repMinPeak') });

interface Scored { rep: Rep; metrics: MetricResult[]; score: number; worstFrame: Record<string, number> }

/** Frames [start, end] of a rep that pass the gate. */
const inRep = (rep: Rep, ok: readonly boolean[]) => {
  const out: number[] = [];
  for (let i = rep.start; i <= rep.end; i++) if (ok[i]) out.push(i);
  return out;
};

export function gradeT1(raw: T1Capture, ctx: GradeContext): TestResult {
  const cap: T1Capture = { front: smooth(raw.front), side: smooth(raw.side) };
  const cal = ctx.calibration, aspect = ctx.aspect, vis = th('gate.visibilityScoring');
  const w = th('t1.weights');
  const frozen: FrozenRep[] = [];
  const empty = (confidence: number, passing: number, total: number): TestResult => ({
    id: 'T1', status: 'notScored', confidence, sides: {}, score100: null, score03: null, asymmetry: null,
    thresholdsUsed: T1_THRESHOLDS, provisional: isProvisional(T1_THRESHOLDS), frames: { passing, total }, frozen: [],
  });
  if (!cal.front) return empty(0, 0, cap.front.length + cap.side.length);

  // ── front: the knees and the weight shift ──
  const front = cal.front;
  const fOk = cap.front.map((f) => f.present && passes(f.image, FRONT_POINTS, 'front', vis));
  const fSamples = cap.front.map((f, i) => ({ i, t: f.t, v: fOk[i] ? hipDrop(f.image, front.hipY, front.floorY) : NaN }));
  const fReps = segment(fSamples, repThresholds());
  const fScored: Scored[] = fReps.map((rep) => {
    const idx = inRep(rep, fOk);
    const bottom = idx.filter((i) => fSamples[i].v >= 0.7 * rep.peak);
    const worstAt = (f: (i: number) => number) => bottom.reduce((b, i) => (f(i) > f(b) ? i : b), bottom[0] ?? rep.bottom);
    const vl = (i: number) => kneeInsideRatio(cap.front[i].image, 'left'), vr = (i: number) => kneeInsideRatio(cap.front[i].image, 'right');
    const sh = (i: number) => Math.abs(weightShift(cap.front[i].image) - front.shift);
    const iL = worstAt(vl), iR = worstAt(vr), iS = idx.reduce((b, i) => (sh(i) > sh(b) ? i : b), idx[0] ?? rep.bottom);
    const at = (c: number, f: (i: number) => number) => (idx.length ? aroundPeak(cap.front, c, f, (i) => fOk[i]) : null);
    const metrics = [
      metric('valgusLeft', 'Left knee inside its line', 'hip half-widths', at(iL, vl), 't1.valgus', bandOf('t1.valgus'), w.valgusLeft, { side: 'left', rep: rep.index, view: 'front' }),
      metric('valgusRight', 'Right knee inside its line', 'hip half-widths', at(iR, vr), 't1.valgus', bandOf('t1.valgus'), w.valgusRight, { side: 'right', rep: rep.index, view: 'front' }),
      metric('lateralShift', 'Sideways weight shift', 'hip widths', at(iS, sh), 't1.lateralShift', bandOf('t1.lateralShift'), w.lateralShift, { rep: rep.index, view: 'front' }),
    ];
    return { rep, metrics, score: weightedScore(metrics) ?? 0, worstFrame: { valgusLeft: iL, valgusRight: iR, lateralShift: iS } };
  });

  // ── side: depth, trunk against shin, arms, heels ──
  const sideCal = cal.side;
  const sOkBody = cap.side.map((f) => f.present && f.image.length >= 33);
  const near: Side = sideCal?.near ?? nearSide(cap.side.find((f, i) => sOkBody[i])?.image ?? []);
  const faces = cap.side.filter((f, i) => sOkBody[i]).map((f) => facingSign(f.image));
  const facing: 1 | -1 = sideCal?.facing ?? (faces.filter((x) => x > 0).length >= faces.length / 2 ? 1 : -1);
  const sOk = cap.side.map((f) => f.present && passes(f.image, sidePoints(near), 'side', vis));
  const floorY = sideCal?.floorY ?? front.floorY, standHipY = sideCal?.hipY ?? front.hipY;
  const bodyH = sideCal?.bodyHeight ?? front.bodyHeight;
  const heelRef = sideCal?.heelFloorY ?? front.heelFloorY;
  const sSamples = cap.side.map((f, i) => ({ i, t: f.t, v: sOk[i] ? hipDrop(f.image, standHipY, floorY) : NaN }));
  const sReps = segment(sSamples, repThresholds());
  const heelLine = th('geom.heelRise');
  const sScored: (Scored & { heelRose: Side | 'both' | null; heelMax: number })[] = sReps.map((rep) => {
    const idx = inRep(rep, sOk);
    const img = (i: number) => cap.side[i].image;
    const kf = (i: number) => kneeFlexion(img(i), near, aspect);
    const iBottom = idx.reduce((b, i) => (kf(i) > kf(b) ? i : b), idx[0] ?? rep.bottom);
    const bottomWin = idx.filter((i) => sSamples[i].v >= 0.7 * rep.peak);
    const iArms = bottomWin.reduce((b, i) => (shoulderFlexion(img(i), near, aspect) < shoulderFlexion(img(b), near, aspect) ? i : b), bottomWin[0] ?? iBottom);
    const iCrease = idx.reduce((b, i) => (hipAboveKnee(img(i), near, aspect) < hipAboveKnee(img(b), near, aspect) ? i : b), idx[0] ?? iBottom);
    // heels: each one the model sees, against its own standing line; a side is named only when one heel rose alone
    let heelMax = 0, iHeel = iBottom;
    const rose = { left: false, right: false };
    for (const i of idx) {
      for (const s of ['left', 'right'] as const) {
        if (img(i)[SIDE[s].heel].v < vis) continue;
        const h = heelHeight(img(i), s, heelRef[s], bodyH);
        if (h > heelLine) rose[s] = true;
        if (h > heelMax) { heelMax = h; iHeel = i; }
      }
    }
    const heelRose: Side | 'both' | null = rose.left && rose.right ? 'both' : rose.left ? 'left' : rose.right ? 'right' : null;
    const read = idx.length > 0;
    const at = (c: number, f: (i: number) => number) => (read ? aroundPeak(cap.side, c, f, (i) => sOk[i]) : null);
    const metrics = [
      metric('depthKneeFlex', 'Depth (knee bend at the bottom)', '°', at(iBottom, kf), 't1.depthKneeFlex', bandOf('t1.depthKneeFlex'), w.depthKneeFlex, { rep: rep.index, view: 'side' }),
      metric('hipCrease', 'Hip crease against the knee line', 'thigh lengths above', at(iCrease, (i) => hipAboveKnee(img(i), near, aspect)), 't1.hipCrease', bandOf('t1.hipCrease'), 0, { rep: rep.index, view: 'side' }),
      metric('trunkTibia', 'Trunk against shin', '°', at(iBottom, (i) => trunkTibiaDiff(img(i), near, aspect, facing)), 't1.trunkTibia', bandOf('t1.trunkTibia'), w.trunkTibia, { rep: rep.index, view: 'side' }),
      metric('shoulderFlex', 'Arms overhead (shoulder angle)', '°', at(iArms, (i) => shoulderFlexion(img(i), near, aspect)), 't1.shoulderFlex', bandOf('t1.shoulderFlex'), w.shoulderFlex, { rep: rep.index, view: 'side' }),
    ];
    return { rep, metrics, score: weightedScore(metrics) ?? 0, heelRose, heelMax, worstFrame: { depthKneeFlex: iBottom, hipCrease: iCrease, trunkTibia: iBottom, shoulderFlex: iArms, heelRise: iHeel } };
  });

  // ── the median over each view's best three reps ──
  const pickMedian = (scored: Scored[], id: string, frames: readonly PoseFrame[]): MetricResult | null => {
    if (!scored.length) return null;
    const best = bestReps(scored.map((s) => s.score));
    const values = scored.map((s) => s.metrics.find((m) => m.id === id)!.value ?? NaN);
    const med = medianRep(values, best);
    const tmpl = scored[0].metrics.find((m) => m.id === id)!;
    if (!med) return { ...tmpl, value: null, score: null, fault: false, rep: undefined };
    const src = scored[med.at];
    const m = metric(tmpl.id, tmpl.label, tmpl.unit, med.value, tmpl.thresholdId, bandOf(tmpl.thresholdId), tmpl.weight, {
      ...(tmpl.side ? { side: tmpl.side } : {}), rep: src.rep.index, ...(tmpl.view ? { view: tmpl.view } : {}),
    });
    // the worst rep's skeleton for a metric in fault: the rep in which it read worst
    if (m.fault) {
      const worst = scored.reduce((a, b) => ((b.metrics.find((x) => x.id === id)!.score ?? 101) < (a.metrics.find((x) => x.id === id)!.score ?? 101) ? b : a));
      const fi = worst.worstFrame[id];
      if (fi !== undefined && frames[fi]) frozen.push({ metric: id, ...(m.side ? { side: m.side } : {}), rep: worst.rep.index, image: frames[fi].image.map((l) => ({ ...l })), aspect });
    }
    return m;
  };

  const heelReps = sScored.filter((s) => s.heelRose);
  const oneSide = heelReps.length && heelReps.every((r) => r.heelRose === heelReps[0].heelRose) && heelReps[0].heelRose !== 'both'
    ? heelReps[0].heelRose as Side : null;
  const heel = metric('heelRise', 'Heels stay down', 'reps with a heel up', sScored.length ? heelReps.length : null, 't1.heelRiseReps', bandOf('t1.heelRiseReps'), w.heelRise, {
    ...(heelReps[0] ? { rep: heelReps[0].rep.index } : {}), ...(oneSide ? { side: oneSide } : {}), view: 'side',
  });
  if (heel.fault && heelReps[0]) {
    const s = heelReps.reduce((a, b) => (b.heelMax > a.heelMax ? b : a));
    frozen.push({ metric: 'heelRise', ...(oneSide ? { side: oneSide } : {}), rep: s.rep.index, image: cap.side[s.worstFrame.heelRise].image.map((l) => ({ ...l })), aspect });
  }

  const metrics = [
    pickMedian(sScored, 'depthKneeFlex', cap.side), pickMedian(sScored, 'hipCrease', cap.side),
    pickMedian(sScored, 'trunkTibia', cap.side), pickMedian(sScored, 'shoulderFlex', cap.side), sScored.length ? heel : null,
    pickMedian(fScored, 'valgusLeft', cap.front), pickMedian(fScored, 'valgusRight', cap.front),
    pickMedian(fScored, 'lateralShift', cap.front),
  ].filter((m): m is MetricResult => m !== null);

  const passing = fOk.filter(Boolean).length + sOk.filter(Boolean).length;
  const total = cap.front.length + cap.side.length;
  const rate = ctx.poseHz ?? poseHz(cap.front.length >= cap.side.length ? cap.front : cap.side);
  const confidence = confidenceOf(passing, total, rate);
  if (!scorable(confidence)) return empty(confidence, passing, total);

  const both = {
    ...sideResult(metrics, { repsValid: Math.min(fReps.length, sReps.length), repsTotal: fReps.length + sReps.length }),
    views: { front: { valid: fReps.length, total: fReps.length }, side: { valid: sReps.length, total: sReps.length } },
  };
  const { score100, score03 } = worseSide({ both });
  return {
    id: 'T1', status: 'scored', confidence, sides: { both }, score100, score03, asymmetry: null,
    thresholdsUsed: T1_THRESHOLDS, provisional: isProvisional(T1_THRESHOLDS), frames: { passing, total }, frozen,
  };
}
