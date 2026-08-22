export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getOrCreateWallet } from '@/lib/wallet/wallet-service';

/**
 * GET /api/v1/wallet/ledger?limit=50&cursor=<entryId>
 * Read-only, cursor-paginated audit trail of the caller's ledger. The balance
 * is fully reconstructable from these rows alone.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const playerId = (session?.user as any)?.id as string | undefined;
  if (!playerId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get('limit') || 50);
  const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50));
  const cursor = url.searchParams.get('cursor') || undefined;

  const wallet = await getOrCreateWallet(prisma, playerId);
  const rows = await prisma.walletLedgerEntry.findMany({
    where: { walletId: wallet.id },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return NextResponse.json({
    entries: page.map((r) => ({
      id: r.id,
      currency: r.currency,
      delta: Number(r.delta),
      balance_after: Number(r.balanceAfter),
      reason_code: r.reasonCode,
      source: r.source,
      metadata: r.metadata ?? null,
      created_at: r.createdAt.toISOString(),
    })),
    next_cursor: hasMore ? page[page.length - 1].id : null,
  });
}
