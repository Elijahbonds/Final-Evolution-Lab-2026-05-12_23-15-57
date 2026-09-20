export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { evidenceFrom } from '@/lib/guidance/evidence';
import { adjacentPathways, counsellorNote, suggestPathways } from '@/lib/guidance/pathways';

/**
 * What this person keeps coming back to, and one next step in that direction.
 *
 * Advisory only — nothing here gates content, changes a score, or decides anything. The scoring lives in
 * lib/guidance/pathways.ts, the mode-to-discipline reading in lib/guidance/evidence.ts; this route only fetches
 * rows and hands them over, so there is no judgement in the HTTP layer to drift from the tested one.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // A wide window on purpose: a counsellor looks at a year, not at this week's form.
  const since = new Date(Date.now() - 365 * 24 * 3600 * 1000);

  const [sessions, cards] = await Promise.all([
    prisma.gameSession.findMany({
      where: { userId, createdAt: { gte: since } },
      select: { mode: true, createdAt: true },
      take: 2000,
    }).catch(() => []),
    prisma.creativeCard.findMany({
      where: { ownerId: userId },
      select: { primary: true },
      take: 500,
    }).catch(() => []),
  ]);

  const evidence = evidenceFrom(sessions, cards);
  const suggestions = suggestPathways(evidence);

  return NextResponse.json({
    note: counsellorNote(suggestions),
    suggestions: suggestions.map((s) => ({
      id: s.pathway.id,
      title: s.pathway.title,
      discipline: s.pathway.discipline,
      looksLike: s.pathway.looksLike,
      firstStep: s.pathway.firstStep,
      strength: s.strength,
      exploratory: s.exploratory,
      because: s.because,
    })),
    adjacent: adjacentPathways(suggestions).map((p) => ({
      id: p.id, title: p.title, discipline: p.discipline, looksLike: p.looksLike, firstStep: p.firstStep,
    })),
    // Shown so somebody can see what it read. Disagreeing with the facts beats arguing with a black box.
    evidence,
  });
}
