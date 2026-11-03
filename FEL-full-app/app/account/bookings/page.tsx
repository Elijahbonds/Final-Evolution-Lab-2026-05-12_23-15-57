import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { isCoachStoreEnabled } from '@/lib/flags';
import { icsFor } from '@/lib/coach-store/api';
import { isMissingTable, logStoreUnavailable } from '@/lib/coach-store/gate';
import { bookingRowView, HIDDEN_BOOKING_STATUSES } from '@/lib/coach-store/myBookings';
import { siteOrigin } from '@/lib/stripe/site-origin';
import { AddToCalendar } from '@/components/coach-store/add-to-calendar';
import { SHOP_LOOK as L } from '@/components/shop/look';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false }, title: 'Your bookings' };

// PLAT-P07 (2026-11-02): one action look on this page (the shop's outlined button)
const ACTION = L.buy.replace('mt-3 ', '');

/**
 * YOUR BOOKINGS — the way back to a paid video review or live call after the thanks page (owner 2026-10-13).
 * Signed-in only (the buyer's own rows: Booking.clientUserId). Flag-gated by COACH_STORE_ENABLED like the other coach
 * pages (off is a 404); a missing table says "not set up yet", like the coach dashboard. The rules for each action
 * are in lib/coach-store/myBookings.ts. Programs and memberships already have a home, /account/coaching.
 */
export default async function BookingsPage() {
  if (!isCoachStoreEnabled()) notFound();
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect(loginPath('/account/bookings'));

  let rows: Awaited<ReturnType<typeof prisma.booking.findMany>> = [];
  try {
    rows = await prisma.booking.findMany({
      where: { clientUserId: userId, status: { notIn: [...HIDDEN_BOOKING_STATUSES] } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    logStoreUnavailable();
    return <main className={L.page}><h1 className={L.title}>Bought and booked</h1><p className={L.lede}>Coach store is not set up yet.</p></main>;
  }

  const now = new Date();
  const origin = siteOrigin();
  const views = rows.map((row) => bookingRowView(row, now, (id, s, e) => (origin ? icsFor(id, s, e, origin) : null)));

  // PLAT-P07: one list of everything bought or booked — the coach store's bookings (each with its own actions: Upload
  // clips, Join call, Add to calendar, Receipt; lib/coach-store/myBookings.ts), then one line each to the books and the
  // coaching you own, which keep their own pages (My Library, /account/coaching).
  return (
    <main className={L.page}>
      <p className={L.eyebrow}>Account</p>
      <h1 className={L.title}>Bought and booked</h1>
      <ul className="mt-6 space-y-3" data-bookings>
        {views.map((v) => (
          <li key={v.id} className={L.card} data-booking={v.id}>
            <p className={L.cardTitle}>{v.title}</p>
            <p className={L.cardLine}>{v.statusLine}{v.whenLine ? ` · ${v.whenLine}` : ''}</p>
            {v.joinHint ? <p className={L.cardSide}>{v.joinHint}</p> : null}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {v.review ? <Link className={ACTION} href={v.review.href}>{v.review.label}</Link> : null}
              {v.join ? <Link className={ACTION} href={v.join.href}>{v.join.label}</Link> : null}
              {v.calendarIcs ? <AddToCalendar ics={v.calendarIcs} className={ACTION} /> : null}
              {v.receipt ? <a className={`${L.cardSide} underline`} href={v.receipt.href}>{v.receipt.label}</a> : null}
            </div>
          </li>
        ))}
      </ul>
      {views.length === 0 ? <p className={L.lede}>No bookings yet. <Link className="underline" href="/coach">Browse coaching</Link></p> : null}
      <ul className={`${L.rows} mt-6`} aria-label="More you own">
        <li><Link className={L.row} href="/press/library"><span>Audiobooks</span><span aria-hidden className={L.rowSide}>›</span></Link></li>
        <li><Link className={L.row} href="/account/coaching"><span>Programs and memberships</span><span aria-hidden className={L.rowSide}>›</span></Link></li>
        <li><Link className={L.row} href="/coaches"><span>Find a coach</span><span aria-hidden className={L.rowSide}>›</span></Link></li>
      </ul>
    </main>
  );
}
