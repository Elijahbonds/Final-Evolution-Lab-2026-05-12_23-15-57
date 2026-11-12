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
  /** Which export the header was read as (COACH-DELIVERY COA-07): a named team app, a generic header, or none. */
  format?: ImportFormat;
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

// ── named team-app exports (COACH-DELIVERY COA-07, 2026-10-27) ─────────────────────────────────────────────────────
//
// TeamSnap, SportsEngine and LeagueApps roster exports name their columns their own way, and every one of them carries
// a PARENT or GUARDIAN's email beside (or instead of) the player's. The generic header reader would miss the player
// columns ("Player First Name", "Email Address 1") and could pick up a guardian's address as the athlete's. So each app
// has a named map: its marker header, its first/last name and the PLAYER's email column — never a guardian column, which
// is read as nothing at all (an invite is the athlete's own; a guardian is asked through /consent/guardian, not here).
// A row whose only email is a guardian's gets a code on the handout sheet, not an email.
//
// assumption: the column names below are each app's documented/common export headers as of 2026-10; exports vary by
// account settings, so each map takes a few spellings, and tests/fixtures/{teamsnap,sportsengine,leagueapps}-roster.csv
// pin them. A real export from the owner should be added as a fixture when one is to hand.

export type ImportFormat = 'teamsnap' | 'sportsengine' | 'leagueapps' | 'generic' | 'list';

export interface TeamAppMap {
  id: Exclude<ImportFormat, 'generic' | 'list'>;
  label: string;
  /** The header only this app's export has. */
  marker: RegExp;
  first: RegExp;
  last: RegExp;
  /** The PLAYER's own email. */
  email: RegExp;
  /** Columns that hold someone else's email (a parent, a guardian, a contact): never read. */
  guardian: RegExp;
}

export const TEAM_APP_MAPS: readonly TeamAppMap[] = [
  {
    id: 'leagueapps', label: 'LeagueApps',
    marker: /^player\s*first\s*name$/i,
    first: /^player\s*first\s*name$/i, last: /^player\s*last\s*name$/i, email: /^player\s*e-?mail(\s*address)?$/i,
    guardian: /^(parent|guardian)\s*\d*\s*.*e-?mail/i,
  },
  {
    id: 'sportsengine', label: 'SportsEngine',
    marker: /^participant\s*:?\s*first\s*name$/i,
    first: /^participant\s*:?\s*first\s*name$/i, last: /^participant\s*:?\s*last\s*name$/i, email: /^participant\s*:?\s*e-?mail(\s*address)?$/i,
    guardian: /^((primary\s*)?(parent|guardian|contact)\s*\d*\s*:?\s*.*e-?mail|primary\s*contact\s*e-?mail)/i,
  },
  {
    id: 'teamsnap', label: 'TeamSnap',
    marker: /^(e-?mail\s*address\s*1|jersey\s*number)$/i,
    first: /^first(\s*name)?$/i, last: /^last(\s*name)?$/i, email: /^e-?mail\s*address\s*1$/i,
    // TeamSnap lists a member's contacts as "Email Address 2…n" and "Contact … Email": a parent's, so not read
    guardian: /^(e-?mail\s*address\s*([2-9]|\d{2,})|contact.*e-?mail|parent.*e-?mail|guardian.*e-?mail)$/i,
  },
];

/** The named team app whose export this header is, or null. Matched on the marker AND the columns the map reads. */
export function teamAppOf(head: readonly string[]): TeamAppMap | null {
  for (const m of TEAM_APP_MAPS) {
    if (!head.some((h) => m.marker.test(h))) continue;
    if (head.some((h) => m.first.test(h)) || head.some((h) => m.email.test(h))) return m;
  }
  return null;
}

export function parseRosterImport(text: string, max: number = MAX_IMPORT_ROWS): ImportResult {
  const src = String(text ?? '').replace(/^﻿/, '').slice(0, MAX_TEXT);
  const records = parseCsv(src, detectDelimiter(src)).filter((r) => r.cells.some((c) => c.trim()));
  const result: ImportResult = { rows: [], problems: [], duplicates: 0 };
  if (!records.length) return result;


  // A header row names its columns; without one, each line is read loosely.
  const head = records[0].cells.map((c) => c.trim());
  const app = teamAppOf(head);
  const nameCol = app ? head.findIndex((c) => app.first.test(c)) : head.findIndex((c) => NAME_HEADER.test(c));
  const lastCol = app ? head.findIndex((c) => app.last.test(c)) : head.findIndex((c) => LAST_HEADER.test(c));
  // a team app's player email only; a guardian column is never a candidate, even if the generic rule would match it
  const emailCol = app ? head.findIndex((c) => app.email.test(c) && !app.guardian.test(c)) : head.findIndex((c) => EMAIL_HEADER.test(c));
  const hasHeader = !!app || nameCol >= 0 || emailCol >= 0;
  const body = hasHeader ? records.slice(1) : records;
  result.format = app ? app.id : hasHeader ? 'generic' : 'list';

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

/** The line the coach reads under the import: which export it was read as. */
export function importFormatLine(f: ImportFormat | undefined): string | null {
  const app = TEAM_APP_MAPS.find((m) => m.id === f);
  return app ? `Read as a ${app.label} export: player names and player emails only. Parent and guardian emails were left out.` : null;
}

/** One line per problem, for the coach. */
export const IMPORT_PROBLEM_COPY: Record<ImportProblem, string> = {
  bad_email: 'that email does not look right',
  empty: 'no name or email on this line',
  too_many: `over the ${MAX_IMPORT_ROWS}-athlete limit for one import`,
};
