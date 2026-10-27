export const dynamic = 'force-dynamic';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { firstBlockDraft, undoFirstBlock, type FirstBlockDb } from '@/lib/coach/firstBlockServer';
import { aiCallerFromEnv } from '@/lib/coach/weeklyDraft/server';

/**
 * COACH-DELIVERY COA-02 (2026-10-27): draft a client's first block from the goal the coach set with them, the coach's
 * answers (days a week, equipment) and their Mirror screen (lib/coach/firstBlockServer.ts, weeklyDraft/firstBlock.ts).
 *   GET   ?programId=&daysPerWeek=&equipment=&goal=   the draft, line by line with why (the AI words a summary only when
 *         the Abacus switch is on and the client is an adult; it is never sent health data)
 *   POST  { action: 'undo', programId, weeks, sessionsPerWeek }  back to blank weeks while nothing has been logged
 * Applying is the builder's 'import_program' action (POST /api/coach/programs/:id/exercises).
 */
const db = () => prisma as unknown as FirstBlockDb;

export async function GET(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const q = Object.fromEntries(req.nextUrl.searchParams.entries());
  const r = await firstBlockDraft(db(), userId, q, aiCallerFromEnv());
  return NextResponse.json(r.body, { status: r.status });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (body?.action !== 'undo') return bad('unknown_action', 400);
  const r = await undoFirstBlock(db(), userId, body);
  return NextResponse.json(r.body, { status: r.status });
}
