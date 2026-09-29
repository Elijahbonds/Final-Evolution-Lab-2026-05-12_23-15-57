// T5 — countermovement jump, hands on hips, three max efforts, facing the camera (spec §4 T5; owner default Q3).
//
// HEIGHT is flight time: h = g·t²/8, the same physics as lib/irl/dunkTracker.ts, refused over 130 cm (the camera lost
// the feet) and never read from how high the body rose in the image. Best valid jump of three. It feeds PRQ power.
// QUALITY is the landing: how far the hips drop to absorb it (a stiff landing drops under 10% of standing hip height),
// each knee's FPPA at the deepest point, and — only at a pose rate of 50 Hz or more — how far apart the feet touched
// down. It feeds MQS. The two are kept apart on purpose (spec §4 T5): a big jumper with a stiff landing sees both.
//
// TIMING READS THE RAW STREAM. Take-off is the last instant both feet were down, landing the first instant one foot is
// down again (DunkTracker's rule), each found BETWEEN frames: the foot's height on the two airborne frames next to the
// edge gives its speed, and the edge is extrapolated back (or forward) to the floor, clamped to the frame gap it lies
// in. A frame-counted flight is up to a frame long or short at each end (at 30 fps, ±4 cm of height on a 50 cm jump);
// a contact line crossed without extrapolation reads every flight short by the time the feet take to clear it.
//
// A jump whose hands left the hips is not the standard (the arm-swing variant is not built) and is not counted.
//
// Pure.
import type { PoseFrame } from '@/lib/pose/landmarks';
import type { FrontCalibration } from '../calibration';
import { footLowY, fppa, hipDrop, kneeFlexionFront, passes, smooth, wristsAboveShoulders } from '../geometry';
import { bestReps, medianRep } from '../reps';
import {
  confidenceOf, metric, poseHz, scorable, sideResult, weightedScore, worseSide,
  type FrozenRep, type JumpRead, type MetricResult, type T5Extra, type TestResult,
} from '../scoring';
import { bandOf, isProvisional, th, type ThresholdId } from '../thresholds';
import type { GradeContext } from './t1-overhead-squat';

export const G = 9.81;

export const T5_THRESHOLDS: ThresholdId[] = [
  'gate.minConfidence', 'gate.visibility', 'gate.visibilityScoring', 'gate.minValidReps', 'gate.minPoseHz', 'gate.jumpFps',
  'geom.lensHfovDeg', 't5.contactLine', 't5.airLine', 't5.flightMinMs', 't5.flightMaxMs', 't5.maxHeightCm',
  't5.landingWindowMs', 't5.landingFlex', 't5.landingValgus', 't5.landingSymMs', 't5.cvPct', 't5.weights',
  't5.armSwingWrist', 't5.nominalHeightM', 't5.flightDetect', 't5.reps', 'score.meanWorst', 'score.bands03', 'prq.verticalJump',
];

const FEET = [27, 28, 29, 30, 31, 32];
const SCORING_POINTS = [23, 24, 25, 26, ...FEET];

export const heightCmOf = (flightMs: number) => (G * (flightMs / 1000) ** 2) / 8 * 100;

/** One flight found in the stream. */
export interface Flight {
  takeoffT: number;
  landT: number;
  /** Each foot's own touchdown (ms), when it was seen. */
  footDownT: { left: number | null; right: number | null };
  /** Indices: last frame down before take-off, first frame down after landing. */
  takeoffIdx: number;
  landIdx: number;
  /** Frames in the air, for the arm-swing check. */
  airIdx: number[];
  landed: boolean;
}

/**
 * The instant a foot's height line meets the floor: a least-squares line through the given (t, h) points, solved for
 * h = 0 and clamped to [lo, hi] (the frame gap the edge lies in). One point, or a flat line, gives the gap's middle.
 */
