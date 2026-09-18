export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isRealMoneyCompetitionEnabled, FEATURE_DISABLED } from '@/lib/flags';
import { appendMatchEvent, isExpired } from '@/lib/competition';

/**
 * POST /api/competition/submit-score
 * Body: { matchId, score }
 * Submit a score for an ACTIVE match. Server-authoritative.
 */
export async function POST(req: NextRequest) {
  if (!isRealMoneyCompetitionEnabled()) {
    return NextResponse.json(FEATURE_DISABLED, { status: 403 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const userId = session.user.id;

  const body = await req.json().catch(() => ({}));
  const { matchId, score } = body as { matchId?: string; score?: number };
  if (!matchId) return NextResponse.json({ error: 'matchId is required' }, { status: 400 });
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 0) {
    return NextResponse.json({ error: 'score must be a non-negative integer' }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const match = await tx.competitionMatch.findUnique({ where: { id: matchId } });
      if (!match) throw Object.assign(new Error('Match not found'), { httpStatus: 404 });
      if (match.status !== 'ACTIVE') throw Object.assign(new Error('Match is not active'), { httpStatus: 409 });

      // Check expiry for score-duels
      if (isExpired(match.expiresAt)) {
        throw Object.assign(new Error('Match has expired'), { httpStatus: 410 });
      }

      const isP1 = match.player1Id === userId;
      const isP2 = match.player2Id === userId;
      if (!isP1 && !isP2) throw Object.assign(new Error('You are not a participant'), { httpStatus: 403 });

      // Check if already submitted
      if (isP1 && match.player1Score !== null) throw Object.assign(new Error('Score already submitted'), { httpStatus: 409 });
      if (isP2 && match.player2Score !== null) throw Object.assign(new Error('Score already submitted'), { httpStatus: 409 });

      const updateData: any = {};
      if (isP1) {
        updateData.player1Score = score;
        updateData.player1SubmittedAt = new Date();
      } else {
        updateData.player2Score = score;
        updateData.player2SubmittedAt = new Date();
      }

      // Check if both scores are now in
      const otherScoreExists = isP1 ? match.player2Score !== null : match.player1Score !== null;
      if (otherScoreExists) {
        updateData.status = 'SCORED';
      }

      const updated = await tx.competitionMatch.update({
        where: { id: matchId },
        data: updateData,
      });

      await appendMatchEvent(tx, matchId, 'SCORE_SUBMITTED', userId, {
        player: isP1 ? 'p1' : 'p2',
        score,
        bothScored: otherScoreExists,
      });

      return updated;
    });

    return NextResponse.json({
      matchId: result.id,
      status: result.status,
      yourScore: result.player1Id === userId ? result.player1Score : result.player2Score,
    });
  } catch (err: any) {
    const httpStatus = err?.httpStatus;
    if (httpStatus) return NextResponse.json({ error: err.message }, { status: httpStatus });
    console.error('[competition/submit-score]', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
