export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { MODE_INFO } from '@/lib/game-data';
import { parseCard } from '@/lib/mp/dunkCard';

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

  // THE CARDS (2026-09-13, owner: "in multiplayer we should see other peoples dunk and score"). The duel
  // itself stores only two integers, so what each player actually threw lives in the SCORE_SUBMITTED events
  // — which already carry a JSON payload, hence no schema change. Read defensively: an older match has no
  // cards at all and must return exactly what it always did.
  //
  // The opponent's card is ONLY released once BOTH have submitted. Handing it over early would let a player
  // read the dunks they have to beat before taking their own run, which turns an async duel into a target
  // list — and this is a money-adjacent surface, so that is a fairness hole rather than a nicety.
  const bothIn = myScore !== null && myScore !== undefined && oppScore !== null && oppScore !== undefined;
  let myCard: unknown = null, oppCard: unknown = null;
  try {
    const evs = await prisma.matchEvent.findMany({
      where: { matchId: m.id, eventType: 'SCORE_SUBMITTED' },
      orderBy: { seq: 'asc' },
    });
    for (const e of evs) {
      const payload = (typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload) as { player?: string; card?: unknown } | null;
      if (!payload?.card) continue;
      const mine = (payload.player === 'p1') === isP1;
      const parsed = parseCard(payload.card);
      if (!parsed) continue;
      if (mine) myCard = parsed; else if (bothIn) oppCard = parsed;
    }
  } catch { /* a match with no readable events returns exactly what it always did */ }

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
    myCard,
    oppCard,
    // so a client can say "their card unlocks when you post a score" rather than silently showing nothing
    oppCardLocked: !bothIn,
  });
}
