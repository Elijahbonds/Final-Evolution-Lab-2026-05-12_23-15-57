export const dynamic = 'force-dynamic';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { coachHabitAct, coachHabitBoard, type HabitDb } from '@/lib/coach/habits/server';

/**
 * COACH-PARITY (2026-10-26): coach-assigned habits, the coach's side (lib/coach/habits/server.ts).
 *   GET   the coach's habits, who each reaches, each athlete's last 7 days and streak (a health habit's ticks only from an
 *         adult who shares their health with this coach)
 *   POST  { action: 'create', preset | 'custom', label?, kind?, target?, unit?, frequency, perWeek?, scope, scopeId }
 *         | { action: 'archive', id }. A health or body-weight/diet habit is never assigned to a minor (400 habit_adults_only).
 * Before prisma/pending/2026-10-26-coach-parity.sql is applied: GET { available: false }, POST 503.
 */
const db = () => prisma as unknown as HabitDb;

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await coachHabitBoard(db(), userId);
  return NextResponse.json(r.body, { status: r.status });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await coachHabitAct(db(), userId, await req.json().catch(() => null));
  return NextResponse.json(r.body, { status: r.status });
}
