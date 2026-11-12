import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { CoachView } from './_components/coach-view';
import { prisma } from '@/lib/db';
import { StoreOfferLinks, showStoreOfferLinks } from '@/components/coach-store/store-offer-links';

export const dynamic = 'force-dynamic';

export default async function CoachPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/coach'));
  // STORE-OFFER-1: the offer links, for a verified adult with the store flag on (no DB read while the flag is off)
  const offersFor = await showStoreOfferLinks(prisma, (session.user as { id?: string } | undefined)?.id);
  return (
    <div className="min-h-screen bg-fel-bg pb-20">
      {/* A11-01's heading is now the visible one in CoachView (premium-ui P8): one h1, seen and read */}
      <CoachView />
      <StoreOfferLinks adult={offersFor} />{/* STORE-OFFER-1: nothing unless the flag is on and the viewer a verified adult */}
    </div>
  );
}
