import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ensureReferralCode, getReferralStats } from '@/lib/marketing/referral';

export const dynamic = 'force-dynamic';

/**
 * GET /api/marketing/referral — return the caller's share code + stats,
 * creating the code lazily on first read. Auth required.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    await ensureReferralCode(prisma, userId);
    const stats = await getReferralStats(prisma, userId);
    return NextResponse.json(stats);
  } catch (e) {
    console.error('referral GET failed', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
