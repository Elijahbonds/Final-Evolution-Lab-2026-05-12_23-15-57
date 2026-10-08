/**
 * lib/flags.ts — server-side feature flags.
 *
 * Flags are read from environment variables and default to OFF. They gate
 * incomplete or compliance-sensitive surfaces so code can ship dark and be
 * switched on by the operator (Elijah) without a redeploy of new logic.
 *
 * Convention: a flag is ON only when its env var is exactly "1" or "true"
 * (case-insensitive). Anything else — unset, "0", "false", "" — is OFF.
 */

function envOn(name: string): boolean {
  const v = (process.env[name] ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

/**
 * M3 Track C — NEXUS Studio Creator monetization surface (subscription gating,
 * build metering/quota, overage credits, cartridge publishing, partner API).
 * Default OFF. Elijah flips STUDIO_CREATOR_ENABLED=1 when ready to expose it.
 */
export function isStudioCreatorEnabled(): boolean {
  return envOn('STUDIO_CREATOR_ENABLED');
}

/**
 * M4 Track B — real-money competition (escrow, KYC, geo-gating). Default OFF.
 * Declared here so M3 code that references it compiles; wired fully in M4.
 */
export function isRealMoneyCompetitionEnabled(): boolean {
  return envOn('REAL_MONEY_COMPETITION');
}

/** Standard 403 body for a disabled feature. */
export const FEATURE_DISABLED = { error: 'feature_disabled', message: 'This feature is not currently enabled.' } as const;

/**
 * M13 Track (Season engine) — the PRO lane of the season pass is a paid,
 * cosmetic-only upgrade on Stripe rails. Default OFF: the pass ships with the
 * FREE lane fully live and the PRO lane visible-but-dark until Elijah flips
 * SEASON_PASS_PURCHASE=1. No pricing is decided in code (owner owns pricing).
 */
export function isSeasonPassPurchaseEnabled(): boolean {
  return envOn('SEASON_PASS_PURCHASE');
}

/**
 * PRO-lane price in USD cents, read from SEASON_PASS_PRO_PRICE_USD_CENTS.
 *
 * Pricing is the OWNER's, never the code's: there is deliberately no default
 * and no fallback. Unset (or non-positive) returns null and the checkout route
 * answers 503 `not_configured`, so the lane can never be sold at a price the
 * repo invented. Elijah sets the env var; changing the price needs no deploy.
 */
export function seasonPassProPriceUsdCents(): number | null {
  const raw = Number((process.env.SEASON_PASS_PRO_PRICE_USD_CENTS ?? '').trim());
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return Math.round(raw);
}

/** COACH-STORE-V1. Default OFF. Pages and routes 404 while this is unset. */
export function isCoachStoreEnabled(): boolean {
  return envOn('COACH_STORE_ENABLED');
}

/** Checkout. Still test mode only. Default OFF. */
export function isCoachStorePaymentsEnabled(): boolean {
  return envOn('COACH_STORE_PAYMENTS_ENABLED');
}

/** Signed upload URLs and selling async video review. Default OFF. */
export function isCoachReviewUploadsEnabled(): boolean {
  return envOn('COACH_REVIEW_UPLOADS_ENABLED');
}

/**
 * Real Stripe transfers. Default OFF. The payout route answers 503 and writes nothing
 * until this is on, and even then it does not mark a payout completed without a transfer.
 */
export function isPayoutsEnabled(): boolean {
  return envOn('PAYOUTS_ENABLED');
}

/** LIVE-PAGE-FLAGOFF. Default OFF. /live/schedule 404s while unset. */
export function isLiveStreamScheduleEnabled(): boolean {
  return envOn('LIVE_STREAM_SCHEDULE_ENABLED');
}

/**
 * STORE-READY B1 — /closet "Scan My Face". Default OFF: the button, its helper line and the
 * FaceScanCapture module (tasks-vision + the Google model fetch) exist only behind this flag.
 */
export function isFaceScanEnabled(): boolean {
  return envOn('FACE_SCAN_ENABLED');
}

/**
 * STORE-READY B2 — a live Stripe key (sk_live_/rk_live_) opens coach-store checkout ONLY while
 * this is on. Default OFF: a live key with the flag unset answers store_closed live_mode_off.
 */
export function isCoachStoreLive(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.COACH_STORE_LIVE ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

/**
 * STORE-READY B10 (FE PM 4:33 PM PT Oct 7) — every real-money checkout that is NOT the coach store
 * (coin packs, shard packs, all /api/stripe/checkout products, season pass PRO, studio credits,
 * marketplace) stays refused while this is off. Default OFF: no real-money product outside the
 * coach store sells at launch — each needs an 18+ check and a refund path before this flag is
 * turned on. The coach store never reads this flag.
 */
export function isVirtualPurchasesEnabled(): boolean {
  return envOn('VIRTUAL_PURCHASES_ENABLED');
}
