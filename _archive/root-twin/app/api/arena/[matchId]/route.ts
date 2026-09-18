export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { MODE_INFO } from '@/lib/game-data';

/**
 * GET /api/arena/[matchId]
 * Detail/status for a single Arena duel the caller participates in.
 */
export async function GET(_req: NextRequest, { params }: { params: { matchId: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const m = await prisma.competitionMatch.findUnique({ where: { id: params.matchId } });
  if (!m || m.currency !== 'LC') return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const isP1 = m.player1Id === userId;
  const isP2 = m.player2Id === userId;
  if (!isP1 && !isP2) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const myScore = isP1 ? m.player1Score : m.player2Score;
  const oppScore = isP1 ? m.player2Score : m.player1Score;

  return NextResponse.json({
    id: m.id,
    mode: m.mode,
    name: MODE_INFO[m.mode]?.name ?? m.mode,
    href: MODE_INFO[m.mode]?.href ?? '#',
    feeLc: m.entryFeeCents,
    rakePercent: m.rakePercent,
    status: m.status,
    role: isP1 ? 'p1' : 'p2',
    myScore: myScore ?? null,
    oppScore: oppScore ?? null,
    mySubmitted: myScore !== null && myScore !== undefined,
    hasOpponent: Boolean(m.player2Id),
    winnerId: m.winnerId,
    iWon: m.winnerId ? m.winnerId === userId : null,
    seed: m.seed,
  });
}
