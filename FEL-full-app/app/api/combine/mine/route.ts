export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { myCombines, type CombineDb } from '@/lib/combine/server';

/**
 * COMBINE-DAY (2026-10-25): the signed-in athlete's own combine numbers, and where they placed in each group. No other
 * athlete's name or number leaves the server. `available: false` until prisma/pending/2026-10-25-combine-day.sql is applied.
 */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await myCombines(prisma as unknown as CombineDb, userId);
  return NextResponse.json(r.body, { status: r.status });
}
