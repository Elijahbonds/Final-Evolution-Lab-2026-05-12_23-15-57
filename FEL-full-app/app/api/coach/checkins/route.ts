export const dynamic = 'force-dynamic';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { coachAct, coachBoard, type CheckinDb } from '@/lib/coach/checkins/server';

/**
 * COACH-PARITY (2026-10-26): the coach's check-in forms (lib/coach/checkins/server.ts).
 *   GET  ?formId=   the coach's forms, who each goes to, this period's count; with formId, every athlete's answers over time
 *                   (health answers only from an adult who shares their health with this coach)
 *   POST { action: 'create' | 'update', title, cadence, painCheck, questions } | { action: 'archive', id }
 *        | { action: 'assign' | 'unassign', formId, scope: 'athlete' | 'team', scopeId }
 * Before prisma/pending/2026-10-26-coach-parity.sql is applied: GET { available: false }, POST 503.
 */
const db = () => prisma as unknown as CheckinDb;

export async function GET(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await coachBoard(db(), userId, { formId: req.nextUrl.searchParams.get('formId') });
  return NextResponse.json(r.body, { status: r.status });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await coachAct(db(), userId, await req.json().catch(() => null));
  return NextResponse.json(r.body, { status: r.status });
}
