export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * GET /api/mirror-triumph?mode=dunkContest
 * Returns the user's Mirror Triumph record for a given mode.
 *
 * POST /api/mirror-triumph
 * Body: { mode, score }
 * Submit a score. If it beats the user's bestScore, update the streak.
 * Mirror Triumph is FREE — no flag gate, no money involved.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const mode = req.nextUrl.searchParams.get('mode');
  if (!mode) return NextResponse.json({ error: 'mode query param required' }, { status: 400 });

  const record = await prisma.mirrorTriumph.findUnique({
    where: { userId_mode: { userId: session.user.id, mode } },
  });

  return NextResponse.json(record ?? {
    bestScore: 0,
    currentStreak: 0,
    longestStreak: 0,
    totalBeats: 0,
    lastBeatAt: null,
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const userId = session.user.id;

  const body = await req.json().catch(() => ({}));
  const { mode, score } = body as { mode?: string; score?: number };

  if (!mode) return NextResponse.json({ error: 'mode is required' }, { status: 400 });
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 0) {
    return NextResponse.json({ error: 'score must be a non-negative integer' }, { status: 400 });
  }

  const existing = await prisma.mirrorTriumph.findUnique({
    where: { userId_mode: { userId, mode } },
  });

  const beaten = score > (existing?.bestScore ?? 0);

  if (!existing) {
    // First submission for this mode
    const record = await prisma.mirrorTriumph.create({
      data: {
        userId,
        mode,
        bestScore: score,
        currentStreak: 0, // no ghost to beat on first play
        longestStreak: 0,
        totalBeats: 0,
        lastBeatAt: null,
      },
    });
    return NextResponse.json({ ...record, beaten: false, firstPlay: true });
  }

  if (beaten) {
    const newStreak = existing.currentStreak + 1;
    const updated = await prisma.mirrorTriumph.update({
      where: { userId_mode: { userId, mode } },
      data: {
        bestScore: score,
        currentStreak: newStreak,
        longestStreak: Math.max(existing.longestStreak, newStreak),
        totalBeats: existing.totalBeats + 1,
        lastBeatAt: new Date(),
      },
    });
    return NextResponse.json({ ...updated, beaten: true, firstPlay: false });
  } else {
    // Did not beat ghost — streak resets
    const updated = await prisma.mirrorTriumph.update({
      where: { userId_mode: { userId, mode } },
      data: { currentStreak: 0 },
    });
    return NextResponse.json({ ...updated, beaten: false, firstPlay: false });
  }
}
