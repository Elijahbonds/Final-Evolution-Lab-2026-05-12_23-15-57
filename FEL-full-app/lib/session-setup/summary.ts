// Session summary kept on the device. The share card and the CSV name only verified adults.
// A kid or unknown nickname is not written into the file.

import type { SessionBand } from './roster';
import { inchesFromCm } from './voice';

export interface SummaryRow {
  name: string;
  band: SessionBand;
  verticalCm: number;
  judges: number;
}

function cell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function adultRows(rows: readonly SummaryRow[]): SummaryRow[] {
  return rows.filter((r) => r.band === '18+');
}

export function adultCsv(rows: readonly SummaryRow[]): string {
  const lines = ['name,vertical_in,judges'];
  for (const r of adultRows(rows)) {
    lines.push(`${cell(r.name)},${inchesFromCm(r.verticalCm)},${r.judges.toFixed(1)}`);
  }
  return lines.join('\n');
}

export function adultShareText(rows: readonly SummaryRow[]): string {
  const adults = adultRows(rows);
  if (adults.length === 0) return '';
  return adults.map((r) => `${r.name}: ${inchesFromCm(r.verticalCm)} inches, judges ${r.judges.toFixed(1)}`).join('\n');
}
