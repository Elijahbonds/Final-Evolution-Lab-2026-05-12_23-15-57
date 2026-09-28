export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { needsReview } from '@/lib/coach/loop';
import { logLines } from '@/lib/coach/setLog';
import { doseLine } from '@/lib/coach/structure';

/**
 * GET /api/coach/inbox — completed client sessions across the programs I coach, newest first, with logs to review.
 *
 * MIRROR-COACH P2 (2026-09-25): a log saved from the per-set Today card has SetLogs; its per-exercise columns are
 * derived from them (lib/coach/setLog.ts setSummary), so the inbox's existing line reads "3×8,8,7 @ 60–65 kg · RPE 8"
 * with no view change. Each log also carries `setLines` — one line per set in kilograms ("Set 1 · 8 reps · 60 kg ·
 * 2 left · effort 8 (Surge)"), [] for a row saved before per-set logging — for the Clients tab to show under it.
 */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const rows = await prisma.clientSession.findMany({
    where: { program: { coachId: userId }, completedAt: { not: null } }, orderBy: { completedAt: 'desc' }, take: 30,
    include: { program: { select: { id: true, name: true } }, session: { select: { label: true, block: { select: { label: true } } } }, exerciseLogs: { include: { sessionExercise: { include: { exercise: { select: { name: true } } } }, setLogs: { orderBy: { setIndex: 'asc' } } } } },
  });
  const clients = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.clientId))] } }, select: { id: true, name: true, email: true } });
  const items = rows.map((r) => ({
    id: r.id, completedAt: r.completedAt, program: r.program, session: `${r.session.block.label} · ${r.session.label}`,
    clientName: clients.find((c) => c.id === r.clientId)?.name ?? clients.find((c) => c.id === r.clientId)?.email?.split('@')[0] ?? 'player',
    logs: r.exerciseLogs.map((l) => {
      const read = logLines({ ...l, setLogs: l.setLogs ?? [] });
      // the prescription as the client read it (P2 review: a cleared load read "@ ", a timed per-side dose lost its side)
      return { id: l.id, exercise: l.sessionExercise.exercise.name, prescribed: doseLine(l.sessionExercise), actualSets: l.actualSets, actualReps: l.actualReps, actualLoad: l.actualLoad, rpe: l.rpe, setLines: read.kind === 'sets' ? read.lines : [], clientNote: l.clientNote, videoUrl: l.videoUrl, coachComment: l.coachComment, coachCommentAt: l.coachCommentAt };
    }),
  }));
  return NextResponse.json({ items, needsReview: needsReview(items.map((i) => ({ completedAt: i.completedAt, logs: i.logs }))) });
}
