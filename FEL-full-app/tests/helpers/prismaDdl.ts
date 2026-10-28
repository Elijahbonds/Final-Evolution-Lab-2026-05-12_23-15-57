// tests/helpers/prismaDdl.ts — DATA-RIGHTS-SWEEP (2026-10-25): build a THROWAWAY Postgres database's schema from
// prisma/schema.prisma plus every prisma/pending/*.sql, without running a Prisma command (lanes may not; the round-7
// rules). Test-only: it is how lib/data-rights/accountErase.integration.test.ts gets every table, applied and pending,
// onto an empty local database.
//
// What it reproduces, because the erase depends on it: every table and column, nullability, primary keys, unique keys,
// enums, and every foreign key with Prisma's referential actions (an explicit onDelete, else Restrict for a required
// relation and SetNull for an optional one; onUpdate Cascade). What it does not: indexes, and defaults other than now()
// and autoincrement() (the seeder fills every NOT NULL column itself). The pending files are applied statement by
// statement after it, and a statement that re-creates something schema.prisma already made (the older pending files
// are in the schema too) is skipped by its SQLSTATE: 42P07 duplicate table, 42701 duplicate column, 42710 duplicate
// object. Anything else fails the build.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parsePrismaModels, relationFields, stripSqlComments } from './schemaScan';

const PG: Record<string, string> = {
  String: 'TEXT', Int: 'INTEGER', BigInt: 'BIGINT', Float: 'DOUBLE PRECISION', Boolean: 'BOOLEAN',
  DateTime: 'TIMESTAMP(3)', Json: 'JSONB', Decimal: 'DECIMAL(65,30)', Bytes: 'BYTEA',
};
const ACTION: Record<string, string> = { Cascade: 'CASCADE', SetNull: 'SET NULL', Restrict: 'RESTRICT', NoAction: 'NO ACTION', SetDefault: 'SET DEFAULT' };
const qi = (s: string) => `"${s}"`;
const list = (a: string[]) => a.map(qi).join(', ');
const colsIn = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

export function prismaSchemaDdl(schema: string): string[] {
  const enums = new Map<string, string[]>();
  for (const m of schema.matchAll(/^enum\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    enums.set(m[1], m[2].split('\n').map((l) => l.replace(/\/\/.*$/, '').trim()).filter((l) => /^\w+$/.test(l)));
  }
  const models = parsePrismaModels(schema);
  const byName = new Map(models.map((m) => [m.name, m]));
  const colName = (f: { name: string; attrs: string }) => /@map\("([^"]+)"\)/.exec(f.attrs)?.[1] ?? f.name;
  const stmts: string[] = [];
  for (const [name, values] of enums) stmts.push(`CREATE TYPE ${qi(name)} AS ENUM (${values.map((v) => `'${v}'`).join(', ')})`);
  const fks: string[] = [];
  for (const m of models) {
    const defs: string[] = [];
    for (const f of m.fields) {
      if (byName.has(f.type)) {
        const fields = relationFields(f.attrs);
        if (!fields.length) continue;   // the back-relation side
        const refs = /references:\s*\[([^\]]*)\]/.exec(f.attrs)![1];
        const target = byName.get(f.type)!;
        const onDelete = /onDelete:\s*(\w+)/.exec(f.attrs)?.[1] ?? (f.optional ? 'SetNull' : 'Restrict');
        const mapCols = (names: string[], model: typeof m) => names.map((n) => colName(model.fields.find((x) => x.name === n) ?? { name: n, attrs: '' }));
        fks.push(`ALTER TABLE ${qi(m.table)} ADD FOREIGN KEY (${list(mapCols(fields, m))}) REFERENCES ${qi(target.table)} (${list(mapCols(colsIn(refs), target))}) ON DELETE ${ACTION[onDelete]} ON UPDATE CASCADE`);
        continue;
      }
      const base = enums.has(f.type) ? qi(f.type) : PG[f.type];
      if (!base) throw new Error(`prismaDdl: unknown type ${m.name}.${f.name} ${f.type}`);
      const auto = /@default\(autoincrement\(\)\)/.test(f.attrs);
      let def = `${qi(colName(f))} ${auto ? 'SERIAL' : base}${f.list ? '[]' : ''}`;
      if (!f.optional && !f.list) def += ' NOT NULL';
      if (/@default\(now\(\)\)/.test(f.attrs)) def += ' DEFAULT CURRENT_TIMESTAMP';
      if (/@id\b/.test(f.attrs)) def += ' PRIMARY KEY';
      if (/@unique\b/.test(f.attrs)) def += ' UNIQUE';
      defs.push(def);
    }
    const fieldCol = (n: string) => colName(m.fields.find((x) => x.name === n) ?? { name: n, attrs: '' });
    const pk = /@@id\(\[([^\]]*)\]/.exec(m.block);
    if (pk) defs.push(`PRIMARY KEY (${list(colsIn(pk[1]).map(fieldCol))})`);
    for (const u of m.block.matchAll(/^\s*@@unique\(\[([^\]]*)\]/gm)) defs.push(`UNIQUE (${list(colsIn(u[1]).map(fieldCol))})`);
    stmts.push(`CREATE TABLE ${qi(m.table)} (\n  ${defs.join(',\n  ')}\n)`);
  }
  return [...stmts, ...fks];
}

/** The statements of one pending SQL file, in order. `;` ends a statement only at the end of a line. */
export function pendingStatements(sql: string): string[] {
  return stripSqlComments(sql).split(/;\s*$/m).map((s) => s.trim()).filter(Boolean);
}

interface Raw { $executeRawUnsafe(sql: string, ...v: unknown[]): Promise<number> }
const DUPLICATE = new Set(['42P07', '42701', '42710']);
function sqlState(e: unknown): string {
  const err = e as { code?: string; meta?: { code?: string }; message?: string };
  return err.meta?.code ?? (/(?:code|SQLSTATE)[^0-9A-Z]*([0-9A-Z]{5})/.exec(err.message ?? '')?.[1]) ?? err.code ?? '';
}

/** Build every table on an EMPTY database. Returns the pending statements skipped as duplicates, for the record. */
export async function buildSchema(db: Raw, root: string): Promise<{ applied: number; duplicates: number }> {
  for (const s of prismaSchemaDdl(readFileSync(join(root, 'prisma/schema.prisma'), 'utf8'))) await db.$executeRawUnsafe(s);
  let applied = 0;
  let duplicates = 0;
  const dir = join(root, 'prisma/pending');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
    for (const s of pendingStatements(readFileSync(join(dir, f), 'utf8'))) {
      try {
        await db.$executeRawUnsafe(s);
        applied += 1;
      } catch (e) {
        const msg = (e as Error).message ?? '';
        if (DUPLICATE.has(sqlState(e)) || /already exists/.test(msg)) { duplicates += 1; continue; }
        throw new Error(`${f}: ${msg.slice(0, 300)}`);
      }
    }
  }
  return { applied, duplicates };
}
