export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  ARENA_RAKE_PERCENT,
  isArenaMode,
  validateArenaFee,
  generateMatchSeed,
  arenaExpiry,
  arenaLockEntry,
  appendMatchEvent,
  ArenaError,
} from '@/lib/arena';
import { recordServerEvent } from '@/lib/analytics-server';

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
  const mode = String(body?.mode ?? '');
  const feeLc = Number(body?.feeLc);

  if (!isArenaMode(mode)) {
    return NextResponse.json({ error: 'invalid_mode', detail: 'That mode is not available in the Arena.' }, { status: 400 });
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
