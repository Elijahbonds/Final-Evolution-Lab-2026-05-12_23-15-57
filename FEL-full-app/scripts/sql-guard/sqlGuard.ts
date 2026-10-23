/**
 * scripts/sql-guard/sqlGuard.ts — THE PURE MATCHER BEHIND .github/workflows/db-guard.yml (docs/DB-GUARD.md).
 *
 * Owner decision 2026-10-20 ("guarded CI job, one-time secret"): CI may write to the production database ONLY when
 * `prisma migrate diff --from-url <prod> --to-schema-datamodel prisma/schema.prisma --script` is exactly the
 * statements of one reviewed file in prisma/pending/, or of an ordered set of them. Anything else stops and pings
 * the owner. This module makes that decision. It does no I/O: it takes SQL text in and returns a verdict, so every
 * rule below is unit-tested (scripts/sql-guard-tests.ts) against the real pending files and against what Prisma
 * itself prints (scripts/sql-guard-prisma-tests.ts).
 *
 * THE RULES.
 *   1. Comments are stripped, whitespace is collapsed, unquoted text is lower-cased (Postgres folds it the same way),
 *      and spaces around `(`, `)` and `,` are dropped. Quoted identifiers and string literals are kept byte for byte.
 *   2. Order does not matter where Prisma does not care: the statements of a diff are compared as a MULTISET (Prisma
 *      groups a diff by kind — every CREATE TABLE, then every CREATE INDEX, then every FK — so two files interleave),
 *      the column/constraint list of a CREATE TABLE is compared as a set, and so are the clauses of one
 *      `ALTER TABLE ... ADD COLUMN a, ADD COLUMN b`. The verify step (the same diff, which must come back empty)
 *      is the backstop for anything this equivalence lets through.
 *   3. ONLY ADDITIVE STATEMENTS ARE EVER APPLIED, by allowlist: CREATE TABLE, CREATE [UNIQUE] INDEX, CREATE TYPE ...
 *      AS ENUM, ALTER TYPE ... ADD VALUE, and ALTER TABLE whose every clause is ADD COLUMN or ADD CONSTRAINT ...
 *      FOREIGN KEY. A DROP, any ALTER ... DROP / TYPE / RENAME / SET, TRUNCATE, DELETE, UPDATE, INSERT, a transaction
 *      verb, dollar-quoting — anything else — is never applied, in a diff OR in a pending file. A pending file that
 *      holds one is ineligible, however well it matches.
 *   4. The diff must equal the union of WHOLE files, exactly, and that union must be the only one that does. A file
 *      half in the diff (production already has part of it) is "unexpected", never "apply the rest".
 *   5. The chosen files are applied in dependency order: a file that references a table or enum another chosen file
 *      creates (REFERENCES, ALTER TABLE, ON, a column of that enum type) goes after it; ties break by file name,
 *      which is the date order the pending files are named in. A cycle is "unexpected".
 *
 * The raw-SQL tables (PartyReport, CreatorInquiry, BookEntitlement, BookFulfillmentEvent) are not in schema.prisma,
 * so once production has them every diff proposes `DROP TABLE` for them. That is rule 3: the guard stops, and the
 * report names the pending file that created the table so the owner sees why (OWNER-RUNBOOK §4 and §6).
 */

export interface PendingFile {
  /** The file name inside prisma/pending/, e.g. `2026-10-13-party-report.sql`. */
  name: string;
  sql: string;
}

export interface Statement {
  /** The statement as written (comments stripped, trimmed, no trailing `;`). */
  raw: string;
  /** The comparison key (rules 1 and 2). */
  norm: string;
  /** Rule 3. */
  additive: boolean;
  /** Why a statement is not additive. */
  reason?: string;
  /** True for a DROP of anything, or an ALTER that drops/retypes/renames: the "stop and ping" class. */
  destructive: boolean;
  /** Tables and enum types this statement creates. */
  creates: string[];
  /** Tables and enum types this statement needs to exist (rule 5). */
  needs: string[];
  /** For `DROP TABLE "X"` / `DROP TYPE "X"`: X. */
  dropTarget?: string;
}

