export const dynamic = 'force-dynamic';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { myAct, myBookings, type GroupDb } from '@/lib/group-booking/server';

/**
 * GROUP-BOOKING: the signed-in person's group seats, make-up credits (with the open Friday/Saturday slots) and 1:1s.
 *   GET   → { available, seats, makeups, passes, oneOnOne, cancelLine }
 *   POST  { action: 'cancel', seatId } | { action: 'makeup', seatId, date, hour } | { action: 'cancel_1on1', id }
 */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await myBookings(prisma as unknown as GroupDb, userId);
  return NextResponse.json(r.body, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await myAct(prisma as unknown as GroupDb, userId, await req.json().catch(() => null));
  return NextResponse.json(r.body, { status: r.status });
}
