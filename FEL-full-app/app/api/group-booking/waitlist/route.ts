export const dynamic = 'force-dynamic';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { waitlist, type GroupDb } from '@/lib/group-booking/server';

/** GROUP-BOOKING: POST { groupId } — a full group's waitlist. No charge, no automatic seat; the coach sees the list. */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await waitlist(prisma as unknown as GroupDb, userId, await req.json().catch(() => null));
  return NextResponse.json(r.body, { status: r.status });
}
