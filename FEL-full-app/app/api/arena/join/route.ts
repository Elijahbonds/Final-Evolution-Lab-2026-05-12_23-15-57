export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { arenaLockEntry, appendMatchEvent, ArenaError, arenaModeKey } from '@/lib/arena';
import { recordServerEvent } from '@/lib/analytics-server';
import { isStakingPaused, stakingPausedDetail, STAKING_PAUSED_CODE, STAKING_PAUSED_STATUS } from '@/lib/stakingPause';

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
      // MUSIC-SUITE P1 (2026-09-25, owner decision #9: "pause staking both now"): accepting a duel puts a NEW stake up,
      // so a duel on a paused mode (music, dance — a stored 'musicAcademy' too) that was posted before the pause can no
      // longer be joined. Refused before the lock: nothing is written and the joiner's Lab Credits never move. The
      // creator's stake is not stranded — /api/arena/cancel refunds a WAITING duel with no mode check, and the lobby
      // tells them so (components/arena-view.tsx).
      if (isStakingPaused(match.mode)) throw new ArenaError(STAKING_PAUSED_CODE, stakingPausedDetail(match.mode), STAKING_PAUSED_STATUS);

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

    // HOTFIX (2026-09-24): a duel stored as 'musicAcademy' answers and logs as 'music', as the lobby and the duel page do.
    const mode = arenaModeKey(result.mode);
    recordServerEvent({ name: 'arena_match_joined', props: { matchId: result.id, mode }, userId }).catch(() => {});

    return NextResponse.json({ ok: true, matchId: result.id, mode, seed: result.seed, status: result.status });
  } catch (err: any) {
    if (err instanceof ArenaError) {
      return NextResponse.json({ error: err.code, detail: err.message }, { status: err.httpStatus });
    }
    console.error('[arena/join]', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
