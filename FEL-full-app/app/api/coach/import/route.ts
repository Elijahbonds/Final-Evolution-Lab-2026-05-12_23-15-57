export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { abacusAvailable } from '@/lib/abacus/killSwitch';
import { callCoachLLM } from '@/lib/coach-service';
import { youthRules } from '@/lib/coach/taxonomy';
import { importAiSwitch } from '@/lib/coach/parity/probe';
import { previewImport } from '@/lib/coach/import/preview';
import { libraryState, libraryViewer } from '@/lib/library/server';

/**
 * POST /api/coach/import — COACH-PARITY (2026-10-26): "paste a program". { text, csv?: boolean, programId?, ai?: boolean }
 * → the program read into weeks, days and lines, each line matched to the coach's catalogue or the library, for the review
 * grid. NOTHING IS SAVED: the coach confirms the grid through POST /api/coach/programs/:id/exercises
 * { action: 'import_program', weeks, repeat } (lib/coach/import/apply.ts).
 * For coaches (lib/library/server.ts libraryViewer isCoach). `programId` (one of the coach's own) sets youth rules for the
 * match: adults-only library entries are left out for a client under 18 or with no birth year.
 * The AI reader runs only when asked, when the rules read too little, and when COACH_IMPORT_AI_ENABLED and the Abacus
 * kill switch are both on (lib/coach/import/ai.ts); its answer is re-read by the same rules.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const viewer = await libraryViewer(userId, (session.user as { role?: string }).role);
  if (!viewer.isCoach) return NextResponse.json({ error: 'coaches_only' }, { status: 403 });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  let youth = false;
  if (typeof body.programId === 'string' && body.programId) {
    const p = await prisma.coachingProgram.findUnique({ where: { id: body.programId }, select: { coachId: true, clientId: true } });
    if (!p || p.coachId !== userId) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const client = await prisma.user.findUnique({ where: { id: p.clientId }, select: { dobYear: true } });
    youth = youthRules(client?.dobYear);
  }
  const [{ index }, catalogue] = await Promise.all([
    libraryState(),
    prisma.programExercise.findMany({ where: { coachId: userId }, select: { id: true, name: true } }),
  ]);
  const ai = importAiSwitch() && abacusAvailable() ? (system: string, user: string) => callCoachLLM(system, [{ role: 'user', content: user }]) : null;
  const r = await previewImport({ text: String(body.text ?? ''), csv: body.csv === true, ai: body.ai === true }, { index, catalogue, youth }, ai);
  if (!r.ok) return NextResponse.json({ error: r.error, aiOffered: r.aiOffered ?? false }, { status: 400 });
  return NextResponse.json({ ...r.preview, youth });
}
