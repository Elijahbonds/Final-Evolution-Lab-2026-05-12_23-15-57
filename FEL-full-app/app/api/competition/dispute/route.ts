export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isRealMoneyCompetitionEnabled, FEATURE_DISABLED } from '@/lib/flags';
import { appendMatchEvent } from '@/lib/competition';

/**
 * POST /api/competition/dispute
 * Body: { matchId, reason }
 * A participant disputes a SCORED match. Match moves to DISPUTED status
 * for admin/human review.
 */
export async function POST(req: NextRequest) {
  if (!isRealMoneyCompetitionEnabled()) {
    return NextResponse.json(FEATURE_DISABLED, { status: 403 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const userId = session.user.id;

  const body = await req.json().catch(() => ({}));
  const { matchId, reason } = body as { matchId?: string; reason?: string };
  if (!matchId) return NextResponse.json({ error: 'matchId is required' }, { status: 400 });
  if (!reason || reason.trim().length < 10) {
    return NextResponse.json({ error: 'reason must be at least 10 characters' }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const match = await tx.competitionMatch.findUnique({ where: { id: matchId } });
      if (!match) throw Object.assign(new Error('Match not found'), { httpStatus: 404 });

      // Can dispute SCORED or ACTIVE matches
      if (!['SCORED', 'ACTIVE'].includes(match.status)) {
        throw Object.assign(new Error('Match cannot be disputed in current state'), { httpStatus: 409 });
      }

      const isParticipant = match.player1Id === userId || match.player2Id === userId;
      if (!isParticipant) throw Object.assign(new Error('Only participants can dispute'), { httpStatus: 403 });

      const updated = await tx.competitionMatch.update({
        where: { id: matchId },
        data: {
          status: 'DISPUTED',
          disputeReason: reason.trim(),
          disputedAt: new Date(),
          disputedBy: userId,
        },
      });

      await appendMatchEvent(tx, matchId, 'DISPUTED', userId, { reason: reason.trim() });

      return updated;
    });

    return NextResponse.json({ matchId: result.id, status: result.status });
  } catch (err: any) {
    const httpStatus = err?.httpStatus;
    if (httpStatus) return NextResponse.json({ error: err.message }, { status: httpStatus });
    console.error('[competition/dispute]', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
