// lib/csv/csv.ts — a small CSV writer and reader, made on the phone (JUMP-TESTS, 2026-10-25). No dependency, no server.
//
// Written after lib/combine/csv.ts on lane/combine-day (not merged when this landed), with one change: a NUMBER is never
// prefixed. That file defuses every cell that starts with = + - @, so a negative number (a Bland-Altman difference, a
// drop of −1.5 cm) would open in a spreadsheet as the text '-1.5. Here only strings are defused; a finite number is
// written as itself, and a non-finite one as an empty cell. When combine-day lands, its csvCell can move onto this one.
//
// SAFE TO OPEN IN A SPREADSHEET: a string cell is quoted when it holds a comma, a quote or a line break, and a string
// that starts like a formula (= + - @, a tab or a return) is prefixed with ' so Excel or Sheets reads it as text (CSV
// injection). Rows end in \r\n (RFC 4180).
//
// Pure.

export type CsvValue = string | number | boolean | null | undefined;

export function csvCell(v: CsvValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  let s = v;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** A header and rows → the file's text (every row ends in \r\n). */
export function toCsv(header: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/**
 * The file's text → rows of cells (RFC 4180: quoted cells, "" inside quotes, \r\n or \n). A cell this file defused
 * ('=…) comes back with its ' still on it: the reader returns what is in the file.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
      continue;
    }
    if (c === '"' && cell === '') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

/** Rows with a header → one object per row, keyed by the header (trimmed, lower-cased). */
export function csvRecords(text: string): Record<string, string>[] {
  const [head, ...rest] = parseCsv(text);
  if (!head) return [];
  const keys = head.map((h) => h.trim().toLowerCase());
  return rest.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

/** A file name: letters, digits and dashes, then the day (UTC). */
export function csvFileName(base: string, at: Date = new Date()): string {
  const b = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'export';
  return `${b}-${at.toISOString().slice(0, 10)}.csv`;
}
