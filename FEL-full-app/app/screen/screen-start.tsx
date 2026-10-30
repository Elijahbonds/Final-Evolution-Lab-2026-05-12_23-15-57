'use client';

// /screen — the QR page. Two ways in, and nothing else loaded: no pose runtime until a button is tapped.
import { ScreenFrame } from '@/app/play/mirror/assess/_components/screen-ui';
import { StartStep } from '@/app/play/mirror/assess/_components/gate-steps';
import { ASSESS_PATH } from '@/lib/screen/routes';
import Link from 'next/link';
import { REVIEW_BUTTON_LABEL } from '@/lib/coach-store/storeOffers';

export function ScreenStart({ reviewHref = null }: { reviewHref?: string | null } = {}) {
  const back = () => { if (typeof window !== 'undefined' && window.history.length > 1) window.history.back(); };
  return (
    <ScreenFrame back={back}>
      <StartStep jumpHref={`${ASSESS_PATH}?run=vertical`} fullHref={`${ASSESS_PATH}?run=full`} />
      {/* STORE-OFFER-1: "Book a review", after the screen's own two buttons — only while the store flag is on (the offer page
          itself is sign-in and verified-adult only) */}
      {reviewHref && (
        <Link href={reviewHref} data-action="book-review" className="mx-auto mt-6 block text-center font-mono text-xs text-[#FFD700] underline">
          {REVIEW_BUTTON_LABEL}
        </Link>
      )}
    </ScreenFrame>
  );
}