export interface ParsedSql {
  statements: Statement[];
  /** Set when the text cannot be split safely (dollar quoting, an unterminated quote or comment). */
  error?: string;
}

export type Decision =
  | { kind: 'empty' }
  | { kind: 'match'; files: string[]; statementCount: number }
  | { kind: 'unexpected'; reasons: string[] };

// ---------------------------------------------------------------------------------------------------------------
// Lexing: comments, quotes, statement boundaries.
// ---------------------------------------------------------------------------------------------------------------

interface Piece { text: string; quoted: boolean }

/**
 * Splits SQL into statements, dropping comments. Each statement is a list of pieces: quoted identifiers ("...") and
 * string literals ('...') kept verbatim, everything else as plain text. Doubled quotes inside a quote are kept.
 */
function lex(sql: string): { statements: Piece[][]; error?: string } {
  const statements: Piece[][] = [];
  let pieces: Piece[] = [];
  let plain = '';
  const flushPlain = () => { if (plain) { pieces.push({ text: plain, quoted: false }); plain = ''; } };
  const endStatement = () => {
    flushPlain();
    if (pieces.some(p => p.quoted || p.text.trim())) statements.push(pieces);
    pieces = [];
  };
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === '-' && next === '-') {
      const eol = sql.indexOf('\n', i);
      i = eol === -1 ? n : eol;
      plain += ' ';
      continue;
    }
    if (c === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) return { statements, error: 'unterminated /* comment' };
      i = end + 2;
      plain += ' ';
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      for (;;) {
        if (j >= n) return { statements, error: `unterminated ${c === '"' ? 'quoted identifier' : 'string literal'}` };
        if (sql[j] === c) {
          if (sql[j + 1] === c) { j += 2; continue; }
          break;
        }
        j++;
      }
      flushPlain();
      pieces.push({ text: sql.slice(i, j + 1), quoted: true });
      i = j + 1;
      continue;
    }
    if (c === '$' && /^\$[A-Za-z_]*\$/.test(sql.slice(i))) {
      return { statements, error: 'dollar-quoted text ($$ ... $$) is not something this guard applies' };
    }
    if (c === ';') { endStatement(); i++; continue; }
    plain += c;
    i++;
  }
  endStatement();
  return { statements };
}

/** Rule 1 on one statement's pieces. */
function normalisePieces(pieces: Piece[]): string {
  let out = '';
  for (const p of pieces) out += p.quoted ? p.text : p.text.replace(/\s+/g, ' ').toLowerCase();
  return tightenOutsideQuotes(out).trim();
}

/** Drops whitespace around ( ) , outside quotes, and collapses what is left. */
function tightenOutsideQuotes(s: string): string {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < s.length) {
        if (s[j] === c) { if (s[j + 1] === c) { j += 2; continue; } break; }
        j++;
      }
      out += s.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === ' ') {
      const prev = out[out.length - 1];
      let k = i;
      while (s[k] === ' ') k++;
      const nxt = s[k];
      if (prev === undefined || prev === '(' || prev === ',' || prev === ' ' || nxt === '(' || nxt === ')' || nxt === ',' || nxt === undefined) {
        i = k;
        continue;
      }
      out += ' ';
      i = k;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Replaces the inside of every quote with `_`, so structure can be read without a name or literal faking it. */
function mask(s: string): string {
  return s.replace(/"(?:[^"]|"")*"|'(?:[^']|'')*'/g, m => m[0] + '_'.repeat(Math.max(0, m.length - 2)) + m[0]);
}

/** Splits `s` at commas that are at paren depth 0 and outside quotes. */
function splitTopLevel(s: string): string[] {
  const masked = mask(s);
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) { parts.push(s.slice(start, i)); start = i + 1; }
  }
  parts.push(s.slice(start));
  return parts.map(p => p.trim()).filter(Boolean);
}

