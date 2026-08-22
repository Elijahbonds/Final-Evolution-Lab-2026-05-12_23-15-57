export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  resolveArena,
  arenaPayWinner,
  arenaRefund,
  appendMatchEvent,
  ArenaError,
} from '@/lib/arena';
import { recordServerEvent } from '@/lib/analytics-server';

/**
 * POST /api/arena/submit-score
 * Body: { matchId, score }
 * Records the caller's score for their Arena duel. When BOTH players have
 * submitted, the duel auto-settles atomically: higher score takes the pot
 * (minus rake); a tie refunds both players.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const matchId = String(body?.matchId ?? '');
  const score = Number(body?.score);
  if (!matchId) return NextResponse.json({ error: 'matchId is required' }, { status: 400 });
  if (!Number.isInteger(score) || score < 0) {
    return NextResponse.json({ error: 'score must be a non-negative integer' }, { status: 400 });
  }

  try {
    const outcome = await prisma.$transaction(async (tx: any) => {
      const match = await tx.competitionMatch.findUnique({ where: { id: matchId } });
      if (!match) throw new ArenaError('NOT_FOUND', 'Match not found', 404);
      if (match.currency !== 'LC') throw new ArenaError('WRONG_BOOK', 'Not an Arena match', 400);

      const isP1 = match.player1Id === userId;
      const isP2 = match.player2Id === userId;
      if (!isP1 && !isP2) throw new ArenaError('NOT_A_PLAYER', 'You are not in this duel.', 403);
      if (!['ACTIVE', 'WAITING'].includes(match.status)) {
        throw new ArenaError('NOT_SUBMITTABLE', 'This duel is no longer accepting scores.', 409);
      }
      // A duel needs both players before scores count.
      if (!match.player2Id) throw new ArenaError('WAITING_OPPONENT', 'Waiting for an opponent to join.', 409);

      // Idempotent per player: first submission wins, later ones are ignored.
      const alreadySubmitted = isP1 ? match.player1Score !== null : match.player2Score !== null;
      const data: any = {};
      if (isP1 && !alreadySubmitted) {
        data.player1Score = score;
        data.player1SubmittedAt = new Date();
      } else if (isP2 && !alreadySubmitted) {
        data.player2Score = score;
        data.player2SubmittedAt = new Date();
      }
      if (Object.keys(data).length) {
        await tx.competitionMatch.update({ where: { id: matchId }, data });
        await appendMatchEvent(tx, matchId, 'SCORE_SUBMITTED', userId, { player: isP1 ? 'p1' : 'p2', score });
      }

      const p1Score = isP1 && !alreadySubmitted ? score : match.player1Score;
      const p2Score = isP2 && !alreadySubmitted ? score : match.player2Score;

      // Not both in yet — hold.
      if (p1Score === null || p2Score === null || p1Score === undefined || p2Score === undefined) {
        return { settled: false, status: 'ACTIVE', mySubmitted: true };
      }

      // Both scores are in — resolve + settle.
      const feeLc = match.entryFeeCents;
      const result = resolveArena(p1Score, p2Score);

      if (result === 'tie') {
        await arenaRefund(tx, { userId: match.player1Id, matchId, feeLc });
        await arenaRefund(tx, { userId: match.player2Id, matchId, feeLc });
        const updated = await tx.competitionMatch.update({
          where: { id: matchId },
          data: { status: 'VOIDED' },
        });
        await appendMatchEvent(tx, matchId, 'REFUNDED', null, { reason: 'tie', feeLc });
        return { settled: true, status: updated.status, result: 'tie', p1Score, p2Score, feeLc };
      }

      const winnerId = result === 'p1' ? match.player1Id : match.player2Id;
      // mark SCORED, then pay + SETTLE within the same tx
      const { payout, rake } = await arenaPayWinner(tx, {
        winnerId,
        matchId,
        feeLc,
        rakePercent: match.rakePercent,
      });
      const updated = await tx.competitionMatch.update({
        where: { id: matchId },
        data: { status: 'SETTLED', winnerId },
      });
      await appendMatchEvent(tx, matchId, 'SETTLED', null, { winnerId, payout, rake, p1Score, p2Score });

      return {
        settled: true,
        status: updated.status,
        result,
        winnerId,
        iWon: winnerId === userId,
        payout,
        rake,
        p1Score,
        p2Score,
        feeLc,
      };
    });

    if ((outcome as any).settled) {
      recordServerEvent({ name: 'arena_match_settled', props: { matchId, status: (outcome as any).status }, userId }).catch(() => {});
    }

    return NextResponse.json({ ok: true, ...outcome });
  } catch (err: any) {
    if (err instanceof ArenaError) {
      return NextResponse.json({ error: err.code, detail: err.message }, { status: err.httpStatus });
    }
    console.error('[arena/submit-score]', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
