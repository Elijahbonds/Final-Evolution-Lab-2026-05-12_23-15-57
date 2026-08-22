export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * POST /api/ladder/enter
 * Body: { score: number }
 * Free entry — records / updates the user's score in the current weekly ladder.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const body = await req.json();
  const score = typeof body.score === 'number' ? Math.round(body.score) : 0;
  if (score < 0) return NextResponse.json({ error: 'Invalid score' }, { status: 400 });

  // Get or create current week's season
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + mondayOffset));
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  let season = await prisma.ladderSeason.findUnique({ where: { weekStart } });
  if (!season) {
    season = await prisma.ladderSeason.create({
      data: { weekStart, weekEnd, mode: 'dunk', prizePool: 500 },
    });
  }

  if (season.finalized) {
    return NextResponse.json({ error: 'This week\'s ladder has been finalized' }, { status: 400 });
  }

  // Upsert entry: keep best score, increment attempts
  const entry = await prisma.ladderEntry.upsert({
    where: { seasonId_userId: { seasonId: season.id, userId } },
    update: {
      attempts: { increment: 1 },
      score,
      bestScore: { set: undefined }, // we handle below
    },
    create: {
      seasonId: season.id,
      userId,
      score,
      bestScore: score,
      attempts: 1,
    },
  });

  // Update bestScore if this attempt is higher
  if (score > entry.bestScore) {
    await prisma.ladderEntry.update({
      where: { id: entry.id },
      data: { bestScore: score },
    });
  }

  return NextResponse.json({
    seasonId: season.id,
    weekStart: season.weekStart,
    bestScore: Math.max(score, entry.bestScore),
    attempts: entry.attempts,
  });
}

/**
 * GET /api/ladder/enter — leaderboard for current week
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const now = new Date();
  const day = now.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + mondayOffset));

  const season = await prisma.ladderSeason.findUnique({
    where: { weekStart },
    include: {
      entries: {
        orderBy: { bestScore: 'desc' },
        take: 50,
        include: { user: { select: { name: true, email: true } } },
      },
    },
  });

  if (!season) return NextResponse.json({ season: null, entries: [] });

  return NextResponse.json({
    season: {
      id: season.id,
      weekStart: season.weekStart,
      weekEnd: season.weekEnd,
      mode: season.mode,
      prizePool: season.prizePool,
      finalized: season.finalized,
    },
    entries: season.entries.map((e: any, i: number) => ({
      rank: i + 1,
      userId: e.userId,
      name: e.user.name || e.user.email?.split('@')[0],
      bestScore: e.bestScore,
      attempts: e.attempts,
    })),
  });
}
