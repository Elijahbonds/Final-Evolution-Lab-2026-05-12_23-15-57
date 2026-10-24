// lib/coach/weeklyDraft/dose.ts — COACH-AI-DRAFT (2026-10-24): reading a prescription and moving it one step.
//
// Pure. A prescription's `load` is free text a coach typed ("60 kg", "135 lbs @ RPE7", "RPE7", "body", ""), so every
// step here reads only what it can read for certain and returns null otherwise — a draft that cannot tell what a load
// means does not change it (the volume can still move).

import { EFFORT_BANDS, bandAllowed } from '../taxonomy';
import type { Exposure, LoggedSet, OpFields } from './types';
import { LIMIT_EFFORT, LOAD_STEP, MAX_DRAFT_RPE, MAX_DRAFT_SETS, MIN_EASE_SETS, PROGRESS_MAX_EFFORT, PROGRESS_MIN_RIR, REGRESS_LOAD_SHARE } from './thresholds';

/** "8-10" → [8, 10]; "10" → [10, 10]; "3x10" → [10, 10]; a timed "30 s", "AMRAP" or anything else → null. */
export function repRange(reps: string): [number, number] | null {
  const t = reps.trim();
  let m = /^(\d+)\s*[-–]\s*(\d+)$/.exec(t);
  if (m) { const lo = Number(m[1]), hi = Number(m[2]); return lo > 0 && hi >= lo ? [lo, hi] : null; }
  m = /^(?:\d+\s*[x×]\s*)?(\d+)$/i.exec(t);
  if (m) { const n = Number(m[1]); return n > 0 ? [n, n] : null; }
  return null;
}

const NUM_LOAD = /^\s*(\d+(?:\.\d+)?)\s*(kgs?|lbs?)\b/i;
const RPE_IN = /\bRPE\s*(\d+(?:\.\d+)?)/i;

export interface ParsedLoad { value: number; unit: 'kg' | 'lb'; rest: string }

/** A load written as a weight: "60 kg", "135lbs @ RPE7" → { 60, kg, rest }. Anything else → null. */
export function numericLoad(load: string): ParsedLoad | null {
  const m = NUM_LOAD.exec(load);
  if (!m) return null;
  const value = Number(m[1]);
  if (!(value > 0)) return null;
  return { value, unit: m[2].toLowerCase().startsWith('kg') ? 'kg' : 'lb', rest: load.slice(m[0].length) };
}

