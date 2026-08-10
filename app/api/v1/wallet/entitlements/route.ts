export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * GET /api/v1/wallet/entitlements
 * The caller's owned catalog items (from spending coins/shards). Read-only.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const playerId = (session?.user as any)?.id as string | undefined;
  if (!playerId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const rows = await prisma.playerEntitlement.findMany({
    where: { playerId },
    orderBy: { updatedAt: 'desc' },
  });
  return NextResponse.json({
    entitlements: rows.map((r) => ({ sku_id: r.skuId, quantity: r.quantity, updated_at: r.updatedAt.toISOString() })),
  });
}
