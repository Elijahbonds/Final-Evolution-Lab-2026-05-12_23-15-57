/**
 * scripts/workout/revise-all-plans.ts — owner decision #22: every depth drop in every week of every past /workout plan
 * swapped, with the in-app note, including the plans nobody has opened. MIRROR-COACH P2 (2026-09-25).
 *
 * It walks every WorkoutPlan row in pages and stores the same pure revision the plan route stores on read
 * (lib/workout/plan-backfill.ts → lib/workout/plan-revision.ts revisePlanForStorage: every depth drop swapped, and a
 * youth revision P1 stored undone — the P2 review, 2026-09-26, made the youth revision a read-time view, because stored
 * it outlived an adult birth year). A DRY RUN unless --apply: it prints the counts per focus and per age band (adult /
 * minor / unknown; what each band is SERVED is checked) and writes nothing. Idempotent: a second --apply reports
 * changed 0 and writes 0.
 *
 * NOT RUN IN THIS LANE: its database is offline on purpose. The main session runs it at deploy, against the hosted
 * database, after the deploy that carries the revision (so a read in between serves the same weeks this writes):
 *
 *   DRY RUN:  DATABASE_URL=… /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/workout/revise-all-plans.ts
 *   APPLY:    DATABASE_URL=… /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/workout/revise-all-plans.ts --apply
 *   CHECK:    run the dry run again: "changed 0".
 *
 * Flags: --dry-run (the default, may be said), --apply, --page-size N (1-1000, default 200). Any other flag is refused
 * before the database is opened. Exit code 0 when clean; 1 when a write failed or matched no row, or a depth drop (or
 * a jump SERVED to a youth owner) is left; 2 for a bad flag. It prints the target as host/name only, never the credentials.
 */

import type { PrismaClient } from '@/public/_prisma/client';
import { backfillClean, backfillWorkoutPlans, describeDatabaseUrl, formatBackfillReport, parseBackfillArgs } from '../../lib/workout/plan-backfill';

export interface ReviseAllPlansIo {
  /** Opens the database. Called only after the flags parse. */
  open: () => Promise<{ db: Pick<PrismaClient, 'workoutPlan'>; close: () => Promise<void> }>;
  log: (line: string) => void;
  databaseUrl?: string;
}

/** The whole script, with its database and output passed in (the test runs it on a stand-in table). Returns the exit code. */
export async function reviseAllPlans(argv: readonly string[], io: ReviseAllPlansIo): Promise<number> {
  let args;
  try {
    args = parseBackfillArgs(argv);
  } catch (e) {
    io.log(`revise-all-plans: ${(e as Error).message}`);
    return 2;
  }
  io.log(`revise-all-plans: ${args.apply ? 'APPLY' : 'DRY RUN'} against ${describeDatabaseUrl(io.databaseUrl)} (page size ${args.pageSize})`);
  const { db, close } = await io.open();
  try {
    const report = await backfillWorkoutPlans(db, {
      apply: args.apply,
      pageSize: args.pageSize,
      onPage: (r) => io.log(`  … page ${r.pages}: ${r.scanned} read, ${r.changed} changed, ${r.written} written`),
    });
    for (const line of formatBackfillReport(report)) io.log(line);
    io.log(JSON.stringify(report));
    return backfillClean(report) ? 0 : 1;
  } finally {
    await close();
  }
}

if (process.argv[1]?.endsWith('revise-all-plans.ts')) {
  // .env first (as scripts/ledger-backfill.ts does), so the target it names is the one lib/db opens
  import('dotenv/config').then(() => reviseAllPlans(process.argv.slice(2), {
    databaseUrl: process.env.DATABASE_URL,
    log: (line) => console.log(line),
    open: async () => {
      const { prisma } = await import('../../lib/db');
      return { db: prisma, close: () => prisma.$disconnect() };
    },
  })).then(
    (code) => { process.exitCode = code; },
    (e) => { console.error('revise-all-plans FAILED (nothing after the failed read was written; it is safe to run again)', e); process.exitCode = 1; },
  );
}
