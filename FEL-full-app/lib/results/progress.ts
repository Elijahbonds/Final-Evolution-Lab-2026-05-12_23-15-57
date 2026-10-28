// lib/results/progress — My progress (/train/progress): one row per measure, your numbers over time (PLAT-P03,
// 2026-10-28; TRY-08 re-test history, TRY-11 "kept on this phone", part of PRG-10's timeline).
//
// WHERE THE NUMBERS COME FROM (the page writes nothing, anywhere):
//   account  the records the tools already write for a verified adult who opted in (lib/privacy/scanSaveGate.ts):
//            saved jump checks (WorkoutScan), saved readiness checks, saved bar-speed sets — read on the server.
//   device   the copies the tools already keep on this phone, for everyone they keep them for: the jump history
//            (lib/jump/historyStore.ts), the sprint runs (lib/sprint/store.ts), the bar-speed sets (lib/vbt/sets.ts) and
//            the readiness days (lib/coach/readiness/deviceHistory.ts). Read on the phone; never sent.
//   combine  the athlete's own combine numbers (lib/combine/server.ts myCombines): re-test history, combine to combine.
//
// Every row's arrow is the latest number against the one before it, in that tool's own band (lib/results/*.ts).
//
// Pure.
import { LIFTS } from '@/lib/vbt/lifts';
import type { KeptSet } from '@/lib/vbt/sets';
import type { SprintRecord } from '@/lib/sprint/store';
import type { JumpHistoryEntry } from '@/lib/jump/historyStore';
import { HISTORY_TEST_NAMES } from '@/lib/jump/historyStore';
import type { MyCombine } from '@/lib/combine/server';
import type { ReadinessBand } from '@/lib/coach/readiness/types';
import { compareLast, vsLineOf, type Comparison, type VsLast, type VsWords } from './view';
import { RESULT_COPY } from './copy';
import { jumpCompare } from './jump';
import { sprintBand, speedPm, timePm } from './sprint';
import { vbtCompare } from './vbt';
import { stationBand, stationSeries, stationValue } from './combine';
import { STATIONS } from '@/lib/combine/catalogue';

export type RowSource = 'account' | 'device' | 'combine';

/** The sparkline's points (the brief: six). */
export const SPARK_POINTS = 6;
/** TRY-11: the jumps a phone shows, newest first. */
export const DEVICE_JUMPS = 10;
/** A row's history list, at most. */
export const HISTORY_ROWS = 30;

export interface ProgressRow {
  key: string;
  measure: string;
  unit: string;
  source: RowSource;
  estimate: boolean;
  better: 'up' | 'down';
  /** The newest number, formatted. */
  latest: string;
  latestAt: number;
  vsLast: VsLast;
  vsLine: string | null;
  /** The last SPARK_POINTS values (display unit), oldest first. */
  spark: number[];
  /** Newest first: when, the number, and its arrow against the one before it. */
  history: { at: number; value: string; vs: VsLast }[];
}

interface RowSpec<T> {
  key: string; measure: string; unit: string; source: RowSource; estimate: boolean; better: 'up' | 'down';
  items: readonly T[];
  at: (t: T) => number;
  /** The display value (the spark's unit). */
  value: (t: T) => number;
  fmt: (v: number) => string;
  compare: (now: T, before: T) => Comparison;
  words: VsWords;
  limit?: number;
}

/** One row from a tool's records (any order). Null when there are none. */
export function rowOf<T>(s: RowSpec<T>): ProgressRow | null {
  const items = [...s.items].filter((t) => Number.isFinite(s.at(t)) && Number.isFinite(s.value(t))).sort((a, b) => s.at(a) - s.at(b));
  if (!items.length) return null;
  const newest = items[items.length - 1];
  const prev = items.length > 1 ? items[items.length - 2] : null;
  const c = prev ? s.compare(newest, prev) : { vsLast: null, delta: null };
  const all = items.map((t, i) => ({ at: s.at(t), value: s.fmt(s.value(t)), vs: i > 0 ? s.compare(t, items[i - 1]).vsLast : null }));
  const history = all.slice(-(s.limit ?? HISTORY_ROWS)).reverse();
  return {
    key: s.key, measure: s.measure, unit: s.unit, source: s.source, estimate: s.estimate, better: s.better,
    latest: s.fmt(s.value(newest)), latestAt: s.at(newest), vsLast: c.vsLast, vsLine: vsLineOf(c, s.words),
    spark: items.slice(-SPARK_POINTS).map(s.value), history,
  };
}

