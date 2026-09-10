#!/usr/bin/env -S yarn tsx
/**
 * scripts/ci-suite.ts — full CI regression runner.
 *
 * Where `standing-suite.ts` runs a hand-maintained list (61 of the 133 test
 * scripts on disk, so every mode suite added after it was written — tennis,
 * golf, story, the Mode 1-7 gates — ran nowhere automatically), this runner
 * DISCOVERS every `scripts/*-tests.ts` plus `scripts/ledger-invariants.ts`.
 * Nothing can be added to the tree and silently skipped.
 *
 * Run:  yarn test               (skips DB suites when DATABASE_URL is unset)
 *       yarn test:ci            (CI: DB provided, skips are fatal)
 *       yarn tsx scripts/ci-suite.ts --filter tennis --concurrency 1
 *
 * Flags:
 *   --require-db        treat a skipped DB suite as a failure (CI uses this)
 *   --filter <substr>   only run suites whose filename contains <substr>
 *   --concurrency <n>   parallel suites (default: cpu count, capped at 8)
 *   --list              print the discovered suite plan and exit
 *
 * Exit code is non-zero if any suite fails, so it gates the build/deploy.
 */

import { execFile } from 'node:child_process';
import { cpus } from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const SCRIPTS = path.join(ROOT, 'scripts');

/**
 * Suites that talk to Postgres through `lib/db`. They have no internal env
 * gate — without DATABASE_URL they throw on client construction — so the
 * runner gates them instead. `assertDbListFresh()` below re-derives this set
 * from the source on every run, so the list cannot rot as suites are added.
 */
const DB_SUITES = new Set([
  'arena-tests.ts',
  'creative-card-tests.ts',
  'economy-tests.ts',
  'ledger-invariants.ts',
  'ledger-tests.ts',
  'm2-tests.ts',
  'm3-tests.ts',
  'm4-tests.ts',
  'prq-tests.ts',
  'wallet-tests.ts',
]);

/** Non-`*-tests.ts` files that are nonetheless real regression suites. */
const EXTRA_SUITES = ['ledger-invariants.ts'];

type Status = 'pass' | 'fail' | 'skip';
interface Result {
  file: string;
  status: Status;
  ms: number;
  output: string;
}

function parseArgs(argv: string[]) {
  const flag = (name: string) => argv.includes(`--${name}`);
  const value = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const concurrency = Number(value('concurrency') ?? 0);
  return {
    requireDb: flag('require-db'),
    list: flag('list'),
    filter: value('filter'),
    concurrency:
      Number.isFinite(concurrency) && concurrency > 0
        ? concurrency
        : Math.min(cpus().length || 2, 8),
  };
}

function discover(filter?: string): string[] {
  const entries = fs.readdirSync(SCRIPTS);
  const suites = entries
    .filter((f) => f.endsWith('-tests.ts') || EXTRA_SUITES.includes(f))
    .filter((f) => !filter || f.includes(filter))
    .sort();
  return suites;
}

/**
 * Guard: any suite that imports the Prisma client directly must be declared in
 * DB_SUITES. Keeps the gate honest when new DB-backed suites land.
 */
function assertDbListFresh(suites: string[]) {
  const dbImport = /@prisma\/client|PrismaClient|from '(?:\.\.\/lib\/db|@\/lib\/db)'/;
  const undeclared = suites.filter(
    (f) => !DB_SUITES.has(f) && dbImport.test(fs.readFileSync(path.join(SCRIPTS, f), 'utf8')),
  );
  if (undeclared.length) {
    console.error(
      `\n❌ ci-suite: these suites import Prisma but are not in DB_SUITES:\n` +
        undeclared.map((f) => `     ${f}`).join('\n') +
        `\n   Add them to DB_SUITES in scripts/ci-suite.ts so they are gated on DATABASE_URL.\n`,
    );
    process.exit(1);
  }
}

function runSuite(file: string): Promise<Result> {
  const started = Date.now();
  return new Promise((resolve) => {
    execFile(
      'yarn',
      ['tsx', path.join('scripts', file)],
      {
        cwd: ROOT,
        env: { ...process.env, NODE_ENV: 'test' },
        maxBuffer: 32 * 1024 * 1024,
        timeout: 10 * 60_000,
      },
      (err, stdout, stderr) => {
        resolve({
          file,
          status: err ? 'fail' : 'pass',
          ms: Date.now() - started,
          output: `${stdout}${stderr}`,
        });
      },
    );
  });
}

async function runPool(files: string[], concurrency: number): Promise<Result[]> {
  const results: Result[] = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, files.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= files.length) return;
      const r = await runSuite(files[i]);
      results.push(r);
      const mark = r.status === 'pass' ? '✓' : '❌';
      console.log(
        `  ${mark} [${results.length}/${files.length}] ${r.file} (${(r.ms / 1000).toFixed(1)}s)`,
      );
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const suites = discover(args.filter);
  assertDbListFresh(suites);

  const hasDb = Boolean(process.env.DATABASE_URL);
  const runnable = suites.filter((f) => hasDb || !DB_SUITES.has(f));
  const skipped = suites.filter((f) => !runnable.includes(f));

  if (args.list) {
    console.log(`${suites.length} suite(s) discovered:`);
    for (const f of suites) {
      console.log(`  ${DB_SUITES.has(f) ? '[db] ' : '     '}${f}`);
    }
    return;
  }

  console.log('='.repeat(64));
  console.log(`FEL CI SUITE — ${suites.length} discovered, ${runnable.length} running`);
  console.log(
    `DATABASE_URL: ${hasDb ? 'present (DB suites included)' : 'unset (DB suites skipped)'}`,
  );
  console.log(`Concurrency: ${args.concurrency}`);
  console.log('='.repeat(64));

  const started = Date.now();
  const results = await runPool(runnable, args.concurrency);
  const failures = results.filter((r) => r.status === 'fail');

  for (const f of failures) {
    console.log(`\n${'='.repeat(64)}`);
    console.log(`FAILED: ${f.file}`);
    console.log('='.repeat(64));
    console.log(f.output.trimEnd());
  }

  console.log(`\n${'='.repeat(64)}`);
  console.log('CI SUITE SUMMARY');
  console.log('='.repeat(64));
  console.log(`  passed:  ${results.length - failures.length}`);
  console.log(`  failed:  ${failures.length}`);
  console.log(`  skipped: ${skipped.length}${skipped.length ? ` (${skipped.join(', ')})` : ''}`);
  console.log(`  elapsed: ${((Date.now() - started) / 1000).toFixed(1)}s`);

  if (skipped.length && args.requireDb) {
    console.error(
      `\n❌ --require-db was set but ${skipped.length} DB suite(s) were skipped. ` +
        `Provide DATABASE_URL and run \`prisma db push\` before this step.`,
    );
    process.exit(1);
  }

  if (failures.length) {
    console.error(`\n❌ ${failures.length} SUITE(S) FAILED`);
    failures.forEach((f) => console.error(`     ${f.file}`));
    process.exit(1);
  }
  console.log('\n✅ ALL SUITES GREEN');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
