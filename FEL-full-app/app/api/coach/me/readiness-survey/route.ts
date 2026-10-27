export const dynamic = 'force-dynamic';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { canWriteHealthData } from '@/lib/privacy/healthWriteGate';
import { readDobYear, verifiedAdult } from '@/lib/privacy/scanSaveGate';
import type { ReadinessDb } from '@/lib/coach/readiness/server';
import { deleteMine, submitSurvey, surveyContext } from '@/lib/coach/readiness/surveyServer';

/**
 * COACH-DELIVERY COA-03 (2026-10-26): the five-question readiness survey (lib/coach/readiness/survey.ts), beside the jump check.
 *   GET     may they answer (verified adult), is health data on, today's answer read under each coach's rule
 *   POST    { day, answers: { sleep, soreness, energy, mood, ready } } — HEALTH_WRITE_ROUTES i: a verified adult
 *           (canWriteHealthData below; 403), a live health_data grant (412), once a day (the first stands)
 *   DELETE  every survey of the athlete's own
 * Before prisma/pending/2026-10-26-coach-delivery.sql is applied: GET { ready: false }, POST/DELETE 503.
 */
const db = () => prisma as unknown as ReadinessDb;

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const adult = verifiedAdult(await readDobYear(prisma, userId, 'readiness_survey'));
  const r = await surveyContext(db(), userId, adult);
  return NextResponse.json(r.body, { status: r.status });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await submitSurvey(db(), userId, await req.json().catch(() => null), () => canWriteHealthData(prisma, userId));
  return NextResponse.json(r.body, { status: r.status });
}

export async function DELETE() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await deleteMine(db(), userId);
  return NextResponse.json(r.body, { status: r.status });
}
