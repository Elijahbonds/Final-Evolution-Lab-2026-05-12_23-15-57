export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isRealMoneyCompetitionEnabled, FEATURE_DISABLED } from '@/lib/flags';
import { appendMatchEvent } from '@/lib/competition';
import { ledgerEscrowRefund } from '@/lib/stripe-helpers';

/**
 * POST /api/competition/void
 * Body: { matchId }
 * Admin voids a match (dispute resolution, tie, or expired). Refunds all
 * escrowed entry fees back to both players.
 */
export async function POST(req: NextRequest) {
  if (!isRealMoneyCompetitionEnabled()) {
    return NextResponse.json(FEATURE_DISABLED, { status: 403 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Only admin can void
  const caller = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  if (caller?.role !== 'admin') {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { matchId } = body as { matchId?: string };
  if (!matchId) return NextResponse.json({ error: 'matchId is required' }, { status: 400 });

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const match = await tx.competitionMatch.findUnique({ where: { id: matchId } });
      if (!match) throw Object.assign(new Error('Match not found'), { httpStatus: 404 });

      if (['SETTLED', 'VOIDED'].includes(match.status)) {
        throw Object.assign(new Error('Match already finalized'), { httpStatus: 409 });
      }

      // Refund player 1
      const refund1 = await ledgerEscrowRefund(tx, {
        userId: match.player1Id,
        amountCents: match.entryFeeCents,
        matchId: match.id,
        idempotencyKey: `escrow-refund:${match.id}:p1`,
      });

      // Refund player 2 if joined
      let refund2TxId: string | null = null;
      if (match.player2Id) {
        const r2 = await ledgerEscrowRefund(tx, {
          userId: match.player2Id,
          amountCents: match.entryFeeCents,
          matchId: match.id,
          idempotencyKey: `escrow-refund:${match.id}:p2`,
        });
        refund2TxId = r2.transactionId;
      }

      const updated = await tx.competitionMatch.update({
        where: { id: matchId },
        data: {
          status: 'VOIDED',
          refundTxId: refund1.transactionId,
        },
      });

      await appendMatchEvent(tx, matchId, 'VOIDED', session.user.id, {
        refund1TxId: refund1.transactionId,
        refund2TxId,
      });

      return updated;
    });

    return NextResponse.json({ matchId: result.id, status: result.status });
  } catch (err: any) {
    const httpStatus = err?.httpStatus;
    if (httpStatus) return NextResponse.json({ error: err.message }, { status: httpStatus });
    console.error('[competition/void]', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
