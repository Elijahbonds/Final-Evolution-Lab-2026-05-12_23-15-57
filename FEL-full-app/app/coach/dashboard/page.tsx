import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isCoachStoreEnabled } from '@/lib/flags';
import { isAllowlistedCoach } from '@/lib/coach-store/coaches';
import { isMissingTable, logStoreUnavailable } from '@/lib/coach-store/gate';
import { reviewUrgency } from '@/lib/coach-store/reviews';
import { PAIN_LINE } from '@/lib/coach-store/constants';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  if (!isCoachStoreEnabled()) notFound();
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect(`/login?next=${encodeURIComponent('/coach/dashboard')}`);
  if (!isAllowlistedCoach(userId)) notFound();
  const now = new Date();
  let bookings: Awaited<ReturnType<typeof prisma.booking.findMany>> = [];
  try {
    bookings = await prisma.booking.findMany({ where: { coachUserId: userId }, orderBy: { dueAt: 'asc' } });
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    logStoreUnavailable();
    return <main className="px-4 py-8 text-white">Coach store is not set up yet.</main>;
  }
  const earned = bookings.filter((b) => b.status === 'PAID').reduce((n, b) => n + (b.priceCents - b.platformFeeCents - b.stripeFeeCents), 0);
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 text-white">
      <h1 className="text-2xl font-black">Today</h1>
      <p className="mt-2 text-sm">All times Pacific.</p>
      <p className="mt-2 text-sm">Balance (accrued) ${(earned / 100).toFixed(2)}. Payouts are manual for now.</p>
      <p className="mt-1 text-sm text-white/60">FEL keeps 15%. Stripe&apos;s card fee comes out of your share.</p>
      <ul className="mt-4 space-y-2 text-sm">
        {bookings.map((b) => (
          <li key={b.id} className="rounded-xl border border-white/10 p-3">
            {b.kind} · {b.status}
            {b.painYes ? <span className="ml-2 rounded bg-red-500/30 px-2">Pain — {PAIN_LINE}</span> : null}
            {b.dueAt ? <span className="ml-2">{reviewUrgency(b.dueAt, now)}</span> : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
