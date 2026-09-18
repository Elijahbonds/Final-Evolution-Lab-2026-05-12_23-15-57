export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { buyCardSlot } from '@/lib/creator/creative-card-service';
import { WalletError } from '@/lib/wallet/wallet-service';

/** POST /api/v1/creative-card/slots/buy — spend shards for one extra card slot. */
export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const result = await buyCardSlot(prisma, userId);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof WalletError) {
      const status = e.message === 'INSUFFICIENT_FUNDS' ? 402 : 409;
      return NextResponse.json({ error: e.message }, { status });
    }
    console.error('[FEL-CREATIVE] buyCardSlot failed', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
