export const dynamic = 'force-dynamic';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { mySchedule, scheduleAct, type ScheduleDb } from '@/lib/coach/schedule/server';

/**
 * COACH-DELIVERY COA-05 (2026-10-26): the athlete's side of the coach calendar.
 *   GET   upcoming sessions from their live coaches that reach them (past the teen gate), and their feed link
 *   POST  { action: 'feed_on' | 'feed_reset' | 'feed_off' } — the athlete's own .ics link (nothing else is accepted here)
 */
const db = () => prisma as unknown as ScheduleDb;

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await mySchedule(db(), userId);
  return NextResponse.json(r.body, { status: r.status });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
  if (!body || !['feed_on', 'feed_reset', 'feed_off'].includes(String(body.action))) return bad('unknown_action', 400);
  const r = await scheduleAct(db(), userId, { action: body.action });
  return NextResponse.json(r.body, { status: r.status });
}
