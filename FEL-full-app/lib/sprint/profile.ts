// profile — Samozino's sprint model, fitted to a side-on position trace (SPRINT-SPEED, 2026-10-25).
//
// The model (Samozino et al. 2016, Scand J Med Sci Sports; after Furusawa 1927): from a standing start at t0,
//   v(t) = v_max (1 − e^(−(t − t0)/τ))
//   x(t) = x0 + v_max ((t − t0) + τ e^(−(t − t0)/τ) − τ)
// x is LINEAR in v_max and x0 once τ and t0 are fixed, so the fit searches τ and t0 (for each τ the best t0, then the best
// τ: a scan and a golden-section search each) and solves v_max and x0 exactly at each. A start time or start position already known (the Go, first movement,
// the start marker) is held instead of searched.
//
// Then the force-velocity profile as Samozino computes it: the horizontal force F_H(t) = m·a(t) + F_air(t), with
// F_air = ½ ρ A_f C_d v² and A_f = 0.2025 h^0.725 m^0.425 × 0.266; a straight line F_H against v gives F0 and V0, and
// Pmax = F0·V0 ÷ 4. Without a body mass the profile is per kilogram and leaves out the air (it then reads F0 = v_max/τ).
// The F-V slope is reported but labelled: the JSSM 2021 reliability study found it the least repeatable number
// (docs/SPRINT-BENCHMARK.md §3), so nothing may be prescribed from it.
//
// The ± (v_max, τ): a residual bootstrap (seeded) around the best fit.
//
// Every output is an ESTIMATE; no agreement with a radar or gates is claimed until the pilot.
//
// Pure.
import { mulberry32 } from '@/lib/pose/synth';
import { sr } from './PROPOSED-sprint';

export interface PosSample { t: number; x: number }

export interface SamozinoFit {
  vmax: number; tau: number; t0: number; x0: number;
  /** ±1 SD of v_max (m/s) and τ (s), from the bootstrap. */
  vmaxSd: number; tauSd: number;
  /** RMS of the residuals (m). */
  rmsM: number;
  n: number;
}

const g = (t: number, t0: number, tau: number): number => {
  const u = t - t0;
  return u <= 0 ? 0 : u + tau * Math.exp(-u / tau) - tau;
};

/** v_max and x0 for a fixed τ and t0 (x0 held when given): least squares. */
function solveLinear(s: readonly PosSample[], tau: number, t0: number, x0Known: number | null): { vmax: number; x0: number; sse: number } {
  let sg = 0, sgg = 0, sx = 0, sgx = 0;
  const n = s.length;
  for (const p of s) { const gi = g(p.t, t0, tau); sg += gi; sgg += gi * gi; sx += p.x; sgx += gi * p.x; }
  let vmax: number, x0: number;
  if (x0Known !== null) {
    x0 = x0Known;
    vmax = sgg > 0 ? (sgx - x0 * sg) / sgg : 0;
  } else {
    const det = n * sgg - sg * sg;
    if (Math.abs(det) < 1e-12) return { vmax: 0, x0: sx / n, sse: Infinity };
    vmax = (n * sgx - sg * sx) / det;
    x0 = (sx - vmax * sg) / n;
  }
  let sse = 0;
  for (const p of s) sse += (p.x - x0 - vmax * g(p.t, t0, tau)) ** 2;
  return { vmax, x0, sse };
}

interface Best { tau: number; t0: number; vmax: number; x0: number; sse: number }

/** The minimum of f on [lo, hi]: a scan of `n` points, then a golden-section search around the best. */
function minimise(f: (x: number) => number, lo: number, hi: number, n: number): { x: number; y: number } {
  if (hi <= lo) return { x: lo, y: f(lo) };
  let bi = 0, by = Infinity;
  const step = (hi - lo) / (n - 1);
  for (let i = 0; i < n; i++) { const y = f(lo + step * i); if (y < by) { by = y; bi = i; } }
  let a = Math.max(lo, lo + step * (bi - 1)), b = Math.min(hi, lo + step * (bi + 1));
  const R = (Math.sqrt(5) - 1) / 2;
  let c = b - R * (b - a), d = a + R * (b - a), fc = f(c), fd = f(d);
  for (let k = 0; k < 40; k++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - R * (b - a); fc = f(c); } else { a = c; c = d; fc = fd; d = a + R * (b - a); fd = f(d); }
  }
  const x = (a + b) / 2, y = f(x);
  return y <= by ? { x, y } : { x: lo + step * bi, y: by };
}

function search(s: readonly PosSample[], known: { t0: number | null; x0: number | null }): Best | null {
  const tauLo = sr('sprint.tauMin'), tauHi = sr('sprint.tauMax');
  const tFirst = s[0].t;
  // t0: up to ~4 τ_max before the first sample (the run started out of view, still speeding up), or inside the trace
  // (the athlete stood still in view first) up to 1 s before its end
  const tLast = s[s.length - 1].t;
  const t0Lo = tFirst - 4 * tauHi, t0Hi = Math.max(tFirst, Math.min(tLast - 1, tFirst + 10));
  const sse = (tau: number, t0: number): number => {
    const r = solveLinear(s, tau, t0, known.x0);
    return r.vmax > 0 && Number.isFinite(r.sse) ? r.sse : Infinity;
  };
  // the profile over τ: for each τ the best t0 (held when known), then the best τ
  const bestT0 = (tau: number) => (known.t0 !== null ? { x: known.t0, y: sse(tau, known.t0) } : minimise((t0) => sse(tau, t0), t0Lo, t0Hi, 48));
  const outer = minimise((tau) => bestT0(tau).y, tauLo, tauHi, 32);
  if (!Number.isFinite(outer.y)) return null;
  const t0 = bestT0(outer.x).x;
  const r = solveLinear(s, outer.x, t0, known.x0);
  if (!(r.vmax > 0)) return null;
  return { tau: outer.x, t0, vmax: r.vmax, x0: r.x0, sse: r.sse };
}

