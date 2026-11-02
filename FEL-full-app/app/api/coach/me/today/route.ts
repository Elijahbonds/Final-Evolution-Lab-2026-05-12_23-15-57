export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { loadToday } from '@/lib/coach/todayServer';
import { todayReadiness, type ReadinessDb } from '@/lib/coach/readiness/server';
import { libraryClips, todayExtras } from '@/lib/coach/todayExtras';   // PLAT-P06 (2026-10-28): wiring only

/**
 * GET /api/coach/me/today — the client's next session across their active programs, with the open log and recent coach
 * comments. MIRROR-COACH P2 (2026-09-25): each exercise now carries the catalogue's coaching (cues, faults, demo, the
 * easier version by name), the session structure in words and its timers, and the open log its per-set rows — see
 * lib/coach/todayServer.ts loadToday, which this route runs against the real database.
 */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  // COACH-READINESS (2026-10-25): today's saved jump check under the program coach's rule (Low + "ease off" eases the day)
  const now = new Date();
  const payload = await loadToday(prisma, userId, now, { readiness: (coachId) => todayReadiness(prisma as unknown as ReadinessDb, userId, coachId, now) });
  // PLAT-P06: the coach's reply on top of the next session, each exercise's demo loop, and (no program) whether a coach
  // link is live — every read soft (lib/coach/todayExtras.ts)
  return NextResponse.json({ ...payload, ...(await todayExtras(prisma, userId, payload, { now, clips: libraryClips })) });
}
