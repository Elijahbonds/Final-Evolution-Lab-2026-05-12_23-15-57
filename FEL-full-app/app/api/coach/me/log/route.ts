export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { saveClientLog } from '@/lib/coach/todayServer';

/**
 * POST /api/coach/me/log — the client logs a session (lane 1 C2).
 *  { programId, sessionId, logs: [{ sessionExerciseId, sets?, actualSets?, actualReps?, actualLoad?, rpe?, clientNote?, videoUrl? }], complete?: boolean }
 * Opens (or reuses) the client's open ClientSession for that session, upserts one ExerciseLog per exercise, and marks the
 * session complete when asked. The client can only log their own active program.
 *
 * MIRROR-COACH P2 (2026-09-25): a log may carry `sets` — one row per set, weight in kg or lb, reps in reserve 0–5,
 * effort 1–10 (lib/coach/setLog.ts). They are written to SetLog and the per-exercise columns are derived from them. A
 * set out of range is refused with its own error and the row it came from ({ error: 'rir_range', set: 2, … }) and
 * nothing is written. The save itself is lib/coach/todayServer.ts saveClientLog.
 */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  let body: unknown;
  try { body = await req.json(); } catch { return bad('invalid_json'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return bad('invalid_json');
  const r = await saveClientLog(prisma, userId, body as Record<string, unknown>);
  if (!r.ok) {
    const { ok: _ok, status, ...err } = r;
    return NextResponse.json(err, { status });
  }
  return NextResponse.json({ clientSession: r.clientSession });
}
