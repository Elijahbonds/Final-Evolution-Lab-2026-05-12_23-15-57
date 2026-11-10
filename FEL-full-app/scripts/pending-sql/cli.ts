// pending-sql command line. Run from FEL-full-app/:
//
//   npx tsx scripts/pending-sql/cli.ts plan                 read-only: what the database lacks, and the order to apply in
//   npx tsx scripts/pending-sql/cli.ts apply                the same plan, then applies each APPLY file, one at a time
//   npx tsx scripts/pending-sql/cli.ts apply --only 2026-11-03-teacher.sql,2026-11-03-hoops-cam.sql
//
// The database URL is read from the environment variable PROD_DIRECT_URL (or the one named by --url-env NAME). It is
// never taken from the command line and never printed. Load it the way docs/OWNER-RUNBOOK.md §3 does.
//
// `plan` only reads the catalog. `apply` WRITES and is the owner's step (CLAUDE.md: database work on anything but a
// local throwaway is never an agent's). Each file runs through `prisma db execute`, which sends the file as one query:
// on Postgres that is one transaction, so a file that fails leaves nothing behind (measured on Postgres 16, 2026-11-10).
// After each file the catalog is read again and the file must now be `applied`, or the run stops.
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { formatPlan, plan, stateOf, type Catalog, type FileState } from './pendingSql';
import { redact } from '../sql-guard/sqlGuard';

const ROOT = path.resolve(__dirname, '..', '..');
const PENDING = path.join(ROOT, 'prisma', 'pending');

function arg(name: string): string | undefined { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }

async function readCatalog(url: string): Promise<Catalog> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaClient } = require(path.join(ROOT, 'public', '_prisma', 'client')) as { PrismaClient: new (o: { datasourceUrl: string }) => { $queryRawUnsafe<T>(q: string): Promise<T>; $disconnect(): Promise<void> } };
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    const col = async (q: string) => new Set((await db.$queryRawUnsafe<Array<{ v: string }>>(q)).map((r) => r.v));
    return {
      tables: await col(`select tablename::text as v from pg_tables where schemaname = current_schema()`),
      columns: await col(`select (table_name || '.' || column_name)::text as v from information_schema.columns where table_schema = current_schema()`),
      types: await col(`select t.typname::text as v from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = current_schema() and t.typtype = 'e'`),
      indexes: await col(`select indexname::text as v from pg_indexes where schemaname = current_schema()`),
      constraints: await col(`select (c.relname || '.' || k.conname)::text as v from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = current_schema()`),
    };
  } finally { await db.$disconnect(); }
}

function files(): Array<{ name: string; sql: string }> {
  return readdirSync(PENDING).filter((f) => f.endsWith('.sql')).sort().map((name) => ({ name, sql: readFileSync(path.join(PENDING, name), 'utf8') }));
}

async function states(url: string): Promise<{ cat: Catalog; all: FileState[] }> {
  const cat = await readCatalog(url);
  return { cat, all: files().map((f) => stateOf(f.name, f.sql, cat)) };
}

async function main(): Promise<number> {
  const mode = process.argv[2];
  if (mode !== 'plan' && mode !== 'apply') { console.error('usage: cli.ts plan | apply [--only a.sql,b.sql] [--url-env NAME]'); return 2; }
  const envName = arg('--url-env') ?? 'PROD_DIRECT_URL';
  const url = process.env[envName];
  if (!url) { console.error(`pending-sql: ${envName} is not set, so nothing was read or written. Load it as docs/OWNER-RUNBOOK.md §3 shows.`); return 2; }
  const onlyArg = arg('--only');
  const only = onlyArg ? new Set(onlyArg.split(',').map((s) => s.trim()).filter(Boolean)) : undefined;
  const known = new Set(files().map((f) => f.name));
  for (const o of only ?? []) if (!known.has(o)) { console.error(`pending-sql: --only names ${o}, which is not in prisma/pending/`); return 2; }

  let { cat, all } = await states(url);
  const steps = plan(all, cat, only);
  console.log(formatPlan(steps));
  if (mode === 'plan') { console.log('\nplan only: nothing was written. Run with `apply` to apply the APPLY lines.'); return steps.some((s) => s.action === 'stop') ? 1 : 0; }

  const todo = steps.filter((s) => s.action === 'apply');
  if (!todo.length) { console.log('\nnothing to apply.'); return steps.some((s) => s.action === 'stop') ? 1 : 0; }
  console.log('');
  for (const step of todo) {
    // the URL goes to the child through its environment (the schema's own env names), never through argv
    const r = spawnSync('npx', ['--no-install', 'prisma', 'db', 'execute', '--schema', path.join('prisma', 'schema.prisma'), '--file', path.join('prisma', 'pending', step.name)],
      { cwd: ROOT, env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url }, encoding: 'utf8' });
    const out = redact(`${r.stdout ?? ''}${r.stderr ?? ''}`, url).trim();
    if (r.status !== 0) {
      console.error(`FAILED  ${step.name}\n${out}\n\nNothing from this file was kept (one transaction). Files before it stay applied. Fix the cause, then run plan again.`);
      return 1;
    }
    ({ cat, all } = await states(url));
    const now = all.find((s) => s.name === step.name)!;
    if (now.status !== 'applied') {
      console.error(`STOPPED  ${step.name} ran without an error, but the database still lacks: ${now.lacks.join(', ')}. Nothing further was applied.`);
      return 1;
    }
    console.log(`applied  ${step.name}`);
  }
  const after = plan(all, cat, only);
  const held = after.filter((s) => s.action === 'stop');
  console.log(`\ndone: ${todo.length} file(s) applied.${held.length ? ` ${held.length} still held back:` : ''}`);
  for (const h of held) console.log(`STOP   ${h.name}  — ${h.why}`);
  console.log('Read-only check that the schema-backed part is whole: docs/OWNER-RUNBOOK.md §5.4.');
  return held.length ? 1 : 0;
}

main().then((code) => process.exit(code), (e) => { console.error(`pending-sql: ${redact(String(e?.message ?? e), process.env[arg('--url-env') ?? 'PROD_DIRECT_URL'])}`); process.exit(1); });
