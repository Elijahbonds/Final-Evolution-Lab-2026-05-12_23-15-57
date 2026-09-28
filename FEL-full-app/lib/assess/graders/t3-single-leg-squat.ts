// T3 — single-leg squat, each side, facing the camera, five reps to about 60° of knee bend (spec §4 T3).
//
// At each rep's deepest point: the stance knee's FPPA against its standing baseline (valgus +), the free side's hip
// drop against the two-foot standing pelvis, the sideways trunk lean, and how deep the knee went. A free foot that
// touches down, or a stance foot that hops, is balance lost on that rep, and any such rep caps the test at 1/3.
//
// DEPTH FROM THE FRONT is the one thing the image cannot show (the knee bends toward the lens): world landmarks when the
// frame has them, else the leg-height estimate (geometry.kneeFlexionFront). The bottom window's median is read, not the
// single deepest frame, so jitter at the turn-around is not scored.
//
// Pure.
import { SIDE, type PoseFrame } from '@/lib/pose/landmarks';
import type { Side } from '../protocol';
import { footClearance, footHeight, fppa, kneeFlexionFront, lateralTrunkLean, passes, pelvicTilt, smooth } from '../geometry';
import { bestReps, median, medianRep, segment } from '../reps';
import {
  asymmetry, confidenceOf, metric, poseHz, scorable, sideResult, weightedScore, worseSide,
  type FrozenRep, type MetricResult, type SideResult, type TestResult,
} from '../scoring';
import { bandOf, isProvisional, th, type ThresholdId } from '../thresholds';
import type { GradeContext } from './t1-overhead-squat';

export type T3Capture = Partial<Record<Side, readonly PoseFrame[]>>;

export const T3_THRESHOLDS: ThresholdId[] = [
  'gate.minConfidence', 'gate.visibilityScoring', 'gate.minValidReps', 'gate.minPoseHz', 'geom.lensHfovDeg',
  't3.repEnter', 't3.repExit', 't3.repMinPeak', 't3.fppa', 't3.pelvicDrop', 't3.trunkLean', 't3.depth', 't3.balanceReps',
  't3.weights', 't5.contactLine', 't5.airLine', 'score.meanWorst', 'score.bands03', 'score.asymmetryPoints',
];

const other = (s: Side): Side => (s === 'left' ? 'right' : 'left');
const points = (s: Side) => [23, 24, 11, 12, SIDE[s].knee, SIDE[s].ankle];

interface RepRead { index: number; metrics: MetricResult[]; score: number; balanceLost: 'touchDown' | 'hop' | null; frame: number }

export interface T3Side { result: SideResult; passing: number; total: number; frozen: FrozenRep[]; balance: { rep: number; kind: 'touchDown' | 'hop' }[] }

