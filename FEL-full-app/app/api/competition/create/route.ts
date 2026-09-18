export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isRealMoneyCompetitionEnabled, FEATURE_DISABLED } from '@/lib/flags';
import {
  checkCompetitionEligibility,
  validateEntryFee,
  generateMatchSeed,
  DEFAULT_RAKE_PERCENT,
  scoreDuelExpiry,
  appendMatchEvent,
} from '@/lib/competition';
import { ledgerEscrowLock } from '@/lib/stripe-helpers';

/**
 * POST /api/competition/create
 * Body: { mode, matchType, entryFeeCents }
 * Creates a new competition match and locks the creator's entry fee into escrow.
 */
export async function POST(req: NextRequest) {
  if (!isRealMoneyCompetitionEnabled()) {
    return NextResponse.json(FEATURE_DISABLED, { status: 403 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const userId = session.user.id;

  const body = await req.json().catch(() => ({}));
  const { mode, matchType = 'H2H', entryFeeCents } = body as {
    mode?: string;
    matchType?: string;
    entryFeeCents?: number;
  };

  if (!mode) return NextResponse.json({ error: 'mode is required' }, { status: 400 });
  if (!['H2H', 'SCORE_DUEL', 'GHOST_DUEL'].includes(matchType)) {
    return NextResponse.json({ error: 'Invalid matchType' }, { status: 400 });
  }
  if (typeof entryFeeCents !== 'number') {
    return NextResponse.json({ error: 'entryFeeCents is required' }, { status: 400 });
  }

  const feeCheck = validateEntryFee(entryFeeCents);
  if (!feeCheck.allowed) return NextResponse.json(feeCheck, { status: 400 });

  // Eligibility gates
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { dobYear: true, kycStatus: true, selfExcludedAt: true, declaredState: true },
  });
  if (!user) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  const eligibility = checkCompetitionEligibility(user);
  if (!eligibility.allowed) return NextResponse.json(eligibility, { status: 403 });

  const seed = generateMatchSeed();
  const expiresAt = matchType === 'SCORE_DUEL' ? scoreDuelExpiry() : null;

  try {
    const match = await prisma.$transaction(async (tx: any) => {
      const m = await tx.competitionMatch.create({
        data: {
          mode,
          matchType,
          status: 'WAITING',
          entryFeeCents,
          rakePercent: DEFAULT_RAKE_PERCENT,
          seed,
          player1Id: userId,
          expiresAt,
        },
      });

      // Lock creator's entry fee into escrow
      const escrowResult = await ledgerEscrowLock(tx, {
        userId,
        amountCents: entryFeeCents,
        matchId: m.id,
        idempotencyKey: `escrow-create:${m.id}:p1`,
      });

      await tx.competitionMatch.update({
        where: { id: m.id },
        data: { escrowTxId: escrowResult.transactionId },
      });

      await appendMatchEvent(tx, m.id, 'CREATED', userId, {
        mode, matchType, entryFeeCents, seed,
      });

      await appendMatchEvent(tx, m.id, 'ESCROW_LOCKED', userId, {
        player: 'p1', amountCents: entryFeeCents,
      });

      return { ...m, escrowTxId: escrowResult.transactionId };
    });

    return NextResponse.json({ matchId: match.id, status: match.status, seed: match.seed, expiresAt });
  } catch (err: any) {
    if (err?.code === 'NEGATIVE_BALANCE') {
      return NextResponse.json({ error: 'insufficient_funds', detail: 'Not enough USD balance to cover entry fee.' }, { status: 402 });
    }
    console.error('[competition/create]', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
