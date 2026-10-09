export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { loadProgramGates } from '@/lib/coach/protocolGateServer';

/**
 * GET /api/coach/programs/:id/gates — MIRROR-COACH P8 (2026-09-29): the protocol gate as the program's COACH sees it.
 * For every plyometric and depth drop in the program (lib/coach/protocolGate.ts gatedKind), keyed by SessionExercise id:
 * what the client's Today does with it right now — shows it as written, shows its ladder's easier step instead, or holds
 * it back — and why. The client's health reasons are named only with the client's live coach_view grant for this coach;
 * without it, one generic line. The program builder (components/coach/program-builder.tsx) draws it under each item.
 *
 * The program's coach only: its client gets 403, anyone else 404. The logic is lib/coach/protocolGateServer.ts
 * loadProgramGates, run against the real database.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const { id } = await params;
  const r = await loadProgramGates(prisma, userId, id);
  if (!r.ok) return bad(r.error, r.status);
  return NextResponse.json({ gates: r.gates });
}