const IN = 2.54;
const in1 = (cm: number) => Math.round((cm / IN) * 10) / 10;
const jumpWords: VsWords = { against: RESULT_COPY.lastTime, up: 'higher', down: 'lower', fmt: (x) => `${x.toFixed(1)} in` };
const at = (iso: string) => Date.parse(iso);

// ── jump ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The phone's jump history, one row per test. A phone shows its last DEVICE_JUMPS of each (TRY-11). */
export function deviceJumpRows(entries: readonly JumpHistoryEntry[]): ProgressRow[] {
  const tests = [...new Set(entries.map((e) => e.test))];
  return tests.flatMap((test) => {
    const mine = entries.filter((e) => e.test === test);
    const rsi = test === 'rj105';
    const r = rowOf({
      key: `device:jump:${test}`, measure: HISTORY_TEST_NAMES[test] ?? 'Jump', unit: rsi ? 'RSI' : 'in', source: 'device', estimate: true, better: 'up',
      items: rsi ? mine.filter((e) => e.rsi !== null) : mine.filter((e) => e.bestCm !== null), at: (e) => at(e.at),
      value: (e) => (rsi ? e.rsi! : in1(e.bestCm!)), fmt: (v) => (rsi ? v.toFixed(2) : v.toFixed(1)),
      // the 10-5's bounce score has no band in the jump tool: the change, no arrow
      compare: (a, b) => (rsi ? compareLast(a.rsi, b.rsi, null) : jumpCompare(a.bestCm, b.bestCm)),
      words: rsi ? { ...jumpWords, fmt: (x) => x.toFixed(2) } : jumpWords, limit: DEVICE_JUMPS,
    });
    return r ? [r] : [];
  });
}

/** The jump checks saved to the account (WorkoutScan heights, cm). */
export function savedJumpRow(points: readonly { at: number; cm: number }[]): ProgressRow | null {
  return rowOf({
    key: 'account:jump', measure: 'Jump check', unit: 'in', source: 'account', estimate: true, better: 'up',
    items: points, at: (p) => p.at, value: (p) => in1(p.cm), fmt: (v) => v.toFixed(1), compare: (a, b) => jumpCompare(a.cm, b.cm), words: jumpWords,
  });
}

// ── sprint ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** The phone's sprint runs: one row per test, distance and start (only those are compared). */
export function sprintRows(runs: readonly SprintRecord[]): ProgressRow[] {
  const keyOf = (r: SprintRecord) => `${r.test}|${r.label}|${r.startKind}|${r.reactionIncluded}`;
  return [...new Set(runs.map(keyOf))].flatMap((k) => {
    const mine = runs.filter((r) => keyOf(r) === k);
    const speed = mine[0].test === 'trace';
    const r = rowOf({
      key: `device:sprint:${k}`, measure: speed ? 'Top speed' : mine[0].test === 'gate' ? `${mine[0].label} sprint` : mine[0].label,
      unit: speed ? 'm/s' : 's', source: 'device', estimate: true, better: speed ? 'up' : 'down',
      items: mine.filter((x) => (speed ? x.topSpeed !== null : x.timeS !== null)), at: (x) => at(x.at),
      value: (x) => (speed ? x.topSpeed! : x.timeS!), fmt: (v) => (speed ? v.toFixed(1) : v.toFixed(2)),
      compare: (a, b) => (speed
        ? compareLast(a.topSpeed, b.topSpeed, sprintBand(speedPm(a.topSpeedSd), speedPm(b.topSpeedSd)))
        : compareLast(a.timeS, b.timeS, sprintBand(timePm(a.sdS), timePm(b.sdS)))),
      words: { against: RESULT_COPY.lastTime, up: speed ? 'faster' : 'slower', down: speed ? 'slower' : 'faster', fmt: (x) => (speed ? `${x.toFixed(1)} m/s` : `${x.toFixed(2)} s`) },
    });
    return r ? [r] : [];
  });
}

