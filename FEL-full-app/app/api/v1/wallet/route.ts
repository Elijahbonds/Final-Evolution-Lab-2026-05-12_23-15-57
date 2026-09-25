export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { readWallet } from '@/lib/wallet/wallet-service';
import { refundNotesFor } from '@/lib/wallet/dead-buy-refunds';

/**
 * GET /api/v1/wallet
 * Returns the caller's authoritative balance. The player id is ALWAYS taken
 * from the session — never from a query/body param.
 * `refund_notes` (owner decision 2026-09-24): why the balance went up when a purchase that delivered nothing was paid
 * back, one { id, text, at } per refund from the last two weeks. The wallet chip shows each once per device.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const playerId = (session?.user as any)?.id as string | undefined;
  if (!playerId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const view = await readWallet(prisma, playerId);
  return NextResponse.json({
    coins: view.coins,
    shards: view.shards,
    lc: view.lc,
    version: view.version,
    updated_at: view.updated_at,
    refund_notes: refundNotesFor(prisma, playerId),   // read after readWallet, which refunds and remembers the notes
  });
}
