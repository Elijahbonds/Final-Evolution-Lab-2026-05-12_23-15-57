/**
 * FEL's platform fee. One pure constant so client components never import the Stripe SDK.
 * lib/stripe.ts re-exports this as PLATFORM_TAKE_RATE (same 0.15). The referral tree's
 * PLATFORM_TAKE stays 0.30; coach-store sales do not use that constant.
 */
export const PLATFORM_FEE_RATE = 0.15;
