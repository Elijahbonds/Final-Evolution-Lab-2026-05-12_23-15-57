export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isRealMoneyCompetitionEnabled, FEATURE_DISABLED } from '@/lib/flags';
import { getBalance } from '@/lib/ledger';
import { prisma } from '@/lib/db';

/**
 * GET /api/wallet/balance
 * Returns the user's USD wallet balance (in cents) from the ledger.
 */
export async function GET() {
  if (!isRealMoneyCompetitionEnabled()) {
    return NextResponse.json(FEATURE_DISABLED, { status: 403 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const balanceCents = await getBalance(prisma, {
    type: 'USER_WALLET',
    currency: 'USD_CENTS',
    userId: session.user.id,
  });

  return NextResponse.json({ balanceCents });
}
