export const dynamic = 'force-dynamic';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { canSaveScanNumbers, readDobYear, refuseScanSave } from '@/lib/privacy/scanSaveGate';
import { checkAccess } from '@/lib/coach/readiness/gate';
import { checkContext, deleteHistory, saveCheck, type ReadinessDb } from '@/lib/coach/readiness/server';

/**
 * COACH-READINESS (2026-10-25): the 30-second daily jump check, the athlete's own.
 *
 *   GET    ?day=YYYY-MM-DD  may they check (verified adult only), is it kept on the server (the movement-save gate), their
 *                           saved history, and the rule each of their coaches has for them.
 *   POST   { day, bestCm, meanCm, teCm, jumps, poseHz, feel? } — the day's NUMBERS only (never a frame or a picture):
 *                           SCAN-SAVE GATE FIRST (lib/privacy/scanSaveGate.ts canSaveScanNumbers: verified 18+ AND opted
 *                           in; row 1l of SCAN_SAVE_ROUTES), then read against the saved history, kept once per day, and
 *                           each coach whose rule reads Low and who has the athlete's coach_view grant told once per day.
 *   DELETE                  every check of the athlete's own, and the alerts about them. Taking your data back needs no age.
 */
const db = () => prisma as unknown as ReadinessDb;

export async function GET(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const access = checkAccess({ signedIn: true, dobYear: await readDobYear(prisma, userId, 'readiness_check') });
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error });
  const canSave = await canSaveScanNumbers(prisma, userId);
  const r = await checkContext(db(), userId, canSave, req.nextUrl.searchParams.get('day'));
  return NextResponse.json(r.body, { status: r.status });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!(await canSaveScanNumbers(prisma, userId))) return refuseScanSave();
  const body = await req.json().catch(() => null);
  const r = await saveCheck(db(), userId, body);
  return NextResponse.json(r.body, { status: r.status });
}

export async function DELETE() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await deleteHistory(db(), userId);
  return NextResponse.json(r.body, { status: r.status });
}
