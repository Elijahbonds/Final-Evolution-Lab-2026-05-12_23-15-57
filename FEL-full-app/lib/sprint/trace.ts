// trace — the side-on speed trace (SPRINT-SPEED, 2026-10-25): the camera far and side-on, the hips tracked across the
// picture, scaled to metres from two markers a known distance apart (or the athlete's height), smoothed, and fitted.
//
//   positions      each frame's hip point as metres along the run (lib/sprint/geometry.ts alongM)
//   speedCurve     speed against time: a local straight-line fit over a short window (≈ 0.12 s) at each frame — the
//                  derivative with the landmark jitter averaged out, not a frame-to-frame difference
//   readTrace      the whole read: top speed (the curve's peak, and the model's v_max), the Samozino fit and its F-V
//                  profile, and the model's splits from the start line when the start is known
//
// Only the part of the run inside the picture is measured. The fit needs the speeding-up part in view to find τ; when
// the trace shows only steady running, the read says so and gives the top speed alone.
//
// Every number is an ESTIMATE with its own ±.
//
// Pure.
import { alongM, bodyPoint, type BodyPointKind, type MarkerScale } from './geometry';
import { fitSamozino, fvProfile, modelSplit, modelSpeed, type FvProfile, type PosSample } from './profile';
import type { FrameLike } from './timing';
import { framesHz } from './timing';

/** Each seen frame's point as metres along the run; t in SECONDS from `t0Ms`. */
export function positions(frames: readonly FrameLike[], scale: MarkerScale, point: BodyPointKind, t0Ms: number): PosSample[] {
  const out: PosSample[] = [];
  for (const f of frames) {
    const p = bodyPoint(f, point);
    if (p) out.push({ t: (f.t - t0Ms) / 1000, x: alongM(scale, p) });
  }
  return out;
}

export interface SpeedPoint { t: number; v: number }

/** Speed (m/s) at each sample: the slope of a straight line through the samples within ±halfS seconds. */
export function speedCurve(s: readonly PosSample[], halfS = 0.06): SpeedPoint[] {
  const out: SpeedPoint[] = [];
  let lo = 0, hi = 0;
  for (let i = 0; i < s.length; i++) {
    while (s[lo].t < s[i].t - halfS) lo++;
    while (hi + 1 < s.length && s[hi + 1].t <= s[i].t + halfS) hi++;
    const n = hi - lo + 1;
    if (n < 3) continue;
    let tb = 0, xb = 0;
    for (let k = lo; k <= hi; k++) { tb += s[k].t; xb += s[k].x; }
    tb /= n; xb /= n;
    let stt = 0, stx = 0;
    for (let k = lo; k <= hi; k++) { stt += (s[k].t - tb) ** 2; stx += (s[k].t - tb) * (s[k].x - xb); }
    if (stt > 0) out.push({ t: s[i].t, v: stx / stt });
  }
  return out;
}

export interface TraceSplit { m: number; s: number }

export type TraceRead =
  | {
    ok: true;
    /** The seen speed curve's peak (m/s), the window it is averaged over, and its ±1 SD. */
    topSpeed: number; topSpeedSd: number;
    curve: SpeedPoint[];
    /** null when the trace shows no speeding up (τ cannot be found). */
    model: null | { vmax: number; vmaxSd: number; tau: number; tauSd: number; t0: number; rmsM: number };
    profile: FvProfile | null;
    /** The model's times from the start line (when the start line and the start are both known). */
    splits: TraceSplit[];
    seenM: [number, number];
    poseHz: number;
  }
  | { ok: false; why: string };

/** Speed from steady running: one straight line, its slope and that slope's SD. */
function steady(s: readonly PosSample[]): { v: number; sd: number } {
  const n = s.length;
  const tb = s.reduce((a, p) => a + p.t, 0) / n, xb = s.reduce((a, p) => a + p.x, 0) / n;
  let stt = 0, stx = 0;
  for (const p of s) { stt += (p.t - tb) ** 2; stx += (p.t - tb) * (p.x - xb); }
  const v = stx / stt;
  let rss = 0;
  for (const p of s) rss += (p.x - xb - v * (p.t - tb)) ** 2;
  return { v, sd: Math.sqrt(rss / Math.max(1, n - 2) / stt) };
}

