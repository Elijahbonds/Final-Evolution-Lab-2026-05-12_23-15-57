export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * GET /api/marketplace/purchase — list buyer's purchases
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const purchases = await prisma.marketplacePurchase.findMany({
    where: { buyerId: session.user.id },
    include: { listing: { select: { title: true, itemKey: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ purchases });
}
