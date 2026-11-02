// STORE-OFFER-1: the two store offers, linked from the coach landing page (/coach) — only while the coach store flag is on
// AND the viewer is a verified adult (the offer page's own check, isVerifiedAdult: unknown age is not an adult).
// Otherwise it renders nothing: no link to an offer page a minor cannot buy, or that 404s with the flag off.
import Link from 'next/link';
import { isCoachStoreEnabled } from '@/lib/flags';
import { isVerifiedAdult } from '@/lib/coach-store/adult';
import { REVIEW_BUTTON_LABEL } from '@/lib/coach-store/storeOffers';
import type { GateDb } from '@/lib/privacy/scanSaveGate';

/** Whether /coach shows the offer links. Flag off: false before any DB read. No user: false. */
export async function showStoreOfferLinks(db: GateDb, userId: string | undefined): Promise<boolean> {
  if (!isCoachStoreEnabled() || !userId) return false;
  return isVerifiedAdult(db, userId);
}

export function StoreOfferLinks({ adult }: { adult: boolean }) {
  if (!isCoachStoreEnabled() || !adult) return null;
  return (
    <nav aria-label="Store offers" data-testid="store-offer-links" className="mx-auto mt-8 flex max-w-xl flex-col gap-3 px-4 text-base">
      <Link href="/coach/offers/dunk-jump-review" className="text-[#FFD700] underline">{REVIEW_BUTTON_LABEL}</Link>
      <Link href="/coach/offers/founders-coaching" className="text-[#FFD700] underline">Founders Coaching — $129/month</Link>
    </nav>
  );
}
