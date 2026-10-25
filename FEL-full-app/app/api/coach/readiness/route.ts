export const dynamic = 'force-dynamic';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { coachBoard, seeCoachAlert, setCoachRule, type ReadinessDb } from '@/lib/coach/readiness/server';

/**
 * COACH-READINESS (2026-10-25): the coach's side of the daily jump check.
 *
 *   GET    today's alerts (one per athlete per day) and each sharing athlete's latest band — only athletes on the coach's
 *          live roster who are verified adults, opted in to saving their numbers, and gave THIS coach a live coach_view
 *          grant (anyone else: nothing, not a line); plus the rules the coach set and the teams they run.
 *   PUT    { scope: 'athlete' | 'team', scopeId, kind, dropPct, action } or { scope, scopeId, clear: true } — a rule for one
 *          athlete on the live roster or one team the coach runs.
 *   PATCH  { id } — dismiss one of the coach's own alerts.
 * Before prisma/pending/2026-10-25-coach-readiness.sql is applied: GET { available: false }, PUT 503.
 */
const db = () => prisma as unknown as ReadinessDb;

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await coachBoard(db(), userId);
  return NextResponse.json(r.body, { status: r.status });
}

export async function PUT(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await setCoachRule(db(), userId, await req.json().catch(() => null));
  return NextResponse.json(r.body, { status: r.status });
}

export async function PATCH(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await seeCoachAlert(db(), userId, await req.json().catch(() => null));
  return NextResponse.json(r.body, { status: r.status });
}
