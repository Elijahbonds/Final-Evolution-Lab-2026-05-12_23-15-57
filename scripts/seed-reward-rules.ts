/**
 * scripts/seed-reward-rules.ts — upsert the DEFAULT reward rules into the DB so
 * they are editable at runtime WITHOUT a code release (spec §2/§10). Safe to
 * re-run: it upserts by reasonCode and never deletes. Editing a row in the DB
 * overrides the in-code default (resolveRule prefers the DB row).
 *
 * Run: `yarn tsx scripts/seed-reward-rules.ts`
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { DEFAULT_REWARD_RULES } from '../lib/wallet/reward-rules';

const prisma = new PrismaClient();

async function main() {
  let n = 0;
  for (const [reasonCode, r] of Object.entries(DEFAULT_REWARD_RULES)) {
    await prisma.rewardRule.upsert({
      where: { reasonCode },
      // Do NOT clobber a hand-tuned live row's amounts on re-seed; only ensure
      // the row exists and stays active. Operators edit values in the DB.
      update: { active: true },
      create: {
        reasonCode,
        currency: r.currency,
        formula: r.formula,
        baseAmount: r.baseAmount,
        scaleNum: r.scaleNum,
        minGrant: r.minGrant,
        maxGrant: r.maxGrant,
        perMinuteCap: r.perMinuteCap,
        perDayCurrencyCap: r.perDayCurrencyCap,
        active: r.active,
      },
    });
    n++;
  }
  console.log(`Seeded/verified ${n} reward rules.`);
}

main()
  .catch((e) => {
    console.error('seed-reward-rules FAILED:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