/** Index of the paren that closes the one at `open`, outside quotes; -1 if none. */
function closingParen(s: string, open: number): number {
  const masked = mask(s);
  let depth = 0;
  for (let i = open; i < masked.length; i++) {
    if (masked[i] === '(') depth++;
    else if (masked[i] === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

// ---------------------------------------------------------------------------------------------------------------
// Classification (rule 3) and the order-insensitive key (rule 2).
// ---------------------------------------------------------------------------------------------------------------

const unq = (quoted: string) => quoted.slice(1, -1).replace(/""/g, '"');

function classify(norm: string): Omit<Statement, 'raw' | 'norm'> {
  const m = mask(norm);
  const base = { creates: [] as string[], needs: [] as string[], destructive: false };
  const notAdditive = (reason: string, destructive = false, dropTarget?: string) =>
    ({ ...base, additive: false, reason, destructive, dropTarget });

  if (/^drop\b/.test(m)) {
    const t = /^drop (?:table|type|index|view|schema|sequence)(?: if exists)? ("(?:[^"]|"")*")/.exec(norm);
    return notAdditive('DROP is never applied by the guard', true, t ? unq(t[1]) : undefined);
  }
  if (/^(truncate|delete|update|insert)\b/.test(m)) return notAdditive(`${m.split(' ')[0].toUpperCase()} changes data; never applied`, true);
  // Paranoia across every shape below: an unquoted DROP / TRUNCATE / RENAME anywhere is destructive.
  if (/\b(drop|truncate|rename)\b/.test(m)) return notAdditive('contains DROP / TRUNCATE / RENAME; never applied', true);

  let r: RegExpExecArray | null;
  if ((r = /^create table ("(?:[^"]|"")*")\(/.exec(norm))) {
    const table = unq(r[1]);
    return { ...base, additive: true, creates: [table], needs: needsOf(norm).filter(x => x !== table) };
  }
  if ((r = /^create (?:unique )?index "(?:[^"]|"")*" on ("(?:[^"]|"")*")\(/.exec(norm))) {
    return { ...base, additive: true, needs: [unq(r[1])] };
  }
  if ((r = /^create type ("(?:[^"]|"")*") as enum\(/.exec(norm))) {
    return { ...base, additive: true, creates: [unq(r[1])] };
  }
  if ((r = /^alter type ("(?:[^"]|"")*") add value '/.exec(norm))) {
    return { ...base, additive: true, needs: [unq(r[1])] };
  }
  if ((r = /^alter table ("(?:[^"]|"")*") (.+)$/.exec(norm))) {
    const table = unq(r[1]);
    for (const clause of splitTopLevel(r[2])) {
      const mc = mask(clause);
      const ok = /^add column\b/.test(mc) || /^add constraint "_*" foreign key\(/.test(mc);
      if (!ok) {
        const destructive = /^alter column\b.*\btype\b|^alter column\b.*\bset data type\b/.test(mc);
        return notAdditive(`ALTER TABLE clause "${clause.slice(0, 60)}" is not ADD COLUMN / ADD CONSTRAINT ... FOREIGN KEY`, destructive);
      }
    }
    return { ...base, additive: true, needs: [table, ...needsOf(norm).filter(x => x !== table)] };
  }
  if (/^alter\b/.test(m)) return notAdditive('ALTER of this kind is never applied', /\btype\b/.test(m));
  return notAdditive(`"${norm.slice(0, 40)}" is not an additive statement this guard applies`);
}

/** Tables and types a statement leans on: REFERENCES "X", and a column whose type is a quoted (enum) name. */
function needsOf(norm: string): string[] {
  const out = new Set<string>();
  const ref = /references ("(?:[^"]|"")*")/g;
  let r: RegExpExecArray | null;
  while ((r = ref.exec(norm))) out.add(unq(r[1]));
  const typed = /"(?:[^"]|"")*" ("(?:[^"]|"")*")/g;   // `"col" "EnumType"` inside a column definition
  while ((r = typed.exec(norm))) out.add(unq(r[1]));
  return [...out];
}

/** Rule 2: the order-insensitive comparison key. */
function orderInsensitive(norm: string): string {
  const create = /^create table "(?:[^"]|"")*"\(/.exec(norm);
  if (create) {
    const open = create[0].length - 1;
    const close = closingParen(norm, open);
    if (close === norm.length - 1) {
      const elements = splitTopLevel(norm.slice(open + 1, close)).sort();
      return `${norm.slice(0, open)}(${elements.join(',')})`;
    }
  }
  const alter = /^(alter table "(?:[^"]|"")*") (.+)$/.exec(norm);
  if (alter) {
    const clauses = splitTopLevel(alter[2]);
    if (clauses.length > 1 && clauses.every(c => /^add column\b/.test(mask(c)))) return `${alter[1]} ${clauses.sort().join(',')}`;
  }
  return norm;
}

