export const dynamic = 'force-dynamic';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { bookInPerson, inPersonSlots, type GroupDb } from '@/lib/group-booking/server';

/**
 * GROUP-BOOKING: 1:1 sessions in person (online 1:1s book through the coach store's own flow).
 *   GET  ?trainer=<id>  → { available, slots: [{ startsAt, label }] }
 *   POST { trainerId, gymId, startsAt } → 201 { ok, id, pay, ics } · 409 slot_taken | bad_slot · 403 the teen gate
 */
export async function GET(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await inPersonSlots(prisma as unknown as GroupDb, req.nextUrl.searchParams.get('trainer') ?? '');
  return NextResponse.json(r.body, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await bookInPerson(prisma as unknown as GroupDb, userId, await req.json().catch(() => null));
  return NextResponse.json(r.body, { status: r.status });
}
