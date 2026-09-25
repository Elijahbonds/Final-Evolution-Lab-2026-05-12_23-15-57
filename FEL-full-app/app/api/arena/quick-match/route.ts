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
import { ensureHouseRivals, pickHouseRival } from '@/lib/arena-rivals';
import { MODE_INFO } from '@/lib/game-data';
import { recordServerEvent } from '@/lib/analytics-server';

/**
 * POST /api/arena/quick-match
 * Body: { mode, feeLc }
 *
 * Triumph-style instant match: opens a duel AND fills the other seat with a
 * House Rival in one step, so the player goes straight from the lobby into
 * the venue — no waiting for a second human. The match is a GHOST_DUEL
 * (ACTIVE from birth): the rival's score is drawn server-side from the match
 * seed when the player submits (see /api/arena/submit-score), banded to the
 * player's own measured level in the mode, never to their submitted score.
 *
 * The house stakes the same fee from its treasury through the same lock
 * funnel — the pot, the rake and the payout are the standard arena math.
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
  const feeCheck = validateArenaFee(feeLc);
  if (!feeCheck.ok) return NextResponse.json({ error: feeCheck.reason, detail: feeCheck.detail }, { status: 400 });

  try {
    // House roster lives outside the match transaction (find-or-create).
    const houseIds = await ensureHouseRivals(prisma);

    const result = await prisma.$transaction(async (tx: any) => {
      const seed = generateMatchSeed();
      const rival = pickHouseRival(seed);
      const rivalId = houseIds.get(rival.key);
      if (!rivalId) throw new ArenaError('HOUSE_UNAVAILABLE', 'No house rival is available right now.', 503);

      const m = await tx.competitionMatch.create({
        data: {
          mode,
          matchType: 'GHOST_DUEL',
          status: 'ACTIVE',
          currency: 'LC',
          entryFeeCents: feeLc,
          rakePercent: ARENA_RAKE_PERCENT,
          seed,
          player1Id: userId,
          player2Id: rivalId,
          expiresAt: arenaExpiry(),
        },
      });
      // Both seats stake through the same funnel: player first, then house.
      await arenaLockEntry(tx, { userId, matchId: m.id, feeLc });
      await arenaLockEntry(tx, { userId: rivalId, matchId: m.id, feeLc });
      await appendMatchEvent(tx, m.id, 'CREATED', userId, { mode, feeLc, currency: 'LC', seed, quickMatch: true });
      await appendMatchEvent(tx, m.id, 'QUICK_MATCHED', null, { rival: rival.key, player: 'p2' });
      await appendMatchEvent(tx, m.id, 'ESCROW_LOCKED', userId, { player: 'p1', feeLc });
      await appendMatchEvent(tx, m.id, 'ESCROW_LOCKED', rivalId, { player: 'p2', feeLc });
      return { match: m, rival };
    });

    recordServerEvent({ name: 'arena_quick_match', props: { matchId: result.match.id, mode, feeLc }, userId }).catch(() => {});

    return NextResponse.json({
      ok: true,
      matchId: result.match.id,
      mode: result.match.mode,
      seed: result.match.seed,
      status: result.match.status,
      feeLc,
      rival: { name: result.rival.name, tagline: result.rival.tagline, house: true },
      href: MODE_INFO[mode]?.href ?? '/modes',
    });
  } catch (err: any) {
    if (err instanceof ArenaError) {
      return NextResponse.json({ error: err.code, detail: err.message }, { status: err.httpStatus });
    }
    console.error('[arena/quick-match]', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
