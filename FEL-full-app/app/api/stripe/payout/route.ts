export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isPayoutsEnabled } from '@/lib/flags';

/**
 * POST /api/stripe/payout
 * Connect transfers are not built. This route writes nothing and never marks a payout COMPLETED.
 * PAYOUTS_ENABLED default off. Even when that flag is on, the answer stays 503 until a real transfer exists.
 */
export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  void isPayoutsEnabled();
  return NextResponse.json({ error: 'payouts_not_available' }, { status: 503 });
}
