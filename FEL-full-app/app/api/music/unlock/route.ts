export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { spend, readWallet, WalletError } from '@/lib/wallet/wallet-service';
import { MUSIC_PURCHASES, MUSIC_SKU_PREFIX, kitForSku, musicPurchase } from '@/lib/babylon/music/purchases';
import { backedEntitlements, type DeadBuyRow } from '@/lib/wallet/dead-buys';
import { REASON } from '@/lib/wallet/reward-rules';

/**
 * Buy something in the Music Room.
 *
 * Exists for the same reason app/api/cards/boosts does: ledger idempotency keys are unique across the WHOLE
 * table, so a key composed on the client would collide between two players and hand the second one the first
 * one's entry — a free kit. Derived here from the session's player id, it cannot.
 *
 * A kit is permanent, so a replay returns the original entry rather than charging twice. The Cell assist is
 * consumable and each one is a separate purchase, so the client supplies a nonce that is folded into the key
 * alongside the player id — enough to tell two deliberate buys apart, not enough to spend as somebody else.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const playerId = (session?.user as { id?: string } | undefined)?.id;
  if (!playerId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const skuId = String((body as { sku?: unknown })?.sku ?? '');
  const nonce = String((body as { nonce?: unknown })?.nonce ?? '').slice(0, 40).replace(/[^A-Za-z0-9_-]/g, '');

  const item = musicPurchase(skuId);
  if (!item || !skuId.startsWith(MUSIC_SKU_PREFIX)) {
    return NextResponse.json({ error: 'unknown_item' }, { status: 404 });
  }

  const isKit = kitForSku(skuId) !== null;
  // A kit: one key forever. An assist: one key per deliberate purchase.
  const idempotencyKey = isKit
    ? `music:${playerId}:${skuId}`
    : `music:${playerId}:${skuId}:${nonce || 'once'}`;

  try {
    const result = await spend(prisma, { playerId, idempotencyKey, skuId, quantity: 1 });
    return NextResponse.json({ ok: true, shards: result.balances.shards, sku: skuId });
  } catch (e) {
    if (e instanceof WalletError && e.code === 'INSUFFICIENT_FUNDS') {
      const bal = await readWallet(prisma, playerId).catch(() => ({ shards: 0 }));
      return NextResponse.json({ error: 'insufficient_shards', shards: bal.shards, cost: item.shards }, { status: 409 });
    }
    console.error('[music/unlock] unexpected error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

/** The kit SKUs the room sells (a free kit has none: everybody owns it). */
const KIT_SKUS = MUSIC_PURCHASES.map((p) => p.id).filter((id) => kitForSku(id) !== null);

/**
 * What this player owns, so the room does not offer to sell it again — and so a kit bought on one device is there on
 * every other.
 *
 * MUSIC-SUITE P2 (2026-09-25): until today nothing called this, and the room kept its kits in localStorage only. Now the
 * room reads it at mount (app/play/music/_components/loader.tsx readOwnedKits) and localStorage is only its cache. Three
 * things changed with the first caller:
 *   - OWNED MEANS PAID FOR. A kit counts only when its entitlement row has a charge behind it that the dead-buy rules
 *     never pay back (lib/wallet/dead-buys.ts backedEntitlements). /store sold kits through the generic spend route
 *     (browser-made keys) and wrote the same row; those charges are paid back automatically, and a paid-back kit's row
 *     was never deleted. Reading the bare row would hand every refunded /store buyer the kit AND the shards.
 *   - THE SWEEP RUNS FIRST. readWallet pays back any dead buy before the ledger is read here, so the answer already
 *     reflects a refund made on this very request.
 *   - A FAILED READ IS NOT "YOU OWN NOTHING". The entitlement read used to .catch(() => []) and answer 200 with an
 *     empty list; the room now removes a kit the server does not list, so a database hiccup would have locked every
 *     player's kits. Any failure is a 503 and the room keeps its cache.
 * Only kit SKUs are listed: the Cell assist is consumable, and a /store-bought one was never a foundation to use.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const playerId = (session?.user as { id?: string } | undefined)?.id;
  if (!playerId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const wallet = await readWallet(prisma, playerId);   // pays back dead buys first
    const w = await prisma.wallet.findUnique({ where: { playerId }, select: { id: true } });
    const [ents, raw] = await Promise.all([
      prisma.playerEntitlement.findMany({ where: { playerId, skuId: { in: KIT_SKUS } }, select: { skuId: true } }),
      w
        ? prisma.walletLedgerEntry.findMany({
          where: { walletId: w.id, reasonCode: { in: [REASON.SPEND_CATALOG_ITEM, REASON.DEAD_BUY_REFUND] } },
          select: { id: true, currency: true, delta: true, reasonCode: true, idempotencyKey: true, metadata: true, createdAt: true },
        })
        : Promise.resolve([]),
    ]);
    const rows: DeadBuyRow[] = raw.map((r) => ({ ...r, currency: String(r.currency), delta: Number(r.delta) }));
    const backed = backedEntitlements(KIT_SKUS, rows, playerId);
    const owned = [...new Set(ents.map((e) => e.skuId))].filter((sku) => backed.has(sku)).sort();
    return NextResponse.json({ owned, shards: wallet.shards });
  } catch (e) {
    console.error('[music/unlock] owned read failed', e);
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
