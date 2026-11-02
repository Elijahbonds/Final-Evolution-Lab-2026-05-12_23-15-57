import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { isCoachStoreEnabled } from '@/lib/flags';
import { isVerifiedAdult } from '@/lib/coach-store/adult';
import { OFFER_COPY, OFFERS_PATH, storeOfferByKey } from '@/lib/coach-store/storeOffers';
import { OfferCard } from '@/components/coach-store/offer-card';

export const dynamic = 'force-dynamic';

/**
 * STORE-OFFER-1: one store offer. With COACH_STORE_ENABLED off (the default) this is a 404 before anything is read.
 * Signed-in only; the offer itself is for verified adults (the age lane's check). No checkout here yet: there is no
 * MarketplaceListing row for either offer, and this tip writes none.
 */
export default async function OfferPage({ params }: { params: { offer: string } }) {
  if (!isCoachStoreEnabled()) notFound();
  const row = storeOfferByKey(params.offer); const copy = OFFER_COPY[params.offer];
  if (!row || !copy) notFound();
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect(loginPath(`${OFFERS_PATH}/${row.key}`));
  const adult = await isVerifiedAdult(prisma, userId);
  return (
    <div className="min-h-screen bg-[#050505] px-4 py-12">
      <OfferCard copy={copy} adult={adult} />
    </div>
  );
}
