export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { arenaRefund, appendMatchEvent, ArenaError } from '@/lib/arena';

/**
 * POST /api/arena/cancel
 * Body: { matchId }
 * The creator cancels an unfilled WAITING duel and is refunded their entry.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const matchId = String(body?.matchId ?? '');
  if (!matchId) return NextResponse.json({ error: 'matchId is required' }, { status: 400 });

  try {
    const updated = await prisma.$transaction(async (tx: any) => {
      const match = await tx.competitionMatch.findUnique({ where: { id: matchId } });
      if (!match) throw new ArenaError('NOT_FOUND', 'Match not found', 404);
      if (match.currency !== 'LC') throw new ArenaError('WRONG_BOOK', 'Not an Arena match', 400);
      if (match.player1Id !== userId) throw new ArenaError('NOT_OWNER', 'Only the creator can cancel this duel.', 403);
      if (match.status !== 'WAITING') throw new ArenaError('NOT_CANCELLABLE', 'This duel can no longer be cancelled.', 409);

      await arenaRefund(tx, { userId, matchId, feeLc: match.entryFeeCents });
      const u = await tx.competitionMatch.update({ where: { id: matchId }, data: { status: 'VOIDED' } });
      await appendMatchEvent(tx, matchId, 'REFUNDED', userId, { reason: 'cancelled', feeLc: match.entryFeeCents });
      return u;
    });

    return NextResponse.json({ ok: true, matchId: updated.id, status: updated.status });
  } catch (err: any) {
    if (err instanceof ArenaError) {
      return NextResponse.json({ error: err.code, detail: err.message }, { status: err.httpStatus });
    }
    console.error('[arena/cancel]', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
