export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { needsReview } from '@/lib/coach/loop';

/** GET /api/coach/inbox — completed client sessions across the programs I coach, newest first, with logs to review. */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const rows = await prisma.clientSession.findMany({
    where: { program: { coachId: userId }, completedAt: { not: null } }, orderBy: { completedAt: 'desc' }, take: 30,
    include: { program: { select: { id: true, name: true } }, session: { select: { label: true, block: { select: { label: true } } } }, exerciseLogs: { include: { sessionExercise: { include: { exercise: { select: { name: true } } } } } } },
  });
  const clients = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.clientId))] } }, select: { id: true, name: true, email: true } });
  const items = rows.map((r) => ({
    id: r.id, completedAt: r.completedAt, program: r.program, session: `${r.session.block.label} · ${r.session.label}`,
    clientName: clients.find((c) => c.id === r.clientId)?.name ?? clients.find((c) => c.id === r.clientId)?.email?.split('@')[0] ?? 'player',
    logs: r.exerciseLogs.map((l) => ({ id: l.id, exercise: l.sessionExercise.exercise.name, prescribed: `${l.sessionExercise.sets}×${l.sessionExercise.reps} @ ${l.sessionExercise.load}`, actualSets: l.actualSets, actualReps: l.actualReps, actualLoad: l.actualLoad, rpe: l.rpe, clientNote: l.clientNote, videoUrl: l.videoUrl, coachComment: l.coachComment, coachCommentAt: l.coachCommentAt })),
  }));
  return NextResponse.json({ items, needsReview: needsReview(items.map((i) => ({ completedAt: i.completedAt, logs: i.logs }))) });
}
