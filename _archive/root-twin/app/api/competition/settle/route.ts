export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isRealMoneyCompetitionEnabled, FEATURE_DISABLED } from '@/lib/flags';
import { winnerPayout, rakeAmount, appendMatchEvent } from '@/lib/competition';
import { ledgerEscrowSettle } from '@/lib/stripe-helpers';

/**
 * POST /api/competition/settle
 * Body: { matchId }
 * Settle a SCORED match — pay the winner, take the rake.
 * Ties refund both players (handled by void route).
 */
export async function POST(req: NextRequest) {
  if (!isRealMoneyCompetitionEnabled()) {
    return NextResponse.json(FEATURE_DISABLED, { status: 403 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { matchId } = body as { matchId?: string };
  if (!matchId) return NextResponse.json({ error: 'matchId is required' }, { status: 400 });

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const match = await tx.competitionMatch.findUnique({ where: { id: matchId } });
      if (!match) throw Object.assign(new Error('Match not found'), { httpStatus: 404 });
      if (match.status !== 'SCORED') throw Object.assign(new Error('Match is not in SCORED state'), { httpStatus: 409 });
      if (match.player1Score === null || match.player2Score === null) {
        throw Object.assign(new Error('Both scores required'), { httpStatus: 409 });
      }

      // Determine winner (higher score wins)
      let winnerId: string;
      if (match.player1Score > match.player2Score) {
        winnerId = match.player1Id;
      } else if (match.player2Score > match.player1Score) {
        winnerId = match.player2Id;
      } else {
        // Tie — cannot settle, must void/refund
        throw Object.assign(new Error('Tied match must be voided, not settled'), { httpStatus: 409 });
      }

      const payout = winnerPayout(match.entryFeeCents, match.rakePercent);
      const rake = rakeAmount(match.entryFeeCents, match.rakePercent);

      const settleResult = await ledgerEscrowSettle(tx, {
        winnerId,
        matchId: match.id,
        winnerPayoutCents: payout,
        rakeCents: rake,
        idempotencyKey: `escrow-settle:${match.id}`,
      });

      const updated = await tx.competitionMatch.update({
        where: { id: matchId },
        data: {
          status: 'SETTLED',
          winnerId,
          settleTxId: settleResult.transactionId,
        },
      });

      await appendMatchEvent(tx, matchId, 'SETTLED', null, {
        winnerId,
        payoutCents: payout,
        rakeCents: rake,
      });

      return updated;
    });

    return NextResponse.json({
      matchId: result.id,
      status: result.status,
      winnerId: result.winnerId,
    });
  } catch (err: any) {
    const httpStatus = err?.httpStatus;
    if (httpStatus) return NextResponse.json({ error: err.message }, { status: httpStatus });
    console.error('[competition/settle]', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
