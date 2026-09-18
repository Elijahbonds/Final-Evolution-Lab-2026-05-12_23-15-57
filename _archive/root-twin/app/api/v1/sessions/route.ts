export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { upcomingGroupSlots, privateSlots, privateBookingAvailable, SESSION_PRICING } from '@/lib/sessions/schedule';

/** GET /api/v1/sessions — upcoming group workouts + private availability + my bookings. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const now = new Date();
  const group = upcomingGroupSlots(now, 6);
  // Seminars are ad-hoc (none scheduled by default) -> private fallback opens.
  const seminars: { sessionKey: string; title: string; startsAtIso: string; seats: number; shards: number }[] = [];
  const privateOpen = privateBookingAvailable(now, seminars);
  const priv = privateOpen ? privateSlots(now, 4) : [];

  const myBookings = await prisma.sessionBooking.findMany({
    where: { userId, status: 'confirmed' }, orderBy: { startsAt: 'asc' }, take: 20,
  });

  return NextResponse.json({ group, seminars, privateOpen, private: priv, pricing: SESSION_PRICING, myBookings });
}
