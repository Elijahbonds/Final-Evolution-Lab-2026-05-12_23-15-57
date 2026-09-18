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
