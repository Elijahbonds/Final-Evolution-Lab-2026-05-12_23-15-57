// pending-sql: which files in prisma/pending/ a database still needs, in what order, and which may be applied by a tool.
//
// OWNER CALL (2026-11-10, delegated: "apply the pending tables so those features turn on"). 38 files wait in
// prisma/pending/. The runbook (docs/OWNER-RUNBOOK.md §5) applies them one at a time, by hand, and a file whose objects
// production already has fails with "already exists". db-guard (docs/DB-GUARD.md) only applies files that are in
// schema.prisma, so the raw-SQL files (teacher, hoops-cam, group booking, program-ask, studio-share, ...) are never
// applied by it. This module is the missing piece: it reads what each file creates, compares that with the database's
// own catalog, and says per file: applied / missing / partial / manual.
//
// PURE. No I/O, no database, no clock. The command line (cli.ts) does the reading and the writing.
//
// What a tool may apply (the same line the owner drew for db-guard): a file that only ADDS (tables, columns, enum types,
// indexes, constraints, comments, row-level-security settings). A file that changes or removes rows or objects (UPDATE,
// INSERT, DELETE, TRUNCATE, DROP, ALTER ... DROP / RENAME / TYPE) is `manual`: it is listed and never applied here.

export interface FileObjects {
  tables: string[];
  /** [table, column] for columns added to a table the file does not itself create. */
  columns: Array<[string, string]>;
  types: string[];
  indexes: string[];
  /** [table, constraint] */
  constraints: Array<[string, string]>;
  /** Tables the file needs to exist that it does not create (REFERENCES, ALTER TABLE, CREATE INDEX ... ON). */
  needs: string[];
  /** Statements that are not additive, shortened. Any entry makes the file `manual`. */
  notAdditive: string[];
  /** Every CREATE says IF NOT EXISTS and every ADD CONSTRAINT sits in a catalog-guarded DO block: a second run changes nothing. */
  rerunnable: boolean;
}

export interface Catalog {
  tables: ReadonlySet<string>;
  /** `table.column` */
  columns: ReadonlySet<string>;
  types: ReadonlySet<string>;
  indexes: ReadonlySet<string>;
  /** `table.constraint` */
  constraints: ReadonlySet<string>;
}

export type Status = 'applied' | 'missing' | 'partial' | 'manual';

export interface FileState {
  name: string;
  status: Status;
  /** What the database lacks (empty when applied). */
  lacks: string[];
  /** What it already has (empty when missing). */
  has: string[];
  objects: FileObjects;
}

export interface PlanStep { name: string; action: 'apply' | 'skip' | 'stop'; why: string }

/** Strips `--` and block comments. Dollar-quoted bodies and string literals are kept as they are. */
export function stripComments(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const two = sql.slice(i, i + 2);
    if (two === '--') { while (i < sql.length && sql[i] !== '\n') i++; continue; }
    if (two === '/*') { const end = sql.indexOf('*/', i + 2); i = end < 0 ? sql.length : end + 2; out += ' '; continue; }
    if (c === "'") {   // a string literal: copy to its closing quote ('' is an escaped quote)
      let j = i + 1;
      while (j < sql.length) { if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; } if (sql[j] === "'") break; j++; }
      out += sql.slice(i, j + 1); i = j + 1; continue;
    }
    out += c; i++;
  }
  return out;
}

/** The text with every string literal's body blanked, so a `;` or a keyword inside quoted text is never read as SQL. */
export function maskStrings(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    if (sql[i] !== "'") { out += sql[i]; i++; continue; }
    let j = i + 1;
    while (j < sql.length) { if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; } if (sql[j] === "'") break; j++; }
    out += "''"; i = j + 1;
  }
  return out;
}

const uniq = <T>(xs: T[], key: (x: T) => string = String): T[] => { const seen = new Set<string>(); return xs.filter((x) => { const k = key(x); if (seen.has(k)) return false; seen.add(k); return true; }); };
const short = (s: string) => { const one = s.replace(/\s+/g, ' ').trim(); return one.length > 110 ? `${one.slice(0, 107)}...` : one; };

