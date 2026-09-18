export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { composeProfile } from '@/lib/camp/profile';

/** GET /api/coach/roster — every client I coach, with their card (if published), PRQ and the deltas since their program began (lane 5 S3). */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const programs = await prisma.coachingProgram.findMany({ where: { coachId: userId }, orderBy: { startDate: 'desc' }, select: { id: true, name: true, clientId: true, startDate: true, isActive: true } });
  const clientIds = [...new Set(programs.map((p) => p.clientId))];
  const [users, cards] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true, email: true } }),
    prisma.creatorCard.findMany({ where: { ownerId: { in: clientIds } }, select: { ownerId: true, slug: true, published: true, rarity: true, prq: true, topScore: true, wins: true } }),
  ]);
  const roster = await Promise.all(clientIds.map(async (cid) => {
    const first = [...programs].filter((p) => p.clientId === cid).sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0];
    const profile = await composeProfile(cid, first?.startDate ?? null);
    const u = users.find((x) => x.id === cid); const card = cards.find((c) => c.ownerId === cid) ?? null;
    return {
      clientId: cid, name: u?.name ?? u?.email?.split('@')[0] ?? 'player',
      programs: programs.filter((p) => p.clientId === cid).map((p) => ({ id: p.id, name: p.name, isActive: p.isActive })),
      card: card ? { slug: card.slug, published: card.published, rarity: card.rarity, prq: card.prq, topScore: card.topScore, wins: card.wins } : null,
      prq: profile.prq.measured && Object.keys(profile.prq.measured).length ? profile.prq.measured : profile.prq.card,
      prqDelta: profile.prq.delta, sessions: profile.history.sessions, wins: profile.history.wins, resiliency: profile.resiliency,
    };
  }));
  return NextResponse.json({ roster });
}
