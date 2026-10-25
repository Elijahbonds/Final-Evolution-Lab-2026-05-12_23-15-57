// refine — a flight's take-off, apex and touch-down re-timed from the WHOLE flight, and the landing posture measured
// (JUMP-PRO, 2026-10-24). It runs on a flight lib/assess/graders/t5-cmj.ts detectFlights already found; it never finds
// one, never refuses one, and changes none of the finder's tuned numbers.
//
// WHY. The finder times each edge from the foot alone: a line through the foot's first (or last) ~50 ms off the floor,
// extrapolated to it. Measured on the ground-truth bench (lib/jump/bench.ts, realistic noise, 8 seeds × 3 jumps):
//   take-off  +4 ms late at 60 fps, +7 at 120, +12 at 240 (the toe leaves last and slowly, so the foot's early rise
//             curves, and the line through it lands late); SD 19 ms at 30 fps (two noisy points make the line)
//   landing   within ±1 ms mean, SD 9 → 3 ms from 30 → 240 fps
// and the flight time cannot see a landing on bent knees (+5 cm) or flat feet (+3 cm): the body comes down lower than
// it left, so it falls for longer.
//
// HOW. In the air the hips are ballistic: one parabola fits every airborne frame, from the torso's points, which the
// model holds about twice as steadily as a foot. A foot is the hips minus the leg: footHeight(t) = hips(t) − L(t), where
// L is the hip-to-lowest-foot length, a POSTURE that changes slowly in the air. So each edge is where
//   hips(t) − floor = L(t)
// with hips(t) the parabola, the floor the planted run's median, and L(t) a line fitted to the airborne legs next to
// the edge (EDGE_FIT_MS). The noise of one foot frame is averaged over every frame of the fit instead of riding on the
// two nearest the floor. Then:
//   apexT          the parabola's vertex
//   landDropCm     L at touch-down minus L at take-off: the hips' height at contact, landing vs take-off (− = lower)
//   heightTovCm    the take-off-velocity height, from the flight time AND the landing drop: the hips rise
//                  v0·T − g·T²/2 = landDrop over the flight, so v0 = landDrop/T + g·T/2 and h = v0²/2g. With a landing in
//                  the take-off posture it is exactly g·T²/8; with bent knees it takes the extra fall back out.
// The parabola's own curvature is the ruler (g in image units: free fall scales the picture), so no body height and
// no lens model is needed; a ruler more than RULER_TOL off the calibration's is not trusted and the drop is not used.
//
// Pure.
import type { PoseFrame } from '@/lib/pose/landmarks';
import type { FrontCalibration } from '@/lib/assess/calibration';
import { footLowY } from '@/lib/assess/geometry';
import { th } from '@/lib/assess/thresholds';
import { comOf } from './com';

export const G = 9.81;

/** The refiner's numbers (new, JUMP-PRO): measured on lib/jump/bench.ts; see each line. */
export const REFINE = {
  /** Airborne frames this close to an edge (ms) are left out of the hip parabola: the hips still push / absorb. */
  parabolaMarginMs: 25,
  /** At least this many frames in the parabola, or nothing is refined. */
  minParabolaFrames: 5,
  /** The leg line next to an edge is fitted over this long of flight (ms), and at least EDGE_MIN_FRAMES frames. */
  edgeFitMs: 70,
  edgeMinFrames: 3,
  /** The planted floor is the median lowest foot over this window before take-off / after touch-down (ms). */
  floorFromMs: 30, floorToMs: 220,
  /** A refined edge is searched this far (ms) either side of its centre (the finder's edge, or the parabola's own). */
  maxShiftMs: 90,
  /** The finder's edge is re-centred on the parabola when the hips there are this far (cm) off the leg's length. */
  recentreCm: 6,
  /** Parabola frames off it by more than this many robust SDs (or 1.5 cm) are dropped and it is fitted again. */
  trimSd: 3,
  /** The free-fall ruler must agree with the calibration's (nominal body height) within this share to be used. */
  rulerTol: 0.35,
  /** A foot the model is unsure of (visibility under the gate, over unsureVis) still counts, at this weight (1/σ²: 3× the noise). */
  unsureVis: 0.2,
  unsureWeight: 1 / 9,
  /**
   * The torso's width (shoulders + hips, image x) standing after the landing over before the take-off: past this share
   * the athlete moved toward or away from the lens, the picture's scale changed, and the drop is not used.
   */
  depthTol: 0.06,
  /**
   * A body cannot land MORE extended than it took off (the take-off is full extension on the toes): a drop above zero
   * is the picture, not the body, and is read as none — over this (cm) it marks the landing unreadable.
   */
  riseTolCm: 4,
  /** A re-timed flight vouches for itself (over the finder's rise check) when its apex sits this near mid-flight (rise ÷ fall)… */
  vouchRiseFall: 0.3,
  /** …and the hips' parabola fits within this RMS (cm). */
  vouchRmsCm: 2,
  /**
   * The fits' own SD understates the error by this much (bench, every condition: the error over the claimed SD had an
   * SD of 1.1–1.3, not 1), so every ± is widened by it. The ± a jump is shown with must not promise more than it keeps.
   */
  sdInflate: 1.2,
  /** The leg-length noise prior (cm, one frame): MediaPipe-lite foot jitter at the default rig, pooled into every fit. */
  legNoiseCm: 1.5,
  /**
   * JUMP-PRO 2 (approach, `plantFloor`): the take-off floor is a line through the PLANT foot's own stance, from this long
   * before the take-off to this long before it (ms), read at the take-off — no stand before it, and a floor that moves
   * in the picture under a rolling foot is followed to where the toe leaves. Bench: a plant lasts 180–240 ms.
   */
  plantFromMs: 150, plantToMs: 12,
  /** With `rescale`: past this change of scale over the jump (share) even the rescaled drop is not used. */
  rescaleMax: 0.3,
} as const;

