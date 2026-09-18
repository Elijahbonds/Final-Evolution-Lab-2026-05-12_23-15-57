export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { TREE_INCLUDE, toTree, isCertifiedCoach } from '@/lib/coach/server';
import { nextSession, accessRole } from '@/lib/coach/loop';

/** GET /api/coach/programs — programs I coach and programs I am the client of, as trees with completion and plan status. */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const rows = await prisma.coachingProgram.findMany({
    where: { OR: [{ coachId: userId }, { clientId: userId }] }, orderBy: { updatedAt: 'desc' },
    include: { ...TREE_INCLUDE, clientSessions: { where: { completedAt: { not: null } }, select: { sessionId: true, completedAt: true } } },
  });
  const planByProgram = new Map((await prisma.goalPlan.findMany({ where: { programId: { in: rows.map((r) => r.id) } }, select: { programId: true, status: true, goalText: true } })).map((p) => [p.programId!, p]));
  const people = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.flatMap((r) => [r.coachId, r.clientId]))] } }, select: { id: true, name: true, email: true } });
  const nameOf = (id: string) => { const u = people.find((x) => x.id === id); return u?.name ?? u?.email?.split('@')[0] ?? 'player'; };
  const programs = rows.map((r) => {
    const tree = toTree(r);
    const done = r.clientSessions.map((c) => c.sessionId);
    return { tree, role: accessRole(r, userId), coachName: nameOf(r.coachId), clientName: nameOf(r.clientId), isActive: r.isActive, startDate: r.startDate, completedSessionIds: done, next: nextSession(tree, done), plan: planByProgram.get(r.id) ?? null };
  });
  return NextResponse.json({ programs, coachCertified: await isCertifiedCoach(userId) });
}
