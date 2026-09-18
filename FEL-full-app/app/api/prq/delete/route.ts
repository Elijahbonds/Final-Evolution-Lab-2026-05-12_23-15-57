import { NextResponse } from 'next/server';
import { readWallet } from '@/lib/wallet/wallet-service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { postLc } from '@/lib/ledger';

export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  // Count before delete for idempotency reporting
  const count = await prisma.prqEntry.count({ where: { userId } });

  if (count > 0) {
    await prisma.prqEntry.deleteMany({ where: { userId } });

    // Ledger the deletion as an event (wallet untouched)
    const walletView = await readWallet(prisma, userId);   // pass 5 phase 1
    await postLc(prisma, {
      userId,
      amount: 0,
      reason: `PRQ data erasure: ${count} entries deleted`,
      balanceAfter: walletView.lc,
      dedupeKey: `prq-erase:${userId}:${Date.now()}`,
    });
  }

  return NextResponse.json({ ok: true, deleted: count });
}