/** JUMP-PRO 2: what an approach read changes (every default is the standing jump's, unchanged). */
export interface RefineOpts {
  /** The point that flies the parabola: the hips (hands on hips) or the centre of mass (arms swinging; lib/jump/com.ts). */
  point?: 'hips' | 'com';
  /** The take-off floor from the plant step's own stance (a line, read at the take-off) instead of the planted run. */
  plantFloor?: boolean;
  /**
   * How a move toward the lens is seen: the torso's width (facing the lens) or the legs' segment lengths (side-on: the
   * thigh and shin lie in the picture's plane, so their lengths change only with the distance).
   */
  depthCue?: 'torso' | 'legs';
  /** The picture's width ÷ height (the legs' lengths need it). */
  aspect?: number;
  /**
   * Shrink the landing drop toward none by its own noise (default true: a standing jump should land tall, so a drop
   * inside its noise is noise). An approach lands lower almost every time (the arms come down, the legs reach for the
   * floor): there the prior is wrong and the shrink reads high, so the drop is taken out whole.
   */
  shrinkDrop?: boolean;
  /** With the legs' cue: read each edge's leg at the flight's own scale instead of refusing a drop past depthTol. */
  rescale?: boolean;
  /** Re-timing passes (default 3): each re-fits the floors and leg lines from the last pass's edges. */
  passes?: number;
}

export interface RefinedFlight {
  takeoffT: number;
  landT: number;
  apexT: number;
  flightMs: number;
  /** g·T²/8 of the refined flight (cm). */
  heightFlightCm: number;
  /** The take-off-velocity height (cm), the landing drop taken out; equals heightFlightCm when no drop was used. */
  heightTovCm: number;
  /** Hip height at touch-down minus at take-off (cm, − = landed lower); null when the ruler could not be trusted. */
  landDropCm: number | null;
  /** Its standard error (cm). */
  landDropSdCm: number | null;
  /** The share of the drop taken out (0–1): a drop inside its own noise is shrunk toward none. */
  dropWeight: number;
  /** Torso width standing after over before (1 = the same distance from the lens). */
  depthRatio: number | null;
  /** Why the drop was not used, when it was not. */
  dropSkipped: 'ruler' | 'moved' | 'rose' | null;
  /** One standard deviation of each height (cm), from the fits' own residuals: the ± a jump is shown with. */
  heightFlightSdCm: number;
  heightTovSdCm: number;
  /** Rise time over fall time of the hips (1 = landed as it left): the posture check that needs no ruler. */
  riseFall: number;
  /** Metres per image-height unit, from free fall. */
  ruler: number;
  /** Frames the parabola used, and its RMS residual (cm). */
  frames: number;
  rmsCm: number;
  /** Each edge moved from the finder's (ms). */
  shiftMs: { takeoff: number; land: number };
  /** JUMP-PRO 2: each refined edge's own ±1 SD (ms), the fits' error over the foot's crossing speed (× sdInflate). */
  edgeSdMs: { takeoff: number; land: number };
}

