export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { validateMessage } from '@/lib/coach/loop';

/** POST /api/coach/review — { exerciseLogId, comment } — the coach's comment on one logged exercise (lane 1 C3). */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  let body: any;
  try { body = await req.json(); } catch { return bad('invalid_json'); }
  const log = await prisma.exerciseLog.findUnique({ where: { id: String(body.exerciseLogId ?? '') }, include: { clientSession: { include: { program: { select: { coachId: true } } } } } });
  if (!log) return bad('not_found', 404);
  if (log.clientSession.program.coachId !== userId) return bad('forbidden', 403);
  const comment = validateMessage(body.comment);
  if (!comment) return bad('comment_required');
  const updated = await prisma.exerciseLog.update({ where: { id: log.id }, data: { coachComment: comment, coachCommentAt: new Date() } });
  return NextResponse.json({ log: updated });
}
