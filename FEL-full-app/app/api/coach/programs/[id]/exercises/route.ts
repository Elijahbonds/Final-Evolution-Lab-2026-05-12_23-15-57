export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { TREE_INCLUDE, toTree, isCertifiedCoach } from '@/lib/coach/server';
import { validateExerciseSpec } from '@/lib/coach/loop';

/**
 * POST /api/coach/programs/:id/exercises — the program builder (lane 1 C1). Coach of the program, certified.
 *  { action: 'add', sessionId, exerciseId, sets?, reps?, load?, tempo?, restSeconds?, coachNote? }
 *  { action: 'update', sessionExerciseId, ...same fields }
 *  { action: 'remove', sessionExerciseId }
 * Returns the program tree after the change.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const { id } = await params;
  const program = await prisma.coachingProgram.findUnique({ where: { id }, select: { id: true, coachId: true } });
  if (!program) return bad('not_found', 404);
  if (program.coachId !== userId) return bad('forbidden', 403);
  if (!(await isCertifiedCoach(userId))) return bad('facilitator_not_certified', 403);
  let body: any;
  try { body = await req.json(); } catch { return bad('invalid_json'); }

  if (body.action === 'remove') {
    const se = await prisma.sessionExercise.findUnique({ where: { id: String(body.sessionExerciseId ?? '') }, include: { session: { include: { block: true } } } });
    if (!se || se.session.block.programId !== id) return bad('not_found', 404);
    await prisma.sessionExercise.delete({ where: { id: se.id } });
  } else if (body.action === 'update') {
    const se = await prisma.sessionExercise.findUnique({ where: { id: String(body.sessionExerciseId ?? '') }, include: { session: { include: { block: true } } } });
    if (!se || se.session.block.programId !== id) return bad('not_found', 404);
    const v = validateExerciseSpec({ ...body, exerciseId: body.exerciseId ?? se.exerciseId });
    if (!v.ok) return bad(v.error);
    await prisma.sessionExercise.update({ where: { id: se.id }, data: { ...v.spec } });
  } else if (body.action === 'add') {
    const session = await prisma.session.findUnique({ where: { id: String(body.sessionId ?? '') }, include: { block: true, exercises: { select: { order: true } } } });
    if (!session || session.block.programId !== id) return bad('session_not_found', 404);
    const v = validateExerciseSpec(body);
    if (!v.ok) return bad(v.error);
    const ex = await prisma.programExercise.findUnique({ where: { id: v.spec.exerciseId }, select: { id: true, coachId: true } });
    if (!ex) return bad('exercise_not_found', 404);
    const order = (session.exercises.reduce((m, e) => Math.max(m, e.order), 0)) + 1;
    await prisma.sessionExercise.create({ data: { sessionId: session.id, order, ...v.spec } });
  } else return bad('unknown_action');

  const full = await prisma.coachingProgram.findUnique({ where: { id }, include: TREE_INCLUDE });
  return NextResponse.json({ tree: toTree(full) });
}