// ── bar speed ───────────────────────────────────────────────────────────────────────────────────────────────────

/** Bar-speed sets: one row per lift and load (sets are compared at the same load only). */
export function vbtRows(sets: readonly KeptSet[], source: RowSource): ProgressRow[] {
  const keyOf = (s: KeptSet) => `${s.lift}|${s.loadKg ?? 0}`;
  return [...new Set(sets.map(keyOf))].flatMap((k) => {
    const mine = sets.filter((s) => keyOf(s) === k && s.bestMcv !== null);
    if (!mine.length) return [];
    const s0 = mine[0];
    const r = rowOf({
      key: `${source}:vbt:${k}`, measure: `${LIFTS[s0.lift]?.name ?? s0.lift}${s0.loadKg ? ` · ${s0.loadKg} kg` : ''}`, unit: 'm/s',
      source, estimate: true, better: 'up', items: mine, at: (s) => s.at, value: (s) => s.bestMcv!, fmt: (v) => v.toFixed(2),
      compare: (a, b) => vbtCompare(a.repMcvs, b.repMcvs, a.fps),
      words: { against: RESULT_COPY.lastTime, up: 'faster', down: 'slower', fmt: (x) => `${x.toFixed(2)} m/s` },
    });
    return r ? [r] : [];
  });
}

// ── readiness ───────────────────────────────────────────────────────────────────────────────────────────────────

export interface ReadinessDay { day: string; bestCm: number; band: ReadinessBand; belowReal: boolean }

/** Readiness days: the best jump each day; the arrow is each day's own read against the normal (never re-judged). */
export function readinessRow(days: readonly ReadinessDay[], source: RowSource): ProgressRow | null {
  const vs = (d: ReadinessDay): VsLast => (d.band === 'building' ? null : d.belowReal ? 'down' : d.band === 'ready' ? 'up' : 'same');
  const r = rowOf({
    key: `${source}:readiness`, measure: 'Readiness check', unit: 'in', source, estimate: true, better: 'up',
    items: days, at: (d) => Date.parse(`${d.day}T12:00:00`), value: (d) => in1(d.bestCm), fmt: (v) => v.toFixed(1),
    compare: (a) => ({ vsLast: vs(a), delta: null }),
    words: { against: RESULT_COPY.yourNormal, up: 'above', down: 'below', fmt: () => '' },
  });
  return r ? { ...r, vsLine: readinessVsLine(r.vsLast) } : null;
}

/** Readiness's arrow words: the band against the normal, never a made-up amount. */
export function readinessVsLine(v: VsLast): string | null {
  if (v === null) return null;
  return v === 'same' ? RESULT_COPY.same(RESULT_COPY.yourNormal) : v === 'up' ? 'Above your normal' : 'Below your normal';
}

// ── combine ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Each station across the athlete's combines (TRY-08). */
export function combineRows(events: readonly MyCombine[]): ProgressRow[] {
  return stationSeries(events).flatMap((s) => {
    const def = STATIONS[s.kind];
    const lower = def.better === 'lower';
    const unit = stationValue(s.kind, 0).unit;
    const r = rowOf({
      key: `combine:${s.id}`, measure: s.name, unit, source: 'combine', estimate: def.method !== 'hand', better: lower ? 'down' : 'up',
      items: s.points, at: (p) => p.at, value: (p) => Number(stationValue(s.kind, p.value).value), fmt: (v) => (unit === 's' ? v.toFixed(2) : unit === 'in' ? v.toFixed(1) : String(Math.round(v))),
      compare: (a, b) => compareLast(a.value, b.value, stationBand(s.kind)),
      words: { against: RESULT_COPY.lastCombine, up: lower ? 'slower' : 'higher', down: lower ? 'faster' : 'lower', fmt: (x) => { const p = stationValue(s.kind, x); return `${p.value} ${p.unit}`; } },
    });
    return r ? [r] : [];
  });
}

/** Rows in the page's order: the newest number first. */
export function byNewest(rows: readonly ProgressRow[]): ProgressRow[] {
  return [...rows].sort((a, b) => b.latestAt - a.latestAt);
}
