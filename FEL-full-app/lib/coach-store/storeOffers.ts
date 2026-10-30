/**
 * STORE-OFFER-1 (2026-10-29): the two offers Elijah priced in Command & Launch at 9:33 PM PT — a $99 Dunk & Jump Review
 * and Founders Coaching, 10 spots at $129/month. Copy: /workspace/fel-specs/STORE-COPY-REVIEW-FOUNDERS-2026-10-29.md (DRAFT,
 * Elijah reviews before live). Typed, flag-off data in the same shape as `STORE_PRICES` (./storePrices — its nine approved
 * rows are pinned and untouched; these two sit beside them). Gated behind `isCoachStoreEnabled()` (`COACH_STORE_ENABLED`,
 * default off): with the flag unset nothing here is returned, linked or rendered. Writes no database rows.
 * Adults 18+ only: every buyer is `verified_adult` (./adult `isVerifiedAdult`, the age lane's check).
 */
import { isCoachStoreEnabled } from '@/lib/flags';
import { MAX_CLIPS, MAX_CLIP_SECONDS } from './constants';
import type { StorePriceRow } from './storePrices';

// ── Research's four calls, DECIDED: Elijah, 2026-10-29 11:54 PM PT ("Yes, use Research's store defaults: 8 reviews a week,
// 3 business days, Founders $129 locked for life, 2 reviews a month"). ──
/** Dunk & Jump Reviews per week. */
export const REVIEW_WEEKLY_CAP = 8;
/** Business days to deliver a review. */
export const REVIEW_TURNAROUND_BUSINESS_DAYS = 3;
/** The Founders price stays $129 for the member's life. */
export const FOUNDERS_PRICE_LOCKED_FOR_LIFE = true;
/** Video reviews a Founders member gets per month. */
export const FOUNDERS_REVIEWS_PER_MONTH = 2;
/** The price-lock words, ONE place: Research may revise them. */
export const FOUNDERS_PRICE_LOCK_WORDING = 'locked for life';
/** Weeks between a Founders member's Mirror re-screens (Elijah, 2026-10-30 12:16 AM PT: "Founders rescreen every 6 weeks"). */
export const FOUNDERS_RESCREEN_WEEKS = 6;

/** Elijah's picks (9:33 PM PT). */
export const REVIEW_PRICE_CENTS = 9900;
export const FOUNDERS_PRICE_CENTS = 12900;
export const FOUNDERS_SPOTS = 10;

export const REVIEW_OFFER_KEY = 'dunk-jump-review';
export const FOUNDERS_OFFER_KEY = 'founders-coaching';
export const OFFERS_PATH = '/coach/offers';
export const REVIEW_OFFER_PATH = `${OFFERS_PATH}/${REVIEW_OFFER_KEY}`;
/** Refunds follow the existing public store terms (app/store-terms), refund section. */
export const TERMS_REFUND_HREF = '/store-terms#refund-policy';

export const STORE_OFFERS: readonly StorePriceRow[] = [
  {
    key: REVIEW_OFFER_KEY,
    title: 'Dunk & Jump Review',
    priceCents: REVIEW_PRICE_CENTS,
    billing: 'one_time',
    manifest: { kind: 'video_review', maxClips: MAX_CLIPS, maxClipSeconds: MAX_CLIP_SECONDS },
    buyer: 'verified_adult',
  },
  {
    key: FOUNDERS_OFFER_KEY,
    title: 'Founders Coaching',
    priceCents: FOUNDERS_PRICE_CENTS,
    billing: 'month',
    manifest: { kind: 'membership', audience: 'adult', interval: 'month' },
    buyer: 'verified_adult',
  },
] as const;

export interface OfferCopy {
  key: string;
  title: string;
  priceLabel: string;
  headline: string;
  body?: string;
  bullets: readonly string[];
  finePrint: string;
}

/** The copy draft, with Research's calls filled from the constants above (all decided). */
export const OFFER_COPY: Readonly<Record<string, OfferCopy>> = {
  [REVIEW_OFFER_KEY]: {
    key: REVIEW_OFFER_KEY,
    title: 'Dunk & Jump Review',
    priceLabel: '$99',
    headline: 'Send me your jump. I\'ll break it down.',
    body: 'Upload a clip of your approach and takeoff (side view plus front view if you can). I\'ll personally review your plant, takeoff and arm swing, and send back a video breakdown with the 2–3 fixes that matter most and the drills to fix them.',
    bullets: [
      'One clip set, one personal video review from Elijah Bonds',
      `Back within ${REVIEW_TURNAROUND_BUSINESS_DAYS} business days`,
      `Limited to ${REVIEW_WEEKLY_CAP} reviews per week. When this week is full, you'll see the next open week.`,
      'For adults 18+.',
    ],
    finePrint: 'This is a coaching and postural assessment, never a medical diagnosis. It doesn\'t promise any jump height. If you have pain or an injury, see a licensed clinician first. Refunds follow our Terms and refund page.',
  },
  [FOUNDERS_OFFER_KEY]: {
    key: FOUNDERS_OFFER_KEY,
    title: `Founders Coaching (${FOUNDERS_SPOTS} spots)`,
    priceLabel: '$129/month',
    headline: `Train with me every month. Only ${FOUNDERS_SPOTS} spots.`,
    bullets: [
      'Your program, written by Elijah and updated monthly',
      `${FOUNDERS_REVIEWS_PER_MONTH} video reviews per month`,
      `Mirror movement screen at the start and every ${FOUNDERS_RESCREEN_WEEKS} weeks to track progress`,
      ...(FOUNDERS_PRICE_LOCKED_FOR_LIFE ? [`Founders price $129, ${FOUNDERS_PRICE_LOCK_WORDING}`] : []),
      'Cancel anytime, effective at the end of the billing period',
      'For adults 18+.',
    ],
    finePrint: 'Coaching and postural assessment, never diagnosis. No guaranteed results. Refunds follow our Terms and refund page.',
  },
};

/** The end-of-game and /screen button (copy file: "Button text"). */
export const REVIEW_BUTTON_LABEL = 'Get your jump reviewed by Elijah — $99';

/** Flag-gated read path, same pattern as `getStorePrices()`. `[]` while `COACH_STORE_ENABLED` is off. */
export function getStoreOffers(): readonly StorePriceRow[] {
  return isCoachStoreEnabled() ? STORE_OFFERS : [];
}

export function storeOfferByKey(key: string): StorePriceRow | undefined {
  return STORE_OFFERS.find((r) => r.key === key);
}

/** Where the "Book a review" button goes — or null (no button anywhere) while the store flag is off. */
export function reviewOfferHref(): string | null {
  return isCoachStoreEnabled() ? REVIEW_OFFER_PATH : null;
}
