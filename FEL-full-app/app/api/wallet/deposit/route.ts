export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isRealMoneyCompetitionEnabled, FEATURE_DISABLED } from '@/lib/flags';
import { MIN_DEPOSIT_CENTS, MAX_DEPOSIT_CENTS } from '@/lib/competition';
import { ledgerWalletDeposit } from '@/lib/stripe-helpers';

/**
 * POST /api/wallet/deposit
 * Body: { amountCents, paymentRef }
 * Record a deposit after Stripe payment is confirmed.
 * paymentRef is the Stripe payment intent / checkout session ID for idempotency.
 */
export async function POST(req: NextRequest) {
  if (!isRealMoneyCompetitionEnabled()) {
    return NextResponse.json(FEATURE_DISABLED, { status: 403 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const userId = session.user.id;

  const body = await req.json().catch(() => ({}));
  const { amountCents, paymentRef } = body as { amountCents?: number; paymentRef?: string };

  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents)) {
    return NextResponse.json({ error: 'amountCents must be an integer' }, { status: 400 });
  }
  if (amountCents < MIN_DEPOSIT_CENTS || amountCents > MAX_DEPOSIT_CENTS) {
    return NextResponse.json({ error: `Deposit must be between $${(MIN_DEPOSIT_CENTS/100).toFixed(2)} and $${(MAX_DEPOSIT_CENTS/100).toFixed(2)}` }, { status: 400 });
  }
  if (!paymentRef || typeof paymentRef !== 'string') {
    return NextResponse.json({ error: 'paymentRef is required for idempotency' }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      return ledgerWalletDeposit(tx, {
        userId,
        amountCents,
        idempotencyKey: `deposit:${paymentRef}`,
        metadata: { paymentRef },
      });
    });

    return NextResponse.json({
      transactionId: result.transactionId,
      duplicate: result.duplicate,
      amountCents,
    });
  } catch (err: any) {
    console.error('[wallet/deposit]', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
