// lib/combine/score.ts — COMBINE-DAY (2026-10-25): best-of, the station rankings, percentile-within-the-group and the
// weighted composite. Pure; every rule here is pinned in score.test.ts.
//
//   BEST OF       an athlete's number at a station is their best attempt (highest jump, lowest time). A no-mark attempt
//                 counts as taken but has no number; all no-marks = no number.
//   TIES          values are compared at the station's own precision (catalogue `decimals`: a jump at 0.1 cm, a time at
//                 0.01 s, a drill at 1 %), and tied athletes share a rank (competition ranking: 1, 2, 2, 4).
//   PERCENTILE    within this combine's group only (never a population norm: there is none here). For the n athletes
//                 with a number: (athletes beaten + half of the others tied) / (n − 1) × 100, so the best is 100, the
//                 last is 0 and a tie sits in the middle of the places it shares. One athlete alone reads 50 (a group of
//                 one says nothing either way).
//   COMPOSITE     the weighted mean of an athlete's station percentiles. Equal weights (1) by default; the coach may set
//                 each 0–3, and 0 leaves a station out. An athlete missing a weighted station gets a composite over the
//                 stations they did, marked incomplete, and is ranked AFTER every complete athlete — one great station
//                 never tops a board the others finished.
import { STATIONS, type StationConfig } from './catalogue';
import type { CombineEvent, Slots } from './types';

/** (new) The coach's weight range per station, and the step. */
export const WEIGHT_MAX = 3;
export const WEIGHT_STEP = 0.5;
export const DEFAULT_WEIGHT = 1;

const roundTo = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

/** The best number in the slots, or null when nothing has a number. */
export function bestOf(slots: Slots | undefined, better: 'higher' | 'lower'): number | null {
  let best: number | null = null;
  for (const a of slots ?? []) {
    const v = a?.value;
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    if (best === null || (better === 'higher' ? v > best : v < best)) best = v;
  }
  return best;
}

/** How many slots are taken (a no-mark is taken). */
export const takenCount = (slots: Slots | undefined): number => (slots ?? []).filter((a) => a !== null).length;

export interface Ranked { id: string; value: number | null; rank: number | null; pct: number | null }

/**
 * Rank and percentile values within a group. `better` says which way is best; `decimals` is the precision ties are
 * judged at. Athletes with no number get no rank and no percentile and come last, in the order given.
 */
export function rankValues(rows: readonly { id: string; value: number | null }[], better: 'higher' | 'lower', decimals: number): Ranked[] {
  const scored = rows.filter((r) => typeof r.value === 'number' && Number.isFinite(r.value)).map((r) => ({ id: r.id, value: r.value as number, k: roundTo(r.value as number, decimals) }));
  const sign = better === 'higher' ? -1 : 1;
  scored.sort((a, b) => sign * (a.k - b.k));
  const n = scored.length;
  const out: Ranked[] = scored.map((r) => {
    const above = scored.filter((x) => (better === 'higher' ? x.k > r.k : x.k < r.k)).length;
    const tied = scored.filter((x) => x.k === r.k).length;
    const beaten = n - above - tied;
    const pct = n === 1 ? 50 : ((beaten + (tied - 1) / 2) / (n - 1)) * 100;
    return { id: r.id, value: r.value, rank: above + 1, pct: roundTo(pct, 1) };
  });
  for (const r of rows) if (!out.some((o) => o.id === r.id)) out.push({ id: r.id, value: null, rank: null, pct: null });
  return out;
}

export interface StationRow extends Ranked { name: string; slots: Slots; touchCm: number | null }

/** One station's ranked table over the athletes who can be tested there. */
export function stationTable(ev: Pick<CombineEvent, 'athletes' | 'results'>, station: StationConfig): StationRow[] {
  const def = STATIONS[station.kind];
  const athletes = ev.athletes.filter((a) => a.access.testable && (def.method === 'hand' || a.access.camera));
  const ranked = rankValues(athletes.map((a) => ({ id: a.id, value: bestOf(ev.results[a.id]?.[station.id], def.better) })), def.better, def.decimals);
  return ranked.map((r) => {
    const a = athletes.find((x) => x.id === r.id)!;
    const slots = ev.results[a.id]?.[station.id] ?? [];
    const touches = slots.map((s) => s?.touchCm).filter((t): t is number => typeof t === 'number' && Number.isFinite(t));
    return { ...r, name: a.name, slots, touchCm: touches.length ? Math.max(...touches) : null };
  });
}

/** Weights from untrusted input, for these stations: missing = the default, clamped to 0–WEIGHT_MAX on the step. */
export function cleanWeights(raw: unknown, stations: readonly StationConfig[]): Record<string, number> {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const s of stations) {
    const v = src[s.id];
    const n = typeof v === 'number' && Number.isFinite(v) ? v : DEFAULT_WEIGHT;
    out[s.id] = Math.min(WEIGHT_MAX, Math.max(0, Math.round(n / WEIGHT_STEP) * WEIGHT_STEP));
  }
  return out;
}

export interface CompositeRow {
  id: string;
  name: string;
  /** 0–100, or null with no weighted station done. */
  composite: number | null;
  rank: number | null;
  complete: boolean;
  done: number;
  of: number;
  /** Station id → the athlete's percentile there (null: no number). */
  pct: Record<string, number | null>;
}

/** The composite board: complete athletes ranked first, then the incomplete, then those with nothing yet. */
export function compositeTable(ev: Pick<CombineEvent, 'athletes' | 'results' | 'stations'>, weights: Record<string, number>): CompositeRow[] {
  const tables = new Map(ev.stations.map((s) => [s.id, stationTable(ev, s)]));
  const rows = ev.athletes.filter((a) => a.access.testable).map((a) => {
    // the stations this athlete can be tested at, and weighted
    const mine = ev.stations.filter((s) => (weights[s.id] ?? DEFAULT_WEIGHT) > 0 && tables.get(s.id)!.some((r) => r.id === a.id));
    const pct: Record<string, number | null> = {};
    for (const s of ev.stations) pct[s.id] = tables.get(s.id)!.find((r) => r.id === a.id)?.pct ?? null;
    const done = mine.filter((s) => pct[s.id] !== null);
    const w = done.reduce((t, s) => t + (weights[s.id] ?? DEFAULT_WEIGHT), 0);
    const composite = w > 0 ? roundTo(done.reduce((t, s) => t + (weights[s.id] ?? DEFAULT_WEIGHT) * (pct[s.id] as number), 0) / w, 1) : null;
    return { id: a.id, name: a.name, composite, rank: null as number | null, complete: mine.length > 0 && done.length === mine.length, done: done.length, of: mine.length, pct };
  });
  const order = (r: CompositeRow) => (r.composite === null ? 2 : r.complete ? 0 : 1);
  rows.sort((a, b) => order(a) - order(b) || (b.composite ?? 0) - (a.composite ?? 0));
  // ranks: the complete athletes only (an incomplete composite is shown, not ranked); ties share a rank
  const complete = rows.filter((r) => r.complete && r.composite !== null);
  for (const r of complete) r.rank = complete.filter((x) => (x.composite as number) > (r.composite as number)).length + 1;
  return rows;
}

/** "3rd", "11th", "22nd". */
export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${s}`;
}
