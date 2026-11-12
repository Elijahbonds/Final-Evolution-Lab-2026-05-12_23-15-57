export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { clientUpdates, type RawDb } from '@/lib/coach/weeklyDraft/store';
import { PLAN_UPDATE_DAYS } from '@/lib/coach/weeklyDraft/planUpdates';

/**
 * COACH-AI-DRAFT (2026-10-24): GET → the athlete's OWN plan updates their coach approved in the last PLAN_UPDATE_DAYS
 * days: the plain line for each approved change (what the draft said they would read) and the coach's note. Only
 * approved, edited or partly written decisions; never a rejected one, never a reason, never health data. Before the
 * pending SQL is applied: { available: false, updates: [] }.
 */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await clientUpdates(prisma as unknown as RawDb, userId, new Date(Date.now() - PLAN_UPDATE_DAYS * 86_400_000));
  return NextResponse.json(r);
}
