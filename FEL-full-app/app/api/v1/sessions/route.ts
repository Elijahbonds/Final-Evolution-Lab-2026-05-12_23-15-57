export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { upcomingGroupSlots, privateSlots, privateBookingAvailable, SESSION_PRICING } from '@/lib/sessions/schedule';
import { readableKeys, hostingRows, slotCoachId, privateHolders, isPrivateKey, LONGEST_SESSION_MIN } from '@/lib/sessions/joinLink';
import { isSessionAdmin, readJoinLinks } from '@/lib/sessions/joinLinkServer';
import { isCertifiedCoach } from '@/lib/coach/server';

/**
 * GET /api/v1/sessions — upcoming group workouts + private availability + my bookings.
 * Each booking carries its join link (joinUrl + joinHost, null until posted). Admins and a slot's coach also get
 * `hosting`: the slots they post links for, each with its booked count and current link. Anyone else gets null.
 * `myBookings` is the sessions still to come (or running now), soonest first; a private slot somebody else holds is not
 * offered. CONFIRMED rows only: a booking the wallet paid back because its session ended with no link (status
 * 'refunded', lib/wallet/dead-buys.ts) is not listed. `noLinkRefund` says the links were read and this player has
 * none for that booking, the rule the wallet pays an ended session back by; the page promises the shards only then.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const now = new Date();
  const group = upcomingGroupSlots(now, 6);
  // Seminars are ad-hoc (none scheduled by default) -> private fallback opens.
  const seminars: { sessionKey: string; title: string; startsAtIso: string; seats: number; shards: number }[] = [];
  const privateOpen = privateBookingAvailable(now, seminars);

  // Upcoming only: a booking whose session is over leaves the list. Oldest-first with no lower bound, a regular's first
  // 20 sessions filled it for good, and a new booking (and its link) never showed.
  const myBookings = await prisma.sessionBooking.findMany({
    where: { userId, status: 'confirmed', startsAt: { gte: new Date(now.getTime() - LONGEST_SESSION_MIN * 60_000) } },
    orderBy: { startsAt: 'asc' }, take: 20,
  });

  // A private 1-on-1 holds one player (privateHolders): a slot somebody else holds is not offered, and its link goes to
  // the holder alone. The booking route asks for 8 slots, so up to 8 are looked at to offer 4.
  const offered = privateOpen ? privateSlots(now, 8) : [];
  const privateKeys = [...new Set([...offered.map((s) => s.sessionKey), ...myBookings.map((b) => b.sessionKey).filter(isPrivateKey)])];
  const holders = privateHolders(privateKeys.length
    ? await prisma.sessionBooking.findMany({
      where: { sessionKey: { in: privateKeys }, status: 'confirmed' },
      select: { id: true, userId: true, sessionKey: true, status: true, createdAt: true },
    })
    : []);
  const priv = offered.filter((s) => (holders.get(s.sessionKey) ?? userId) === userId).slice(0, 4);

  // Join links (owner decision 2026-09-24). A player reads a link only for a slot they hold a CONFIRMED booking for
  // (readableKeys re-checks the rows above); staff read the slots they host. A missing table reads as "not posted".
  const isAdmin = await isSessionAdmin(userId);
  let hosting: ReturnType<typeof hostingRows> | null = null;
  if (isAdmin || (await isCertifiedCoach(userId))) {
    const booked = await prisma.sessionBooking.groupBy({
      by: ['sessionKey', 'kind'],
      where: { status: 'confirmed', startsAt: { gte: new Date(now.getTime() - 60 * 60000) } },
      _count: { _all: true }, _min: { startsAt: true },
    });
    const rows = hostingRows(group, booked.map((b) => ({ sessionKey: b.sessionKey, kind: b.kind, count: b._count._all, startsAt: b._min.startsAt ?? now })));
    hosting = isAdmin ? rows : rows.filter((r) => slotCoachId(r.sessionKey) === userId);
  }
  const readable = new Set([...readableKeys(userId, myBookings, holders), ...(hosting ?? []).map((r) => r.sessionKey)]);
  // every booked slot is looked up, so a failed read is known even when none is readable; linkOf hands out readable ones only
  const links = await readJoinLinks([...new Set([...readable, ...myBookings.map((b) => b.sessionKey)])]);
  const linkOf = (key: string) => (readable.has(key) ? links?.get(key) ?? null : null);

  return NextResponse.json({
    group, seminars, privateOpen, private: priv, pricing: SESSION_PRICING,
    myBookings: myBookings.map((b) => ({
      ...b, joinUrl: linkOf(b.sessionKey)?.url ?? null, joinHost: linkOf(b.sessionKey)?.host ?? null, noLinkRefund: links !== null && !linkOf(b.sessionKey),
    })),
    hosting: hosting?.map((r) => ({ ...r, url: linkOf(r.sessionKey)?.url ?? null, host: linkOf(r.sessionKey)?.host ?? null })) ?? null,
  });
}
