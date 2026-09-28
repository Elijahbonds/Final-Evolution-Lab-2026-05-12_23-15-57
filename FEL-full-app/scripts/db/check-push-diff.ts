/**
 * scripts/db/check-push-diff.ts — before (and after) a schema push to the hosted database, check that the push is the
 * reviewed one and that it only ADDS (owner decision #16). MIRROR-COACH P2 review, 2026-09-26. It never pushes.
 *
 * It asks Prisma what the LIVE database needs to match prisma/schema.prisma:
 *   prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script
 * and compares that, statement for statement, with the preview that was reviewed (lib/db/pushDiff.ts). The P2 preview
 * so far had only been taken schema-to-schema, so drift in production would not have shown in it.
 *
 *   BEFORE:  DIRECT_URL=… node node_modules/tsx/dist/cli.mjs scripts/db/check-push-diff.ts --preview <schema-push-preview.sql>
 *            exit 0 = the live diff IS the preview, and the preview is additive only. Then push EXACTLY those statements:
 *            DIRECT_URL=… npx prisma db execute --url "$DIRECT_URL" --file <schema-push-preview.sql>
 *            (not `db push --accept-data-loss`: that would also apply — silently — anything the live diff has beyond
 *            the preview.)
 *   AFTER:   the same command with --after: exit 0 = the live database now needs nothing (the push landed whole).
 *
 * Exit 1: the live diff differs from the preview (each extra or missing statement is printed), or the preview is not
 * additive (each offending statement is printed) — stop and ask. Exit 2: a bad flag or no DIRECT_URL. The database
 * address is printed as host/name only, never the credentials. NOT RUN IN THIS LANE (its database is offline).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { additiveOnly, comparePushDiff, sqlStatements } from '../../lib/db/pushDiff';
import { describeDatabaseUrl } from '../../lib/workout/plan-backfill';

function args(argv: readonly string[]): { preview: string | null; after: boolean } {
  let preview: string | null = null, after = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--after') after = true;
    else if (argv[i] === '--preview') preview = argv[++i] ?? null;
    else throw new Error(`unknown flag ${argv[i]} (use --preview <file> [--after])`);
  }
  if (!after && !preview) throw new Error('--preview <file> is required before a push');
  return { preview, after };
}

function main(): number {
  let a: ReturnType<typeof args>;
  try { a = args(process.argv.slice(2)); } catch (e) { console.error(String((e as Error).message)); return 2; }
  const url = process.env.DIRECT_URL;
  if (!url) { console.error('DIRECT_URL is not set'); return 2; }
  console.log(`live database: ${describeDatabaseUrl(url)}`);
  const live = execFileSync(process.execPath, [
    'node_modules/prisma/build/index.js', 'migrate', 'diff', '--from-url', url, '--to-schema-datamodel', 'prisma/schema.prisma', '--script',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

  if (a.after) {
    const left = sqlStatements(live);
    if (!left.length) { console.log('CLEAN: the live database matches prisma/schema.prisma.'); return 0; }
    console.log(`NOT CLEAN: ${left.length} statement(s) still to apply:`);
    for (const s of left) console.log(`  ${s}`);
    return 1;
  }

  const preview = readFileSync(a.preview!, 'utf8');
  const add = additiveOnly(preview);
  const cmp = comparePushDiff(live, preview);
  let ok = true;
  if (!add.ok) {
    ok = false;
    console.log('THE PREVIEW IS NOT ADDITIVE — the standing GO (decision #16) does not cover:');
    for (const s of add.offending) console.log(`  ${s}`);
  }
  if (!cmp.same) {
    ok = false;
    console.log('THE LIVE DIFF IS NOT THE PREVIEW.');
    for (const s of cmp.onlyLive) console.log(`  live only:    ${s}`);
    for (const s of cmp.onlyPreview) console.log(`  preview only: ${s}`);
  }
  console.log(ok
    ? `OK: ${sqlStatements(preview).length} statement(s), all additive, and exactly what the live database needs. Push with prisma db execute --file ${a.preview}, then run this again with --after.`
    : 'STOP: do not push. Show the owner the lines above.');
  return ok ? 0 : 1;
}

process.exitCode = main();
