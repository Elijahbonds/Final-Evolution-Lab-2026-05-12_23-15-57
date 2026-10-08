export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { accessRole, validateMessage } from '@/lib/coach/loop';
import { decorateThread, threadReadStates, type RawDb } from '@/lib/coach/messageReads';

async function programFor(programId: string, userId: string) {
  const p = await prisma.coachingProgram.findUnique({ where: { id: programId }, select: { id: true, coachId: true, clientId: true } });
  if (!p) return { error: bad('not_found', 404) };
  if (!accessRole(p, userId)) return { error: bad('forbidden', 403) };
  return { program: p };
}

/**
 * GET /api/coach/messages?programId= — the coach ↔ client thread, oldest first (last 100).
 * COACH-AI Phase 8 (2026-10-07): the newest 100, shown oldest first. It read `asc` + `take: 100`, which is the FIRST
 * 100, so from the 101st message on a new message never appeared. With the read markers on (the pending SQL applied:
 * lib/coach/messageReads.ts), each message carries `readAt` and `unread`, and `reads` is true; without them neither
 * field is there and `reads` is false. Reading the thread does not mark it read: POST /api/coach/messages/read does.
 */
export async function GET(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const programId = req.nextUrl.searchParams.get('programId') ?? '';
  const r = await programFor(programId, userId);
  if ('error' in r) return r.error;
  const newest = await prisma.programMessage.findMany({ where: { programId }, orderBy: { createdAt: 'desc' }, take: 100 });
  const messages = newest.reverse();
  const reads = await threadReadStates(prisma as unknown as RawDb, programId);
  return NextResponse.json({ messages: decorateThread(messages, userId, r.program.coachId, reads), reads: reads !== null });
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
