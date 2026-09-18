export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { MODE_INFO } from '@/lib/game-data';
import { parseCard } from '@/lib/mp/dunkCard';

function label(userId: string | null | undefined, users: Record<string, string>) {
  if (!userId) return null;
  return users[userId] ?? 'Athlete';
}

/**
 * GET /api/arena/list
 * Returns { open, mine } for the Arena lobby.
 *   open = joinable WAITING LC duels created by others
 *   mine = the caller's recent duels (any status), newest first
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const [openRaw, mineRaw] = await Promise.all([
    prisma.competitionMatch.findMany({
      where: { currency: 'LC', status: 'WAITING', player1Id: { not: userId } },
      orderBy: { createdAt: 'desc' },
      take: 40,
    }),
    prisma.competitionMatch.findMany({
      where: { currency: 'LC', OR: [{ player1Id: userId }, { player2Id: userId }] },
      orderBy: { updatedAt: 'desc' },
      take: 25,
    }),
  ]);

  // Resolve display names in one query.
  const ids = new Set<string>();
  for (const m of [...openRaw, ...mineRaw]) {
    ids.add(m.player1Id);
    if (m.player2Id) ids.add(m.player2Id);
    if (m.winnerId) ids.add(m.winnerId);
  }
  const users = await prisma.user.findMany({
    where: { id: { in: Array.from(ids) } },
    select: { id: true, name: true },
  });
  const nameMap: Record<string, string> = {};
  for (const u of users) nameMap[u.id] = u.name || 'Athlete';

  const modeMeta = (key: string) => ({
    name: MODE_INFO[key]?.name ?? key,
    href: MODE_INFO[key]?.href ?? '#',
  });

  const open = openRaw.map((m) => ({
    id: m.id,
    mode: m.mode,
    ...modeMeta(m.mode),
    feeLc: m.entryFeeCents,
    rakePercent: m.rakePercent,
    creator: label(m.player1Id, nameMap),
    createdAt: m.createdAt,
  }));

  // THE CARDS (2026-09-13). The duel rows carry two integers; what each player threw lives in the
  // SCORE_SUBMITTED events, which already have a JSON payload — so this is one extra query for the whole
  // list rather than a schema change or an N+1. A duel with no events keeps exactly the shape it had.
  const cardsByMatch = new Map<string, { p1?: unknown; p2?: unknown }>();
  try {
    const evs = await prisma.matchEvent.findMany({
      where: { matchId: { in: mineRaw.map((m) => m.id) }, eventType: 'SCORE_SUBMITTED' },
      orderBy: { seq: 'asc' },
    });
    for (const e of evs) {
      const payload = (typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload) as { player?: string; card?: unknown } | null;
      if (!payload?.card) continue;
      const parsed = parseCard(payload.card);
      if (!parsed) continue;
      const slot = cardsByMatch.get(e.matchId) ?? {};
      if (payload.player === 'p1') slot.p1 = parsed; else slot.p2 = parsed;
      cardsByMatch.set(e.matchId, slot);
    }
  } catch { /* no readable events: the list is exactly what it always was */ }

  const mine = mineRaw.map((m) => {
    const isP1 = m.player1Id === userId;
    const myScore = isP1 ? m.player1Score : m.player2Score;
    const oppId = isP1 ? m.player2Id : m.player1Id;
    const oppScore = isP1 ? m.player2Score : m.player1Score;
    // the opponent's card is released only once BOTH have posted — otherwise a player could read the dunks
    // they have to beat before taking their own run, which on a staked duel is a fairness hole
    const bothIn = myScore !== null && myScore !== undefined && oppScore !== null && oppScore !== undefined;
    const slot = cardsByMatch.get(m.id) ?? {};
    const myCard = (isP1 ? slot.p1 : slot.p2) ?? null;
    const oppCard = bothIn ? ((isP1 ? slot.p2 : slot.p1) ?? null) : null;
    return {
      myCard,
      oppCard,
      oppCardLocked: !bothIn,
      id: m.id,
      mode: m.mode,
      ...modeMeta(m.mode),
      feeLc: m.entryFeeCents,
      rakePercent: m.rakePercent,
      status: m.status,
      role: isP1 ? 'p1' : 'p2',
      opponent: label(oppId, nameMap),
      // Quick Match duels seat a House Rival — the lobby labels them so a
      // simulated opponent is never dressed up as a human with stakes on.
      ghost: m.matchType === 'GHOST_DUEL',
      myScore: myScore ?? null,
      oppScore: oppScore ?? null,
      mySubmitted: myScore !== null && myScore !== undefined,
      winnerId: m.winnerId,
      iWon: m.winnerId ? m.winnerId === userId : null,
      seed: m.seed,
      updatedAt: m.updatedAt,
    };
  });

  return NextResponse.json({ open, mine });
}
