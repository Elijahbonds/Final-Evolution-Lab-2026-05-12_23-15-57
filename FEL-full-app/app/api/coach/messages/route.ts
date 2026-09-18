export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { accessRole, validateMessage } from '@/lib/coach/loop';

async function programFor(programId: string, userId: string) {
  const p = await prisma.coachingProgram.findUnique({ where: { id: programId }, select: { id: true, coachId: true, clientId: true } });
  if (!p) return { error: bad('not_found', 404) };
  if (!accessRole(p, userId)) return { error: bad('forbidden', 403) };
  return { program: p };
}

/** GET /api/coach/messages?programId= — the coach ↔ client thread, oldest first (last 100). */
export async function GET(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const programId = req.nextUrl.searchParams.get('programId') ?? '';
  const r = await programFor(programId, userId);
  if ('error' in r) return r.error;
  const messages = await prisma.programMessage.findMany({ where: { programId }, orderBy: { createdAt: 'asc' }, take: 100 });
  return NextResponse.json({ messages: messages.map((m) => ({ ...m, mine: m.authorId === userId, fromCoach: m.authorId === r.program.coachId })) });
}

/** POST /api/coach/messages — { programId, body } — either side writes. */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  let body: any;
  try { body = await req.json(); } catch { return bad('invalid_json'); }
  const r = await programFor(String(body.programId ?? ''), userId);
  if ('error' in r) return r.error;
  const text = validateMessage(body.body);
  if (!text) return bad('body_required');
  const m = await prisma.programMessage.create({ data: { programId: r.program.id, authorId: userId, body: text } });
  return NextResponse.json({ message: { ...m, mine: true, fromCoach: userId === r.program.coachId } });
}
