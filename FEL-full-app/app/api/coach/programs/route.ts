export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { TREE_INCLUDE, toTree, isCertifiedCoach } from '@/lib/coach/server';
import { nextSession, accessRole } from '@/lib/coach/loop';
import { validateProgramCreate } from '@/lib/coach/programs';

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

/** POST /api/coach/programs - create a blank scheduled program for a client. */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!(await isCertifiedCoach(userId))) return bad('facilitator_not_certified', 403);
  let body: unknown;
  try { body = await req.json(); } catch { return bad('invalid_json'); }
  const valid = validateProgramCreate(body && typeof body === 'object' ? body : {});
  if (!valid.ok) return bad(valid.error);
  const spec = valid.program;

  const client = spec.clientLookup.includes('@')
    ? await prisma.user.findFirst({ where: { email: { equals: spec.clientLookup, mode: 'insensitive' } }, select: { id: true, name: true, email: true } })
    : await prisma.user.findUnique({ where: { id: spec.clientLookup }, select: { id: true, name: true, email: true } });
  if (!client) return bad('client_not_found', 404);
  if (client.id === userId) return bad('cannot_coach_self');

  const created = await prisma.coachingProgram.create({
    data: {
      coachId: userId,
      clientId: client.id,
      name: spec.name,
      startDate: new Date(),
      durationWeeks: spec.durationWeeks,
      blocks: {
        create: spec.blocks.map((block) => ({
          order: block.order,
          label: block.label,
          sessions: { create: block.sessions.map((session) => ({ order: session.order, label: session.label })) },
        })),
      },
    },
    include: TREE_INCLUDE,
  });
  const tree = toTree(created);
  const coach = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  const nameOf = (u: { name: string | null; email: string | null } | null) => u?.name ?? u?.email?.split('@')[0] ?? 'player';
  return NextResponse.json({
    program: {
      tree,
      role: 'coach',
      coachName: nameOf(coach),
      clientName: nameOf(client),
      isActive: created.isActive,
      startDate: created.startDate,
      completedSessionIds: [],
      next: nextSession(tree, []),
      plan: null,
    },
  }, { status: 201 });
}
