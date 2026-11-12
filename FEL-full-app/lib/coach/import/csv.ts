// lib/coach/import/csv.ts — COACH-PARITY (2026-10-26): CSV and spreadsheet-paste rows, without a dependency.
// RFC 4180 quoting (a quoted cell may hold the delimiter, a newline, or "" for a quote), CRLF or LF, an optional BOM,
// and the delimiter guessed from the first lines (tab for a spreadsheet copy; comma, else semicolon, the European export).
// Pure.

export type Delimiter = '\t' | ',' | ';';

/** The delimiter the text most likely uses: tab beats comma beats semicolon, counted outside quotes on the first lines. */
export function guessDelimiter(text: string): Delimiter {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  const count = (d: string) => lines.reduce((n, l) => n + l.replace(/"[^"]*"/g, '').split(d).length - 1, 0);
  if (count('\t') >= lines.length && count('\t') > 0) return '\t';
  const c = count(','), s = count(';');
  return s > c ? ';' : ',';
}

/** Rows of cells. Cells are trimmed; an all-blank row is kept as [] so line numbers stay true. */
export function parseCsv(text: string, delimiter: Delimiter = guessDelimiter(text)): string[][] {
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell.trim() === '') { quoted = true; cell = ''; continue; }
    if (ch === delimiter) { row.push(cell.trim()); cell = ''; continue; }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell.trim());
      rows.push(row.every((c) => c === '') ? [] : row);
      row = []; cell = '';
      continue;
    }
    cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell.trim()); rows.push(row.every((c) => c === '') ? [] : row); }
  return rows;
}
