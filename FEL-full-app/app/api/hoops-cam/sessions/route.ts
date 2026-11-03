export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { canSaveScanNumbers, refuseScanSave } from '@/lib/privacy/scanSaveGate';
import { deleteAll, saveSession, type HoopsDb } from '@/lib/hoops-cam/server';

/**
 * BBS-04 (2026-11-03): the shot tracker's kept sessions, the athlete's own.
 *
 *   POST    one session's NUMBERS (never a frame or a picture): SCAN-SAVE GATE FIRST (lib/privacy/scanSaveGate.ts
 *           canSaveScanNumbers: verified 18+ AND opted in; row 1o of SCAN_SAVE_ROUTES) — a teen never gets past it.
 *   DELETE  every session of the athlete's own. Taking your data back needs no age.
 * Before prisma/pending/2026-11-03-hoops-cam.sql is applied: 503 (the session stays on the phone).
 */
const db = () => prisma as unknown as HoopsDb;

export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!(await canSaveScanNumbers(prisma, userId))) return refuseScanSave();
  const r = await saveSession(db(), userId, await req.json().catch(() => null));
  return NextResponse.json(r.body, { status: r.status });
}

export async function DELETE() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await deleteAll(db(), userId);
  return NextResponse.json(r.body, { status: r.status });
}
