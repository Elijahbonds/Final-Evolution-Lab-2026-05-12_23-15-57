// crossing — when a body point crosses a line, to a fraction of a frame (SPRINT-SPEED, 2026-10-25).
//
// The photo-finish read on one phone. Each frame gives the chosen body point's signed distance from the line (+ one
// side, − the other; lib/sprint/geometry.ts) at that frame's REAL capture time (PoseFrame.t: requestVideoFrameCallback's
// captureTime live, so a dropped or late frame moves nothing). A crossing is where the distance changes sign.
//
//   Sub-frame. The frames either side of the sign change are fitted with a straight line, distance against time (the
//   last `fitHalf` before and the first `fitHalf` after), and the crossing is that line's zero. Over ±2 frames a
//   sprinter's speed is constant to well under 1 %, so the straight line is the body's path, and the fit averages the
//   landmark jitter of four frames instead of trusting two.
//   Hold. It counts only when the point was on the old side `holdFrames` frames running and is on the new side
//   `holdFrames` frames running: a point jittering on the line is not two crossings.
//   ±. The fit's own spread (its residuals, or the register's point jitter when there are too few frames to measure
//   it) through the slope: σ_t = σ_d ÷ |slope| × √(1/n + (t* − t̄)² ÷ Σ(t − t̄)²). It is this read's spread, not an
//   accuracy (none is claimed until the pilot).
//
// Pure.
import { sr } from './PROPOSED-sprint';

/** One frame's read: its capture time (ms) and the point's signed distance from the line (picture heights). */
export interface LineSample { t: number; d: number }

export interface Crossing {
  /** When the point was on the line (ms, the frames' clock). */
  t: number;
  /** ±1 SD of t (ms). */
  sdMs: number;
  /** +1: − side to + side; −1: + to −. */
  dir: 1 | -1;
  /** The point's speed across the line (picture heights per second). */
  speed: number;
  /** The last sample before the line, and how many frames the fit used. */
  before: number;
  n: number;
}

export interface CrossingOptions {
  fitHalf?: number;
  fitMs?: number;
  holdFrames?: number;
  holdMs?: number;
  smoothMs?: number;
  /** σ of the point (picture heights) when the fit has too few frames to measure its own. */
  pointSd?: number;
  /** Only crossings after this time (ms). */
  after?: number;
  /** Only this direction. */
  dir?: 1 | -1;
}

const sideOf = (d: number): 1 | -1 => (d >= 0 ? 1 : -1);

/**
 * The line's zero through (t, d): a straight line, or — with 6 frames or more — a parabola (the body speeding up or
 * slowing through the window), taking the root nearest the straight line's. Returns the zero, its ±1 SD (the fitted
 * curve's own SD at the zero through the slope there), the slope at the zero (picture heights per ms), the residual SD.
 */
export function fitZero(pts: readonly LineSample[], pointSd: number): { t: number; sdMs: number; slope: number; resSd: number } | null {
  const n = pts.length;
  if (n < 2) return null;
  const tb = pts.reduce((s, p) => s + p.t, 0) / n;
  const db = pts.reduce((s, p) => s + p.d, 0) / n;
  let stt = 0, std = 0;
  for (const p of pts) { stt += (p.t - tb) ** 2; std += (p.t - tb) * (p.d - db); }
  if (stt === 0) return null;
  const slope1 = std / stt;
  if (slope1 === 0) return null;
  const t1 = tb - db / slope1;
  if (n >= 6) {
    const q = fitQuadZero(pts, tb, t1, pointSd);
    if (q) return q;
  }
  let rss = 0;
  for (const p of pts) rss += (p.d - (db + slope1 * (p.t - tb))) ** 2;
  // the residuals measure the jitter when there are enough frames to (n − 2 ≥ 3); otherwise the register's
  const resSd = n - 2 >= 3 ? Math.sqrt(rss / (n - 2)) : pointSd;
  const sd = Math.max(resSd, pointSd * 0.25);
  const sdMs = (sd / Math.abs(slope1)) * Math.sqrt(1 / n + (t1 - tb) ** 2 / stt);
  return { t: t1, sdMs, slope: slope1, resSd };
}

/** d = c0 + c1 u + c2 u², u = t − tb (ms): least squares by the normal equations, then the root nearest `near`. */
function fitQuadZero(pts: readonly LineSample[], tb: number, near: number, pointSd: number): { t: number; sdMs: number; slope: number; resSd: number } | null {
  // scale u to seconds so the 3×3 system is well conditioned
  const S = [0, 0, 0, 0, 0], R = [0, 0, 0];
  for (const p of pts) {
    const u = (p.t - tb) / 1000;
    let up = 1;
    for (let k = 0; k <= 4; k++) { S[k] += up; if (k <= 2) R[k] += up * p.d; up *= u; }
  }
  const M = [[S[0], S[1], S[2]], [S[1], S[2], S[3]], [S[2], S[3], S[4]]];
  const inv = inv3(M);
  if (!inv) return null;
  const c = [0, 1, 2].map((r) => inv[r][0] * R[0] + inv[r][1] * R[1] + inv[r][2] * R[2]);
  const un = (near - tb) / 1000;
  let u: number;
  if (Math.abs(c[2]) < 1e-12) { if (c[1] === 0) return null; u = -c[0] / c[1]; }
  else {
    const disc = c[1] * c[1] - 4 * c[2] * c[0];
    if (disc < 0) return null;
    const r1 = (-c[1] + Math.sqrt(disc)) / (2 * c[2]), r2 = (-c[1] - Math.sqrt(disc)) / (2 * c[2]);
    u = Math.abs(r1 - un) < Math.abs(r2 - un) ? r1 : r2;
  }
  const slopeS = c[1] + 2 * c[2] * u; // picture heights per second
  if (slopeS === 0) return null;
  const n = pts.length;
  let rss = 0;
  for (const p of pts) { const v = (p.t - tb) / 1000; rss += (p.d - (c[0] + c[1] * v + c[2] * v * v)) ** 2; }
  const resSd = n - 3 >= 3 ? Math.sqrt(rss / (n - 3)) : pointSd;
  const sd = Math.max(resSd, pointSd * 0.25);
  const x = [1, u, u * u];
  let lev = 0;
  for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) lev += x[r] * inv[r][k] * x[k];
  return { t: tb + u * 1000, sdMs: ((sd * Math.sqrt(Math.max(0, lev))) / Math.abs(slopeS)) * 1000, slope: slopeS / 1000, resSd };
}

