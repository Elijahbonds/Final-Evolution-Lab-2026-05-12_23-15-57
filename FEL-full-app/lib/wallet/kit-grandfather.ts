/**
 * lib/wallet/kit-grandfather.ts — the server half of owner decision #23 (MUSIC-SUITE P6, 2026-09-25): a Music Room kit
 * unlocked for free before 2026-09-20 is granted to the account ONCE. The rules are lib/babylon/music/kitGrandfather.ts
 * (pure, shared with the client); this file reads what the account owns and writes the grant.
 *
 * THE GRANT is two writes in one transaction: a ledger row (currency shards, delta 0, reason KIT_GRANDFATHER_2026_09,
 * source admin_adjust, key kit_grandfather_2026_09:<player>:<sku>) and the kit's PlayerEntitlement row. Delta 0 on
 * purpose: nothing was paid and nothing is paid back, the balance stays reconstructable from the deltas, and no earn cap
 * or refund rule ever reads it. The key is unique across the ledger, so a second grant of the same kit to the same
 * player — a replayed request, two tabs, two server instances — fails on it and changes nothing.
 *
 * WHAT THE ACCOUNT OWNS moved here from GET /api/music/unlock (unchanged, plus the grant's reason in the ledger read):
 * the claim route must decide "a kit they don't own" by exactly the rule the room's read uses, not a copy of it.
 */

import { Prisma, type PrismaClient } from '@/public/_prisma/client';
import { MUSIC_PURCHASES, kitForSku } from '@/lib/babylon/music/purchases';
import { grandfatherNote, grandfatherSku, type GrandfatherRecord } from '@/lib/babylon/music/kitGrandfather';
import type { KitId } from '@/lib/babylon/music/SynthKit';
import { backedEntitlements, kitGrandfatherKey, type DeadBuyRow } from './dead-buys';
import { REASON } from './reward-rules';
import { getOrCreateWallet, readWallet } from './wallet-service';

/** The kit SKUs the room sells (a free kit has none: everybody owns it). */
export const MUSIC_KIT_SKUS: readonly string[] = MUSIC_PURCHASES.map((p) => p.id).filter((id) => kitForSku(id) !== null);

/** The ledger reasons the owned-kits read needs: the charges, their refunds, and (P6) the grants. */
export const OWNED_KIT_REASONS: readonly string[] = [REASON.SPEND_CATALOG_ITEM, REASON.DEAD_BUY_REFUND, REASON.KIT_GRANDFATHER_2026_09];

/**
 * The kit SKUs this player owns and their shard balance. readWallet pays back any dead buy first, so the answer already
 * reflects a refund made on this very request. A kit counts only when its entitlement row has something behind it that
 * the dead-buy rules never pay back: the room's own charge, or (P6) a grandfather grant (dead-buys.ts backedEntitlements).
 * Throws on any database failure: a failed read is never "you own nothing".
 */
export async function ownedMusicKits(prisma: PrismaClient, playerId: string): Promise<{ owned: string[]; shards: number }> {
  const wallet = await readWallet(prisma, playerId);   // pays back dead buys first
  const w = await prisma.wallet.findUnique({ where: { playerId }, select: { id: true } });
  const [ents, raw] = await Promise.all([
    prisma.playerEntitlement.findMany({ where: { playerId, skuId: { in: [...MUSIC_KIT_SKUS] } }, select: { skuId: true } }),
    w
      ? prisma.walletLedgerEntry.findMany({
        where: { walletId: w.id, reasonCode: { in: [...OWNED_KIT_REASONS] } },
        select: { id: true, currency: true, delta: true, reasonCode: true, idempotencyKey: true, metadata: true, createdAt: true },
      })
      : Promise.resolve([]),
  ]);
  const rows: DeadBuyRow[] = raw.map((r) => ({ ...r, currency: String(r.currency), delta: Number(r.delta) }));
  const backed = backedEntitlements(MUSIC_KIT_SKUS, rows, playerId);
  const owned = [...new Set(ents.map((e) => e.skuId))].filter((sku) => backed.has(sku)).sort();
  return { owned, shards: wallet.shards };
}

/**
 * Grant `kit` to `playerId` once, on `record`. Returns false when this player already holds the grant (the unique key
 * refused a second one), true when this call wrote it. Any other failure throws and nothing is written.
 */
export async function grantGrandfatherKit(prisma: PrismaClient, playerId: string, kit: KitId, record: GrandfatherRecord): Promise<boolean> {
  const skuId = grandfatherSku(kit);
  const idempotencyKey = kitGrandfatherKey(playerId, skuId);
  if (await prisma.walletLedgerEntry.findUnique({ where: { idempotencyKey }, select: { id: true } })) return false;
  try {
    await prisma.$transaction(async (tx) => {
      const wallet = await getOrCreateWallet(tx, playerId);
      await (tx as any).walletLedgerEntry.create({
        data: {
          walletId: wallet.id, currency: 'shards', delta: BigInt(0), balanceAfter: wallet.shards,
          reasonCode: REASON.KIT_GRANDFATHER_2026_09, source: 'admin_adjust', idempotencyKey,
          metadata: {
            skuId, kit, note: grandfatherNote(kit),
            record: { from: record.from, at: record.at === null ? null : new Date(record.at).toISOString() },
          },
        },
      });
      await (tx as any).playerEntitlement.upsert({
        where: { playerId_skuId: { playerId, skuId } },
        update: {},
        create: { playerId, skuId, quantity: 1 },
      });
    });
    return true;
  } catch (e) {
    // another request granted it first (its row committed between our look and our insert): that grant stands
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return false;
    throw e;
  }
}
