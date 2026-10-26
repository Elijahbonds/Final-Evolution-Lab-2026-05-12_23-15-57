// lib/combine/csv.ts — COMBINE-DAY (2026-10-25): the report as CSV, made on the coach's phone (no dependency, no server).
//
// One row per athlete who could be tested, in composite order: the composite rank and score, then for every station its
// best, its rank, its percentile and each attempt (X = no mark, blank = not taken). Jumps are in cm and in; hand-timed
// stations say so in their header. Held athletes are not in the file: they took no station.
//
// SAFE TO OPEN IN A SPREADSHEET: every cell is quoted when it needs to be, and a cell that starts like a formula
// (= + - @, a tab or a return) is prefixed with ' so Excel or Sheets reads it as text (CSV injection).
import { STATIONS, UNIT_LABEL, stationName } from './catalogue';
import { compositeTable, stationTable } from './score';
import type { CombineEvent } from './types';
import { timedBy } from '@/lib/sprint/cameraSprint';

export function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : v;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

export function combineCsv(ev: CombineEvent): string {
  const board = compositeTable(ev, ev.weights);
  const tables = new Map(ev.stations.map((s) => [s.id, stationTable(ev, s)]));
  const header = ['Composite rank', 'Athlete', 'Composite (0-100)', 'Stations done'];
  for (const s of ev.stations) {
    const def = STATIONS[s.kind];
    const name = stationName(s);
    header.push(`${name} best (${UNIT_LABEL[def.unit]})`);
    if (def.unit === 'cm') header.push(`${name} best (in)`);
    if (s.kind === 'approach') header.push(`${name} touch (cm)`);
    if (s.timing === 'camera') header.push(`${name} timed by`);
    header.push(`${name} rank`, `${name} percentile`);
    for (let i = 1; i <= s.attempts; i++) header.push(`${name} attempt ${i}`);
  }
  const lines = [header.map(csvCell).join(',')];
  for (const row of board) {
    const cells: (string | number | null)[] = [row.rank, row.name, row.composite, `${row.done}/${row.of}`];
    for (const s of ev.stations) {
      const def = STATIONS[s.kind];
      const r = tables.get(s.id)!.find((x) => x.id === row.id);
      const round = def.unit === 's' ? r2 : r1;
      cells.push(r?.value != null ? round(r.value) : null);
      if (def.unit === 'cm') cells.push(r?.value != null ? r1(r.value / 2.54) : null);
      if (s.kind === 'approach') cells.push(r?.touchCm != null ? r1(r.touchCm) : null);
      // SPRINT-SPEED: a camera station says how each athlete's attempts were timed ("camera", "hand-timed" or both)
      if (s.timing === 'camera') cells.push(r ? timedBy(r.slots) : null);
      cells.push(r?.rank ?? null, r?.pct ?? null);
      for (let i = 0; i < s.attempts; i++) {
        const a = r?.slots[i];
        cells.push(a == null ? null : a.value == null ? 'X' : round(a.value));
      }
    }
    lines.push(cells.map(csvCell).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

/** A file name from the combine's name and day: letters, digits and dashes only. */
export function csvFileName(ev: Pick<CombineEvent, 'name' | 'createdAt'>): string {
  const day = new Date(ev.createdAt || Date.now()).toISOString().slice(0, 10);
  const base = ev.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'combine';
  return `${base}-${day}.csv`;
}
