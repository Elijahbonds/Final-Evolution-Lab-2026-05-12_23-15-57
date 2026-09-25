import { NextResponse } from 'next/server';
import { readWallet } from '@/lib/wallet/wallet-service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getOrCreateProfile } from '@/lib/profile-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await getOrCreateProfile(userId);
    // The wallet is read FIRST: that read refunds a /shop card that unlocked nothing and takes it off the shelf
    // (lib/wallet/dead-buy-refunds.ts), so the cards and the ledger below already show the refund.
    const wallet = await readWallet(prisma, userId);   // pass 5 phase 1: the wallet is the balance
    const owned = await prisma.cardOwnership.findMany({ where: { userId } });
    const ledger = await prisma.creditLedger.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return NextResponse.json({
      labCredits: wallet.lc,
      owned: owned?.map((o: any) => o?.cardKey) ?? [],
      ledger: ledger ?? [],
    });
  } catch (e) {
    console.error('shop error', e);
    return NextResponse.json({ error: 'Failed to load shop' }, { status: 500 });
  }
}