function gradeSide(raw: readonly PoseFrame[], s: Side, ctx: GradeContext): T3Side | null {
  const front = ctx.calibration.front;
  if (!front) return null;
  const frames = smooth(raw), aspect = ctx.aspect, vis = th('gate.visibilityScoring'), w = th('t3.weights');
  const ok = frames.map((f) => f.present && passes(f.image, points(s), 'front', vis));
  const depthOf = (i: number) => kneeFlexionFront(frames[i].image, frames[i].world, s, front.legY[s]);
  const samples = frames.map((f, i) => ({ i, t: f.t, v: ok[i] ? depthOf(i) : NaN }));
  const reps = segment(samples, { enter: th('t3.repEnter'), exit: th('t3.repExit'), minPeak: th('t3.repMinPeak') });
  const free = other(s), bodyH = front.bodyHeight;
  const reads: RepRead[] = reps.map((rep) => {
    const win: number[] = [];
    for (let i = rep.start; i <= rep.end; i++) if (ok[i] && samples[i].v >= 0.9 * rep.peak) win.push(i);
    const at = (f: (i: number) => number) => (win.length ? median(win.map(f)) : null);
    const img = (i: number) => frames[i].image;
    // balance, over the whole rep on the RAW frames (a touch-down is an event; smoothing would round it off)
    let balanceLost: RepRead['balanceLost'] = null;
    for (let i = rep.start; i <= rep.end && !balanceLost; i++) {
      const r = raw[i];
      if (!r?.present || r.image.length < 33) continue;
      if (r.image[SIDE[free].ankle].v >= vis && footClearance(r.image, r.world, s, bodyH, front.worldHeight) < th('t5.contactLine')) balanceLost = 'touchDown';
      else if (footHeight(r.image, s, front.footFloorY[s], bodyH) > th('t5.airLine')) balanceLost = 'hop';
    }
    const metrics = [
      metric('fppa', 'Knee angle toward the midline (FPPA)', '°', at((i) => fppa(img(i), s, aspect) - front.fppa[s]), 't3.fppa', bandOf('t3.fppa'), w.fppa, { side: s, rep: rep.index }),
      metric('pelvicDrop', 'Opposite hip drop', '°', at((i) => pelvicTilt(img(i), s, aspect) - front.pelvicTilt[s]), 't3.pelvicDrop', bandOf('t3.pelvicDrop'), w.pelvicDrop, { side: s, rep: rep.index }),
      metric('trunkLean', 'Sideways trunk lean', '°', at((i) => lateralTrunkLean(img(i), aspect)), 't3.trunkLean', bandOf('t3.trunkLean'), w.trunkLean, { side: s, rep: rep.index }),
      metric('depth', 'Depth (knee bend)', '°', at((i) => samples[i].v), 't3.depth', bandOf('t3.depth'), w.depth, { side: s, rep: rep.index }),
    ];
    return { index: rep.index, metrics, score: weightedScore(metrics) ?? 0, balanceLost, frame: rep.bottom };
  });

  const best = bestReps(reads.map((r) => r.score));
  const frozen: FrozenRep[] = [];
  const metrics: MetricResult[] = ['fppa', 'pelvicDrop', 'trunkLean', 'depth'].map((id) => {
    const tmpl = reads[0]?.metrics.find((m) => m.id === id);
    const med = medianRep(reads.map((r) => r.metrics.find((m) => m.id === id)!.value ?? NaN), best);
    const t = tmpl ?? metric(id, id, '°', null, `t3.${id}` as ThresholdId, bandOf(`t3.${id}` as ThresholdId), 0, { side: s });
    const m = metric(t.id, t.label, t.unit, med ? med.value : null, t.thresholdId, bandOf(t.thresholdId), t.weight, { side: s, ...(med ? { rep: reads[med.at].index } : {}) });
    if (m.fault && reads.length) {
      const worst = reads.reduce((a, b) => ((b.metrics.find((x) => x.id === id)!.score ?? 101) < (a.metrics.find((x) => x.id === id)!.score ?? 101) ? b : a));
      frozen.push({ metric: id, side: s, rep: worst.index, image: frames[worst.frame].image.map((l) => ({ ...l })), aspect });
    }
    return m;
  });
  const lost = reads.filter((r) => r.balanceLost);
  const balance = metric('balance', 'Balance (touch-downs or hops)', 'reps', reads.length ? lost.length : null, 't3.balanceReps', bandOf('t3.balanceReps'), 0, {
    side: s, ...(lost[0] ? { rep: lost[0].index } : {}),
  });
  metrics.push(balance);
  return {
    result: sideResult(metrics, {
      repsValid: reads.length, repsTotal: reads.length,
      ...(lost.length ? { capAt1: `Balance lost on ${lost.length} rep${lost.length > 1 ? 's' : ''}` } : {}),
    }),
    passing: ok.filter(Boolean).length, total: frames.length, frozen,
    balance: lost.map((r) => ({ rep: r.index, kind: r.balanceLost! })),
  };
}

export function gradeT3(cap: T3Capture, ctx: GradeContext): TestResult & { t3: { balance: Record<Side, T3Side['balance']> } } {
  const L = cap.left ? gradeSide(cap.left, 'left', ctx) : null;
  const R = cap.right ? gradeSide(cap.right, 'right', ctx) : null;
  const passing = (L?.passing ?? 0) + (R?.passing ?? 0), total = (cap.left?.length ?? 0) + (cap.right?.length ?? 0);
  const confidence = confidenceOf(passing, total, ctx.poseHz ?? poseHz(cap.left ?? cap.right ?? []));
  const base = { id: 'T3' as const, thresholdsUsed: T3_THRESHOLDS, provisional: isProvisional(T3_THRESHOLDS), frames: { passing, total } };
  const t3 = { balance: { left: L?.balance ?? [], right: R?.balance ?? [] } };
  if (!L || !R || !scorable(confidence)) {
    return { ...base, status: 'notScored', confidence, sides: {}, score100: null, score03: null, asymmetry: null, frozen: [], t3 };
  }
  const sides = { left: L.result, right: R.result };
  return { ...base, status: 'scored', confidence, sides, ...worseSide(sides), asymmetry: asymmetry(L.result, R.result), frozen: [...L.frozen, ...R.frozen], t3 };
}
