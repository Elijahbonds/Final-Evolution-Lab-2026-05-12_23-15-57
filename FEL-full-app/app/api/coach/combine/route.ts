export const dynamic = 'force-dynamic';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { rateLimit } from '@/lib/rate-limit';
import { combineContext, createCombine, type CombineDb } from '@/lib/combine/server';

/**
 * COMBINE-DAY (2026-10-25): the coach's combines.
 *
 *   GET   the coach's live roster with what the gates allow for each athlete (lib/combine/gate.ts: the team gate; camera
 *         stations for verified adults; camera numbers kept for those who opted in), the teams they run, and their saved
 *         combines. `available: false` until prisma/pending/2026-10-25-combine-day.sql is applied: the combine then runs
 *         as a draft on the coach's phone.
 *   POST  { name, teamId?, athleteIds, stations, weights } — save a combine to the account. 503 combine_not_ready before
 *         the SQL. Only athletes on the live roster who pass the gate are kept; anyone else is dropped, never stored.
 */
const db = () => prisma as unknown as CombineDb;

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await combineContext(db(), userId);
  return NextResponse.json(r.body, { status: r.status });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!rateLimit(`combine-create:${userId}`, 20, 60_000).ok) return bad('rate_limited', 429);
  const r = await createCombine(db(), userId, await req.json().catch(() => null));
  return NextResponse.json(r.body, { status: r.status });
}
