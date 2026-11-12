// lib/vbt/signal.ts — VBT (2026-10-25): position, velocity and acceleration from samples on the camera's REAL clock.
//
// A phone's frames do not arrive evenly (a 60 fps camera drops to 52, a slow-mo import is 240), so nothing here assumes
// a fixed step. Each sample's velocity is the slope of a local quadratic least-squares fit over the samples within a
// half-window of it (a Savitzky–Golay filter generalised to uneven times); its acceleration is twice the curvature. The
// half-window is the larger of SMOOTH_HALF_MS and SMOOTH_FRAMES frame periods, so a 30 fps take is smoothed over ±83 ms
// and a 240 fps import over ±45 ms. The slope's own standard error (σ_pos / √Σ(t − t̄)²) rides along for the ± bands.
//
// Pure.
import { SMOOTH_FRAMES, SMOOTH_HALF_MS } from './thresholds';

/** One tracked point at one frame: t in ms (the camera's clock), x and y in metres (y UP). */
export interface Sample { t: number; x: number; y: number }

export interface Kin {
  t: number;
  /** Smoothed position (m). */
  x: number; y: number;
  /** Velocity (m/s) and acceleration (m/s²) along each axis. */
  vx: number; vy: number;
  ax: number; ay: number;
  /** 1 / √Σ(t − t̄)² over the fit window (1/s): multiply by the position SD to get the velocity's SD. */
  slopeGain: number;
  /** Samples in the window (the smoothing's √n gain on a position). */
  n: number;
}

/** The median frame period (ms) of a run of samples; 33.3 when there are too few. */
export function framePeriodMs(ts: readonly number[]): number {
  const gaps = ts.slice(1).map((t, i) => t - ts[i]).filter((g) => g > 0).sort((a, b) => a - b);
  return gaps.length ? gaps[gaps.length >> 1] : 1000 / 30;
}

export const halfWindowMs = (periodMs: number): number => Math.max(SMOOTH_HALF_MS, SMOOTH_FRAMES * periodMs);

/** Least-squares a + b·u + c·u² on (u, z); falls back to a line under four points. */
function quad(us: readonly number[], zs: readonly number[]): { a: number; b: number; c: number } {
  const n = us.length;
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, z0 = 0, z1 = 0, z2 = 0;
  for (let i = 0; i < n; i++) {
    const u = us[i], z = zs[i], u2 = u * u;
    s0 += 1; s1 += u; s2 += u2; s3 += u2 * u; s4 += u2 * u2; z0 += z; z1 += z * u; z2 += z * u2;
  }
  if (n >= 4) {
    // solve the 3×3 normal equations by Cramer's rule
    const det = s0 * (s2 * s4 - s3 * s3) - s1 * (s1 * s4 - s3 * s2) + s2 * (s1 * s3 - s2 * s2);
    if (Math.abs(det) > 1e-18) {
      const a = (z0 * (s2 * s4 - s3 * s3) - s1 * (z1 * s4 - s3 * z2) + s2 * (z1 * s3 - s2 * z2)) / det;
      const b = (s0 * (z1 * s4 - z2 * s3) - z0 * (s1 * s4 - s3 * s2) + s2 * (s1 * z2 - z1 * s2)) / det;
      const c = (s0 * (s2 * z2 - s3 * z1) - s1 * (s1 * z2 - s2 * z1) + z0 * (s1 * s3 - s2 * s2)) / det;
      return { a, b, c };
    }
  }
  const den = s0 * s2 - s1 * s1;
  if (n >= 2 && Math.abs(den) > 1e-18) {
    const b = (s0 * z1 - s1 * z0) / den;
    return { a: (z0 - b * s1) / s0, b, c: 0 };
  }
  return { a: n ? z0 / n : 0, b: 0, c: 0 };
}

/** Every sample's smoothed position, velocity and acceleration. Samples must be in time order. */
export function kinematics(samples: readonly Sample[], halfMs?: number): Kin[] {
  if (!samples.length) return [];
  const H = halfMs ?? halfWindowMs(framePeriodMs(samples.map((s) => s.t)));
  const out: Kin[] = [];
  let lo = 0, hi = 0;
  for (let i = 0; i < samples.length; i++) {
    const t0 = samples[i].t;
    while (samples[lo].t < t0 - H) lo++;
    while (hi + 1 < samples.length && samples[hi + 1].t <= t0 + H) hi++;
    const us: number[] = [], xs: number[] = [], ys: number[] = [];
    for (let j = lo; j <= hi; j++) { us.push((samples[j].t - t0) / 1000); xs.push(samples[j].x); ys.push(samples[j].y); }
    const fx = quad(us, xs), fy = quad(us, ys);
    const mu = us.reduce((a, b) => a + b, 0) / us.length;
    const sxx = us.reduce((a, u) => a + (u - mu) ** 2, 0);
    out.push({ t: t0, x: fx.a, y: fy.a, vx: fx.b, vy: fy.b, ax: 2 * fx.c, ay: 2 * fy.c, slopeGain: sxx > 0 ? 1 / Math.sqrt(sxx) : Infinity, n: us.length });
  }
  return out;
}

/** Median of a list (NaN when empty). */
export function median(xs: readonly number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
