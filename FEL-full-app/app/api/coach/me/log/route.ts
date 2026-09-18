export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { validateLog } from '@/lib/coach/loop';

/**
 * POST /api/coach/me/log — the client logs a session (lane 1 C2).
 *  { programId, sessionId, logs: [{ sessionExerciseId, actualSets?, actualReps?, actualLoad?, rpe?, clientNote?, videoUrl? }], complete?: boolean }
 * Opens (or reuses) the client's open ClientSession for that session, upserts one ExerciseLog per exercise, and marks the
 * session complete when asked. The client can only log their own active program.
 */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  let body: any;
  try { body = await req.json(); } catch { return bad('invalid_json'); }
  const programId = String(body.programId ?? ''), sessionId = String(body.sessionId ?? '');
  const program = await prisma.coachingProgram.findUnique({ where: { id: programId }, select: { id: true, clientId: true, isActive: true } });
  if (!program || program.clientId !== userId) return bad('forbidden', 403);
  if (!program.isActive) return bad('program_inactive', 409);
  const session = await prisma.session.findUnique({ where: { id: sessionId }, include: { block: { select: { programId: true } }, exercises: { select: { id: true } } } });
  if (!session || session.block.programId !== programId) return bad('session_not_found', 404);
  const allowed = new Set(session.exercises.map((e) => e.id));

  const logs = Array.isArray(body.logs) ? body.logs.slice(0, 40) : [];
  const cleaned = [];
  for (const raw of logs) {
    const v = validateLog(raw);
    if (!v.ok) return bad(v.error);
    if (!allowed.has(v.log.sessionExerciseId)) return bad('exercise_not_in_session');
    cleaned.push(v.log);
  }

  let cs = await prisma.clientSession.findFirst({ where: { programId, sessionId, clientId: userId, completedAt: null }, orderBy: { createdAt: 'desc' } });
  if (!cs) cs = await prisma.clientSession.create({ data: { programId, sessionId, clientId: userId } });
  const now = new Date();
  for (const l of cleaned) {
    const existing = await prisma.exerciseLog.findFirst({ where: { clientSessionId: cs.id, sessionExerciseId: l.sessionExerciseId } });
    const data = { actualSets: l.actualSets, actualReps: l.actualReps, actualLoad: l.actualLoad, rpe: l.rpe, clientNote: l.clientNote, videoUrl: l.videoUrl, completedAt: body.complete ? now : existing?.completedAt ?? null };
    if (existing) await prisma.exerciseLog.update({ where: { id: existing.id }, data });
    else await prisma.exerciseLog.create({ data: { clientSessionId: cs.id, sessionExerciseId: l.sessionExerciseId, ...data } });
  }
  if (body.complete) {
    cs = await prisma.clientSession.update({ where: { id: cs.id }, data: { completedAt: now } });
    await prisma.exerciseLog.updateMany({ where: { clientSessionId: cs.id, completedAt: null }, data: { completedAt: now } });
  }
  const out = await prisma.clientSession.findUnique({ where: { id: cs.id }, include: { exerciseLogs: true } });
  return NextResponse.json({ clientSession: out });
}
