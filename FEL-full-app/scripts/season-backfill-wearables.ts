/**
 * scripts/season-backfill-wearables.ts
 * ===================================
 * One-shot reconciliation: hand out the season pass cosmetics that were earned
 * before the grant -> wearable bridge existed.
 *
 * The pass used to record a cosmetic as a PassGrant row and stop there, while
 * the closet equips out of OwnedWearable. Every cosmetic earned before that fix
 * is therefore owed: the athlete cleared the tier, the log says so, and no item
 * ever appeared. New grants deliver themselves, so this is only needed once per
 * database that ran the pass before the fix.
 *
 * Safe to re-run: it only ever ADDS a missing OwnedWearable row, never removes
 * one, and skips anything already owned.
 *
 *   DRY RUN (default):  yarn tsx --require dotenv/config scripts/season-backfill-wearables.ts
 *   APPLY:              yarn tsx --require dotenv/config scripts/season-backfill-wearables.ts --apply
 *
 * PRO-lane note: a grant whose purchase was later refunded is skipped, because
 * a refund withdraws those items on purpose (see revokeProLane). Ownership is
 * restored by re-purchasing, not by this script.
 */

import { prisma } from '../lib/db';
import { getWearable } from '../lib/closet/wearable-catalog';

const APPLY = process.argv.includes('--apply');

async function main() {
  const grants = await prisma.passGrant.findMany({
    where: { lane: { in: ['free', 'pro'] } },
    select: { userId: true, seasonId: true, lane: true, tier: true, reward: true },
    orderBy: { createdAt: 'asc' },
  });

  // PRO grants only count while the athlete still holds the lane for that
  // season — a refunded purchase must not be silently restored here.
  const progress = await prisma.passProgress.findMany({ select: { userId: true, seasonId: true, hasPro: true } });
  const hasPro = new Set(progress.filter((p) => p.hasPro).map((p) => `${p.userId}:${p.seasonId}`));

  let considered = 0;
  let skippedRefunded = 0;
  let unresolved = 0;
  const wanted = new Map<string, Set<string>>(); // userId -> itemIds

  for (const g of grants) {
    const reward = g.reward as any;
    if (reward?.kind !== 'cosmetic' || typeof reward?.id !== 'string') continue;
    considered++;

    if (g.lane === 'pro' && !hasPro.has(`${g.userId}:${g.seasonId}`)) {
      skippedRefunded++;
      continue;
    }
    if (!getWearable(reward.id)) {
      console.warn(`  ! ${reward.id} (T${g.tier} ${g.lane}) does not resolve in the catalog — skipping`);
      unresolved++;
      continue;
    }
    if (!wanted.has(g.userId)) wanted.set(g.userId, new Set());
    wanted.get(g.userId)!.add(reward.id);
  }

  // PassGrant.userId carries no foreign key, so a deleted account can leave
  // grant rows behind. OwnedWearable DOES have one, so writing for a vanished
  // user fails the whole run — skip them instead.
  const liveUsers = new Set(
    (await prisma.user.findMany({ where: { id: { in: [...wanted.keys()] } }, select: { id: true } })).map((u) => u.id),
  );
  let orphaned = 0;
  for (const userId of [...wanted.keys()]) {
    if (!liveUsers.has(userId)) {
      wanted.delete(userId);
      orphaned++;
    }
  }

  let missing = 0;
  let created = 0;
  for (const [userId, itemIds] of wanted) {
    const owned = new Set(
      (await prisma.ownedWearable.findMany({ where: { userId }, select: { itemId: true } })).map((o) => o.itemId),
    );
    for (const itemId of itemIds) {
      if (owned.has(itemId)) continue;
      missing++;
      if (APPLY) {
        await prisma.ownedWearable.create({ data: { userId, itemId } });
        created++;
      }
    }
  }

  console.log(`cosmetic grants considered : ${considered}`);
  console.log(`skipped (PRO, refunded)    : ${skippedRefunded}`);
  console.log(`skipped (unresolvable id)  : ${unresolved}`);
  console.log(`skipped (deleted account)  : ${orphaned}`);
  console.log(`athletes with grants       : ${wanted.size}`);
  console.log(`owed items found           : ${missing}`);
  console.log(APPLY ? `items delivered            : ${created}` : `\nDRY RUN — re-run with --apply to deliver them.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
