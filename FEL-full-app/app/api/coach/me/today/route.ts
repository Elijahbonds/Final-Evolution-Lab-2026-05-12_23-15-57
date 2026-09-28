export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { loadToday } from '@/lib/coach/todayServer';

/**
 * GET /api/coach/me/today — the client's next session across their active programs, with the open log and recent coach
 * comments. MIRROR-COACH P2 (2026-09-25): each exercise now carries the catalogue's coaching (cues, faults, demo, the
 * easier version by name), the session structure in words and its timers, and the open log its per-set rows — see
 * lib/coach/todayServer.ts loadToday, which this route runs against the real database.
 */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  return NextResponse.json(await loadToday(prisma, userId));
}