/** What a pending file creates and needs, read from its text. */
export function objectsOf(sqlText: string): FileObjects {
  const sql = maskStrings(stripComments(sqlText));
  const tables: string[] = [], types: string[] = [], indexes: string[] = [], needs: string[] = [];
  const columns: Array<[string, string]> = [], constraints: Array<[string, string]> = [];
  let guarded = true;

  for (const m of sql.matchAll(/\bCREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/gi)) { tables.push(m[2]); if (!m[1]) guarded = false; }
  for (const m of sql.matchAll(/\bCREATE\s+TYPE\s+"([^"]+)"/gi)) types.push(m[1]);
  for (const m of sql.matchAll(/\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(IF\s+NOT\s+EXISTS\s+)?"([^"]+)"\s+ON\s+(?:ONLY\s+)?"([^"]+)"/gi)) { indexes.push(m[2]); needs.push(m[3]); if (!m[1]) guarded = false; }
  for (const m of sql.matchAll(/\bALTER\s+TABLE\s+(?:ONLY\s+)?(?:IF\s+EXISTS\s+)?"([^"]+)"([^;]*)/gi)) {
    const table = m[1], tail = m[2];
    needs.push(table);
    for (const c of tail.matchAll(/\bADD\s+COLUMN\s+(IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/gi)) { columns.push([table, c[2]]); if (!c[1]) guarded = false; }
    for (const c of tail.matchAll(/\bADD\s+CONSTRAINT\s+"([^"]+)"/gi)) constraints.push([table, c[1]]);
  }
  for (const m of sql.matchAll(/\bREFERENCES\s+"([^"]+)"/gi)) needs.push(m[1]);
  if (types.length) guarded = false;   // CREATE TYPE has no IF NOT EXISTS; only a DO guard would do, and none of ours has one
  // an ADD CONSTRAINT outside a DO block fails on a second run
  const outsideDo = sql.replace(/\bDO\s+(\$[A-Za-z_]*\$)[\s\S]*?\1\s*;?/gi, ' ');
  if (/\bADD\s+CONSTRAINT\b/i.test(outsideDo)) guarded = false;

  // not additive: looked for at statement starts, outside DO blocks (a DO block's body is checked as text below)
  const notAdditive: string[] = [];
  for (const stmt of outsideDo.split(';')) {
    const s = stmt.trim();
    if (!s) continue;
    if (/^(UPDATE|INSERT|DELETE|TRUNCATE|DROP|GRANT)\b/i.test(s)) notAdditive.push(short(s));
    else if (/^ALTER\s+TABLE\b/i.test(s) && /\b(DROP\s+(COLUMN|CONSTRAINT|DEFAULT|NOT\s+NULL)|RENAME\b|ALTER\s+COLUMN\s+"[^"]+"\s+(SET\s+DATA\s+)?TYPE)\b/i.test(s)) notAdditive.push(short(s));
    else if (/^ALTER\s+TYPE\b/i.test(s)) notAdditive.push(short(s));
  }
  for (const m of sql.matchAll(/\bDO\s+(\$[A-Za-z_]*\$)([\s\S]*?)\1/gi)) {
    if (/\b(UPDATE\s+"|INSERT\s+INTO|DELETE\s+FROM|TRUNCATE|DROP\s+(TABLE|COLUMN|TYPE|INDEX|CONSTRAINT))\b/i.test(m[2])) notAdditive.push(short(`DO block: ${m[2]}`));
  }

  const own = new Set(tables);
  return {
    tables: uniq(tables),
    columns: uniq(columns.filter(([t]) => !own.has(t)), (x) => x.join('.')),
    types: uniq(types),
    indexes: uniq(indexes),
    constraints: uniq(constraints, (x) => x.join('.')),
    needs: uniq(needs.filter((t) => !own.has(t))),
    notAdditive,
    rerunnable: guarded,
  };
}

/** One file against the catalog. */
export function stateOf(name: string, sqlText: string, cat: Catalog): FileState {
  const o = objectsOf(sqlText);
  const has: string[] = [], lacks: string[] = [];
  const put = (ok: boolean, label: string) => (ok ? has : lacks).push(label);
  for (const t of o.tables) put(cat.tables.has(t), `table ${t}`);
  for (const [t, c] of o.columns) put(cat.columns.has(`${t}.${c}`), `column ${t}.${c}`);
  for (const t of o.types) put(cat.types.has(t), `type ${t}`);
  for (const i of o.indexes) put(cat.indexes.has(i), `index ${i}`);
  for (const [t, c] of o.constraints) put(cat.constraints.has(`${t}.${c}`), `constraint ${t}.${c}`);
  let status: Status;
  if (o.notAdditive.length) status = 'manual';
  else if (has.length + lacks.length === 0) status = 'manual';   // creates nothing this module can see: never guess
  else if (lacks.length === 0) status = 'applied';
  else if (has.length === 0) status = 'missing';
  else status = 'partial';
  return { name, status, lacks, has, objects: o };
}

/**
 * The order to apply in, and what to do with each file. A `missing` file is applied. A `partial` file is applied only
 * when it is re-runnable (every statement guarded); otherwise the plan STOPS there, because running it would fail on
 * the first object that exists. A file is held back (`stop`) when a table it needs is neither in the database nor
 * created by an earlier step.
 */
export function plan(states: FileState[], cat: Catalog, only?: ReadonlySet<string>): PlanStep[] {
  const todo = states.filter((s) => s.status === 'missing' || s.status === 'partial');
  const creates = new Map<string, string>();
  for (const s of todo) for (const t of s.objects.tables) creates.set(t, s.name);
  const steps: PlanStep[] = [];
  const done = new Set<string>();       // file names applied by this plan
  const failed = new Set<string>();
  const have = new Set(cat.tables);
  let left = todo.slice().sort((a, b) => a.name.localeCompare(b.name));
  for (;;) {
    const ready = left.find((s) => s.objects.needs.every((t) => have.has(t)));
    if (!ready) break;
    left = left.filter((s) => s !== ready);
    if (only && !only.has(ready.name)) { steps.push({ name: ready.name, action: 'skip', why: 'not selected (--only)' }); failed.add(ready.name); continue; }
    if (ready.status === 'partial' && !ready.objects.rerunnable) {
      steps.push({ name: ready.name, action: 'stop', why: `partly applied and not re-runnable: has ${ready.has.join(', ')}; lacks ${ready.lacks.join(', ')}` });
      failed.add(ready.name); continue;
    }
    steps.push({ name: ready.name, action: 'apply', why: ready.status === 'partial' ? `re-runnable; lacks ${ready.lacks.join(', ')}` : `lacks ${ready.lacks.length} object(s)` });
    done.add(ready.name);
    for (const t of ready.objects.tables) have.add(t);
  }
  for (const s of left) {
    const missing = s.objects.needs.filter((t) => !have.has(t));
    const by = missing.map((t) => (creates.has(t) ? `${t} (from ${creates.get(t)})` : `${t} (no pending file creates it)`));
    steps.push({ name: s.name, action: 'stop', why: `needs ${by.join(', ')}` });
  }
  for (const s of states) {
    if (s.status === 'applied') steps.push({ name: s.name, action: 'skip', why: 'already applied' });
    if (s.status === 'manual') steps.push({ name: s.name, action: 'skip', why: s.objects.notAdditive.length ? `manual: not additive (${s.objects.notAdditive[0]})` : 'manual: creates nothing this tool can check' });
  }
  return steps;
}

/** The plan as text for a terminal. No URL, host or credential ever appears in it. */
export function formatPlan(steps: PlanStep[]): string {
  const rows = steps.slice().sort((a, b) => (a.action === b.action ? 0 : a.action === 'apply' ? -1 : b.action === 'apply' ? 1 : a.action === 'stop' ? -1 : 1));
  const n = (a: PlanStep['action']) => steps.filter((s) => s.action === a).length;
  const lines = [`pending SQL: ${n('apply')} to apply, ${n('stop')} held back, ${n('skip')} skipped`, ''];
  for (const s of rows) lines.push(`${s.action === 'apply' ? 'APPLY' : s.action === 'stop' ? 'STOP ' : 'skip '}  ${s.name}  — ${s.why}`);
  return lines.join('\n');
}
