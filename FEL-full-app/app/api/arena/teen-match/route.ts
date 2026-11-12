export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isArenaMode, arenaModeKey, generateMatchSeed, arenaExpiry, appendMatchEvent, ArenaError } from '@/lib/arena';
import { ensureHouseRivals, pickHouseRival } from '@/lib/arena-rivals';
import { isMusicDuel } from '@/lib/arena-music';
import { MODE_INFO } from '@/lib/game-data';
import { recordServerEvent } from '@/lib/analytics-server';
import { isStakingPaused } from '@/lib/stakingPause';
import { isUnlistedMode } from '@/lib/unlisted-modes';
import { arenaBand } from '@/lib/age/arenaAgeBand';
import { TEEN_PRACTICE, TEEN_MAX_OPEN, teenPrizeLc, teenDailyCapLc, lockTeenAccount } from '@/lib/arena-teen';

/**
 * POST /api/arena/teen-match
 * Body: { mode }
 *
 * ARENA-AGE-1: the practice duel for a teen or unknown-age account (age read from the DB, never the request — T5). A
 * House Rival takes seat 2 (no human pairing — T4). Entry 0, house cut 0, no Lab Credits locked (T1). A win pays the
 * fixed server prize under the daily cap at /api/arena/submit-score (T2, T3). A verified adult is sent to Quick Match:
 * this route is not a free-prize door for adults. The open-duel limit is counted inside the create transaction, under
 * the account's User-row lock, so concurrent requests can't each see room for one more (Cyber v4 review C2).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { band } = await arenaBand(prisma as any, userId);
  if (band === 'adult') {
    return NextResponse.json({ error: 'use_quick_match', detail: 'Practice duels are for players under 18. Use Quick Match.' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const mode = arenaModeKey(String(body?.mode ?? ''));
  // Music duels run on the one-attempt house beat flow, which is built around an entry; not offered in practice yet.
  if (!isArenaMode(mode) || isUnlistedMode(mode) || isStakingPaused(mode) || isMusicDuel(mode)) {
    return NextResponse.json({ error: 'invalid_mode', detail: 'That game is not available for practice duels.' }, { status: 400 });
  }

  try {
    const houseIds = await ensureHouseRivals(prisma);
    const result = await prisma.$transaction(async (tx: any) => {
      await lockTeenAccount(tx, userId);
      const open = await tx.competitionMatch.count({
        where: { currency: 'LC', matchType: TEEN_PRACTICE, player1Id: userId, status: 'ACTIVE', player1Score: null, expiresAt: { gt: new Date() } },
      });
      if (open >= TEEN_MAX_OPEN) throw new ArenaError('TOO_MANY_OPEN', 'Finish one of your practice duels first.', 409);
      const seed = generateMatchSeed();
      const rival = pickHouseRival(seed);
      const rivalId = houseIds.get(rival.key);
      if (!rivalId) throw new ArenaError('HOUSE_UNAVAILABLE', 'No house rival is available right now.', 503);
      const m = await tx.competitionMatch.create({
        data: {
          mode,
          matchType: TEEN_PRACTICE,
          status: 'ACTIVE',
          currency: 'LC',
          entryFeeCents: 0,
          rakePercent: 0,
          seed,
          player1Id: userId,
          player2Id: rivalId,
          expiresAt: arenaExpiry(),
        },
      });
      // No arenaLockEntry: nothing is debited from either seat.
      await appendMatchEvent(tx, m.id, 'CREATED', userId, { mode, entry: 0, currency: 'LC', seed, teenPractice: true });
      await appendMatchEvent(tx, m.id, 'QUICK_MATCHED', null, { rival: rival.key, player: 'p2' });
      return { match: m, rival };
    });

    recordServerEvent({ name: 'arena_teen_match', props: { matchId: result.match.id, mode }, userId }).catch(() => {});

    return NextResponse.json({
      ok: true,
      matchId: result.match.id,
      mode: result.match.mode,
      seed: result.match.seed,
      status: result.match.status,
      entry: 0,
      prize: teenPrizeLc(),
      dailyCap: teenDailyCapLc(),
      rival: { name: result.rival.name, tagline: result.rival.tagline, house: true },
      href: MODE_INFO[mode]?.href ?? '/modes',
    });
  } catch (err: any) {
    if (err instanceof ArenaError) {
      return NextResponse.json({ error: err.code, detail: err.message }, { status: err.httpStatus });
    }
    console.error('[arena/teen-match]', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
