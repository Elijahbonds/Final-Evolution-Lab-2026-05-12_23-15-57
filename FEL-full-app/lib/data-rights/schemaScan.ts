// lib/data-rights/schemaScan.ts — DATA-RIGHTS-SWEEP (2026-10-25): which tables hold a person's data, read from the two
// places a table can come from: prisma/schema.prisma (applied) and prisma/pending/*.sql (written, waiting for the owner).
//
// Pure: it takes file text and returns what it found. The guard (./registry.test.ts) reads the files and checks every
// table and person column it finds is classified in ./registry.ts. The real-Postgres test builds its database from the
// same parse (tests/helpers/prismaDdl.ts), so the guard and the database it is checked against cannot disagree.
//
// A PERSON COLUMN is either
//   · a foreign key to "User" (a Prisma relation of type User, or `REFERENCES "User"` in SQL), whatever its name; or
//   · a column whose name says it holds a person's id (PERSON_COLUMN below), with or without a foreign key — most of the
//     coach tables carry `coachId` / `clientId` with no constraint at all.
// The name rule is deliberately wide: a column it catches that is not an account id (AnalyticsEvent.guestId is a hashed
// browser token) is classified in the registry with the reason, which costs one line, while a person column it missed
// would be a silent gap.

/** Column names that hold a person's id. `instructorId` / `facilitatorId` name a profile row that belongs to a person. */
export const PERSON_COLUMN =
  /(?:^|[a-z0-9])(?:[Uu]ser|[Pp]layer\d?|[Cc]oach|[Cc]lient|[Aa]thlete|[Oo]wner|[Bb]uyer|[Cc]reator|[Aa]uthor|[Aa]ctor|[Aa]pplicant|[Mm]entee|[Rr]eferrer|[Rr]eporter|[Rr]eported|[Rr]eviewer|[Mm]oderator|[Ww]inner|[Hh]ost|[Gg]uest|[Mm]ember|[Ss]ender|[Rr]ecipient|[Ff]acilitator|[Ii]nstructor|[Ss]etBy|[Aa]cceptedBy|[Ii]nvitee|[Ii]nviter|[Pp]atient|[Pp]arent|[Gg]uardian)Id$|^disputedBy$/;

export interface ScannedTable {
  /** The SQL table name (a model's @@map, or the model name). */
  table: string;
  /** Every column the source declares for it. */
  columns: Set<string>;
  /** The person columns among them (see the header). */
  personColumns: Set<string>;
  /** Where it was declared: 'schema.prisma' and/or pending file names. */
  sources: Set<string>;
}

export type Scan = Map<string, ScannedTable>;

function entry(scan: Scan, table: string, source: string): ScannedTable {
  let t = scan.get(table);
  if (!t) { t = { table, columns: new Set(), personColumns: new Set(), sources: new Set() }; scan.set(table, t); }
  t.sources.add(source);
  return t;
}

function addColumn(t: ScannedTable, col: string, person = false): void {
  t.columns.add(col);
  if (person || PERSON_COLUMN.test(col)) t.personColumns.add(col);
}

const SCALARS = new Set(['String', 'Int', 'BigInt', 'Float', 'Decimal', 'Boolean', 'DateTime', 'Json', 'Bytes']);

/** A Prisma model, as far as the scan and the DDL builder need it. */
export interface PrismaField {
  name: string;
  /** Base type without `?` / `[]`. */
  type: string;
  optional: boolean;
  list: boolean;
  /** The `@...` attributes, raw. */
  attrs: string;
}
export interface PrismaModel { name: string; table: string; fields: PrismaField[]; block: string }

/** Every `model X { ... }` in a schema, with its fields. Relation fields are included (their type is a model name). */
export function parsePrismaModels(schema: string): PrismaModel[] {
  const out: PrismaModel[] = [];
  for (const m of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const [, name, body] = m;
    const map = /@@map\("([^"]+)"\)/.exec(body);
    const fields: PrismaField[] = [];
    for (const raw of body.split('\n')) {
      const line = raw.replace(/\/\/.*$/, '').trim();
      if (!line || line.startsWith('@@')) continue;
      const f = /^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/.exec(line);
      if (!f) continue;
      fields.push({ name: f[1], type: f[2], list: !!f[3], optional: !!f[4], attrs: f[5] ?? '' });
    }
    out.push({ name, table: map ? map[1] : name, fields, block: body });
  }
  return out;
}

/** Field names in a relation's `fields: [a, b]`. */
export function relationFields(attrs: string): string[] {
  const m = /fields:\s*\[([^\]]*)\]/.exec(attrs);
  return m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
}

/** Tables and person columns declared by schema.prisma. */
export function scanPrismaSchema(schema: string, scan: Scan = new Map(), source = 'schema.prisma'): Scan {
  const models = parsePrismaModels(schema);
  const modelNames = new Set(models.map((m) => m.name));
  for (const model of models) {
    const t = entry(scan, model.table, source);
    const userFk = new Set<string>();
    for (const f of model.fields) {
      if (f.type === 'User' && /@relation/.test(f.attrs)) for (const c of relationFields(f.attrs)) userFk.add(c);
    }
    for (const f of model.fields) {
      if (modelNames.has(f.type) && !SCALARS.has(f.type)) continue;   // a relation field is not a column
      addColumn(t, f.name, userFk.has(f.name));
    }
  }
  return scan;
}

/** SQL text without `--` comments. */
export function stripSqlComments(sql: string): string {
  return sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
}

const ident = (s: string) => s.replace(/"/g, '');

/** Tables and person columns created or extended by one pending SQL file. */
export function scanPendingSql(sql: string, source: string, scan: Scan = new Map()): Scan {
  const text = stripSqlComments(sql);
  for (const m of text.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?("?[\w]+"?)\s*\(([\s\S]*?)\n\s*\)\s*;/gi)) {
    const t = entry(scan, ident(m[1]), source);
    for (const line of m[2].split('\n')) {
      const c = /^\s*"?(\w+)"?\s+(?!KEY\b)[A-Za-z]/.exec(line);
      if (!c || /^\s*(CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK)\b/i.test(line)) continue;
      addColumn(t, c[1], /REFERENCES\s+"?User"?\s*\(/i.test(line));
    }
  }
  for (const m of text.matchAll(/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?("?\w+"?)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?("?\w+"?)([^;]*);/gi)) {
    addColumn(entry(scan, ident(m[1]), source), ident(m[2]), /REFERENCES\s+"?User"?\s*\(/i.test(m[3]));
  }
  for (const m of text.matchAll(/ALTER\s+TABLE\s+("?\w+"?)\s+ADD\s+CONSTRAINT\s+"?\w+"?\s+FOREIGN\s+KEY\s*\(([^)]*)\)\s*REFERENCES\s+"?User"?\s*\(/gi)) {
    const t = entry(scan, ident(m[1]), source);
    for (const c of m[2].split(',').map((s) => ident(s.trim())).filter(Boolean)) addColumn(t, c, true);
  }
  return scan;
}

/** Only the tables that hold at least one person column. */
export function personTables(scan: Scan): ScannedTable[] {
  return [...scan.values()].filter((t) => t.personColumns.size > 0).sort((a, b) => a.table.localeCompare(b.table));
}