export const rpeOf = (load: string): number | null => {
  const m = RPE_IN.exec(load);
  return m ? Number(m[1]) : null;
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
const withValue = (p: ParsedLoad, v: number) => `${fmt(v)} ${p.unit}${p.rest}`;

/** One load step up ("60 kg" → "62.5 kg"). */
export function loadUp(load: string): string | null {
  const p = numericLoad(load);
  return p ? withValue(p, p.value + LOAD_STEP[p.unit]) : null;
}

/** REGRESS_LOAD_SHARE off, rounded down to a load step, at least one step, never below one step. */
export function loadDown(load: string): string | null {
  const p = numericLoad(load);
  if (!p) return null;
  const step = LOAD_STEP[p.unit];
  const target = Math.min(p.value - step, Math.floor((p.value * (1 - REGRESS_LOAD_SHARE)) / step) * step);
  if (target < step) return null;
  return withValue(p, target);
}

/** The RPE in a load moved by `by` ("RPE7" → "RPE8"), within 1..MAX_DRAFT_RPE; null without one or at the edge. */
export function rpeMoved(load: string, by: number, max: number = MAX_DRAFT_RPE, min = 5): string | null {
  const r = rpeOf(load);
  if (r == null) return null;
  const next = Math.round(r) + by;
  if (next > max || next < min) return null;
  return load.replace(RPE_IN, (s) => s.replace(/\d+(?:\.\d+)?/, String(next)));
}

const BAND_ORDER = EFFORT_BANDS.map((b) => b.id);
/** The band one step up or down; never up to an adults-only band for youth, never up to Full throttle at all (drafts never write a top set). */
export function bandMoved(band: string | null, by: 1 | -1, youth: boolean, floor = 'cruise'): string | null {
  if (!band) return null;
  const i = BAND_ORDER.indexOf(band);
  if (i < 0) return null;
  const next = BAND_ORDER[i + by];
  if (!next) return null;
  if (by > 0 && (next === 'full' || !bandAllowed(next, youth))) return null;
  if (by < 0 && BAND_ORDER.indexOf(next) < BAND_ORDER.indexOf(floor)) return null;
  return next;
}

export const maxSets = (youth: boolean) => (youth ? MAX_DRAFT_SETS.youth : MAX_DRAFT_SETS.adult);

// ── one step on a row ───────────────────────────────────────────────────────────────────────────────────────────────

export type Step = { after: OpFields; kind: 'load' | 'volume'; what: string } | null;

/**
 * Forward one step. Adults: a weight goes up a plate, else an RPE target goes up one, else the band goes up one, else one
 * more set. Under youth rules only the volume moves (one more set, to the youth ceiling): never a load or a band.
 */
export function progressStep(row: OpFields, youth: boolean): Step {
  if (!youth) {
    const w = loadUp(row.load);
    if (w) return { after: { ...row, load: w }, kind: 'load', what: `${row.load.trim()} → ${w.trim()}` };
    const r = rpeMoved(row.load, 1);
    if (r) return { after: { ...row, load: r }, kind: 'load', what: `${row.load.trim()} → ${r.trim()}` };
    const b = bandMoved(row.effortBand, 1, youth);
    if (b) return { after: { ...row, effortBand: b }, kind: 'load', what: `${bandLabel(row.effortBand)} → ${bandLabel(b)}` };
  }
  if (row.sets < maxSets(youth)) return { after: { ...row, sets: row.sets + 1 }, kind: 'volume', what: `${row.sets} → ${row.sets + 1} sets` };
  return null;
}

/** Back one step: a weight down ~10%, else an RPE down one, else the band down one, else one set fewer (not below 1). */
export function regressStep(row: OpFields, youth: boolean): Step {
  const w = loadDown(row.load);
  if (w) return { after: { ...row, load: w }, kind: 'load', what: `${row.load.trim()} → ${w.trim()}` };
  const r = rpeMoved(row.load, -1);
  if (r) return { after: { ...row, load: r }, kind: 'load', what: `${row.load.trim()} → ${r.trim()}` };
  const b = bandMoved(row.effortBand, -1, youth);
  if (b) return { after: { ...row, effortBand: b }, kind: 'load', what: `${bandLabel(row.effortBand)} → ${bandLabel(b)}` };
  if (row.sets > 1) return { after: { ...row, sets: row.sets - 1 }, kind: 'volume', what: `${row.sets} → ${row.sets - 1} sets` };
  return null;
}

/** An easier week on one row: one set fewer (not below MIN_EASE_SETS) AND the intensity down one step where it reads. */
export function easeStep(row: OpFields, youth: boolean): Step {
  let after: OpFields = { ...row };
  const parts: string[] = [];
  if (row.sets > MIN_EASE_SETS) { after = { ...after, sets: row.sets - 1 }; parts.push(`${row.sets} → ${row.sets - 1} sets`); }
  const w = loadDown(row.load) ?? rpeMoved(row.load, -1);
  if (w) { after = { ...after, load: w }; parts.push(`${row.load.trim()} → ${w.trim()}`); }
  else {
    const b = bandMoved(row.effortBand, -1, youth);
    if (b) { after = { ...after, effortBand: b }; parts.push(`${bandLabel(row.effortBand)} → ${bandLabel(b)}`); }
  }
  return parts.length ? { after, kind: 'load', what: parts.join(', ') } : null;
}

/** One set fewer, not below MIN_EASE_SETS (a week with fewer sessions done: less to come back to). */
export function volumeDownStep(row: OpFields): Step {
  return row.sets > MIN_EASE_SETS ? { after: { ...row, sets: row.sets - 1 }, kind: 'volume', what: `${row.sets} → ${row.sets - 1} sets` } : null;
}

export const bandLabel = (id: string | null): string => EFFORT_BANDS.find((b) => b.id === id)?.label ?? 'no band';

// ── reading an exposure ─────────────────────────────────────────────────────────────────────────────────────────────

/** The sets of an exposure: its per-set rows, else the summary's "8,9,10" with its one RPE on every set. */
export function setsOf(e: Exposure): LoggedSet[] {
  if (e.sets.length) return e.sets;
  const reps = (e.summary.actualReps ?? '').split(',').map((r) => Number(r.trim())).filter((n) => Number.isFinite(n) && n > 0);
  const n = e.summary.actualSets ?? reps.length;
  if (!n) return [];
  return Array.from({ length: n }, (_, i) => ({ reps: reps[i] ?? reps[reps.length - 1] ?? null, weightKg: null, rir: null, effort: i === n - 1 ? e.summary.rpe : null }));
}

export type ExposureRead = 'top' | 'miss' | 'inside' | 'unknown';

export interface ExposureVerdict {
  read: ExposureRead;
  /** Effort is known for the sets (logged effort or RIR). */
  effortKnown: boolean;
  /** The heaviest effort logged (RPE, or 10 − RIR). */
  topEffort: number | null;
  /** The lowest reps logged on a set. */
  lowReps: number | null;
  /** Far under the range: the lowest set under SWAP_EASIER_SHARE of the bottom. */
  farUnder: boolean;
}

const effortOfSet = (s: LoggedSet): number | null => (s.effort != null ? s.effort : s.rir != null ? 10 - s.rir : null);

/**
 * TOP:  every prescribed set logged, every set at or over the top of the range, and nothing harder than
 *       PROGRESS_MAX_EFFORT (or fewer than PROGRESS_MIN_RIR reps left) where effort was logged.
 * MISS: a set under the bottom of the range, fewer sets than prescribed, or half the sets at a limit (LIMIT_EFFORT / 0 RIR).
 * Anything else is INSIDE the range (hold), and an exposure with no reps at all is UNKNOWN.
 */
export function readExposure(e: Exposure, farShare: number): ExposureVerdict {
  const range = repRange(e.prescribed.reps);
  const sets = setsOf(e);
  const efforts = sets.map(effortOfSet).filter((x): x is number => x != null);
  const reps = sets.map((s) => s.reps).filter((x): x is number => x != null);
  const topEffort = efforts.length ? Math.max(...efforts) : null;
  const lowReps = reps.length ? Math.min(...reps) : null;
  const base = { effortKnown: efforts.length > 0, topEffort, lowReps, farUnder: false };
  if (!range || !reps.length) return { ...base, read: 'unknown' };
  const [lo, hi] = range;
  const limits = sets.filter((s) => (s.effort != null && s.effort >= LIMIT_EFFORT) || s.rir === 0).length;
  const farUnder = lowReps != null && lowReps < lo * farShare;
  if (lowReps! < lo || reps.length < e.prescribed.sets - 1 || limits * 2 >= sets.length && limits > 0) return { ...base, farUnder, read: 'miss' };
  const easyEnough = efforts.length === 0 || (topEffort! <= PROGRESS_MAX_EFFORT && sets.every((s) => s.rir == null || s.rir >= PROGRESS_MIN_RIR));
  if (reps.length >= e.prescribed.sets && lowReps! >= hi && easyEnough) return { ...base, read: 'top' };
  return { ...base, read: 'inside' };
}
