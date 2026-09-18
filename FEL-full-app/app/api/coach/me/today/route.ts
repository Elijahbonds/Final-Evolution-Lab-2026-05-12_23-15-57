export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { TREE_INCLUDE, toTree } from '@/lib/coach/server';
import { nextSession } from '@/lib/coach/loop';

/** GET /api/coach/me/today — the client's next session across their active programs, with the open log and recent coach comments. */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const programs = await prisma.coachingProgram.findMany({
    where: { clientId: userId, isActive: true }, orderBy: { startDate: 'asc' },
    include: { ...TREE_INCLUDE, clientSessions: { where: { clientId: userId }, include: { exerciseLogs: true }, orderBy: { createdAt: 'desc' } } },
  });
  for (const p of programs) {
    const tree = toTree(p);
    const done = p.clientSessions.filter((c) => c.completedAt).map((c) => c.sessionId);
    const next = nextSession(tree, done);
    if (!next) continue;
    const open = p.clientSessions.find((c) => c.sessionId === next.session.id && !c.completedAt) ?? null;
    const coach = await prisma.user.findUnique({ where: { id: p.coachId }, select: { name: true, email: true } });
    const recentComments = await prisma.exerciseLog.findMany({
      where: { clientSession: { clientId: userId, programId: p.id }, coachComment: { not: null } }, orderBy: { coachCommentAt: 'desc' }, take: 5,
      include: { sessionExercise: { include: { exercise: { select: { name: true } } } } },
    });
    return NextResponse.json({
      program: { id: p.id, name: p.name, coachName: coach?.name ?? coach?.email?.split('@')[0] ?? 'coach' },
      today: { block: next.block, session: next.session, index: next.index, total: next.total },
      open: open ? { id: open.id, logs: open.exerciseLogs } : null,
      recentComments: recentComments.map((l) => ({ exercise: l.sessionExercise.exercise.name, comment: l.coachComment, at: l.coachCommentAt })),
    });
  }
  return NextResponse.json({ program: null, today: null, open: null, recentComments: [] });
}
