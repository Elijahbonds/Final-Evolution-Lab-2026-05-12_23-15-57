export const dynamic = 'force-dynamic';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { isCertifiedCoach } from '@/lib/coach/server';
import { draftSquad, rebaseTargetDate } from '@/lib/coach/duplicate';
import type { ProgramTree } from '@/lib/coach/loop';

/**
 * POST /api/coach/programs/duplicate — copy a program onto one athlete or a squad.
 *
 * The audit's second finding: no templates, no duplicate-and-tweak, no assigning one block to a group. Programs were
 * created BLANK, one client at a time, and the eleventh athlete meant typing the whole thing again. Duplicating for
 * one athlete is the n=1 case of assigning to a squad, so it is one endpoint.
 *
 * Body: { programId, clientIds: string[], startDate?: ISO, nameTemplate?: string }
 */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!(await isCertifiedCoach(userId))) return bad('facilitator_not_certified', 403);

  let body: { programId?: string; clientIds?: unknown; startDate?: string; nameTemplate?: string };
  try { body = await req.json(); } catch { return bad('invalid_json'); }

  const programId = String(body.programId ?? '');
  const clientIds = Array.isArray(body.clientIds) ? body.clientIds.map(String).filter(Boolean) : [];
  if (!programId || clientIds.length === 0) return bad('programId and clientIds are required');
  if (clientIds.length > 60) return bad('too_many_clients');

  const source = await prisma.coachingProgram.findUnique({
    where: { id: programId },
    include: {
      blocks: {
        orderBy: { order: 'asc' },
        include: {
          sessions: {
            orderBy: { order: 'asc' },
            include: { exercises: { orderBy: { order: 'asc' } } },
          },
        },
      },
    },
  });
  if (!source) return bad('not_found', 404);
  if (source.coachId !== userId) return bad('forbidden', 403);

  const startDate = body.startDate ? new Date(body.startDate) : new Date();
  if (Number.isNaN(startDate.getTime())) return bad('invalid startDate');

  // who already holds a copy of this block, by name — a second tap owes nobody a duplicate in their app
  const existing = await prisma.coachingProgram.findMany({
    where: { coachId: userId, clientId: { in: clientIds }, name: { startsWith: source.name } },
    select: { clientId: true },
  });

  // the pure module decides WHO gets one; the rows below decide what is written
  const asTree = { id: source.id, name: source.name, coachId: source.coachId, clientId: source.clientId, blocks: [] } as ProgramTree;
  const { drafts, skipped } = draftSquad(asTree, clientIds, { startDate, nameTemplate: body.nameTemplate }, existing.map((e) => e.clientId));

  // the anchor every block date is measured against: the source's earliest dated block
  const dated = source.blocks.map((b) => (b.targetDate ? b.targetDate.getTime() : NaN)).filter((t) => Number.isFinite(t));
  const anchor = dated.length ? Math.min(...dated) : null;

  const created: { clientId: string; programId: string }[] = [];
  for (const draft of drafts) {
    const program = await prisma.coachingProgram.create({
      data: {
        coachId: userId,
        clientId: draft.clientId,
        name: draft.name,
        startDate,
        durationWeeks: source.durationWeeks,
        blocks: {
          create: source.blocks.map((b) => ({
            order: b.order,
            label: b.label,
            targetDate: (() => {
              const iso = rebaseTargetDate(b.targetDate ? b.targetDate.toISOString() : null, anchor, startDate);
              return iso ? new Date(iso) : null;
            })(),
            sessions: {
              create: b.sessions.map((s) => ({
                order: s.order,
                label: s.label,
                exercises: {
                  create: s.exercises.map((e) => ({
                    exerciseId: e.exerciseId,
                    order: e.order, sets: e.sets, reps: e.reps, load: e.load,
                    tempo: e.tempo, restSeconds: e.restSeconds, coachNote: e.coachNote,
                  })),
                },
              })),
            },
          })),
        },
      },
      select: { id: true, clientId: true },
    });
    created.push({ clientId: program.clientId, programId: program.id });
  }

  return NextResponse.json({ created, skipped, from: source.name }, { status: 201 });
}
