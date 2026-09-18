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

    const profile = await getOrCreateProfile(userId);
    const owned = await prisma.cardOwnership.findMany({ where: { userId } });
    const ledger = await prisma.creditLedger.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return NextResponse.json({
      labCredits: (await readWallet(prisma, userId)).lc,   // pass 5 phase 1: the wallet is the balance
      owned: owned?.map((o: any) => o?.cardKey) ?? [],
      ledger: ledger ?? [],
    });
  } catch (e) {
    console.error('shop error', e);
    return NextResponse.json({ error: 'Failed to load shop' }, { status: 500 });
  }
}