/**
 * The trace's read. `startAtOrigin`: the first marker is the start line, so the model's x0 is 0 and its splits are from
 * there. The model's start (t0) is always FITTED, never held: a Go is the athlete's reaction earlier than their first
 * movement, and a first-movement read is a few frames uncertain — held, either one biases v_max (the rig measured
 * −3 % from a held first-movement start, outside the fit's own ±). The splits are from the model's own start, the first
 * movement the curve shows, as MySprint's are.
 */
export function readTrace(o: {
  frames: readonly FrameLike[]; scale: MarkerScale; point?: BodyPointKind; t0Ms: number;
  startAtOrigin?: boolean; body?: { massKg?: number | null; heightM?: number | null };
  splitsM?: readonly number[];
  /** The scale's own ±1 SD (%): lib/sprint/geometry.ts markerScaleSdPct or HeightScale.sdPct. */
  scaleSdPct?: number;
}): TraceRead {
  const k = (o.scaleSdPct ?? 0) / 100;
  const s = positions(o.frames, o.scale, o.point ?? 'hips', o.t0Ms);
  if (s.length < 12) return { ok: false, why: 'The athlete was not seen running across the picture. Film side-on, the whole body in view.' };
  // run in either direction: make it positive
  const dir = s[s.length - 1].x >= s[0].x ? 1 : -1;
  const xs = dir === 1 ? s : s.map((p) => ({ t: p.t, x: -p.x }));
  const curve = speedCurve(xs);
  if (curve.length < 5) return { ok: false, why: 'Too few frames to read a speed.' };
  // the peak, averaged over ±0.1 s around it, so one jittered window is not the "top speed"
  const iPk = curve.reduce((b, p, i) => (p.v > curve[b].v ? i : b), 0);
  const around = xs.filter((p) => Math.abs(p.t - curve[iPk].t) <= 0.15);
  const top = around.length >= 4 ? steady(around) : { v: curve[iPk].v, sd: curve[iPk].v * 0.05 };
  const fit = fitSamozino(xs, { t0: null, x0: o.startAtOrigin && dir === 1 ? 0 : null });
  // a model counts only when it explains the curve better than steady running does (the speeding up is in view)
  const flat = steady(xs);
  let flatRss = 0;
  { const tb = xs.reduce((a, p) => a + p.t, 0) / xs.length, xb = xs.reduce((a, p) => a + p.x, 0) / xs.length; for (const p of xs) flatRss += (p.x - xb - flat.v * (p.t - tb)) ** 2; }
  const fitRss = fit.ok ? fit.rmsM ** 2 * fit.n : Infinity;
  const accelerating = fit.ok && fitRss < flatRss * 0.5 && fit.tau < 2.95;
  const model = accelerating && fit.ok ? { vmax: fit.vmax, vmaxSd: Math.hypot(fit.vmaxSd, fit.vmax * k), tau: fit.tau, tauSd: fit.tauSd, t0: fit.t0, rmsM: fit.rmsM } : null;
  const splits = model && o.startAtOrigin
    ? (o.splitsM ?? [5, 10, 20, 30]).map((m) => ({ m, s: Math.round(modelSplit(model, m) * 1000) / 1000 }))
    : [];
  return {
    ok: true,
    topSpeed: top.v, topSpeedSd: Math.hypot(top.sd, top.v * k),
    curve: curve.map((p) => ({ t: p.t, v: p.v })),
    model,
    profile: model ? fvProfile(model, o.body ?? {}) : null,
    splits,
    seenM: [Math.min(...xs.map((p) => p.x)), Math.max(...xs.map((p) => p.x))],
    poseHz: Math.round(framesHz(o.frames)),
  };
}

/** The model's curve at a time, for drawing beside the seen one. */
export { modelSpeed };
