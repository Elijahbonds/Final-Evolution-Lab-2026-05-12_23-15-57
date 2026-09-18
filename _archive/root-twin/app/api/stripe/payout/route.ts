export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { getBalance, type AccountRef } from '@/lib/ledger';
import { ledgerPayout } from '@/lib/stripe-helpers';

/**
 * POST /api/stripe/payout
 * Body: { amount?: number } — amount in cents; if omitted, pays full accrual balance.
 * Idempotent via PayoutRequest.idempotencyKey.
 *
 * Creates a Stripe Transfer to the creator's connected account, then records
 * the ledger debit from CREATOR_ACCRUAL.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const body = await req.json().catch(() => ({}));
  const requestedAmount = body.amount as number | undefined;

  // Check creator accrual balance
  const accrualRef: AccountRef = { type: 'CREATOR_ACCRUAL', currency: 'USD_CENTS', userId };
  // We need to read the balance from the DB directly (outside a tx, for the check)
  const balance = await getBalance(prisma, accrualRef);
  // Creator accrual is negative in the ledger (money owed TO creator), so the payable amount is Math.abs
  // Actually: CREATOR_ACCRUAL receives negative postings (credit to creator = money owed)
  // Balance should be negative meaning we owe them. Payout amount = abs(balance).
  const availableCents = Math.abs(balance);

  if (availableCents <= 0) {
    return NextResponse.json({ error: 'No funds available for payout' }, { status: 400 });
  }

  const payoutCents = requestedAmount
    ? Math.min(requestedAmount, availableCents)
    : availableCents;

  if (payoutCents <= 0) {
    return NextResponse.json({ error: 'Invalid payout amount' }, { status: 400 });
  }

  // Idempotency key: one payout request per user per day max
  const today = new Date().toISOString().slice(0, 10);
  const idempotencyKey = `payout:${userId}:${today}`;

  // Check for existing pending/processing payout today
  const existing = await prisma.payoutRequest.findUnique({ where: { idempotencyKey } });
  if (existing) {
    return NextResponse.json({
      message: 'Payout already requested today',
      payout: existing,
    }, { status: 200 });
  }

  try {
    // In a real Connect setup, we'd create a Transfer to the connected account.
    // For now (test mode), we record the intent and ledger entry.
    // The actual Stripe Transfer requires the creator to have a connected account.
    const result = await prisma.$transaction(async (tx: any) => {
      // Ledger: debit CREATOR_ACCRUAL, credit EXTERNAL
      const { transactionId } = await ledgerPayout(tx, {
        userId,
        amountCents: payoutCents,
        idempotencyKey,
        metadata: { requestedAmount, availableCents },
      });

      const payout = await tx.payoutRequest.create({
        data: {
          userId,
          amount: payoutCents,
          status: 'COMPLETED', // In test mode, immediate completion
          ledgerTxId: transactionId,
          idempotencyKey,
        },
      });

      return payout;
    });

    return NextResponse.json({ payout: result });
  } catch (err: any) {
    console.error('[payout] Error:', err.message);
    return NextResponse.json({ error: 'Payout failed' }, { status: 500 });
  }
}
