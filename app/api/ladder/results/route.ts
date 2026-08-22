export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ledgerLadderPrize } from '@/lib/stripe-helpers';
import { postLc } from '@/lib/ledger';

// Prize distribution: 1st 50%, 2nd 30%, 3rd 20%  // TUNE(elijah)
const PRIZE_SPLITS = [0.5, 0.3, 0.2];

/**
 * POST /api/ladder/results
 * Finalizes the most recent un-finalized ladder season.
 * Awards LC prizes to top 3 via the ledger.
 * Admin-only (or automated cron).
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Only admin can finalize
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  if (user?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  // Find the most recent un-finalized season
  const season = await prisma.ladderSeason.findFirst({
    where: { finalized: false },
    orderBy: { weekStart: 'desc' },
    include: {
      entries: {
        orderBy: { bestScore: 'desc' },
        take: 3,
      },
    },
  });

  if (!season) return NextResponse.json({ error: 'No open season to finalize' }, { status: 404 });
  if (season.entries.length === 0) {
    await prisma.ladderSeason.update({ where: { id: season.id }, data: { finalized: true } });
    return NextResponse.json({ message: 'Season finalized with no entries' });
  }

  const prizePool = season.prizePool;
  const winners: { rank: number; userId: string; prize: number }[] = [];

  await prisma.$transaction(async (tx: any) => {
    for (let i = 0; i < Math.min(season.entries.length, PRIZE_SPLITS.length); i++) {
      const entry = season.entries[i];
      const prize = Math.round(prizePool * PRIZE_SPLITS[i]);
      if (prize <= 0) continue;

      const idempotencyKey = `ladder-prize:${season.id}:${entry.userId}:${i}`;

      // Award LC via the unified funnel (CreditLedger compat + double-entry)
      // First update PlayerProfile.labCredits
      await tx.playerProfile.update({
        where: { userId: entry.userId },
        data: { labCredits: { increment: prize } },
      });
      await postLc(tx, {
        userId: entry.userId,
        amount: prize,
        reason: 'LADDER_PRIZE',
        dedupeKey: idempotencyKey,
        metadata: { seasonId: season.id, rank: i + 1, mode: season.mode },
      });

      winners.push({ rank: i + 1, userId: entry.userId, prize });
    }

    await tx.ladderSeason.update({ where: { id: season.id }, data: { finalized: true } });
  });

  return NextResponse.json({
    message: 'Season finalized',
    seasonId: season.id,
    winners,
  });
}

/**
 * GET /api/ladder/results — past finalized seasons
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const seasons = await prisma.ladderSeason.findMany({
    where: { finalized: true },
    orderBy: { weekStart: 'desc' },
    take: 10,
    include: {
      entries: {
        orderBy: { bestScore: 'desc' },
        take: 3,
        include: { user: { select: { name: true } } },
      },
    },
  });

  return NextResponse.json({
    seasons: seasons.map((s: any) => ({
      id: s.id,
      weekStart: s.weekStart,
      mode: s.mode,
      prizePool: s.prizePool,
      winners: s.entries.map((e: any, i: number) => ({
        rank: i + 1,
        name: e.user.name || 'Anon',
        bestScore: e.bestScore,
        prize: Math.round(s.prizePool * (PRIZE_SPLITS[i] || 0)),
      })),
    })),
  });
}
