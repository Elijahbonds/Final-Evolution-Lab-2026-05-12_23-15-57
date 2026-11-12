export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { rateLimit } from '@/lib/rate-limit';
import { parseRoomId } from '@/lib/coach/live/gate';
import { coachLiveEnabled, postSummary, readLiveGate, type LiveDb } from '@/lib/coach/live/server';

/**
 * COACH-LIVE (2026-10-25): POST /api/coach/live/summary { room, sessionId, minutes, summary } — the coach's End.
 * The summary (sets, reps, flags) is re-validated and worded on the server, and written as ONE message in the program's
 * thread: the only thing a live session keeps. → { posted, text, programId }. Coach only.
 */
export async function POST(req: NextRequest) {
  if (!coachLiveEnabled()) return bad('not_found', 404);
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!rateLimit(`coach-live:summary:${userId}`, 10, 60_000).ok) return bad('rate_limited', 429);
  let body: { room?: unknown };
  try { body = await req.json(); } catch { return bad('invalid_json'); }
  const ref = parseRoomId(body.room);
  if (!ref) return bad('not_found', 404);
  const db = prisma as unknown as LiveDb;
  const door = await readLiveGate(db, userId, ref);
  if (!door.ok) return bad(door.error, door.status);
  const r = await postSummary(db, door, ref, body);
  if (!r.ok) return bad(r.error, r.status);
  return NextResponse.json({ posted: r.posted, text: r.text, programId: r.programId });
}
