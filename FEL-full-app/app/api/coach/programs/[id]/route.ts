export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { loadProgram } from '@/lib/coach/builderServer';

/**
 * GET /api/coach/programs/:id — load ONE program for the builder (MIRROR-COACH P2, 2026-09-25): the tree in running
 * order with every session's structure (sections, key set, supersets, timers, cues, bands), and the builder's
 * warnings per session. Before this the builder could only re-read ALL of a coach's programs through
 * GET /api/coach/programs, and nothing let a page load the one it was editing.
 *
 * The coach of the program or its client; anyone else gets 404 (a program id says nothing about whose it is).
 * The logic is lib/coach/builderServer.ts loadProgram.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const { id } = await params;
  const r = await loadProgram(prisma, userId, id);
  if (!r.ok) return bad(r.error, r.status);
  return NextResponse.json({ program: r.program, warnings: r.warnings });
}
