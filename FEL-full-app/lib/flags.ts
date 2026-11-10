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

import { DEMO_MODEL_FLAG_ENV, type DemoModelFlags } from './babylon/core/demoModels';

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

/**
 * NEXUS STUDIO (owner, 2026-10-14) — the Nexus editor inside FEL at /studio (docs/NEXUS-STUDIO.md). Default OFF: /studio
 * is a 404 for everyone while unset. Separate from STUDIO_CREATOR_ENABLED, which opens the PAID Studio surface (credits,
 * cartridges, partner keys) — turning the editor on must not open those.
 */
export function isNexusStudioEnabled(): boolean {
  return envOn('NEXUS_STUDIO_ENABLED');
}

/**
 * NEX-06 (owner 2026-10-20): Studio SHARE LINKS — a creator's venue played by link (lib/nexus-studio/share.ts). Default OFF: every
 * share route and the /play/shared landing are a 404 while unset. Separate from NEXUS_STUDIO_ENABLED (the editor), so the owner can
 * use the Studio without links reaching anyone.
 */
export function isStudioShareEnabled(): boolean {
  return envOn('STUDIO_SHARE_ENABLED');
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
 * FOUNDERS-CAP-1 (Cyber COACH-STORE-CHECKOUT-SIGNOFF L2) — the server cap of FOUNDERS_SPOTS (10) on the Founders membership
 * (lib/coach-store/foundersCap.ts). Default OFF: checkout and fulfilment behave as today. ON: the 11th Founders checkout is
 * 409 sold_out before any Stripe call, and a paid Founders checkout that would make an 11th member is refund_due, not granted.
 */
export function isFoundersCapEnabled(): boolean {
  return envOn('FOUNDERS_CAP_ENABLED');
}

/**
 * Real Stripe transfers. Default OFF. The payout route answers 503 and writes nothing
 * until this is on, and even then it does not mark a payout completed without a transfer.
 */
export function isPayoutsEnabled(): boolean {
  return envOn('PAYOUTS_ENABLED');
}

/** TRY-AGE-PLACEHOLDER-1 (Cyber's B1 ruling). Default OFF: /try reads the age answer by year alone, as shipped. On: the full
 *  birth date picks the band (exact 13th / 18th birthday) and the band is locked for the session (lib/privacy/tryAgeGate). */
export function isTryAgeBandsEnabled(): boolean {
  return envOn('TRY_AGE_BANDS_ENABLED');
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

/**
 * FEEL PANEL (owner, 2026-10-20) — the hidden feel-knob sliders (docs/FEEL-PANEL.md). Default OFF. The panel opens only while this
 * is on AND the signed-in user is on FEEL_PANEL_USERS (below) or is an admin; GET /api/feel-panel answers both. Even then an
 * override applies only on this device, and only in an unpaid playtest run (lib/feel-panel/sessionGate.ts).
 */
export function isFeelPanelEnabled(): boolean {
  return envOn('FEEL_PANEL_ENABLED');
}

/**
 * FEEL_PANEL_USERS (owner decision 2026-10-20): a comma list of User ids that may open the feel panel — a NARROW permission that
 * opens the panel and nothing else (role 'admin' would also open the CRM and the admin dashboards). The shape of the coach store's
 * COACH_STORE_COACH_USER_IDS (lib/coach-store/coaches.ts). Ids only, never an email in code: the value lives in the env.
 */
export function feelPanelUserIds(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set((env.FEEL_PANEL_USERS ?? '').split(',').map((s) => s.trim()).filter(Boolean));
}

export function isFeelPanelUser(userId: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  return !!userId && feelPanelUserIds(env).has(userId);
}

// ── DEMO-MODELS-1 (owner, 2026-11-09: "Yes full swap") ─────────────────────────────────────────────────────────────────────
// Five server settings, each OFF by default, each its own switch (lib/babylon/core/demoModels.ts names what each does; v2 removed
// setting 5, the library-demo coach body: owner 10:09 AM, "Each viewer sees their own body in workouts and anatomy"). With all
// five off the app is exactly as live: /api/v1/hero-body sends no `demo` and the client keeps every body and request as before.
// AM turns each on only after Elijah's yes on its before/after shots.

/** 1. DEMO_COACH_BODY_ENABLED: the scan owner plays the prep2 coach body (the Meshy scan is the fallback). */
export function isDemoCoachBodyEnabled(): boolean { return envOn(DEMO_MODEL_FLAG_ENV.coachBody); }
/** 2. COACH_BODY_MASK_ENABLED: the skin under the coach body's tee, shorts and shoes is masked (no skin through the tee). */
export function isCoachBodyMaskEnabled(): boolean { return envOn(DEMO_MODEL_FLAG_ENV.coachBodyMask); }
/** 3. DUNK_RIVAL_PREFETCH_ENABLED: Flight Night fetches the rival's body file once the first dunk is in. */
export function isDunkRivalPrefetchEnabled(): boolean { return envOn(DEMO_MODEL_FLAG_ENV.rivalPrefetch); }
/** 4. TRY_GUEST_COACH_BODY_ENABLED: a signed-out guest in /try's dunk demo (only there) plays the coach body (reverses the
 *  2026-09-14 rule while on, for that demo; workouts and anatomy keep the viewer's own body). */
export function isTryGuestCoachBodyEnabled(): boolean { return envOn(DEMO_MODEL_FLAG_ENV.tryGuestCoach); }
/** 6. CROWD_FORGE_FRONT_ENABLED: the crowd's forge front row defaults on (the feel knob crowd.forgeFront still overrides). */
export function isCrowdForgeFrontEnabled(): boolean { return envOn(DEMO_MODEL_FLAG_ENV.crowdForgeFront); }

/** All five, as the hero-body answer carries them. */
export function demoModelFlagsFromEnv(): DemoModelFlags {
  return {
    coachBody: isDemoCoachBodyEnabled(),
    coachBodyMask: isCoachBodyMaskEnabled(),
    rivalPrefetch: isDunkRivalPrefetchEnabled(),
    tryGuestCoach: isTryGuestCoachBodyEnabled(),
    crowdForgeFront: isCrowdForgeFrontEnabled(),
  };
}

/** BINJGB-SHELF-1. Default OFF. /play/gb-shelf* 404 while unset. */
export function isBinjgbShelfEnabled(): boolean {
  return envOn('BINJGB_SHELF_ENABLED');
}

/**
 * BINJGB-SHELF-1 load-your-own. Default OFF. OQ-1 ANSWERED — build switched off.
 * Requires BINJGB_SHELF_ENABLED (OQ-6). Cyber reviews local-file path in PR; G-FILE before ON.
 */
export function isBinjgbLocalFileEnabled(): boolean {
  return envOn('BINJGB_LOCAL_FILE_ENABLED');
}

/**
 * SELLER-18-1 (Cyber BOOK-SIGNOFF S-2; PM 2026-11-09) — the seller-side 18+ gate (lib/seller/canSell.ts). Default OFF:
 * every seller surface behaves as it does today and nothing is taken down; sellers with no birth year only see a prompt to
 * add one. ON: selling needs the role AND a verified adult by the database birth year (unknown age refused), and a seller
 * found to be under 18 is taken down with payouts frozen. Switching it on needs Elijah's own words.
 */
export function isSellerAdultGateEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.SELLER_ADULT_GATE_ENABLED ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}
