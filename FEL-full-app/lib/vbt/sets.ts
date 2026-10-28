// lib/vbt/sets.ts — VBT (2026-10-25): a finished set as it is KEPT — numbers only — and the phone's own history of them.
//
// WHAT A KEPT SET IS. The lift, the load, the day, the source (plate / pose), the frame rate, the counted and partial
// rep counts, the best / mean / last MCV, the best PV, the velocity loss, the stop line, each counted rep's MCV, and
// whether it was a warm-up readiness set (with that day's band). Never a frame, a landmark, a picture or a video.
//
// WHERE. On the server for a verified adult who opted in (lib/vbt/store.ts, behind the movement-save gate); otherwise on
// this phone, one localStorage key per kind (the readiness check's own precedent, lib/coach/readiness/deviceHistory.ts).
// A teen's set is kept nowhere (lib/vbt/gate.ts). Every read and write is wrapped: a private window answers "nothing
// kept" and the tool still works for the session.
//
// Client-safe; the storage is passed in.
import { isLiftId, type LiftId } from './lifts';
import type { BarSpeedDay } from './readiness';
import type { LiveView } from './live';
import type { ReadinessBand } from '@/lib/coach/readiness/types';

export interface KeptSet {
  day: string;
  /** ms since the epoch (the phone's clock), for ordering. */
  at: number;
  lift: LiftId;
  loadKg: number | null;
  source: 'plate' | 'pose';
  fps: number;
  reps: number;
  partials: number;
  bestMcv: number | null;
  meanMcv: number | null;
  lastMcv: number | null;
  bestPv: number | null;
  lossPct: number | null;
  stopPct: number;
  /** Each counted rep's MCV (m/s), in order. For a med-ball set, each throw's release speed. */
  repMcvs: number[];
  warmup: boolean;
  band: ReadinessBand | null;
}

/** The numbers of a finished live view, ready to keep. null when nothing was counted. */
export function keptOf(v: LiveView, o: { day: string; at: number; lift: LiftId; loadKg: number | null; warmup: boolean; band: ReadinessBand | null }): KeptSet | null {
  if (v.throws) {
    if (!v.throws.length) return null;
    const sp = v.throws.map((t) => t.speed);
    return { ...o, source: v.source ?? 'pose', fps: v.fps, reps: sp.length, partials: 0, bestMcv: null, meanMcv: null, lastMcv: null, bestPv: Math.max(...sp), lossPct: null, stopPct: v.lossStopPct, repMcvs: sp, warmup: false, band: null };
  }
  const r = v.read;
  if (!r || !r.counted) return null;
  return {
    ...o, source: v.source ?? 'pose', fps: r.fps, reps: r.counted, partials: r.partials, bestMcv: r.bestMcv, meanMcv: r.meanMcv, lastMcv: r.lastMcv,
    bestPv: r.bestPv, lossPct: r.lossPct, stopPct: v.lossStopPct, repMcvs: r.reps.filter((x) => x.counted).map((x) => x.mcv),
  };
}

// ── validation (the route and the phone read the same) ────────────────────────────────────────────────────────────

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const inR = (x: unknown, lo: number, hi: number): x is number => fin(x) && x >= lo && x <= hi;
const optV = (x: unknown) => x == null || inR(x, 0, 12);
const BANDS: readonly ReadinessBand[] = ['ready', 'normal', 'low', 'building'];

/** A kept set from untrusted JSON (a request body, a localStorage value), or null. Plausible numbers only. */
export function cleanSet(x: unknown): KeptSet | null {
  const r = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  if (typeof r.day !== 'string' || !DAY.test(r.day) || !fin(r.at) || !isLiftId(r.lift)) return null;
  if (!(r.loadKg == null || inR(r.loadKg, 0, 600))) return null;
  if (r.source !== 'plate' && r.source !== 'pose') return null;
  if (!inR(r.fps, 5, 1000) || !inR(r.reps, 1, 100) || !Number.isInteger(r.reps) || !inR(r.partials, 0, 100) || !Number.isInteger(r.partials)) return null;
  if (![r.bestMcv, r.meanMcv, r.lastMcv, r.bestPv].every(optV)) return null;
  if (!(r.lossPct == null || inR(r.lossPct, 0, 100)) || !inR(r.stopPct, 0, 100)) return null;
  if (!Array.isArray(r.repMcvs) || r.repMcvs.length > 100 || !r.repMcvs.every((v) => inR(v, 0, 12))) return null;
  if (typeof r.warmup !== 'boolean' || !(r.band == null || BANDS.includes(r.band as ReadinessBand))) return null;
  return {
    day: r.day, at: r.at, lift: r.lift, loadKg: (r.loadKg as number | null) ?? null, source: r.source, fps: r.fps, reps: r.reps, partials: r.partials,
    bestMcv: (r.bestMcv as number | null) ?? null, meanMcv: (r.meanMcv as number | null) ?? null, lastMcv: (r.lastMcv as number | null) ?? null,
    bestPv: (r.bestPv as number | null) ?? null, lossPct: (r.lossPct as number | null) ?? null, stopPct: r.stopPct, repMcvs: r.repMcvs as number[],
    warmup: r.warmup, band: (r.band as ReadinessBand | null) ?? null,
  };
}

/** The bar-speed readiness days a set history carries (warm-up sets with a band). */
export function barSpeedDays(sets: readonly KeptSet[]): BarSpeedDay[] {
  return sets.filter((s) => s.warmup && s.band && s.loadKg && s.bestMcv != null && s.meanMcv != null).map((s) => {
    const v = s.repMcvs;
    const m = v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
    const sd = v.length > 1 ? Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)) : 0;
    return { day: s.day, lift: s.lift, loadKg: s.loadKg!, bestMcv: s.bestMcv!, meanMcv: s.meanMcv!, sdMcv: Math.round(sd * 1000) / 1000, reps: s.reps, fps: s.fps, belowReal: s.band === 'low', band: s.band! };
  });
}

// ── the phone's history ──────────────────────────────────────────────────────────────────────────────────────────

export const DEVICE_SETS_KEY = 'fel.vbt.sets.v1';
/** (new) The phone keeps at most this many sets. */
export const DEVICE_SETS_MAX = 300;

export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export function readDeviceSets(s: StorageLike | null): KeptSet[] {
  if (!s) return [];
  try {
    const raw = JSON.parse(s.getItem(DEVICE_SETS_KEY) ?? '[]');
    return (Array.isArray(raw) ? raw : []).map(cleanSet).filter((x): x is KeptSet => !!x).sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

export function keepDeviceSet(s: StorageLike | null, set: KeptSet): boolean {
  if (!s) return false;
  try {
    const all = [set, ...readDeviceSets(s)].slice(0, DEVICE_SETS_MAX);
    s.setItem(DEVICE_SETS_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

export function clearDeviceSets(s: StorageLike | null): void {
  try { s?.removeItem(DEVICE_SETS_KEY); } catch { /* nothing kept */ }
}

export function deviceStorage(): StorageLike | null {
  try { return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null; } catch { return null; }
}
