export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isRealMoneyCompetitionEnabled, FEATURE_DISABLED } from '@/lib/flags';
import { checkCompetitionEligibility, appendMatchEvent } from '@/lib/competition';
import { ledgerEscrowLock } from '@/lib/stripe-helpers';

/**
 * POST /api/competition/join
 * Body: { matchId }
 * Player 2 joins a WAITING match. Locks their entry fee into escrow.
 */
export async function POST(req: NextRequest) {
  if (!isRealMoneyCompetitionEnabled()) {
    return NextResponse.json(FEATURE_DISABLED, { status: 403 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const userId = session.user.id;

  const body = await req.json().catch(() => ({}));
  const { matchId } = body as { matchId?: string };
  if (!matchId) return NextResponse.json({ error: 'matchId is required' }, { status: 400 });

  // Eligibility gates
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { dobYear: true, kycStatus: true, selfExcludedAt: true, declaredState: true },
  });
  if (!user) return NextResponse.json({ error: 'user not found' }, { status: 404 });
  const eligibility = checkCompetitionEligibility(user);
  if (!eligibility.allowed) return NextResponse.json(eligibility, { status: 403 });

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const match = await tx.competitionMatch.findUnique({ where: { id: matchId } });
      if (!match) throw Object.assign(new Error('Match not found'), { httpStatus: 404 });
      if (match.status !== 'WAITING') throw Object.assign(new Error('Match is not open for joining'), { httpStatus: 409 });
      if (match.player1Id === userId) throw Object.assign(new Error('Cannot join your own match'), { httpStatus: 409 });
      if (match.player2Id) throw Object.assign(new Error('Match is already full'), { httpStatus: 409 });

      // Lock player 2's entry fee
      await ledgerEscrowLock(tx, {
        userId,
        amountCents: match.entryFeeCents,
        matchId: match.id,
        idempotencyKey: `escrow-join:${match.id}:p2`,
      });

      const updated = await tx.competitionMatch.update({
        where: { id: matchId },
        data: { player2Id: userId, status: 'ACTIVE' },
      });

      await appendMatchEvent(tx, matchId, 'JOINED', userId, { player: 'p2', amountCents: match.entryFeeCents });
      await appendMatchEvent(tx, matchId, 'ESCROW_LOCKED', userId, { player: 'p2', amountCents: match.entryFeeCents });

      return updated;
    });

    return NextResponse.json({ matchId: result.id, status: result.status, seed: result.seed });
  } catch (err: any) {
    if (err?.code === 'NEGATIVE_BALANCE') {
      return NextResponse.json({ error: 'insufficient_funds' }, { status: 402 });
    }
    const httpStatus = err?.httpStatus;
    if (httpStatus) return NextResponse.json({ error: err.message }, { status: httpStatus });
    console.error('[competition/join]', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
