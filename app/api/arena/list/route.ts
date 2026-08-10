export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { MODE_INFO } from '@/lib/game-data';

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

  const mine = mineRaw.map((m) => {
    const isP1 = m.player1Id === userId;
    const myScore = isP1 ? m.player1Score : m.player2Score;
    const oppId = isP1 ? m.player2Id : m.player1Id;
    const oppScore = isP1 ? m.player2Score : m.player1Score;
    return {
      id: m.id,
      mode: m.mode,
      ...modeMeta(m.mode),
      feeLc: m.entryFeeCents,
      rakePercent: m.rakePercent,
      status: m.status,
      role: isP1 ? 'p1' : 'p2',
      opponent: label(oppId, nameMap),
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
