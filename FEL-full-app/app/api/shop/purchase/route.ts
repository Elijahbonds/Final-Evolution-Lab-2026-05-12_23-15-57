import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getOrCreateProfile } from '@/lib/profile-service';
import { SHOP_CARDS } from '@/lib/game-data';
import { postLc } from '@/lib/ledger';

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
      const result = await tx.playerProfile.updateMany({
        where: { userId, labCredits: { gte: card.price } },
        data: { labCredits: { decrement: card.price } },
      });
      if (result.count === 0) {
        throw new Error('INSUFFICIENT_FUNDS');
      }
      await tx.cardOwnership.create({ data: { userId, cardKey } });
      const profile = await tx.playerProfile.findUnique({ where: { userId }, select: { labCredits: true } });
      const balance = profile?.labCredits ?? 0;
      await postLc(tx, {
        userId,
        amount: -card.price,
        reason: `Purchase: ${card.name}`,
        balanceAfter: balance,
        dedupeKey: `shop:${userId}:${cardKey}`,
      });
      return balance;
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
