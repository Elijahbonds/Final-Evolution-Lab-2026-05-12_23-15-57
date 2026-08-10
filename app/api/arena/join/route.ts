export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { arenaLockEntry, appendMatchEvent, ArenaError } from '@/lib/arena';
import { recordServerEvent } from '@/lib/analytics-server';

/**
 * POST /api/arena/join
 * Body: { matchId }
 * Player 2 joins an open LC duel and locks their entry fee. Match goes ACTIVE.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const matchId = String(body?.matchId ?? '');
  if (!matchId) return NextResponse.json({ error: 'matchId is required' }, { status: 400 });

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const match = await tx.competitionMatch.findUnique({ where: { id: matchId } });
      if (!match) throw new ArenaError('NOT_FOUND', 'Match not found', 404);
      if (match.currency !== 'LC') throw new ArenaError('WRONG_BOOK', 'Not an Arena match', 400);
      if (match.status !== 'WAITING') throw new ArenaError('NOT_OPEN', 'This duel is no longer open to join.', 409);
      if (match.player1Id === userId) throw new ArenaError('OWN_MATCH', 'You cannot join your own duel.', 409);
      if (match.player2Id) throw new ArenaError('FULL', 'This duel is already full.', 409);

      const feeLc = match.entryFeeCents;
      await arenaLockEntry(tx, { userId, matchId: match.id, feeLc });
      const updated = await tx.competitionMatch.update({
        where: { id: matchId },
        data: { player2Id: userId, status: 'ACTIVE' },
      });
      await appendMatchEvent(tx, matchId, 'JOINED', userId, { player: 'p2', feeLc });
      await appendMatchEvent(tx, matchId, 'ESCROW_LOCKED', userId, { player: 'p2', feeLc });
      return updated;
    });

    recordServerEvent({ name: 'arena_match_joined', props: { matchId: result.id, mode: result.mode }, userId }).catch(() => {});

    return NextResponse.json({ ok: true, matchId: result.id, mode: result.mode, seed: result.seed, status: result.status });
  } catch (err: any) {
    if (err instanceof ArenaError) {
      return NextResponse.json({ error: err.code, detail: err.message }, { status: err.httpStatus });
    }
    console.error('[arena/join]', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
