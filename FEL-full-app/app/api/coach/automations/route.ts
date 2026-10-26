export const dynamic = 'force-dynamic';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { automationAct, automationBoard, type AutomationDb } from '@/lib/coach/automations/server';

/**
 * COACH-DELIVERY COA-01 (2026-10-26): the coach's automations (lib/coach/automations/server.ts).
 *   GET   the coach's automations, presets, roster and teams, and the last two weeks of runs (the audit)
 *   POST  { action: 'create' | 'update', trigger, scope, scopeId?, missedN?, weekday?, hour?, preset | text }
 *         | { action: 'enable' | 'disable' | 'archive', id } | { action: 'run' } (this coach's automations, now)
 * Posts only into existing program threads, under the teen gate; never emails.
 * Before prisma/pending/2026-10-26-coach-delivery.sql is applied: GET { available: false }, POST 503.
 */
const db = () => prisma as unknown as AutomationDb;

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await automationBoard(db(), userId);
  return NextResponse.json(r.body, { status: r.status });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await automationAct(db(), userId, await req.json().catch(() => null));
  return NextResponse.json(r.body, { status: r.status });
}
