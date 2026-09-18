export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { spend, readWallet, WalletError } from '@/lib/wallet/wallet-service';
import { getWearable } from '@/lib/closet/wearable-catalog';

/** POST /api/v1/closet/buy — buy a cosmetic wearable with COINS. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const itemId = typeof body?.itemId === 'string' ? body.itemId : '';
  const idempotencyKey = typeof body?.idempotency_key === 'string' ? body.idempotency_key : '';
  const w = getWearable(itemId);
  if (!w) return NextResponse.json({ error: 'unknown_item' }, { status: 404 });
  if (!idempotencyKey) return NextResponse.json({ error: 'missing_idempotency_key' }, { status: 400 });

  const already = await prisma.ownedWearable.findUnique({ where: { userId_itemId: { userId, itemId } } });
  if (already) return NextResponse.json({ owned: true, alreadyOwned: true });

  try {
    const result = await spend(prisma, { playerId: userId, idempotencyKey, skuId: itemId, quantity: 1 });
    await prisma.ownedWearable.upsert({ where: { userId_itemId: { userId, itemId } }, update: {}, create: { userId, itemId } });
    return NextResponse.json({ owned: true, balances: result.balances });
  } catch (e) {
    if (e instanceof WalletError && e.code === 'INSUFFICIENT_FUNDS') {
      const bal = await readWallet(prisma, userId);
      return NextResponse.json({ error: 'insufficient_funds', balances: { coins: bal.coins, shards: bal.shards } }, { status: 409 });
    }
    throw e;
  }
}