export type FitResult = ({ ok: true } & SamozinoFit) | { ok: false; why: string };

/**
 * Fit the model to positions along the run (t in SECONDS, x in metres). `t0` (s) and `x0` (m), when known, are held.
 * The trace must show the body speeding up (the curve is what carries τ).
 */
export function fitSamozino(samples: readonly PosSample[], known: { t0?: number | null; x0?: number | null } = {}, o: { boot?: number; seed?: number } = {}): FitResult {
  const s = samples.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.x)).slice().sort((a, b) => a.t - b.t);
  if (s.length < 12) return { ok: false, why: 'Too little of the run was seen to fit a speed curve.' };
  const k = { t0: known.t0 ?? null, x0: known.x0 ?? null };
  const best = search(s, k);
  if (!best) return { ok: false, why: 'The run did not fit a sprint from a start (no speeding up was seen).' };
  const rms = Math.sqrt(best.sse / s.length);
  // residual bootstrap
  const B = o.boot ?? 30;
  const rand = mulberry32(o.seed ?? 7);
  const fitted = s.map((p) => best.x0 + best.vmax * g(p.t, best.t0, best.tau));
  const res = s.map((p, i) => p.x - fitted[i]);
  const vs: number[] = [], ts: number[] = [];
  for (let b = 0; b < B; b++) {
    const sb = s.map((p, i) => ({ t: p.t, x: fitted[i] + res[Math.floor(rand() * res.length)] }));
    const r = search(sb, k);
    if (r) { vs.push(r.vmax); ts.push(r.tau); }
  }
  const sd = (xs: number[]) => {
    if (xs.length < 2) return 0;
    const m = xs.reduce((a, x) => a + x, 0) / xs.length;
    return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
  };
  return { ok: true, vmax: best.vmax, tau: best.tau, t0: best.t0, x0: best.x0, vmaxSd: sd(vs), tauSd: sd(ts), rmsM: rms, n: s.length };
}

/** The model's speed at t (s). */
export const modelSpeed = (f: Pick<SamozinoFit, 'vmax' | 'tau' | 't0'>, t: number): number => (t <= f.t0 ? 0 : f.vmax * (1 - Math.exp(-(t - f.t0) / f.tau)));

/** The model's time (s from its own start) to cover `m` metres from the start line. */
export function modelSplit(f: Pick<SamozinoFit, 'vmax' | 'tau'>, m: number): number {
  // x(u) = v (u + τ e^(−u/τ) − τ) is increasing: bisect
  let lo = 0, hi = 60;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f.vmax * (mid + f.tau * Math.exp(-mid / f.tau) - f.tau) < m) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export interface FvProfile {
  /** Per kilogram (always), and in newtons / watts when a body mass was given. */
  f0PerKg: number; v0: number; pmaxPerKg: number;
  f0N: number | null; pmaxW: number | null;
  /** N·s/m per kg. Reported, never prescribed from (the least reliable number: JSSM 2021). */
  slopePerKg: number;
  withAir: boolean;
}

/** Samozino's F-V profile from a fit. `massKg` and `heightM` optional (air resistance needs both). */
export function fvProfile(f: Pick<SamozinoFit, 'vmax' | 'tau'>, body: { massKg?: number | null; heightM?: number | null } = {}): FvProfile {
  const m = body.massKg && body.massKg > 20 && body.massKg < 250 ? body.massKg : null;
  const h = body.heightM && body.heightM > 1 && body.heightM < 2.4 ? body.heightM : null;
  const kPerKg = m && h ? (0.5 * sr('sprint.airRho') * (0.2025 * h ** 0.725 * m ** 0.425 * 0.266) * sr('sprint.airCd')) / m : 0;
  // F_H / m against v, from the start to 99 % of v_max, every 10 ms
  const tEnd = f.tau * Math.log(100);
  let n = 0, sv = 0, sF = 0, svv = 0, svF = 0;
  for (let t = 0; t <= tEnd; t += 0.01) {
    const v = f.vmax * (1 - Math.exp(-t / f.tau));
    const a = (f.vmax / f.tau) * Math.exp(-t / f.tau);
    const F = a + kPerKg * v * v;
    n++; sv += v; sF += F; svv += v * v; svF += v * F;
  }
  const slope = (n * svF - sv * sF) / (n * svv - sv * sv);
  const f0 = (sF - slope * sv) / n;
  const v0 = -f0 / slope;
  const pmax = (f0 * v0) / 4;
  return {
    f0PerKg: f0, v0, pmaxPerKg: pmax, slopePerKg: slope,
    f0N: m ? f0 * m : null, pmaxW: m ? pmax * m : null, withAir: kPerKg > 0,
  };
}
