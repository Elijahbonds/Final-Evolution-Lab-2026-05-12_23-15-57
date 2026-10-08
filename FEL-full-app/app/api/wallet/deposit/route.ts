export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isRealMoneyCompetitionEnabled, FEATURE_DISABLED } from '@/lib/flags';
import { storeClosed } from '@/lib/coach-store/gate';

/**
 * POST /api/wallet/deposit
 * Body: { amountCents, paymentRef }
 * Record a deposit after Stripe payment is confirmed.
 * paymentRef is the Stripe payment intent / checkout session ID for idempotency.
 *
 * STORE-READY B10 (FE PM 4:36 PM PT Oct 7): this route credits a USD wallet from a
 * CLIENT-SUPPLIED paymentRef and never asks Stripe — so it ALWAYS refuses with 409
 * store_closed deposits_off (after the REAL_MONEY_COMPETITION 403 and the 401), before
 * reading the body, with no ledger write and no Stripe call, whatever the body.
 * Re-open only with a Stripe-verified payment path in a later PR.
 */
export async function POST(_req: NextRequest) {
  if (!isRealMoneyCompetitionEnabled()) {
    return NextResponse.json(FEATURE_DISABLED, { status: 403 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  return storeClosed('deposits_off');
}
