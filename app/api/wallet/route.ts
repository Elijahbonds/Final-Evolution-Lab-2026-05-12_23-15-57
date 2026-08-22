/**
 * GET /api/wallet — authoritative LC balance + owned cards + entitlements.
 *
 * Balance is derived server-side from CreditLedger (SUM of amounts). Owned
 * cards + resolved entitlements come from the ONE entitlements service. The
 * client never computes any of this.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ECONOMY_CONFIG, getBalance, getLifetimeEarned } from '@/lib/economy';
import { resolveEntitlements } from '@/lib/entitlements';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const [balance, lifetimeEarned, recent, entitlements] = await Promise.all([
      getBalance(prisma, userId),
      getLifetimeEarned(prisma, userId),
      prisma.creditLedger.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: ECONOMY_CONFIG.wallet.recentLedgerLimit,
        select: { id: true, amount: true, reason: true, createdAt: true },
      }),
      resolveEntitlements(prisma, userId),
    ]);

    return NextResponse.json({
      balance,
      lifetimeEarned,
      recent,
      owned: entitlements.cardIds,
      entitlements,
    });
  } catch (e) {
    console.error('wallet error', e);
    return NextResponse.json({ error: 'Failed to load wallet' }, { status: 500 });
  }
}
