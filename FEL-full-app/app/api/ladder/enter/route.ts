export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { checkStakeScore, killSwitchOn, STAKE_REFUSAL_STATUS } from '@/lib/arena-score-integrity';

/** The weekly ladder's mode (a new week's season is created with it). */
const LADDER_MODE = 'dunk';

/**
 * POST /api/ladder/enter
 * Body: { score: number }
 * Free entry — records / updates the user's score in the current weekly ladder.
 *
 * HOTFIX (2026-09-24): the ladder pays Lab Credits (POST /api/ladder/results, LADDER_PRIZE) to the week's best scores,
 * and this took ANY non-negative number a signed-in caller sent — the Arena's hole on a prize pool. The score is now
 * held to the season's mode's ceiling (lib/arena-score-integrity.ts) before anything is written.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const body = await req.json();
  const score = typeof body.score === 'number' ? Math.round(body.score) : 0;
  if (!Number.isInteger(score) || score < 0) return NextResponse.json({ error: 'Invalid score' }, { status: 400 });

  // Get or create current week's season
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + mondayOffset));
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  let season = await prisma.ladderSeason.findUnique({ where: { weekStart } });

  // HOTFIX (2026-09-24): a score the season's mode cannot produce is refused before anything is written — the season
  // row included (a new week's season is a dunk ladder, as created below).
  const check = checkStakeScore({ mode: season?.mode ?? LADDER_MODE, score, killSwitch: killSwitchOn() });
  if (!check.ok) return NextResponse.json({ error: check.code, detail: check.detail }, { status: STAKE_REFUSAL_STATUS });

  if (!season) {
    season = await prisma.ladderSeason.create({
      data: { weekStart, weekEnd, mode: LADDER_MODE, prizePool: 500 },
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
