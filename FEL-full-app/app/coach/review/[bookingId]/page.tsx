import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { ReviewStudio } from '@/components/coach-store/review-studio';
import { isCoachStoreEnabled } from '@/lib/flags';
import { isAllowlistedCoach } from '@/lib/coach-store/coaches';
import { isMissingTable, logStoreUnavailable } from '@/lib/coach-store/gate';
import { reviewHref, reviewRole, reviewStudioOpen } from '@/lib/coach-store/reviewLink';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false }, title: 'Video review' };

/** One studio, two sides: the buyer uploads clips, the booking's coach records the reply. The server picks the side. */
export default async function ReviewPage({ params }: { params: { bookingId: string } }) {
  if (!isCoachStoreEnabled()) notFound();
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect(loginPath(reviewHref(params.bookingId)));
  let booking: Awaited<ReturnType<typeof prisma.booking.findUnique>> = null;
  try {
    booking = await prisma.booking.findUnique({ where: { id: params.bookingId } });
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    logStoreUnavailable();
    return <main className="px-4 py-8 text-white">Coach store is not set up yet.</main>;
  }
  if (!booking || !reviewStudioOpen(booking)) notFound();
  const role = reviewRole(booking, userId, isAllowlistedCoach(userId));
  if (!role) notFound();
  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-black text-white">Video review</h1>
      <ReviewStudio bookingId={booking.id} coach={role === 'coach'} />
    </main>
  );
}
