export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isRealMoneyCompetitionEnabled, FEATURE_DISABLED } from '@/lib/flags';
import { MIN_WITHDRAW_CENTS, MAX_WITHDRAW_CENTS } from '@/lib/competition';
import { ledgerWalletWithdraw } from '@/lib/stripe-helpers';
import { randomUUID } from 'crypto';

/**
 * POST /api/wallet/withdraw
 * Body: { amountCents }
 * Request a withdrawal from the user's USD wallet.
 * In production this would initiate a Stripe payout; currently records the
 * ledger entry and returns a withdrawal reference.
 */
export async function POST(req: NextRequest) {
  if (!isRealMoneyCompetitionEnabled()) {
    return NextResponse.json(FEATURE_DISABLED, { status: 403 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const userId = session.user.id;

  const body = await req.json().catch(() => ({}));
  const { amountCents } = body as { amountCents?: number };

  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents)) {
    return NextResponse.json({ error: 'amountCents must be an integer' }, { status: 400 });
  }
  if (amountCents < MIN_WITHDRAW_CENTS || amountCents > MAX_WITHDRAW_CENTS) {
    return NextResponse.json({ error: `Withdrawal must be between $${(MIN_WITHDRAW_CENTS/100).toFixed(2)} and $${(MAX_WITHDRAW_CENTS/100).toFixed(2)}` }, { status: 400 });
  }

  const withdrawalRef = randomUUID();

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      return ledgerWalletWithdraw(tx, {
        userId,
        amountCents,
        idempotencyKey: `withdraw:${withdrawalRef}`,
        metadata: { withdrawalRef },
      });
    });

    return NextResponse.json({
      transactionId: result.transactionId,
      withdrawalRef,
      amountCents,
    });
  } catch (err: any) {
    if (err?.code === 'NEGATIVE_BALANCE') {
      return NextResponse.json({ error: 'insufficient_funds', detail: 'Not enough USD balance for withdrawal.' }, { status: 402 });
    }
    console.error('[wallet/withdraw]', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