function edgeAt(pts: readonly { t: number; h: number }[], lo: number, hi: number): number {
  const mid = (lo + hi) / 2;
  if (pts.length < 2) return mid;
  const n = pts.length, mt = pts.reduce((a, p) => a + p.t, 0) / n, mh = pts.reduce((a, p) => a + p.h, 0) / n;
  const sxx = pts.reduce((a, p) => a + (p.t - mt) ** 2, 0), sxy = pts.reduce((a, p) => a + (p.t - mt) * (p.h - mh), 0);
  if (sxx < 1e-9 || Math.abs(sxy / sxx) < 1e-9) return mid;
  const slope = sxy / sxx, t0 = mt - mh / slope;
  return Number.isFinite(t0) ? Math.max(lo, Math.min(hi, t0)) : mid;
}

/** The flight finder's numbers, all in the register (lib/screen/PROPOSED-thresholds.ts 't5.flightDetect'). */
const FD = th('t5.flightDetect');

/**
 * A foot moving slower than this (body heights per second, over PLANTED_MS) is planted: it is where the floor is. Read
 * over a fixed time rather than one frame, so a 60 fps stream is not twice as quick to call a slow foot planted (a foot
 * slowing at the top of a jump read as planted at 60 fps and landed the jump in the air), and one frame's jitter is
 * not a step.
 */
const PLANTED = FD.plantedSpeed;
const PLANTED_MS = FD.plantedMs;
/** Planted frames the floor is read from, at most, next to an edge. */
const FLOOR_FRAMES = FD.floorFrames;
/**
 * The edge line is fitted through the airborne frames within this long of the edge (at least two): the early rise, the
 * late fall. By time, not by count: three frames at 30 fps span a stretch of the flight curved enough to pull the line
 * (a clean flight read 13 ms long), while at 60 fps three frames are what jitter needs.
 */
const EDGE_SPAN_MS = FD.edgeSpanMs;
/** …and only while the foot is this low (body heights): higher, the legs are tucking and the line bends. */
const EDGE_TOP = FD.edgeTop;
/**
 * How far past the frame gap an edge may be placed (ms): one 60 fps frame. Under jitter the last planted frame can read
 * just over the contact line, which put the gap after the true take-off; measured on the synthetic CMJ at 60 fps, a
 * clamp to the gap alone read every flight short (−1.7 cm mean). A whole frame of slack at 30 fps over-read (+1.7 cm).
 */
const EDGE_SLACK_MS = FD.edgeSlackMs;

/** A flight: take-off and landing, or a reason it is not one. */
export type FlightCheck = { ok: true } | { ok: false; why: string };

/**
 * Every flight in a stream, on the raw frames.
 *
 * THE FLOOR IS RE-READ AROUND EVERY JUMP, not taken once from the calibration. Measured on the owner's recorded two-foot
 * jumps (lib/pose/__fixtures__/jump_two_foot_high.json): the athlete stepped 25 cm back during the dip and landed 40
 * cm nearer the lens, and a floor fixed at the start read the step as a 0.6 s flight and never found the landing. So:
 *   · the TAKE-OFF floor is the last planted run before the feet leave it (a run at one level: a step to a new spot
 *     starts a new run, it does not blend two);
 *   · feet that rise off the floor and SETTLE within ~0.1 s, still low, stepped to a new spot: not a flight;
 *   · the LANDING floor is the first planted run after the feet have come down from the apex, wherever it is;
 *   · a flight whose feet never rose as far as its air time needs (h = g·t²/8, against a nominal body height) is the
 *     camera losing the feet, and is refused with that reason rather than scored.
 * A 3-frame median on each foot's height takes out a single jittered frame at a line. The calibration's lines are the
 * fallback when there is no planted run to read.
 */
