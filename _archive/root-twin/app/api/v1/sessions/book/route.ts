export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { spend, readWallet, WalletError } from '@/lib/wallet/wallet-service';
import { upcomingGroupSlots, privateSlots, privateBookingAvailable } from '@/lib/sessions/schedule';

const SKU_FOR_KIND: Record<string, string> = {
  group_workout: 'session_group_workout',
  seminar: 'seminar_seat',
  private_1on1: 'private_1on1',
};

/**
 * POST /api/v1/sessions/book
 * Body: { idempotency_key, kind, sessionKey }
 * Pays with SHARDS. Server verifies the slot exists before charging. Minors
 * (dobYear implies <18) cannot book private 1-on-1.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const kind = typeof body?.kind === 'string' ? body.kind : '';
  const sessionKey = typeof body?.sessionKey === 'string' ? body.sessionKey : '';
  const idempotencyKey = typeof body?.idempotency_key === 'string' ? body.idempotency_key : '';
  const skuId = SKU_FOR_KIND[kind];
  if (!skuId || !sessionKey || !idempotencyKey) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  const now = new Date();
  let startsAt: Date | null = null;

  if (kind === 'group_workout') {
    const slot = upcomingGroupSlots(now, 8).find((s) => s.sessionKey === sessionKey);
    if (!slot) return NextResponse.json({ error: 'slot_unavailable' }, { status: 404 });
    startsAt = new Date(slot.startsAtIso);
    const count = await prisma.sessionBooking.count({ where: { sessionKey, status: 'confirmed' } });
    if (count >= slot.capacity) return NextResponse.json({ error: 'session_full' }, { status: 409 });
  } else if (kind === 'private_1on1') {
    const me = await prisma.user.findUnique({ where: { id: userId }, select: { dobYear: true } });
    if (me?.dobYear && (now.getFullYear() - me.dobYear) < 18) {
      return NextResponse.json({ error: 'minors_cannot_book_private' }, { status: 403 });
    }
    if (!privateBookingAvailable(now, [])) return NextResponse.json({ error: 'private_closed' }, { status: 409 });
    const slot = privateSlots(now, 8).find((s) => s.sessionKey === sessionKey);
    if (!slot) return NextResponse.json({ error: 'slot_unavailable' }, { status: 404 });
    startsAt = new Date(slot.startsAtIso);
  } else {
    return NextResponse.json({ error: 'unsupported_kind' }, { status: 400 });
  }

  const existing = await prisma.sessionBooking.findFirst({ where: { userId, sessionKey, status: 'confirmed' } });
  if (existing) return NextResponse.json({ booked: true, alreadyBooked: true, booking: existing });

  try {
    const result = await spend(prisma, { playerId: userId, idempotencyKey, skuId, quantity: 1 });
    const booking = await prisma.sessionBooking.create({
      data: { userId, kind, sessionKey, shardsPaid: result.spent.amount, startsAt: startsAt! },
    });
    return NextResponse.json({ booked: true, booking, balances: result.balances });
  } catch (e) {
    if (e instanceof WalletError && e.code === 'INSUFFICIENT_FUNDS') {
      const bal = await readWallet(prisma, userId);
      return NextResponse.json({ error: 'insufficient_funds', balances: { coins: bal.coins, shards: bal.shards }, needShards: true }, { status: 409 });
    }
    throw e;
  }
}
