import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReviewStudio } from '@/components/coach-store/review-studio';
import { isCoachStoreEnabled } from '@/lib/flags';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false }, title: 'Video review' };

export default function ReviewPage({ params }: { params: { bookingId: string } }) {
  if (!isCoachStoreEnabled()) notFound();
  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-black text-white">Video review</h1>
      <ReviewStudio bookingId={params.bookingId} />
    </main>
  );
}
