// Session summary kept on the device. The share card and the CSV name only verified adults.
// A kid or unknown nickname is not written into the file.

import type { SessionBand } from './roster';
import { inchesFromCm } from './voice';
import { summariseJumps } from '@/lib/dunk-film/summary';

export const CUE_TAGS = ['Approach', 'Penultimate', 'Plant', 'Arm swing', 'Ball', 'Finish', 'Landing'] as const;
export type CueTag = (typeof CUE_TAGS)[number];

/** TUNE(elijah): a rep this far under the session top-3 average counts toward a drop-off. */
export const DROP_OFF_PCT = 5;
/** TUNE(elijah): this many measured reps in a row, each under that line, is a drop-off. */
export const DROP_OFF_REPS = 3;
const TOP_N = 3;

export interface SummaryRow {
  name: string;
  band: SessionBand;
  verticalCm: number;
  judges: number;
  round?: number;
  make?: boolean | null;
  tags?: readonly string[];
}

export interface Rep {
  round: number;
  band: SessionBand;
  family: string;
  verticalCm: number;
  /** DunkRefusal such as 'rim_hang'. A refused rep is not a measured height and not a make or miss. */
  refusal?: string | null;
  make?: boolean | null;
  tags?: readonly string[];
}

export interface FamilyMakeRate { family: string; makes: number; marked: number; rate: number | null }

export interface SessionSummaryResult {
  measured: number;
  bestCm: number | null;
  averageCm: number | null;
  top3AverageCm: number | null;
  /** Per measured rep, in order: its height as a percent of the top-3 average. */
  pctOfTop3: number[];
  makes: number;
  marked: number;
  makeRate: number | null;
  byFamily: FamilyMakeRate[];
  dropOff: boolean;
}

export function sessionSummary(reps: readonly Rep[]): SessionSummaryResult {
  const ok = reps.filter((r) => !r.refusal && Number.isFinite(r.verticalCm) && r.verticalCm > 0);
  const stats = summariseJumps(ok.map((r) => ({ airTimeCm: r.verticalCm })));
  const top = ok.map((r) => r.verticalCm).sort((a, b) => b - a).slice(0, TOP_N);
  const top3 = top.length ? top.reduce((a, b) => a + b, 0) / top.length : null;
  const pctOfTop3 = top3 ? ok.map((r) => Math.round((r.verticalCm / top3) * 1000) / 10) : [];
  let streak = 0;
  let dropOff = false;
  for (const pct of pctOfTop3) {
    streak = pct <= 100 - DROP_OFF_PCT ? streak + 1 : 0;
    if (streak >= DROP_OFF_REPS) dropOff = true;
  }
  const marked = ok.filter((r) => r.make === true || r.make === false);
  const fams = new Map<string, { makes: number; marked: number }>();
  for (const r of marked) {
    const f = fams.get(r.family) ?? { makes: 0, marked: 0 };
    f.marked += 1;
    if (r.make) f.makes += 1;
    fams.set(r.family, f);
  }
  const makes = marked.filter((r) => r.make).length;
  return {
    measured: ok.length,
    bestCm: stats.bestCm,
    averageCm: stats.averageCm,
    top3AverageCm: top3,
    pctOfTop3,
    makes,
    marked: marked.length,
    makeRate: marked.length ? makes / marked.length : null,
    byFamily: [...fams].map(([family, f]) => ({ family, ...f, rate: f.marked ? f.makes / f.marked : null })),
    dropOff,
  };
}

function cell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function adultRows(rows: readonly SummaryRow[]): SummaryRow[] {
  return rows.filter((r) => r.band === '18+');
}

export function adultCsv(rows: readonly SummaryRow[]): string {
  const lines = ['name,round,vertical_in,judges,make,tags'];
  for (const r of adultRows(rows)) {
    const make = r.make === true ? 'make' : r.make === false ? 'miss' : '';
    lines.push([
      cell(r.name), r.round ?? '', inchesFromCm(r.verticalCm), r.judges.toFixed(1), make, cell((r.tags ?? []).join(';')),
    ].join(','));
  }
  return lines.join('\n');
}

export function adultShareText(rows: readonly SummaryRow[]): string {
  const adults = adultRows(rows);
  if (adults.length === 0) return '';
  return adults.map((r) => `${r.name}: ${inchesFromCm(r.verticalCm)} inches, judges ${r.judges.toFixed(1)}`).join('\n');
}