interface Pt { t: number; v: number; w?: number }

interface Line { at: (t: number) => number; slope: number; se: (t: number) => number }

/**
 * A least-squares line and its standard error at any t. The residual SD is pooled with a prior `s0` (two
 * pseudo-observations), so a fit of three frames does not claim it knows its own noise.
 */
function fitLine(pts: readonly Pt[], s0: number): Line | null {
  if (pts.length < 2) return null;
  const wt = (p: Pt) => p.w ?? 1;
  const W = pts.reduce((a, p) => a + wt(p), 0);
  const mt = pts.reduce((a, p) => a + wt(p) * p.t, 0) / W, mv = pts.reduce((a, p) => a + wt(p) * p.v, 0) / W;
  const sxx = pts.reduce((a, p) => a + wt(p) * (p.t - mt) ** 2, 0), sxy = pts.reduce((a, p) => a + wt(p) * (p.t - mt) * (p.v - mv), 0);
  const slope = sxx > 1e-12 ? sxy / sxx : 0;
  // weighted residuals are in full-weight units: the variance of a unit-weight frame
  const ssr = pts.reduce((a, p) => a + wt(p) * (p.v - (mv + slope * (p.t - mt))) ** 2, 0);
  const sd = Math.sqrt((ssr + 2 * s0 * s0) / Math.max(1, pts.length - 2 + 2));
  return { at: (t) => mv + slope * (t - mt), slope, se: (t) => sd * Math.sqrt(1 / W + (sxx > 1e-12 ? (t - mt) ** 2 / sxx : 0)) };
}

/** Least-squares parabola v = a + b·τ + c·τ² (τ in s from t0). */
function fitParabola(pts: readonly Pt[], t0: number): { a: number; b: number; c: number; rms: number } | null {
  if (pts.length < 3) return null;
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, y0 = 0, y1 = 0, y2 = 0;
  for (const p of pts) {
    const x = (p.t - t0) / 1000, x2 = x * x;
    s0 += 1; s1 += x; s2 += x2; s3 += x2 * x; s4 += x2 * x2; y0 += p.v; y1 += p.v * x; y2 += p.v * x2;
  }
  // solve [[s0 s1 s2][s1 s2 s3][s2 s3 s4]] · [a b c] = [y0 y1 y2]
  const det = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const M = [[s0, s1, s2], [s1, s2, s3], [s2, s3, s4]], Y = [y0, y1, y2];
  const D = det(M);
  if (Math.abs(D) < 1e-18) return null;
  const col = (k: number) => det(M.map((r, i) => r.map((v, j) => (j === k ? Y[i] : v))));
  const a = col(0) / D, b = col(1) / D, c = col(2) / D;
  const rms = Math.sqrt(pts.reduce((acc, p) => { const x = (p.t - t0) / 1000; return acc + (p.v - (a + b * x + c * x * x)) ** 2; }, 0) / pts.length);
  return { a, b, c, rms };
}

/** The parabola again without its outliers (a frame of the push or the absorb, a jittered hip). */
function robustParabola(pts: readonly Pt[], t0: number, floorU: number): ReturnType<typeof fitParabola> {
  const p = fitParabola(pts, t0);
  if (!p) return null;
  const res = pts.map((q) => { const x = (q.t - t0) / 1000; return Math.abs(q.v - (p.a + p.b * x + p.c * x * x)); });
  const lim = Math.max(floorU, REFINE.trimSd * 1.4826 * median(res));
  const kept = pts.filter((_, i) => res[i] <= lim);
  return kept.length >= REFINE.minParabolaFrames && kept.length < pts.length ? fitParabola(kept, t0) ?? p : p;
}

const median = (v: number[]) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

const HIPS = [23, 24];
const FEET = [27, 28, 29, 30, 31, 32];

/**
 * Re-time one flight. `takeoffT` / `landT` are the finder's edges. Null when the flight has too few airborne frames
 * with the hips and feet seen, or its hips do not fall like a body in free fall (then the finder's read stands).
 */