export function detectFlights(raw: readonly PoseFrame[], front: FrontCalibration): (Flight & { check: FlightCheck })[] {
  const vis = th('gate.visibility'), contact = th('t5.contactLine'), air = th('t5.airLine'), bh = front.bodyHeight;
  const n = raw.length, t = (i: number) => raw[i].t;
  const seen = raw.map((f) => f.present && f.image.length >= 33 && FEET.every((k) => f.image[k].v >= vis));
  const lowRaw = (s: 'left' | 'right') => raw.map((f, i) => (seen[i] ? footLowY(f.image, s) : NaN));
  const med3 = (v: number[]) => v.map((x, i) => {
    const w = [v[i - 1], x, v[i + 1]].filter(Number.isFinite);
    return w.length ? w.sort((a, b) => a - b)[w.length >> 1] : NaN;
  });
  const low = { left: med3(lowRaw('left')), right: med3(lowRaw('right')) };
  const planted = (s: 'left' | 'right', i: number) => {
    if (!Number.isFinite(low[s][i])) return false;
    let j = i - 1;
    while (j > 0 && t(i) - t(j) < PLANTED_MS) j--;
    if (j < 0 || !Number.isFinite(low[s][j]) || t(i) - t(j) < PLANTED_MS * FD.plantedMinShare) return false;
    return Math.abs(low[s][i] - low[s][j]) / bh / ((t(i) - t(j)) / 1000) < PLANTED;
  };
  const plantedBoth = (i: number) => planted('left', i) && planted('right', i);
  /** The level of the planted run nearest frame i in direction dir (one level: it ends where the foot moves on). */
  const runNear = (s: 'left' | 'right', i: number, dir: -1 | 1): number => {
    let k = i;
    while (k >= 0 && k < n && Math.abs(t(k) - t(i)) < FD.searchMs && !planted(s, k)) k += dir;
    const ys: number[] = [];
    let gap = 0;
    for (; k >= 0 && k < n && ys.length < FLOOR_FRAMES; k += dir) {
      if (planted(s, k) && (!ys.length || Math.abs(low[s][k] - ys[0]) / bh < FD.runLevel)) { ys.push(low[s][k]); gap = 0; }
      else if (++gap > 1) break;                                   // one jittered frame does not end the run
    }
    if (ys.length >= FD.minRunFrames) { ys.sort((a, b) => a - b); return ys[ys.length >> 1]; }
    // no run to read (a heel peeling off slowly before a rebound): the foot's low line over the last 0.8 s instead,
    // the median of its three lowest reads so one jittered frame is not the floor; the calibration's line last of all
    const near: number[] = [];
    for (let q = i; q >= 0 && q < n && Math.abs(t(q) - t(i)) <= FD.lookbackMs; q += dir) if (Number.isFinite(low[s][q])) near.push(low[s][q]);
    if (near.length < FD.minRunFrames) return front.footFloorY[s];
    near.sort((a, b) => b - a);
    return near[1];
  };
  const floorAt = (i: number, dir: -1 | 1) => ({ left: runNear('left', i, dir), right: runNear('right', i, dir) });
  const height = (s: 'left' | 'right', i: number, floor: number) => (floor - low[s][i]) / bh;
  const both = (i: number, fl: { left: number; right: number }) => Math.min(height('left', i, fl.left), height('right', i, fl.right));
  const nominalM = th('t5.nominalHeightM'), heightM = front.worldHeight ?? nominalM;

  const flights: (Flight & { check: FlightCheck })[] = [];
  let i = 1;
  while (i < n) {
    const pre = floorAt(i - 1, -1);
    if (!(both(i, pre) > air)) { i++; continue; }
    // stepped to a new spot: the feet settle again within ~0.1 s, still low — a new floor, not a flight
    let k = i, still = 0;
    while (k < n && t(k) - t(i) <= FD.settleMs && still < FD.settleFrames) { still = plantedBoth(k) ? still + 1 : 0; k++; }
    if (still >= FD.settleFrames && both(k - 1, pre) < FD.settleRise * air) { i = k; continue; }
    // the last frame down before it, against the floor the feet left from
    let b = i - 1;
    while (b >= 0 && !(both(b, pre) <= contact)) b--;
    if (b < 0) { i++; continue; }
    const rise: { t: number; h: number }[] = [];
    for (let q = b + 1; q < n; q++) {
      const h = both(q, pre);
      if (!Number.isFinite(h)) continue;
      if (rise.length >= 2 && (h > EDGE_TOP || t(q) - rise[0].t > EDGE_SPAN_MS)) break;
      rise.push({ t: t(q), h });
    }
    // the edge may sit a little before the last frame read as down: under jitter a planted foot reads a little up
    const takeoffT = edgeAt(rise, t(b) - EDGE_SLACK_MS, t(b + 1));
    const limit = takeoffT + th('t5.flightMaxMs') + FD.limitSlackMs;
    // the apex, then the first planted run after the feet have come down from it: the landing floor
    let apex = i, r = -1;
    for (let q = i; q < n && t(q) <= limit; q++) {
      const h = both(q, pre);
      if (Number.isFinite(h) && h > both(apex, pre)) apex = q;
      if (q > apex && Number.isFinite(h) && h < both(apex, pre) - FD.apexDrop && plantedBoth(q) && plantedBoth(q + 1 < n ? q + 1 : q)) { r = q; break; }
    }
    const post = r >= 0 ? floorAt(r, 1) : pre;
    let d = apex;
    while (d < n && t(d) <= limit && !(both(d, post) <= contact)) d++;
    const landed = r >= 0 && d < n && t(d) <= limit;
    const last = Math.min(n - 1, d);
    const airIdx: number[] = [];
    for (let q = b + 1; q < last; q++) if (seen[q]) airIdx.push(q);
    const fall = (h: (q: number) => number, end: number): { t: number; h: number }[] => {
      const out: { t: number; h: number }[] = [];
      for (let q = end - 1; q > apex; q--) {
        const v = h(q);
        if (!Number.isFinite(v)) continue;
        if (out.length >= 2 && (v > EDGE_TOP || out[0].t - t(q) > EDGE_SPAN_MS)) break;
        out.push({ t: t(q), h: v });
      }
      return out;
    };
    const landT = !landed ? t(last) : edgeAt(fall((q) => both(q, post), d), t(d - 1), t(d) + EDGE_SLACK_MS);
    const footDown = (s: 'left' | 'right'): number | null => {
      let q = apex;
      while (q < n && t(q) <= limit && !(height(s, q, post[s]) <= contact)) q++;
      if (q >= n || t(q) > limit) return null;
      return edgeAt(fall((x) => height(s, x, post[s]), q), t(q - 1), t(q) + EDGE_SLACK_MS);
    };
    // the feet have to rise as far as the air time says, against either floor (loose: half, and a nominal height)
    const T = (landT - takeoffT) / 1000;
    const risen = Math.min(both(apex, pre), both(apex, post)) * heightM;
    const check: FlightCheck = !landed || T <= 0 || risen >= FD.riseShare * (G * T * T) / 8 ? { ok: true }
      : { ok: false, why: 'your feet did not rise as far as that air time needs, so the camera lost them' };
    flights.push({ takeoffT, landT, footDownT: { left: footDown('left'), right: footDown('right') }, takeoffIdx: b, landIdx: last, airIdx, landed, check });
    i = landed ? d + 1 : n;
  }
  return flights;
}

