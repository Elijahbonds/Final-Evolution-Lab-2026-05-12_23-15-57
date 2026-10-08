export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { accessRole } from '@/lib/coach/loop';
import { markThreadRead, type RawDb } from '@/lib/coach/messageReads';

/**
 * POST /api/coach/messages/read — { programId }: the signed-in coach or athlete has opened this thread, so the other
 * side's messages are read. COACH-AI Phase 8 (2026-10-07). Before the pending SQL is applied it answers
 * { available: false, marked: 0 } with a 200 — the thread works as before, nothing 500s (lib/coach/messageReads.ts).
 */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  let body: { programId?: unknown } | null;
  try { body = await req.json(); } catch { return bad('invalid_json'); }
  const programId = typeof body?.programId === 'string' ? body.programId : '';
  if (!programId) return bad('program_required');
  const p = await prisma.coachingProgram.findUnique({ where: { id: programId }, select: { id: true, coachId: true, clientId: true } });
  if (!p) return bad('not_found', 404);
  if (!accessRole(p, userId)) return bad('forbidden', 403);
  return NextResponse.json(await markThreadRead(prisma as unknown as RawDb, p.id, userId));
}
