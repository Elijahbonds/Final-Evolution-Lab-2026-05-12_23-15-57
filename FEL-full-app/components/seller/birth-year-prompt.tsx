import Link from 'next/link';
import { SELLER_AGE_MESSAGES } from '@/lib/seller/canSell';

/**
 * SELLER-18-1 v2 (PM 2026-11-09): a seller with no birth year on file is asked for one — a line on their seller page
 * while SELLER_ADULT_GATE_ENABLED is off, the whole page once it is on. The link is the existing account step (/age,
 * AgeStep mode="account" → POST /api/account/birth-year), which comes back to `next`.
 */
export function sellerBirthYearHref(next: string): string {
  return `/age?next=${encodeURIComponent(next)}`;
}

export function SellerBirthYearPrompt({ next }: { next: string }) {
  return (
    <p className="mt-2 rounded-xl border border-[#F5C518]/40 p-3 text-sm" data-seller-birth-year>
      {SELLER_AGE_MESSAGES.age_unknown}{' '}
      <Link className="font-semibold text-[#F5C518] underline" href={sellerBirthYearHref(next)}>Add your birth year</Link>
    </p>
  );
}
