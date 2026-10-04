import { notFound } from 'next/navigation';
import { CallRoom } from '@/components/coach-store/call/room';
import { isCoachStoreEnabled } from '@/lib/flags';

export const dynamic = 'force-dynamic';

export default function SessionPage({ params }: { params: { bookingId: string } }) {
  if (!isCoachStoreEnabled()) notFound();
  return <CallRoom bookingId={params.bookingId} />;
}