export function parseSql(sql: string): ParsedSql {
  const { statements, error } = lex(sql);
  const out: Statement[] = statements.map(pieces => {
    const raw = pieces.map(p => p.text).join('').trim().replace(/\s*\n\s*\n\s*/g, '\n');
    const norm = normalisePieces(pieces);
    return { raw, norm: orderInsensitive(norm), ...classify(norm) };
  });
  return error ? { statements: out, error } : { statements: out };
}

// ---------------------------------------------------------------------------------------------------------------
// The decision (rules 4 and 5).
// ---------------------------------------------------------------------------------------------------------------

function countKeys(stmts: Statement[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of stmts) m.set(s.norm, (m.get(s.norm) ?? 0) + 1);
  return m;
}

function fits(part: Map<string, number>, whole: Map<string, number>): boolean {
  for (const [k, v] of part) if ((whole.get(k) ?? 0) < v) return false;
  return true;
}

const short = (s: Statement) => {
  const one = s.raw.replace(/\s+/g, ' ');
  return one.length > 140 ? `${one.slice(0, 137)}...` : one;
};

interface Parsed { name: string; stmts: Statement[]; keys: Map<string, number>; creates: Set<string>; needs: Set<string> }

/** Rule 5. Returns the names in apply order, or null on a cycle. */
export function dependencyOrder(files: Array<{ name: string; creates: Set<string>; needs: Set<string> }>): string[] | null {
  const byName = new Map(files.map(f => [f.name, f]));
  const deps = new Map<string, Set<string>>();
  for (const f of files) {
    const d = new Set<string>();
    for (const g of files) {
      if (g.name === f.name) continue;
      for (const need of f.needs) if (g.creates.has(need) && !f.creates.has(need)) d.add(g.name);
    }
    deps.set(f.name, d);
  }
  const order: string[] = [];
  const done = new Set<string>();
  while (order.length < files.length) {
    const ready = [...byName.keys()].filter(n => !done.has(n) && [...deps.get(n)!].every(d => done.has(d))).sort();
    if (ready.length === 0) return null;
    order.push(ready[0]);
    done.add(ready[0]);
  }
  return order;
}

/**
 * Decides what the guard may do with a diff. `pending` is every file in prisma/pending/ (order does not matter).
 */