function inv3(m: number[][]): number[][] | null {
  const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-18) return null;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}

/**
 * Every crossing of the line in the samples (time order), each held on both sides and timed to a fraction of a frame.
 * Where: the sign changes of the distance averaged over ±smoothMs. Held: that average stays on each side for
 * holdFrames frames and holdMs. Timed: a straight line through the RAW samples within ±max(fitHalf frames, fitMs).
 */
export function findCrossings(samples: readonly LineSample[], o: CrossingOptions = {}): Crossing[] {
  const half = Math.max(1, Math.round(o.fitHalf ?? sr('sprint.fitHalf')));
  const fitMs = o.fitMs ?? sr('sprint.fitMs');
  const hold = Math.max(1, Math.round(o.holdFrames ?? sr('sprint.holdFrames')));
  const holdMs = o.holdMs ?? sr('sprint.holdMs');
  const smoothMs = o.smoothMs ?? sr('sprint.smoothMs');
  const pointSd = o.pointSd ?? sr('sprint.pointSd');
  const s = samples.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.d)).slice().sort((a, b) => a.t - b.t);
  if (s.length < 2) return [];
  // the averaged distance (a window in time, so a dropped frame does not shift it)
  const sm: number[] = new Array(s.length);
  {
    let lo = 0, hi = 0, sum = 0;
    for (let i = 0; i < s.length; i++) {
      while (hi < s.length && s[hi].t <= s[i].t + smoothMs) { sum += s[hi].d; hi++; }
      while (s[lo].t < s[i].t - smoothMs) { sum -= s[lo].d; lo++; }
      sm[i] = sum / (hi - lo);
    }
  }
  const out: Crossing[] = [];
  let i = 0;
  while (i < s.length - 1) {
    const a = sideOf(sm[i]), b = sideOf(sm[i + 1]);
    if (a === b) { i++; continue; }
    const dir = (b > a ? 1 : -1) as 1 | -1;
    // held on both sides: consecutive averaged samples on each side, at least `hold` of them spanning at least holdMs
    // (a hold cut short by the start or end of the frames counts when it has its `hold` frames: the body entered or
    // left the picture)
    let nb = 0, na = 0, okBefore = false, okAfter = false;
    for (let k = i; k >= 0; k--) {
      if (sideOf(sm[k]) !== a) break;
      nb++;
      if (nb >= hold && (s[i].t - s[k].t >= holdMs || k === 0)) { okBefore = true; break; }
    }
    for (let k = i + 1; k < s.length; k++) {
      if (sideOf(sm[k]) !== b) break;
      na++;
      if (na >= hold && (s[k].t - s[i + 1].t >= holdMs || k === s.length - 1)) { okAfter = true; break; }
    }
    if (!okBefore || !okAfter || (o.after !== undefined && s[i + 1].t <= o.after) || (o.dir !== undefined && dir !== o.dir)) { i++; continue; }
    // the raw samples around the line: ±max(half frames, fitMs)
    const mid = (s[i].t + s[i + 1].t) / 2;
    let lo = i, hi = i + 1;
    while (lo > 0 && (i - lo + 1 < half || mid - s[lo - 1].t <= fitMs)) lo--;
    while (hi < s.length - 1 && (hi - i < half || s[hi + 1].t - mid <= fitMs)) hi++;
    const pts = s.slice(lo, hi + 1);
    const fit = fitZero(pts, pointSd);
    let t: number, sdMs: number, speed: number, n = pts.length;
    if (fit && Math.sign(fit.slope) === dir && fit.t >= pts[0].t && fit.t <= pts[pts.length - 1].t) {
      t = fit.t; sdMs = fit.sdMs; speed = Math.abs(fit.slope) * 1000;
    } else {
      // the fit's zero fell outside its frames (a turn at the line, a bad landmark): the two frames alone
      const p = s[i], q = s[i + 1];
      const f = p.d === q.d ? 0.5 : Math.min(1, Math.max(0, p.d / (p.d - q.d)));
      t = p.t + f * (q.t - p.t);
      const slope = (q.d - p.d) / (q.t - p.t) || 1e-9;
      speed = Math.abs(slope) * 1000;
      sdMs = Math.max((pointSd / Math.abs(slope)) * Math.SQRT1_2, (q.t - p.t) / Math.sqrt(12));
      n = 2;
    }
    out.push({ t, sdMs, dir, speed, before: i, n });
    i += Math.max(1, na); // past the held frames: the next crossing starts on this side
  }
  return out;
}

/** The first crossing after `after`, or null. */
export function firstCrossing(samples: readonly LineSample[], o: CrossingOptions = {}): Crossing | null {
  return findCrossings(samples, o)[0] ?? null;
}
