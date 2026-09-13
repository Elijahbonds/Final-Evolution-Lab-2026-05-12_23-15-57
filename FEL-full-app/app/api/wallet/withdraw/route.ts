export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isRealMoneyCompetitionEnabled, FEATURE_DISABLED } from '@/lib/flags';
import { MIN_WITHDRAW_CENTS, MAX_WITHDRAW_CENTS } from '@/lib/competition';
import { ledgerWalletWithdraw } from '@/lib/stripe-helpers';
import { randomUUID } from 'crypto';
import { canWithdraw } from '@/lib/competition/payoutGate';
import { getBalance } from '@/lib/ledger';

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

  // THE GATE THAT WAS MISSING (2026-09-13). This route checked the feature flag and the amount bounds and
  // NOTHING ELSE — no identity verification, no self-exclusion check, no age check, all of which are applied
  // before a player ENTERS a money match and none of which were applied before money LEFT. That asymmetry is
  // backwards: entry risk is the platform's, but the identity of a payout recipient is the leg that carries
  // the obligations. See lib/competition/payoutGate.ts.
  const gateUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { kycStatus: true, selfExcludedAt: true, dobYear: true },
  });
  if (!gateUser) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const balanceCents = await getBalance(prisma, { type: 'USER_WALLET', currency: 'USD_CENTS', userId });
  const gate = canWithdraw(
    { ...gateUser, balanceCents },
    amountCents,
    { min: MIN_WITHDRAW_CENTS, max: MAX_WITHDRAW_CENTS },
  );
  if (!gate.allowed) {
    // 403 rather than 400: this is not a malformed request, it is a refused one, and the body carries the
    // reason so the client can route the player to the step that fixes it
    return NextResponse.json(
      { error: gate.reason, detail: gate.message, actionable: gate.actionable },
      { status: 403 },
    );
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
