// bulkImport — a team list pasted or uploaded as CSV, read by hand (coach-loop P1, 2026-10-20). No package.
//
// The owner's answer for adding clients includes "bulk team import". The roadmap's done-when: a coach adds 20
// athletes from a pasted list in under a minute, and each joins by code. So the input is whatever a coach has:
//   · a CSV export from a team app or a spreadsheet (a header row with name / email columns, quoted fields, commas
//     inside quotes, "" for a quote, CRLF or LF, a BOM) — or the same with tabs (pasted from a spreadsheet) or
//     semicolons (a European export);
//   · a pasted list, one athlete per line: "Sam Lee, sam@x.com", "Sam Lee <sam@x.com>", "sam@x.com", or just "Sam Lee".
// A row with an email gets a one-shot invite emailed to it (when email is on); a row with only a name gets a code on
// the coach's handout sheet. Either way every row gets its own one-shot invite.
//
// What it refuses, by line number, so the coach can fix the paste: a cell that looks like an email and is not one,
// and a row with nothing in it worth inviting. Duplicate emails are dropped (counted), the list is capped.
//
// Pure. The route makes the invites.

import { normalizeEmail } from '@/lib/mail/address';

export const MAX_IMPORT_ROWS = 50;
const MAX_NAME = 80;
const MAX_TEXT = 100_000;

export interface ImportRow {
  /** 1-based line in what the coach pasted (the header counts), so an error points at the right place. */
  line: number;
  name: string | null;
  email: string | null;
}

export type ImportProblem = 'bad_email' | 'empty' | 'too_many';

export interface ImportResult {
  rows: ImportRow[];
  problems: { line: number; problem: ImportProblem }[];
  /** Rows dropped because the same email was already in the list. */
  duplicates: number;
}

type Delim = ',' | '\t' | ';';

/** One CSV record per element: RFC 4180 quoting, any of the three delimiters, CRLF or LF. Lines are 1-based. */
export function parseCsv(text: string, delim: Delim): { line: number; cells: string[] }[] {
  const out: { line: number; cells: string[] }[] = [];
  let cells: string[] = [], cell = '', quoted = false, line = 1, start = 1, sawQuote = false;
  const endCell = () => { cells.push(sawQuote ? cell : cell.trim()); cell = ''; sawQuote = false; };
  const endRow = () => { endCell(); out.push({ line: start, cells }); cells = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else {
        if (ch === '\n') line++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell.trim() === '') { quoted = true; sawQuote = true; cell = ''; continue; }
    if (ch === delim) { endCell(); continue; }
    if (ch === '\r' && text[i + 1] === '\n') continue;
    if (ch === '\n' || ch === '\r') { endRow(); line++; start = line; continue; }
    cell += ch;
  }
  if (cell !== '' || cells.length || sawQuote) endRow();
  return out;
}

/** The delimiter of a paste: tab (spreadsheet), then semicolon, else comma — read off the first line with content. */
export function detectDelimiter(text: string): Delim {
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? '';
  if (first.includes('\t')) return '\t';
  if (first.includes(';') && !first.includes(',')) return ';';
  return ',';
}

const NAME_HEADER = /^(full\s*name|name|athlete|player|student|client|first\s*name)$/i;
const LAST_HEADER = /^(last\s*name|surname|family\s*name)$/i;
const EMAIL_HEADER = /^(e-?mail(\s*address)?|mail)$/i;
const ANGLE = /^(.*?)<([^<>]+)>\s*$/;

const cleanName = (s: string): string | null => {
  const n = s.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  return n ? n : null;
};

/** One line with no header: find the email (a cell, or "Name <email>"); everything else is the name. */
function readLoose(cells: string[]): { name: string | null; email: string | null; badEmail: boolean } {
  let email: string | null = null, badEmail = false;
  const nameParts: string[] = [];
  for (const raw of cells) {
    const c = raw.trim();
    if (!c) continue;
    const angle = c.match(ANGLE);
    if (angle) {
      const e = normalizeEmail(angle[2]);
      if (e && !email) email = e; else badEmail = true;
      if (angle[1].trim()) nameParts.push(angle[1].replace(/^"|"$/g, ''));
      continue;
    }
    if (c.includes('@')) {
      const e = normalizeEmail(c);
      if (e && !email) email = e; else badEmail = true;
      continue;
    }
    nameParts.push(c);
  }
  return { name: cleanName(nameParts.join(' ')), email, badEmail };
}

export function parseRosterImport(text: string, max: number = MAX_IMPORT_ROWS): ImportResult {
  const src = String(text ?? '').replace(/^﻿/, '').slice(0, MAX_TEXT);
  const records = parseCsv(src, detectDelimiter(src)).filter((r) => r.cells.some((c) => c.trim()));
  const result: ImportResult = { rows: [], problems: [], duplicates: 0 };
  if (!records.length) return result;

  // A header row names its columns; without one, each line is read loosely.
  const head = records[0].cells.map((c) => c.trim());
  const nameCol = head.findIndex((c) => NAME_HEADER.test(c));
  const lastCol = head.findIndex((c) => LAST_HEADER.test(c));
  const emailCol = head.findIndex((c) => EMAIL_HEADER.test(c));
  const hasHeader = nameCol >= 0 || emailCol >= 0;
  const body = hasHeader ? records.slice(1) : records;

  const seen = new Set<string>();
  for (const r of body) {
    let name: string | null, email: string | null, badEmail = false;
    if (hasHeader) {
      const first = nameCol >= 0 ? r.cells[nameCol] ?? '' : '';
      const last = lastCol >= 0 ? r.cells[lastCol] ?? '' : '';
      name = cleanName(`${first} ${last}`);
      const rawEmail = emailCol >= 0 ? (r.cells[emailCol] ?? '').trim() : '';
      email = rawEmail ? normalizeEmail(rawEmail) : null;
      badEmail = !!rawEmail && !email;
    } else {
      ({ name, email, badEmail } = readLoose(r.cells));
    }
    if (badEmail) { result.problems.push({ line: r.line, problem: 'bad_email' }); continue; }
    if (!name && !email) { result.problems.push({ line: r.line, problem: 'empty' }); continue; }
    if (email) {
      if (seen.has(email)) { result.duplicates++; continue; }
      seen.add(email);
    }
    if (result.rows.length >= max) { result.problems.push({ line: r.line, problem: 'too_many' }); continue; }
    result.rows.push({ line: r.line, name, email });
  }
  return result;
}

/** One line per problem, for the coach. */
export const IMPORT_PROBLEM_COPY: Record<ImportProblem, string> = {
  bad_email: 'that email does not look right',
  empty: 'no name or email on this line',
  too_many: `over the ${MAX_IMPORT_ROWS}-athlete limit for one import`,
};
