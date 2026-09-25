export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  ARENA_RAKE_PERCENT,
  isArenaMode,
  arenaModeKey,
  validateArenaFee,
  generateMatchSeed,
  arenaExpiry,
  arenaLockEntry,
  appendMatchEvent,
  ArenaError,
} from '@/lib/arena';
import { recordServerEvent } from '@/lib/analytics-server';
import { isStakingPaused, stakingPausedDetail, STAKING_PAUSED_CODE, STAKING_PAUSED_STATUS } from '@/lib/stakingPause';

/**
 * POST /api/arena/create
 * Body: { mode, feeLc }
 * Opens a new LC skill-duel and locks the creator's entry fee.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  // HOTFIX (2026-09-24): a client still running old code may post 'musicAcademy'. The duel is stored under the key the
  // mode's sessions are saved under, because that is what the ghost draw and the lobby read.
  const mode = arenaModeKey(String(body?.mode ?? ''));
  const feeLc = Number(body?.feeLc);

  if (!isArenaMode(mode)) {
    return NextResponse.json({ error: 'invalid_mode', detail: 'That mode is not available in the Arena.' }, { status: 400 });
  }
  // MUSIC-SUITE P1 (2026-09-25, owner decision #9: "pause staking both now"): a posted duel on a paused mode (music,
  // dance) is refused here, before the transaction — no row, no event, no Lab Credits locked. lib/stakingPause.ts holds
  // the list; a duel posted before the pause is still cancelled and refunded by /api/arena/cancel.
  if (isStakingPaused(mode)) {
    return NextResponse.json({ error: STAKING_PAUSED_CODE, detail: stakingPausedDetail(mode) }, { status: STAKING_PAUSED_STATUS });
  }
  const feeCheck = validateArenaFee(feeLc);
  if (!feeCheck.ok) return NextResponse.json({ error: feeCheck.reason, detail: feeCheck.detail }, { status: 400 });

  try {
    const match = await prisma.$transaction(async (tx: any) => {
      const seed = generateMatchSeed();
      const m = await tx.competitionMatch.create({
        data: {
          mode,
          matchType: 'SCORE_DUEL',
          status: 'WAITING',
          currency: 'LC',
          entryFeeCents: feeLc, // LC units for Arena matches
          rakePercent: ARENA_RAKE_PERCENT,
          seed,
          player1Id: userId,
          expiresAt: arenaExpiry(),
        },
      });
      await arenaLockEntry(tx, { userId, matchId: m.id, feeLc });
      await appendMatchEvent(tx, m.id, 'CREATED', userId, { mode, feeLc, currency: 'LC', seed });
      await appendMatchEvent(tx, m.id, 'ESCROW_LOCKED', userId, { player: 'p1', feeLc });
      return m;
    });

    recordServerEvent({ name: 'arena_match_created', props: { matchId: match.id, mode, feeLc }, userId }).catch(() => {});

    return NextResponse.json({
      ok: true,
      matchId: match.id,
      mode: match.mode,
      seed: match.seed,
      status: match.status,
      feeLc,
    });
  } catch (err: any) {
    if (err instanceof ArenaError) {
      return NextResponse.json({ error: err.code, detail: err.message }, { status: err.httpStatus });
    }
    console.error('[arena/create]', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
