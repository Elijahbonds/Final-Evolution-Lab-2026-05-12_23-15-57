export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { spend, readWallet, WalletError } from '@/lib/wallet/wallet-service';
import { MUSIC_SKU_PREFIX, kitForSku, musicPurchase } from '@/lib/babylon/music/purchases';

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

/** What this player already owns, so the room does not offer to sell it again. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const playerId = (session?.user as { id?: string } | undefined)?.id;
  if (!playerId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const rows = await prisma.playerEntitlement.findMany({
    where: { playerId, skuId: { startsWith: MUSIC_SKU_PREFIX } },
    select: { skuId: true },
  }).catch(() => []);

  const wallet = await readWallet(prisma, playerId).catch(() => ({ shards: 0 }));
  return NextResponse.json({ owned: rows.map((r) => r.skuId), shards: wallet.shards });
}
