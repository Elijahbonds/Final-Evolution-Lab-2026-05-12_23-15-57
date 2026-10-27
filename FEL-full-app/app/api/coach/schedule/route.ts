export const dynamic = 'force-dynamic';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { scheduleAct, scheduleBoard, type ScheduleDb } from '@/lib/coach/schedule/server';

/**
 * COACH-DELIVERY COA-05 (2026-10-26): roster sessions on the coach's calendar (lib/coach/schedule/server.ts).
 *   GET   yesterday → 4 weeks of sessions, who each reaches, the roster and teams, the calendar-feed link
 *   POST  { action: 'create' | 'update', id?, title, startsAt, minutes, place?, scope, scopeId? } (409 clash with another
 *         session or a HELD/PAID store booking) | { action: 'cancel', id } | { action: 'feed_on' | 'feed_reset' | 'feed_off' }
 * Before prisma/pending/2026-10-26-coach-delivery.sql is applied: GET { available: false }, POST 503.
 */
const db = () => prisma as unknown as ScheduleDb;

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await scheduleBoard(db(), userId);
  return NextResponse.json(r.body, { status: r.status });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await scheduleAct(db(), userId, await req.json().catch(() => null));
  return NextResponse.json(r.body, { status: r.status });
}
