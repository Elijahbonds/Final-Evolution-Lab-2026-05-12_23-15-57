export const dynamic = 'force-dynamic';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { reserve, type GroupDb } from '@/lib/group-booking/server';

/**
 * GROUP-BOOKING (2026-11-02): reserve a seat in a group (lib/group-booking/server.ts reserve).
 *   POST { groupId, option: 'drop_in' | 'package' | 'full', date? } → 201 { ok, passId, seats, pay: { mode: 'at_gym' } | { mode: 'online', packageId }, ics }
 *   409 full (join the waitlist) | already_booked | bad_option | not_open · 403 the teen gate · 503 before the pending SQL.
 * Pay at the gym by default: this route never calls a checkout. With every online switch on it names the coach-business
 * package, and the page pays through the existing /api/coach/business/checkout.
 */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await reserve(prisma as unknown as GroupDb, userId, await req.json().catch(() => null));
  return NextResponse.json(r.body, { status: r.status });
}