export function gradeT5(raw: readonly PoseFrame[], ctx: GradeContext & { cameraFps?: number | null }): TestResult & { t5: T5Extra } {
  const front = ctx.calibration.front, aspect = ctx.aspect;
  const hz = ctx.poseHz ?? poseHz(raw);
  const fpsLow = hz < th('gate.jumpFps');
  const base = { id: 'T5' as const, thresholdsUsed: T5_THRESHOLDS, provisional: isProvisional(T5_THRESHOLDS) };
  const emptyExtra: T5Extra = {
    jumps: [], bestHeightCm: null, bestFlightMs: null, bestJump: null, poseFps: hz, cameraFps: ctx.cameraFps ?? null,
    fpsLow, heightPlusMinusCm: null, cvPct: null, inconsistent: false,
  };
  if (!front) {
    return { ...base, status: 'notScored', confidence: 0, sides: {}, score100: null, score03: null, asymmetry: null, frames: { passing: 0, total: raw.length }, frozen: [], t5: emptyExtra };
  }
  const frames = smooth(raw);
  const vis = th('gate.visibilityScoring');
  const ok = frames.map((f) => f.present && passes(f.image, SCORING_POINTS, 'front', vis));
  const flights = detectFlights(raw, front);
  const wLanding = th('t5.landingWindowMs');
  const jumps: (JumpRead & { landFrame: number })[] = [];
  for (const fl of flights) {
    const flightMs = fl.landT - fl.takeoffT;
    if (flightMs < th('t5.flightMinMs')) continue;                       // a hop, not an attempt
    const heightCm = heightCmOf(flightMs);
    const index = jumps.length + 1;
    let invalidWhy: string | undefined;
    if (!fl.landed) invalidWhy = 'the camera never saw you land';
    else if (!fl.check.ok) invalidWhy = fl.check.why;
    else if (flightMs > th('t5.flightMaxMs') || Math.round(heightCm * 10) / 10 > th('t5.maxHeightCm')) invalidWhy = `it read over ${th('t5.maxHeightCm')} cm, so the camera lost your feet`;
    else if (fl.airIdx.some((k) => raw[k].image.length >= 33 && wristsAboveShoulders(raw[k].image) > th('t5.armSwingWrist'))) invalidWhy = 'your hands left your hips';
    // the landing: the deepest hip drop within the window, and the knees there
    let landFrame = fl.landIdx, deepest = -Infinity;
    for (let k = fl.landIdx; k < frames.length && frames[k].t <= fl.landT + wLanding; k++) {
      if (!ok[k]) continue;
      const d = hipDrop(frames[k].image, front.hipY, front.floorY);
      if (d > deepest) { deepest = d; landFrame = k; }
    }
    const landed = Number.isFinite(deepest);
    const valg = (s: 'left' | 'right') => (landed ? fppa(frames[landFrame].image, s, aspect) - front.fppa[s] : null);
    let dip: number | null = null;
    for (let k = fl.takeoffIdx; k >= 0 && frames[k].t >= fl.takeoffT - 1000; k--) {
      if (!ok[k]) continue;
      const kf = Math.max(kneeFlexionFront(frames[k].image, frames[k].world, 'left', front.legY.left), kneeFlexionFront(frames[k].image, frames[k].world, 'right', front.legY.right));
      if (Number.isFinite(kf) && (dip === null || kf > dip)) dip = kf;
    }
    const { left: dl, right: dr } = fl.footDownT;
    jumps.push({
      index, valid: !invalidWhy, ...(invalidWhy ? { invalidWhy } : {}),
      flightMs: Math.round(flightMs), heightCm: Math.round(heightCm * 10) / 10,
      takeoffT: Math.round(fl.takeoffT), landT: Math.round(fl.landT),
      landingFlex: landed ? Math.round(deepest * 1000) / 1000 : null,
      landingValgus: { left: valg('left'), right: valg('right') },
      landingSymMs: !fpsLow && dl !== null && dr !== null ? Math.round(Math.abs(dl - dr)) : null,
      dipKneeFlex: dip === null ? null : Math.round(dip),
      landFrame,
    });
  }

  const valid = jumps.filter((j) => j.valid);
  const w = th('t5.weights');
  const jumpMetrics = (j: JumpRead): MetricResult[] => [
    metric('landingFlex', 'Landing absorb (hip drop)', 'of standing hip height', j.landingFlex, 't5.landingFlex', bandOf('t5.landingFlex'), w.landingFlex, { rep: j.index }),
    metric('landingValgusLeft', 'Left knee on landing (FPPA)', '°', j.landingValgus.left, 't5.landingValgus', bandOf('t5.landingValgus'), w.landingValgusLeft, { side: 'left', rep: j.index }),
    metric('landingValgusRight', 'Right knee on landing (FPPA)', '°', j.landingValgus.right, 't5.landingValgus', bandOf('t5.landingValgus'), w.landingValgusRight, { side: 'right', rep: j.index }),
    { ...metric('landingSym', 'Feet touching down together', 'ms apart', j.landingSymMs, 't5.landingSymMs', bandOf('t5.landingSymMs'), w.landingSym, { rep: j.index }),
      ...(fpsLow ? { note: 'not scored at this frame rate' } : {}) },
  ];
  const per = valid.map((j) => ({ j, metrics: jumpMetrics(j) }));
  const best = bestReps(per.map((p) => weightedScore(p.metrics) ?? 0));
  const frozen: FrozenRep[] = [];
  const metrics: MetricResult[] = per.length ? per[0].metrics.map((tmpl) => {
    const med = medianRep(per.map((p) => p.metrics.find((m) => m.id === tmpl.id)!.value ?? NaN), best);
    const m: MetricResult = {
      ...metric(tmpl.id, tmpl.label, tmpl.unit, med ? med.value : null, tmpl.thresholdId, bandOf(tmpl.thresholdId), tmpl.weight, {
        ...(tmpl.side ? { side: tmpl.side } : {}), ...(med ? { rep: per[med.at].j.index } : {}),
      }),
      ...(tmpl.note ? { note: tmpl.note } : {}),
    };
    if (m.fault) {
      const worst = per.reduce((a, b) => ((b.metrics.find((x) => x.id === tmpl.id)!.score ?? 101) < (a.metrics.find((x) => x.id === tmpl.id)!.score ?? 101) ? b : a));
      const jf = jumps.find((x) => x.index === worst.j.index)!;
      frozen.push({ metric: tmpl.id, ...(tmpl.side ? { side: tmpl.side } : {}), rep: worst.j.index, image: frames[jf.landFrame].image.map((l) => ({ ...l })), aspect });
    }
    return m;
  }) : [];

  const heights = valid.map((j) => j.heightCm);
  const bestJ = valid.reduce<(typeof valid)[number] | null>((a, j) => (!a || j.heightCm > a.heightCm ? j : a), null);
  const mean = heights.length ? heights.reduce((a, b) => a + b, 0) / heights.length : 0;
  const cvPct = heights.length >= 2 ? Math.round((Math.sqrt(heights.reduce((a, h) => a + (h - mean) ** 2, 0) / heights.length) / mean) * 1000) / 10 : null;
  const extra: T5Extra = {
    jumps: jumps.map(({ landFrame: _lf, ...j }) => { void _lf; return j; }),
    bestHeightCm: bestJ ? bestJ.heightCm : null,
    bestFlightMs: bestJ ? bestJ.flightMs : null,
    bestJump: bestJ ? bestJ.index : null,
    poseFps: hz, cameraFps: ctx.cameraFps ?? null, fpsLow,
    // one frame of timing on the best flight: dh = g·t·dt / 4
    heightPlusMinusCm: bestJ && hz > 0 ? Math.round(((G * (bestJ.flightMs / 1000) * (1 / hz)) / 4) * 1000) / 10 : null,
    cvPct, inconsistent: cvPct !== null && cvPct >= bandOf('t5.cvPct').fault!,
  };
  const passing = ok.filter(Boolean).length;
  const confidence = confidenceOf(passing, raw.length, hz);
  if (!scorable(confidence)) {
    return { ...base, status: 'notScored', confidence, sides: {}, score100: null, score03: null, asymmetry: null, frames: { passing, total: raw.length }, frozen: [], t5: extra };
  }
  const both = sideResult(metrics, { repsValid: valid.length, repsTotal: jumps.length });
  return {
    ...base, status: 'scored', confidence, sides: { both }, ...worseSide({ both }), asymmetry: null,
    frames: { passing, total: raw.length }, frozen, t5: extra,
  };
}

/** The points a T5 scoring frame needs (the live gate reads the same list). */
export const T5_POINTS = SCORING_POINTS;
