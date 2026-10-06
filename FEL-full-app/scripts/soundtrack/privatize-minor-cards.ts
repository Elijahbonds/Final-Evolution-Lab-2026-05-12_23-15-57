/**
 * scripts/soundtrack/privatize-minor-cards.ts — CREATOR SOUNDTRACK phase 0 (owner, 2026-10-06).
 *
 * "Old minor/unknown-age acting voice clips = make private (no deletion)." Flips the stored rows to isPublic = false for
 * every public card whose owner is under 18 or has no birth year, and stamps stats.privatizedAt. The app already hides
 * them on read (lib/creator/creative-card-review.ts); this makes the data agree. Nothing is deleted.
 *
 * THE OWNER RUNS THIS. An agent never runs it against a real database.
 *
 *   DRY RUN (default; reads only, prints what it would change):
 *     npx tsx scripts/soundtrack/privatize-minor-cards.ts
 *   APPLY (writes):
 *     npx tsx scripts/soundtrack/privatize-minor-cards.ts --apply
 *   Other disciplines too (default: acting only):
 *     ... --disciplines=acting,music
 *
 * It reads DATABASE_URL from the environment (dotenv), prints the host it is about to use, and refuses without one.
 */
import 'dotenv/config';
import { PrismaClient } from '@/public/_prisma/client';
import { planPrivatize, privatizedStats, type PrivatizeRow } from '../../lib/soundtrack/privatize';

async function main() {
  const apply = process.argv.includes('--apply');
  const dArg = process.argv.find((a) => a.startsWith('--disciplines='));
  const disciplines = dArg ? dArg.slice('--disciplines='.length).split(',').map((s) => s.trim()).filter(Boolean) : ['acting'];
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('No DATABASE_URL: nothing to do.'); process.exitCode = 1; return; }
  let host = '(unparsed)';
  try { host = new URL(url).host; } catch { /* keep the placeholder */ }
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} against ${host} — disciplines: ${disciplines.join(', ')}`);

  const prisma = new PrismaClient();
  try {
    const rows = await prisma.creativeCard.findMany({
      where: { primary: { in: disciplines } },
      select: { id: true, ownerId: true, primary: true, isPublic: true, stats: true, owner: { select: { dobYear: true } } },
    });
    const now = new Date();
    const plan = planPrivatize(rows as unknown as PrivatizeRow[], disciplines, now);
    console.log(`cards read: ${rows.length}; adult owners (left alone): ${plan.skippedAdult}; already private: ${plan.alreadyPrivate}; to make private: ${plan.flip.length}`);
    for (const f of plan.flip) console.log(`  ${f.id}  (owner ${f.ownerId})`);
    if (!apply) { console.log('Dry run: nothing written. Re-run with --apply to make these private.'); return; }
    let done = 0;
    for (const f of plan.flip) {
      const row = rows.find((r) => r.id === f.id)!;
      await prisma.creativeCard.update({ where: { id: f.id }, data: { isPublic: false, stats: privatizedStats(row.stats, now) as never } });
      done++;
    }
    console.log(`Made ${done} card(s) private.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
