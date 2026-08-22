export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * GET /api/account/subscription — current user's active subscriptions + entitlements.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const subs = await prisma.subscription.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
  });

  const entitlements = {
    felPro: subs.some((s: any) => s.product === 'FEL_PRO' && s.status === 'ACTIVE'),
    studioCreator: subs.some((s: any) => s.product === 'STUDIO_CREATOR' && s.status === 'ACTIVE'),
  };

  return NextResponse.json({ subscriptions: subs, entitlements });
}
