// STORE-OFFER-1: one store offer (lib/coach-store/storeOffers.ts), its fine print, and the refund link to the store terms.
import Link from 'next/link';
import { TERMS_REFUND_HREF, type OfferCopy } from '@/lib/coach-store/storeOffers';

export function OfferCard({ copy, adult }: { copy: OfferCopy; adult: boolean }) {
  return (
    <article className="fel-panel mx-auto w-full max-w-xl rounded-2xl p-7" data-offer={copy.key}>
      <h1 className="fel-heading text-3xl font-bold text-white">{copy.title}</h1>
      <p className="mt-1 font-mono text-lg text-[#00E5FF]">{copy.priceLabel}</p>
      <p className="mt-4 text-lg text-white">{copy.headline}</p>
      {copy.body && <p className="mt-3 text-sm text-white/70">{copy.body}</p>}
      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-white/80">
        {copy.bullets.map((b) => <li key={b}>{b}</li>)}
      </ul>
      {adult ? (
        <p className="mt-6 rounded-lg border border-white/15 px-4 py-3 font-mono text-xs text-white/60" data-testid="offer-checkout-pending">
          Booking opens when the store opens.
        </p>
      ) : (
        <p className="mt-6 rounded-lg border border-[#FF3366]/40 px-4 py-3 font-mono text-xs text-[#FF3366]" data-testid="offer-adults-only">
          This offer is for verified adults 18+ only.
        </p>
      )}
      <p className="mt-6 text-xs text-white/50" data-testid="offer-fine-print">
        Fine print: {copy.finePrint}{' '}
        <Link href={TERMS_REFUND_HREF} className="underline">Terms and refund page</Link>
      </p>
    </article>
  );
}