export function decide(diffSql: string, pending: PendingFile[]): Decision {
  const diff = parseSql(diffSql);
  if (diff.error) return { kind: 'unexpected', reasons: [`the diff could not be read: ${diff.error}`] };
  if (diff.statements.length === 0) return { kind: 'empty' };

  const parsed: Parsed[] = [];
  const ineligible = new Map<string, string>();
  const createdBy = new Map<string, string>();
  for (const f of pending) {
    const p = parseSql(f.sql);
    for (const s of p.statements) for (const c of s.creates) if (!createdBy.has(c)) createdBy.set(c, f.name);
    if (p.error) { ineligible.set(f.name, p.error); continue; }
    if (p.statements.length === 0) continue;
    const bad = p.statements.find(s => !s.additive);
    if (bad) { ineligible.set(f.name, `${bad.reason}: ${short(bad)}`); continue; }
    parsed.push({
      name: f.name,
      stmts: p.statements,
      keys: countKeys(p.statements),
      creates: new Set(p.statements.flatMap(s => s.creates)),
      needs: new Set(p.statements.flatMap(s => s.needs)),
    });
  }

  const reasons: string[] = [];
  const blocked = diff.statements.filter(s => !s.additive);
  for (const s of blocked) {
    const why = s.destructive ? 'DESTRUCTIVE' : 'NOT ADDITIVE';
    let line = `${why}: ${short(s)} (${s.reason})`;
    if (s.dropTarget && createdBy.has(s.dropTarget)) {
      line += `. "${s.dropTarget}" is created by prisma/pending/${createdBy.get(s.dropTarget)}; if it is a raw-SQL table ` +
        'that schema.prisma has no model for, the diff "wants" to drop it because production has it. Never apply that ' +
        'line: add the model to schema.prisma instead (OWNER-RUNBOOK §6, docs/DB-GUARD.md).';
    }
    reasons.push(line);
  }
  if (blocked.length) return { kind: 'unexpected', reasons };

  const want = countKeys(diff.statements);
  const candidates = parsed.filter(p => fits(p.keys, want)).sort((a, b) => a.name.localeCompare(b.name));

  // Exact cover of the multiset `want` by whole candidate files; stop at two solutions (ambiguity is enough to stop).
  const solutions: Parsed[][] = [];
  const remaining = new Map(want);
  const chosen: Parsed[] = [];
  const search = (from: Parsed[]) => {
    if (solutions.length > 1) return;
    let firstKey: string | undefined;
    for (const [k, v] of [...remaining].sort((a, b) => a[0].localeCompare(b[0]))) if (v > 0) { firstKey = k; break; }
    if (firstKey === undefined) {
      const key = chosen.map(c => c.name).sort().join('\n');
      if (!solutions.some(sol => sol.map(c => c.name).sort().join('\n') === key)) solutions.push([...chosen]);
      return;
    }
    for (const c of from) {
      if (!c.keys.has(firstKey) || !fits(c.keys, remaining)) continue;
      for (const [k, v] of c.keys) remaining.set(k, remaining.get(k)! - v);
      chosen.push(c);
      search(from.filter(x => x !== c));
      chosen.pop();
      for (const [k, v] of c.keys) remaining.set(k, remaining.get(k)! + v);
    }
  };
  search(candidates);

  if (solutions.length === 1) {
    const order = dependencyOrder(solutions[0]);
    if (!order) return { kind: 'unexpected', reasons: [`the matching files depend on each other in a cycle: ${solutions[0].map(s => s.name).join(', ')}`] };
    return { kind: 'match', files: order, statementCount: diff.statements.length };
  }
  if (solutions.length > 1) {
    return { kind: 'unexpected', reasons: [`more than one set of pending files matches the diff exactly (${solutions.map(s => `[${s.map(f => f.name).join(', ')}]`).join(' and ')}); a person has to choose`] };
  }

  // No exact cover: explain it.
  const covered = new Set(parsed.flatMap(p => [...p.keys.keys()]));
  for (const s of diff.statements) {
    if (!covered.has(s.norm)) {
      const inIneligible = [...ineligible.keys()].filter(name => {
        const f = pending.find(x => x.name === name)!;
        return parseSql(f.sql).statements.some(x => x.norm === s.norm);
      });
      reasons.push(inIneligible.length
        ? `MATCHES ONLY AN INELIGIBLE FILE: ${short(s)} is in ${inIneligible.join(', ')} (${inIneligible.map(n => ineligible.get(n)).join('; ')})`
        : `NO PENDING FILE: ${short(s)}`);
    }
  }
  for (const p of parsed) {
    const inDiff = p.stmts.filter(s => want.has(s.norm));
    if (inDiff.length && inDiff.length < p.stmts.length) {
      const missing = p.stmts.filter(s => !want.has(s.norm));
      reasons.push(`PARTLY APPLIED?: ${p.name} has ${inDiff.length} of its ${p.stmts.length} statements in the diff; ` +
        `not in the diff: ${missing.map(short).join(' | ')}`);
    }
  }
  if (!reasons.length) reasons.push('the diff repeats a statement more often than the pending files do');
  return { kind: 'unexpected', reasons };
}