export function refineFlight(
  raw: readonly PoseFrame[], front: FrontCalibration, takeoffT: number, landT: number,
  /** The neighbouring flights' edges: a floor is never read inside another flight (a rebound's contact is short). */
  near: { prevLandT?: number; nextTakeoffT?: number } = {},
  opts: RefineOpts = {},
): RefinedFlight | null {
  const vis = th('gate.visibility');
  const hipsOk = (f: PoseFrame) => f.present && f.image.length >= 33 && HIPS.every((k) => f.image[k].v >= vis);
  const feetOk = (f: PoseFrame) => hipsOk(f) && FEET.every((k) => f.image[k].v >= vis);
  const feetSeen = (f: PoseFrame) => hipsOk(f) && FEET.every((k) => f.image[k].v >= REFINE.unsureVis);
  // image heights grow UP: u = −y
  const hipU = opts.point === 'com' ? (f: PoseFrame) => -comOf(f.image).y : (f: PoseFrame) => -(f.image[23].y + f.image[24].y) / 2;
  const lowU = (f: PoseFrame) => -Math.max(footLowY(f.image, 'left'), footLowY(f.image, 'right'));
  const legL = (f: PoseFrame) => hipU(f) - lowU(f);

  let to = takeoffT, td = landT;
  let par: ReturnType<typeof fitParabola> = null, t0 = 0, used = 0;
  let floorPre = NaN, floorPost = NaN;
  let Lto = NaN, Ltd = NaN, seTo = NaN, seTd = NaN, slopeTo = NaN, slopeTd = NaN, seFloorPre = NaN, seFloorPost = NaN;
  const R = REFINE;
  // the floor windows, kept inside this flight's own contacts
  const prevLand = near.prevLandT;
  const preFrom = (to: number) => Math.max(to - R.floorToMs, (near.prevLandT ?? -Infinity) + R.floorFromMs);
  const postTo = (td: number) => Math.min(td + R.floorToMs, (near.nextTakeoffT ?? Infinity) - R.floorFromMs);
  const nominalRuler = (front.worldHeight ?? th('t5.nominalHeightM')) / front.bodyHeight;
  const s0 = R.legNoiseCm / 100 / nominalRuler;
  for (let pass = 0; pass < (opts.passes ?? 3); pass++) {
    const air = raw.filter((f) => hipsOk(f) && f.t > to + R.parabolaMarginMs && f.t < td - R.parabolaMarginMs);
    if (air.length < R.minParabolaFrames) return null;
    t0 = (to + td) / 2;
    par = robustParabola(air.map((f) => ({ t: f.t, v: hipU(f) })), t0, 0.015 / ((front.worldHeight ?? th('t5.nominalHeightM')) / front.bodyHeight));
    if (!par || par.c >= 0) return null;
    used = air.length;
    const pre = raw.filter((f) => feetOk(f) && f.t <= to - R.floorFromMs && f.t >= preFrom(to)).map(lowU);
    const post = raw.filter((f) => feetOk(f) && f.t >= td + R.floorFromMs && f.t <= postTo(td)).map(lowU);
    floorPre = median(pre); floorPost = median(post);
    // a median's standard error: 1.25 σ/√n
    seFloorPre = (1.25 * s0) / Math.sqrt(Math.max(1, pre.length)); seFloorPost = (1.25 * s0) / Math.sqrt(Math.max(1, post.length));
    if (opts.plantFloor) {
      // the plant's stance, up to the toe-off: a line read at the take-off (its median when the line has too few frames)
      // a heel rising fast comes back unsure (motion blur): it counts at the unsure weight, as the leg lines count it
      const st = raw.filter((f) => feetSeen(f) && f.t >= Math.max(to - R.plantFromMs, (prevLand ?? -Infinity) + R.floorFromMs) && f.t <= to - R.plantToMs).map((f) => ({ t: f.t, v: lowU(f), w: feetOk(f) ? 1 : R.unsureWeight }));
      const ln = st.length >= 4 ? fitLine(st, s0) : null;
      if (ln) { floorPre = ln.at(to); seFloorPre = ln.se(to); }
      else if (st.length) { floorPre = median(st.map((q) => q.v)); seFloorPre = (1.25 * s0) / Math.sqrt(st.length); }
    }
    if (!Number.isFinite(floorPre) || !Number.isFinite(floorPost)) return null;
    const P = par;
    const hipAt = (t: number) => { const x = (t - t0) / 1000; return P.a + P.b * x + P.c * x * x; };
    // the legs next to each edge, in the air
    const gap = (to + td) / 2;
    const near = (from: number, dir: 1 | -1) => {
      const out: Pt[] = [];
      const fs = dir === 1 ? raw.filter((f) => f.t > from && f.t < gap) : raw.filter((f) => f.t < from && f.t > gap).reverse();
      for (const f of fs) {
        if (!feetSeen(f)) continue;
        const w = feetOk(f) ? 1 : R.unsureWeight;
        if (out.length >= R.edgeMinFrames && Math.abs(f.t - from) > R.edgeFitMs) break;
        out.push({ t: f.t, v: legL(f), w });
      }
      return out;
    };
    const lUp = fitLine(near(to, 1), s0), lDown = fitLine(near(td, -1), s0);
    if (!lUp || !lDown) return null;
    // solve hips(t) − floor − L(t) = 0 by bisection inside the allowed shift
    const solve = (f: (t: number) => number, center: number, rising: boolean): number => {
      let lo = center - R.maxShiftMs, hi = center + R.maxShiftMs;
      const flo = f(lo), fhi = f(hi);
      if (!(Number.isFinite(flo) && Number.isFinite(fhi)) || Math.sign(flo) === Math.sign(fhi)) return center;
      for (let k = 0; k < 40; k++) {
        const m = (lo + hi) / 2, fm = f(m);
        if ((fm > 0) === rising) hi = m; else lo = m;
      }
      return (lo + hi) / 2;
    };
    // an edge the parabola says is in the air (or under the floor) is re-centred where the parabola meets the leg
    const off = (t: number, floor: number, L: number) => Math.abs(hipAt(t) - floor - L) * nominalRuler * 100;
    const vx = t0 + (-P.b / (2 * P.c)) * 1000;
    const along = (floor: number, L: number, rising: boolean) => {
      // hips(t) = floor + L on the rising (before the vertex) or falling side
      const disc = P.b * P.b - 4 * P.c * (P.a - floor - L);
      if (disc < 0) return NaN;
      const r1 = (-P.b + Math.sqrt(disc)) / (2 * P.c), r2 = (-P.b - Math.sqrt(disc)) / (2 * P.c);
      const roots = [r1, r2].map((x) => t0 + x * 1000);
      return rising ? Math.min(...roots) : Math.max(...roots);
    };
    let cTo = to, cTd = td;
    if (off(cTo, floorPre, lUp.at(cTo)) > R.recentreCm) { const x = along(floorPre, lUp.at(cTo), true); if (Number.isFinite(x) && x < vx) cTo = x; }
    if (off(cTd, floorPre, lDown.at(cTd)) > R.recentreCm && off(cTd, floorPost, lDown.at(cTd)) > R.recentreCm) { const x = along(floorPre, lDown.at(cTd), false); if (Number.isFinite(x) && x > vx) cTd = x; }
    const nto = solve((t) => hipAt(t) - floorPre - lUp.at(t), cTo, true);
    const ntd = solve((t) => hipAt(t) - floorPost - lDown.at(t), cTd, false);
    to = nto; td = ntd;
    Lto = lUp.at(to); Ltd = lDown.at(td);
    seTo = lUp.se(to); seTd = lDown.se(td);
    // how fast the foot crosses the floor (image units per ms): the hips' speed less the leg's own change
    const dHip = (t: number) => (P.b + 2 * P.c * ((t - t0) / 1000)) / 1000;
    slopeTo = Math.abs(dHip(to) - lUp.slope); slopeTd = Math.abs(dHip(td) - lDown.slope);
  }
  if (!par) return null;
  const T = (td - to) / 1000;
  const apexT = t0 + (-par.b / (2 * par.c)) * 1000;
  // free fall is the ruler: u'' = 2c image units/s² is g
  const ruler = G / (-2 * par.c);
  const nominal = (front.worldHeight ?? th('t5.nominalHeightM')) / front.bodyHeight;
  const rulerOk = Math.abs(ruler / nominal - 1) <= R.rulerTol;
  const asp = opts.aspect ?? 4 / 3;
  const seg = (f: PoseFrame, a: number, b: number) => Math.hypot((f.image[a].x - f.image[b].x) * asp, f.image[a].y - f.image[b].y);
  const width = opts.depthCue === 'legs'
    ? (f: PoseFrame) => seg(f, 23, 25) + seg(f, 25, 27) + seg(f, 24, 26) + seg(f, 26, 28)
    : (f: PoseFrame) => Math.abs(f.image[11].x - f.image[12].x) + Math.abs(f.image[23].x - f.image[24].x);
  // the legs' cue reads its segments from the hips, knees and ankles: a blurred (unsure) foot still has them
  const cueOk = opts.depthCue === 'legs' ? feetSeen : feetOk;
  const wPre = median(raw.filter((f) => cueOk(f) && f.t <= to - R.floorFromMs && f.t >= preFrom(to)).map(width));
  const wPost = median(raw.filter((f) => cueOk(f) && f.t >= td + R.floorFromMs && f.t <= postTo(td)).map(width));
  let depthRatio = Number.isFinite(wPre) && Number.isFinite(wPost) && wPre > 0 ? wPost / wPre : null;
  let moved = depthRatio === null || Math.abs(depthRatio - 1) > R.depthTol;
  let rawDrop = (Ltd - Lto) * ruler;
  if (opts.depthCue === 'legs' && opts.rescale) {
    // side-on, the legs' segment lengths are the picture's scale through the whole jump: a line through them in time
    // gives the scale at each edge, and each edge's leg is read at the flight's own scale (the parabola's), so a run
    // angled toward or away from the lens no longer reads as a landing drop
    const sc = fitLine(raw.filter((f) => cueOk(f) && f.t >= preFrom(to) && f.t <= postTo(td)).map((f) => ({ t: f.t, v: width(f) })), 0);
    const sTo = sc?.at(to) ?? NaN, sTd = sc?.at(td) ?? NaN, sMid = sc?.at((to + td) / 2) ?? NaN;
    if (sTo > 0 && sTd > 0 && sMid > 0) {
      depthRatio = sTd / sTo;
      moved = Math.abs(depthRatio - 1) > R.rescaleMax;
      rawDrop = (Ltd * (sMid / sTd) - Lto * (sMid / sTo)) * ruler;
    }
  }
  const rose = rawDrop * 100 > R.riseTolCm;
  const dropSkipped: RefinedFlight['dropSkipped'] = !rulerOk ? 'ruler' : moved ? 'moved' : rose ? 'rose' : null;
  const dropM = dropSkipped ? null : Math.min(0, rawDrop);
  const dropSdM = dropM !== null ? R.sdInflate * Math.hypot(seTo, seTd) * ruler : null;
  // each edge's timing SD (ms): the leg line's and the floor's error over the crossing speed
  const sdEdge = (se: number, seF: number, slope: number) => (slope > 1e-9 ? Math.hypot(se, seF) / slope : 0);
  const sdT = (R.sdInflate * Math.hypot(sdEdge(seTo, seFloorPre, slopeTo), sdEdge(seTd, seFloorPost, slopeTd))) / 1000;
  const heightFlightCm = ((G * T * T) / 8) * 100;
  const heightFlightSdCm = ((G * T * sdT) / 4) * 100;
  // the drop, shrunk by its own noise (a positive-part James–Stein weight): a clean landing's noise is not "taken out"
  const w = dropM === null || dropSdM === null || dropM === 0 ? 0 : opts.shrinkDrop === false ? 1 : Math.max(0, dropM * dropM - dropSdM * dropSdM) / (dropM * dropM);
  let heightTovCm = heightFlightCm, heightTovSdCm = heightFlightSdCm;
  if (dropM !== null && w > 0 && T > 0) {
    const v0 = (dropM * w) / T + (G * T) / 2;
    heightTovCm = ((v0 * v0) / (2 * G)) * 100;
    heightTovSdCm = Math.hypot(heightFlightSdCm, ((w * (dropSdM ?? 0)) / 2) * 100);
  }
  const rise = apexT - to, fall = td - apexT;
  return {
    takeoffT: to, landT: td, apexT, flightMs: td - to, heightFlightCm, heightTovCm,
    landDropCm: dropM === null ? null : dropM * 100, landDropSdCm: dropSdM === null ? null : dropSdM * 100, dropWeight: w, depthRatio, dropSkipped,
    heightFlightSdCm, heightTovSdCm, riseFall: fall > 0 ? rise / fall : NaN,
    ruler, frames: used, rmsCm: par.rms * ruler * 100,
    shiftMs: { takeoff: to - takeoffT, land: td - landT },
    edgeSdMs: { takeoff: R.sdInflate * sdEdge(seTo, seFloorPre, slopeTo), land: R.sdInflate * sdEdge(seTd, seFloorPost, slopeTd) },
  };
}

/** A re-timed flight that is plainly a body in free fall: its apex near mid-flight, its hip parabola tight. */
export const refineVouches = (r: RefinedFlight): boolean =>
  Number.isFinite(r.riseFall) && Math.abs(r.riseFall - 1) <= REFINE.vouchRiseFall && r.rmsCm <= REFINE.vouchRmsCm;
