export const dynamic = 'force-dynamic';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { myHabits, tickHabit, type HabitDb } from '@/lib/coach/habits/server';

/**
 * COACH-PARITY (2026-10-26): the athlete's habits on Today (lib/coach/habits/server.ts).
 *   GET   today's habits from their live coaches (a teen: training habits only), ticked or not, with the streak
 *   POST  { habitId, done: boolean, value? } — today (the PT day) only; the teen gate first, then the health rules for a
 *         health habit (403 adults only, 412 health_data_consent_required). Never pays Lab Credits or moves the play streak.
 * Before the pending SQL: GET { available: false }, POST 503.
 */
const db = () => prisma as unknown as HabitDb;

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await myHabits(db(), userId);
  return NextResponse.json(r.body, { status: r.status });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await tickHabit(db(), userId, await req.json().catch(() => null));
  return NextResponse.json(r.body, { status: r.status });
}
