import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { isCoachStoreEnabled } from '@/lib/flags';
import { isAllowlistedCoach } from '@/lib/coach-store/coaches';
import { isMissingTable, logStoreUnavailable } from '@/lib/coach-store/gate';
import { reviewUrgency } from '@/lib/coach-store/reviews';
import { reviewHref, reviewStudioOpen } from '@/lib/coach-store/reviewLink';
import { PAIN_LINE } from '@/lib/coach-store/constants';
import { SyncWithStripe } from '@/components/coach-store/sync-stripe';
import { platformFeePolicy } from '@/lib/coach-business/config';
import { platformFeeLabel } from '@/lib/coach-business/fees';
import { readCoachPlan } from '@/lib/coach-business/planServer';
import { planDb } from '@/lib/coach-business/server';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  if (!isCoachStoreEnabled()) notFound();
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect(loginPath('/coach/dashboard'));
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
  const feeLabel = platformFeeLabel(platformFeePolicy(), await readCoachPlan(planDb(), userId).catch(() => 'free' as const));
  const earned = bookings.filter((b) => b.status === 'PAID').reduce((n, b) => n + (b.priceCents - b.platformFeeCents - b.stripeFeeCents), 0);
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 text-white">
      <h1 className="text-2xl font-black">Today</h1>
      <p className="mt-2 text-sm">All times Pacific.</p>
      <p className="mt-2 text-sm"><Link className="underline" href="/coach/dashboard/settings">Hours and days off</Link></p>
      <p className="mt-2"><SyncWithStripe /></p>
      <p className="mt-2 text-sm">Balance (accrued) ${(earned / 100).toFixed(2)}. Payouts are manual for now.</p>
      {/* owner call 5 (2026-10-27): the fee is read from the coach-business fee config (lib/coach-business/config.ts
          platformFeePolicy, the coach's plan) — the business dashboard's own "FEL keeps {fee}" — never a typed number */}
      <p className="mt-1 text-sm text-white/60">FEL keeps {feeLabel}. Stripe&apos;s card fee comes out of your share.</p>
      <ul className="mt-4 space-y-2 text-sm">
        {bookings.map((b) => (
          <li key={b.id} className="rounded-xl border border-white/10 p-3">
            {b.kind} · {b.status}
            {b.painYes ? <span className="ml-2 rounded bg-red-500/30 px-2">Pain — {PAIN_LINE}</span> : null}
            {b.dueAt ? <span className="ml-2">{reviewUrgency(b.dueAt, now)}</span> : null}
            {reviewStudioOpen(b) ? <Link className="ml-2 underline" href={reviewHref(b.id)}>Open review</Link> : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
