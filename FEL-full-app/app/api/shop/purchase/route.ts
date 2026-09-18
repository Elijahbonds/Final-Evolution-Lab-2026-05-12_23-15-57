import { NextResponse } from 'next/server';
import { applyLc, WalletError } from '@/lib/wallet/wallet-service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getOrCreateProfile } from '@/lib/profile-service';
import { SHOP_CARDS } from '@/lib/game-data';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const cardKey = String(body?.cardKey ?? '');
    const card = SHOP_CARDS.find((c) => c?.key === cardKey);
    if (!card) return NextResponse.json({ error: 'Unknown card' }, { status: 400 });

    const owned = await prisma.cardOwnership.findUnique({
      where: { userId_cardKey: { userId, cardKey } },
    });
    if (owned) return NextResponse.json({ error: 'Already owned' }, { status: 400 });

    await getOrCreateProfile(userId);

    const newBalance = await prisma.$transaction(async (tx) => {
      // Atomic conditional decrement — guards against two concurrent
      // purchases both reading the same stale balance and both passing the
      // funds check.
      // LC lives in the wallet (2026-09-04): applyLc rejects INSUFFICIENT_FUNDS atomically and writes ledger + mirror.
      let r;
      try { r = await applyLc(tx, { playerId: userId, delta: -card.price, reasonCode: 'SHOP_PURCHASE', source: 'spend', idempotencyKey: `shop:${userId}:${cardKey}`, metadata: { cardKey, name: card.name } }); }
      catch (e) { if (e instanceof WalletError && e.code === 'INSUFFICIENT_FUNDS') throw new Error('INSUFFICIENT_FUNDS'); throw e; }
      await tx.cardOwnership.create({ data: { userId, cardKey } });
      return r.balanceAfter;
    });

    return NextResponse.json({ ok: true, labCredits: newBalance });
  } catch (e: any) {
    if (e?.message === 'INSUFFICIENT_FUNDS') {
      return NextResponse.json({ error: 'Not enough Lab Credits' }, { status: 400 });
    }
    console.error('purchase error', e);
    return NextResponse.json({ error: 'Purchase failed' }, { status: 500 });
  }
}
