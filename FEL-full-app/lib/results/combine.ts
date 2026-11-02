// lib/results/combine — the athlete's combine numbers as ResultViews, and each station's re-test history across their
// combines (PLAT-P03, 2026-10-28; TRY-08: "re-test history, combine to combine").
//
// BANDS (read-only): a jump station (standing or approach) reads "same" inside JUMP_SAME_BAND_IN (lib/results/jump.ts,
// the jump tool's own); a hand-timed sprint or agility station and a skill drill's % have no band in the combine tool,
// so they show the change with no arrow (assumption: flagged; a stopwatch's own spread is an owner call).
// COMPARABLE: the same station id (kind + variant) only, a combine before.
//
// OWN-01: until the combine SQL is applied, myCombines answers `available: false` and every row here is empty.
//
// Pure.
import { STATIONS, stationName, type StationKind } from '@/lib/combine/catalogue';
import { ordinal } from '@/lib/combine/score';
import type { MyCombine, MyStation } from '@/lib/combine/server';
import { JUMP_BAND_CM } from './jump';
import { compareLast, vsLineOf, type ResultNextStep, type ResultView } from './view';
import { RESULT_COPY } from './copy';

const IN = 2.54;

/** The station's own band in its stored unit, or null when the combine tool has none. */
export function stationBand(kind: StationKind): number | null {
  return kind === 'cmj' || kind === 'approach' ? JUMP_BAND_CM : null;
}

/** The stored value as the card prints it: a jump in inches, a time in seconds, a drill in %. */
export function stationValue(kind: StationKind, v: number): { value: string; unit: string } {
  const u = STATIONS[kind].unit;
  if (u === 'cm') return { value: (v / IN).toFixed(1), unit: 'in' };
  if (u === 's') return { value: v.toFixed(2), unit: 's' };
  return { value: String(Math.round(v)), unit: '%' };
}

/** "2nd of 14 in this combine." DRAFT copy (the combine tool's rank, said once). */
export const placedLine = (rank: number, of: number) => `${ordinal(rank)} of ${of} in this combine.`;

/** The same station in an earlier combine (events newest first), or null. */
export function previousStation(events: readonly MyCombine[], eventId: string, stationId: string): MyStation | null {
  const i = events.findIndex((e) => e.id === eventId);
  for (const e of events.slice(i + 1)) {
    const s = e.stations.find((x) => x.id === stationId && x.best !== null);
    if (s) return s;
  }
  return null;
}

/** One station of one combine → the card, against the same station last combine. */
export function stationView(s: MyStation, prev: MyStation | null, next: ResultNextStep): ResultView {
  const def = STATIONS[s.kind];
  const c = compareLast(s.best, prev?.best ?? null, stationBand(s.kind));
  const shown = s.best === null ? null : stationValue(s.kind, s.best);
  const fmt = (x: number) => { const p = stationValue(s.kind, x); return `${p.value} ${p.unit}`; };
  const lower = def.better === 'lower';
  return {
    measure: stationName(s), value: shown?.value ?? null, unit: shown?.unit ?? stationValue(s.kind, 0).unit,
    estimate: def.method !== 'hand', pm: null, vsLast: c.vsLast, better: lower ? 'down' : 'up',
    vsLine: vsLineOf(c, { against: RESULT_COPY.lastCombine, up: lower ? 'slower' : 'higher', down: lower ? 'faster' : 'lower', fmt }),
    line: s.rank ? placedLine(s.rank, s.of) : '', next,
  };
}

/** A station's bests across the athlete's combines, oldest first: the re-test history. */
export function stationSeries(events: readonly MyCombine[]): { id: string; kind: StationKind; name: string; points: { at: number; value: number }[] }[] {
  const by = new Map<string, { id: string; kind: StationKind; name: string; points: { at: number; value: number }[] }>();
  for (const e of [...events].sort((a, b) => a.createdAt - b.createdAt)) {
    for (const s of e.stations) {
      if (s.best === null) continue;
      const row = by.get(s.id) ?? { id: s.id, kind: s.kind, name: stationName(s), points: [] };
      row.points.push({ at: e.createdAt, value: s.best });
      by.set(s.id, row);
    }
  }
  return [...by.values()];
}
