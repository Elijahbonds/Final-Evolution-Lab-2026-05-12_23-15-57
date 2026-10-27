// lib/vbt/profile.ts — VBT (2026-10-25): the load-velocity line, the estimated 1RM, and loads for today's target zone.
//
// THE LINE. Each load's FASTEST rep (MCV) — the standard practice, so a tired last rep does not drag a load down —
// against the load, fitted by least squares: v = slope·kg + intercept. At least LV_MIN_LOADS distinct loads,
// LV_MIN_LOAD_GAP_KG apart; the slope must be negative (the bar slows as the load rises), else no line.
//
// THE e1RM. The load where the line reaches the lift's MVT (lib/vbt/lifts.ts, cited in docs/VBT-BENCHMARK.md §2). Only
// for a lift with a published MVT. Its ± (95 %) carries: the line's own scatter as an inverse prediction (with three
// or more loads; with two, the reps' own measurement spread), and the MVT's spread between people (MVT_SD), which is
// usually the larger. It is labelled an ESTIMATE everywhere it is shown, and it is never shown to a minor
// (lib/vbt/gate.ts).
//
// LOADS FOR A ZONE. The loads whose predicted MCV falls in the prescribed zone, rounded inward to LOAD_STEP_KG and never
// above the e1RM.
//
// Pure.
import { LIFTS, ZONES, type LiftId, type ZoneId } from './lifts';
import { LOAD_STEP_KG, LV_MIN_LOAD_GAP_KG, LV_MIN_LOADS, MVT_SD } from './thresholds';

export interface LoadPoint { loadKg: number; mcv: number; /** the rep's own ± (95 %), optional */ mcvPm?: number }

export type LvFit =
  | { ok: true; lift: LiftId; slope: number; intercept: number; r2: number | null; n: number; loads: LoadPoint[]; e1rmKg: number | null; e1rmPmKg: number | null; mvt: number | null }
  | { ok: false; lift: LiftId; why: 'few_loads' | 'not_slower'; loads: LoadPoint[] };

const r1 = (x: number) => Math.round(x * 10) / 10;

/** Each load's fastest rep (loads within 0.25 kg are one load). */
export function bestPerLoad(points: readonly LoadPoint[]): LoadPoint[] {
  const by = new Map<number, LoadPoint>();
  for (const p of points) {
    if (!(p.loadKg > 0) || !(p.mcv > 0)) continue;
    const key = Math.round(p.loadKg * 2) / 2;
    const cur = by.get(key);
    if (!cur || p.mcv > cur.mcv) by.set(key, { ...p, loadKg: key });
  }
  return [...by.values()].sort((a, b) => a.loadKg - b.loadKg);
}

export function fitProfile(lift: LiftId, points: readonly LoadPoint[]): LvFit {
  const loads = bestPerLoad(points);
  const distinct = loads.filter((p, i) => i === 0 || p.loadKg - loads[i - 1].loadKg >= LV_MIN_LOAD_GAP_KG);
  if (distinct.length < LV_MIN_LOADS) return { ok: false, lift, why: 'few_loads', loads };
  const n = loads.length;
  const mx = loads.reduce((a, p) => a + p.loadKg, 0) / n, my = loads.reduce((a, p) => a + p.mcv, 0) / n;
  const sxx = loads.reduce((a, p) => a + (p.loadKg - mx) ** 2, 0);
  const sxy = loads.reduce((a, p) => a + (p.loadKg - mx) * (p.mcv - my), 0);
  const slope = sxy / sxx, intercept = my - slope * mx;
  if (!(slope < 0)) return { ok: false, lift, why: 'not_slower', loads };
  const ssr = loads.reduce((a, p) => a + (p.mcv - (slope * p.loadKg + intercept)) ** 2, 0);
  const syy = loads.reduce((a, p) => a + (p.mcv - my) ** 2, 0);
  const r2 = n >= 3 && syy > 0 ? Math.round((1 - ssr / syy) * 1000) / 1000 : null;
  const mvt = LIFTS[lift].mvt;
  let e1rmKg: number | null = null, e1rmPmKg: number | null = null;
  if (mvt != null) {
    const x0 = (mvt - intercept) / slope;
    // the line's scatter: its residual SD (3+ loads), never under the reps' own measurement SD
    const measSd = loads.some((p) => p.mcvPm != null) ? loads.reduce((a, p) => a + (p.mcvPm ?? 0) / 1.96, 0) / n : 0;
    const s = Math.max(n >= 3 ? Math.sqrt(ssr / (n - 2)) : 0, measSd);
    const sdLine = (s / Math.abs(slope)) * Math.sqrt(1 + 1 / n + (mvt - my) ** 2 / (slope * slope * sxx));
    const sdMvt = MVT_SD / Math.abs(slope);
    e1rmKg = r1(x0);
    e1rmPmKg = r1(1.96 * Math.hypot(sdLine, sdMvt));
  }
  return { ok: true, lift, slope: Math.round(slope * 1e5) / 1e5, intercept: Math.round(intercept * 1e4) / 1e4, r2, n, loads, e1rmKg, e1rmPmKg, mvt };
}

/** The load (kg) the line predicts for a velocity. */
export const loadAt = (fit: Extract<LvFit, { ok: true }>, v: number): number => (v - fit.intercept) / fit.slope;

/** The loads that land in a zone today: [lo, hi] kg, rounded inward to the plate step; null when the zone is out of reach. */
export function loadsForZone(fit: Extract<LvFit, { ok: true }>, zone: ZoneId): { loKg: number; hiKg: number } | null {
  const z = ZONES[zone];
  // faster zone ↔ lighter load: the zone's top speed is its light end
  let lo = loadAt(fit, Math.min(z.hi, 2.5)), hi = loadAt(fit, z.lo);
  if (fit.e1rmKg != null) hi = Math.min(hi, fit.e1rmKg);
  lo = Math.max(0, lo);
  const loKg = Math.ceil(lo / LOAD_STEP_KG - 1e-9) * LOAD_STEP_KG, hiKg = Math.floor(hi / LOAD_STEP_KG + 1e-9) * LOAD_STEP_KG;
  return hiKg >= loKg && hiKg > 0 ? { loKg: loKg || 0, hiKg } : null;
}
