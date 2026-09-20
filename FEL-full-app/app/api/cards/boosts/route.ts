export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { spend, readWallet, WalletError } from '@/lib/wallet/wallet-service';
import { boostSkuId, cardById, ownedFromEntitlements, purchaseCheck } from '@/lib/cards/boosts';

/**
 * The creator boost cards a player owns, and buying one.
 *
 * This exists rather than pointing the client at /api/v1/wallet/spend for one reason: the idempotency key. Ledger
 * keys are unique across the WHOLE table, so a key the client composes from a card id would collide between two
 * players and hand the second one the first one's entry — a free card. Derived here from the session's own player
 * id, it cannot. It also means a double tap and a retried request buy the card exactly once: the second call
 * replays the first result instead of charging again.
 *
 * Price, balance and entitlement are all still the wallet's (lib/wallet/wallet-service.ts). Nothing is re-derived.
 */

async function ownedFor(playerId: string): Promise<string[]> {
  const rows = await prisma.playerEntitlement.findMany({ where: { playerId }, select: { skuId: true } });
  return ownedFromEntitlements(rows.map((r) => r.skuId));
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const playerId = (session?.user as { id?: string } | undefined)?.id;
  if (!playerId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const [owned, wallet] = await Promise.all([
    ownedFor(playerId),
    readWallet(prisma, playerId).catch(() => ({ shards: 0 })),
  ]);
  return NextResponse.json({ owned, shards: wallet.shards });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const playerId = (session?.user as { id?: string } | undefined)?.id;
  if (!playerId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const cardId = typeof (body as { card_id?: unknown })?.card_id === 'string' ? (body as { card_id: string }).card_id : '';

  const card = cardById(cardId);
  if (!card) return NextResponse.json({ error: 'unknown_card' }, { status: 404 });

  const owned = await ownedFor(playerId);
  if (owned.includes(card.id)) {
    const bal = await readWallet(prisma, playerId);
    return NextResponse.json({ owned, shards: bal.shards, already: true });
  }

  try {
    const result = await spend(prisma, {
      playerId,
      // One key per player per card, forever. This is the whole reason the route exists.
      idempotencyKey: `boost_card:${playerId}:${card.id}`,
      skuId: boostSkuId(card.id),
      quantity: 1,
    });
    return NextResponse.json({ owned: [...owned, card.id], shards: result.balances.shards });
  } catch (e) {
    if (e instanceof WalletError && e.code === 'INSUFFICIENT_FUNDS') {
      const bal = await readWallet(prisma, playerId);
      // Say how short they are rather than just refusing; purchaseCheck owns that arithmetic.
      const check = purchaseCheck(card, bal.shards, owned);
      return NextResponse.json(
        { error: 'insufficient_shards', shards: bal.shards, cost: check.cost, owned },
        { status: 409 },
      );
    }
    console.error('[cards/boosts] unexpected error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
