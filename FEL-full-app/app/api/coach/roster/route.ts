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
  // A CLIENT EXISTS BEFORE THEIR PROGRAMMING DOES (2026-09-19). This route used to derive the roster from
  // CoachingProgram rows alone, so an athlete who accepted an invite this morning was invisible until the coach had
  // already written them a program — which is backwards, because you write the program for somebody who is already
  // there. The roster is now the union: everyone on CoachClient, plus anyone with a program (which keeps every
  // relationship that predates the invite table working, untouched and unmigrated).
  const linked = await prisma.coachClient.findMany({
    where: { coachId: userId, endedAt: null },
    select: { clientId: true, createdAt: true, via: true },
  });
  const clientIds = [...new Set([...linked.map((l) => l.clientId), ...programs.map((p) => p.clientId)])];
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
      // a client with no programming yet is NEW, not broken — the UI shows them first so the coach writes their block
      joinedAt: linked.find((l) => l.clientId === cid)?.createdAt ?? null,
      awaitingProgram: !programs.some((p) => p.clientId === cid),
      prq: profile.prq.measured && Object.keys(profile.prq.measured).length ? profile.prq.measured : profile.prq.card,
      prqDelta: profile.prq.delta, sessions: profile.history.sessions, wins: profile.history.wins, resiliency: profile.resiliency,
    };
  }));
  return NextResponse.json({ roster });
}
