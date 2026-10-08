export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { arenaLockEntry, appendMatchEvent, ArenaError, arenaModeKey, arenaExpiry } from '@/lib/arena';
import { recordServerEvent } from '@/lib/analytics-server';
import { isStakingPaused, stakingPausedDetail, STAKING_PAUSED_CODE, STAKING_PAUSED_STATUS } from '@/lib/stakingPause';
import { isExpired } from '@/lib/arena-reclaim';

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
      // MUSIC-SUITE P6 (2026-09-26, owner decision #30): a posted duel past its expiresAt is the reclaim sweep's to refund
      // (lib/arena-reclaim.ts), not a challenge — accepting it would lock the joiner's stake on a duel that is refunded at
      // the next sweep with no time left to play. Refused before the lock; the lobby no longer lists it as open.
      if (isExpired(match.expiresAt, new Date())) throw new ArenaError('EXPIRED', 'This duel has expired and can no longer be accepted.', 409);

      const feeLc = match.entryFeeCents;
      await arenaLockEntry(tx, { userId, matchId: match.id, feeLc });
      // MUSIC-SUITE P6 FIX PASS (2026-09-26): THE DEADLINE STARTS AGAIN AT THE JOIN. It was left at create + 48 h, and the
      // creator cannot play before a join (music-attempt and submit-score answer 409 WAITING_OPPONENT) — so a joiner at
      // hour 47:50 played a 66 s set at once, and at hour 48 the sweep paid them the pot by forfeit: the creator never had a
      // window to play. Before P6 nothing expired, so this only bit once the sweep existed (all modes, #30). Both players
      // now get the whole ARENA_EXPIRY_HOURS from the moment the duel is accepted (the open-post window stays 48 h from
      // create: the lobby lists it, and join refuses it, by the old deadline above). OWNER CALL #30 did not say; this is
      // the reading that gives the creator a window (flagged in the phase report).
      const expiresAt = arenaExpiry();
      const updated = await tx.competitionMatch.update({
        where: { id: matchId },
        data: { player2Id: userId, status: 'ACTIVE', expiresAt },
      });
      await appendMatchEvent(tx, matchId, 'JOINED', userId, { player: 'p2', feeLc, expiresAt: expiresAt.toISOString() });
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
