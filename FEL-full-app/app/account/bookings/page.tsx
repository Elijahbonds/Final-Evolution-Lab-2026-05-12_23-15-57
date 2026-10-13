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

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false }, title: 'Your bookings' };

const ACTION = 'rounded-md border border-white/20 px-3 py-1.5 text-sm font-semibold hover:border-white/50';

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
    return <main className="mx-auto max-w-xl px-4 py-8 text-white">Coach store is not set up yet.</main>;
  }

  const now = new Date();
  const origin = siteOrigin();
  const views = rows.map((row) => bookingRowView(row, now, (id, s, e) => (origin ? icsFor(id, s, e, origin) : null)));

  return (
    <main className="mx-auto max-w-xl px-4 py-8 text-white">
      <h1 className="text-2xl font-black">Your bookings</h1>
      <p className="mt-2 text-sm text-white/60">Video reviews and live calls you bought. Newest first.</p>
      {views.length === 0 ? (
        <div className="mt-6 rounded-xl border border-white/10 p-4 text-sm">
          <p>No bookings yet.</p>
          <Link className="mt-2 inline-block underline" href="/coach">Browse coaching</Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {views.map((v) => (
            <li key={v.id} className="rounded-xl border border-white/10 p-4">
              <p className="font-semibold">{v.title}</p>
              <p className="mt-1 text-sm text-white/70">{v.statusLine}</p>
              {v.whenLine ? <p className="mt-1 text-sm text-white/60">{v.whenLine}</p> : null}
              {v.joinHint ? <p className="mt-1 text-xs text-white/50">{v.joinHint}</p> : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {v.review ? <Link className={ACTION} href={v.review.href}>{v.review.label}</Link> : null}
                {v.join ? <Link className={ACTION} href={v.join.href}>{v.join.label}</Link> : null}
                {v.calendarIcs ? <AddToCalendar ics={v.calendarIcs} className={ACTION} /> : null}
                {v.receipt ? <a className="text-sm underline" href={v.receipt.href}>{v.receipt.label}</a> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-8 text-sm text-white/60">
        Programs and memberships are under <Link className="underline" href="/account/coaching">Coaching</Link>.
      </p>
    </main>
  );
}