// ---------------------------------------------------------------------------------------------------------------
// Helpers for the CLI and the docs.
// ---------------------------------------------------------------------------------------------------------------

/**
 * The undo of an additive pending file, newest object first: DROP TABLE for each table it creates, DROP COLUMN for
 * each column it adds to an existing table, DROP TYPE for each enum. The guard NEVER runs these; they are for the
 * owner, by hand, and only after a deploy whose client no longer needs the object (OWNER-RUNBOOK §5.5).
 */
export function rollbackFor(sql: string): string[] {
  const { statements } = parseSql(sql);
  const out: string[] = [];
  const created = new Set(statements.flatMap(s => s.creates));
  for (const s of statements) {
    const ct = /^create table ("(?:[^"]|"")*")/.exec(s.norm);
    if (ct) { out.push(`DROP TABLE ${ct[1]};`); continue; }
    const ty = /^create type ("(?:[^"]|"")*")/.exec(s.norm);
    if (ty) { out.push(`DROP TYPE ${ty[1]};`); continue; }
    const at = /^alter table ("(?:[^"]|"")*") (.+)$/.exec(s.norm);
    if (at && !created.has(unq(at[1]))) {
      for (const clause of splitTopLevel(at[2])) {
        const col = /^add column ("(?:[^"]|"")*")/.exec(clause);
        if (col) out.push(`ALTER TABLE ${at[1]} DROP COLUMN ${col[1]};`);
        const fk = /^add constraint ("(?:[^"]|"")*")/.exec(clause);
        if (fk) out.push(`ALTER TABLE ${at[1]} DROP CONSTRAINT ${fk[1]};`);
      }
    }
  }
  // Undo in reverse: a column's FK before the column, a table before the enum it uses.
  return out.reverse();
}

/**
 * Removes every part of a Postgres URL that identifies or opens the database (user, password, host, port, database
 * name) from text that will be printed to a PUBLIC workflow log or issue. GitHub masks the whole secret on its own,
 * but Prisma's errors print the host on its own ("Can't reach database server at `<host>:5432`").
 */
export function redact(text: string, url: string | undefined): string {
  if (!url) return text;
  const secrets = new Set<string>([url]);
  const m = /^[a-z]+:\/\/(?:([^:@/]*)(?::([^@/]*))?@)?([^:/?#]+)(?::(\d+))?(?:\/([^?#]*))?/i.exec(url);
  if (m) {
    const [, user, pass, host, port, db] = m;
    for (const v of [user, pass, host, db]) if (v && v.length >= 3) { secrets.add(v); try { secrets.add(decodeURIComponent(v)); } catch { /* keep raw */ } }
    if (host && port) secrets.add(`${host}:${port}`);
  }
  let out = text;
  for (const s of [...secrets].sort((a, b) => b.length - a.length)) out = out.split(s).join('<redacted>');
  return out;
}

/** The markdown block the workflow puts in its summary and, when it stops, in the issue. */
export function formatDecision(d: Decision): string {
  if (d.kind === 'empty') return '**Decision: empty.** Production already matches `prisma/schema.prisma`. Nothing to apply.';
  if (d.kind === 'match') {
    return [`**Decision: exact match** of ${d.files.length} reviewed pending file(s), ${d.statementCount} statement(s), applied in this order:`, '',
      ...d.files.map((f, i) => `${i + 1}. \`prisma/pending/${f}\``)].join('\n');
  }
  return ['**Decision: unexpected. Nothing was applied by this decision.**', '', ...d.reasons.map(r => `- ${r}`)].join('\n');
}
