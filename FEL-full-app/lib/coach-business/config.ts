// lib/coach-business/config.ts — COACH-BUSINESS (owner decisions 2026-10-25): every switch and every number the owner
// sets for the coach business lives here, read from the environment, so changing one needs no code change.
//
//   · COACH_CONNECT_PAYMENTS_ENABLED  — coaches charging clients through Stripe Connect (onboarding, package checkout,
//                                        refunds, the payouts dashboard link). OFF by default: every money route answers
//                                        409 store_closed `payments_off` and the pages say "Payments aren't live yet".
//   · COACH_CONNECT_LIVE               — a LIVE Stripe key (sk_live_/rk_live_) opens those routes only while this is on.
//                                        OFF by default, so with the payments switch on the routes still sell in TEST mode only.
//   · COACH_PRO_ENABLED                — the Free/Pro gates are enforced and Coach Pro is on sale. OFF by default: no coach
//                                        loses anything they have today while Pro cannot be bought.
//   · COACH_PRO_PRICE_USD_CENTS        — the Pro price, per month. Default COACH_PRO_PRICE_DEFAULT_CENTS ($39, the owner's
//                                        price of 2026-10-25). Every place the Coach Pro / FEL Coach price shows or is
//                                        charged reads coachProPriceCents(): the upgrade, /api/stripe/checkout FEL_COACH
//                                        (lib/stripe.ts) and the B2B paywall line (lib/pro-guard.ts).
//   · COACH_FREE_CLIENT_LIMIT          — how many active clients a Free coach keeps. Default FREE_CLIENT_LIMIT_DEFAULT (3,
//                                        the owner's number of 2026-10-25).
//   · COACH_MARKETPLACE_ENABLED        — /coaches (find a coach) and applying to a coach. OFF by default.
//
// The 5% revenue share is the owner's decision (2026-10-25), so it is a constant here, not an env read. So is Stripe's
// card rate, which the buyer's processing fee is sized to (fees.ts saleSplit): one place, no scattered literals.

function envOn(env: NodeJS.ProcessEnv, name: string): boolean {
  const v = (env[name] ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

/** FEL's share of a coach's sale through Stripe Connect, in basis points (owner, 2026-10-25: 5%). */
export const CONNECT_FEE_BPS = 500;

/**
 * Stripe's processing fee on a card charge, which the BUYER covers (owner, 2026-10-25: "5% + Stripe fee on top").
 * assumption: Stripe's US standard card rate, 2.9% + 30¢ (domestic cards, no negotiated pricing). International cards
 * (+1.5%) and currency conversion (+1%) cost FEL more than this; docs/COACH-BUSINESS.md says by how much.
 */
export const STRIPE_CARD_FEE_BPS = 290;
export const STRIPE_CARD_FEE_FIXED_CENTS = 30;

// ── PAYMENTS-READY (2026-10-26): the owner's two open money calls, each one env value away ─────────────────────────────
// MONEY CONSTANTS. PAYMENTS-READY shipped every default as the behaviour of 2026-10-26.
//
// TUNED (MONEY), owner, in chat, 2026-10-27: "You do it. I approve." — the answer to Owner Inbox cards "coach-fee" and
// "refund-fee", which recommended "5% on free, 0% on Pro" and "follow the terms you already approved: refund in full".
//   · PLATFORM_FEE_BPS_PRO_DEFAULT  500 → 0     A Coach Pro coach pays FEL no share of a sale; Coach Free keeps 5%.
//   · REFUND_PROCESSING_FEE_DEFAULT false → true  A refund returns the buyer's processing fee too: refunded in full,
//                                                 FEL absorbs Stripe's fee (the coach's outcome does not change).
// The env still overrides both (PLATFORM_FEE_BPS_PRO=500 restores 5% on Pro; REFUND_PROCESSING_FEE=0/false/off/no
// restores "the processing fee is not refunded"), and scripts/payments-preflight.ts prints what is in force.
//
//   · PLATFORM_FEE_BPS_FREE / PLATFORM_FEE_BPS_PRO — FEL's share of a coach's sale, in basis points, by the coach's plan
//     (plan.ts: Pro = an active FEL_COACH / FEL_FACILITY subscription or the coach-store allowlist). Defaults: Free 500
//     (5%, the owner's 5% of 2026-10-25), Pro 0 (0%, the owner's "0% on Pro" of 2026-10-27).
//   · PLATFORM_FEE_CAP_CENTS_MONTHLY — the most FEL takes from one coach in a calendar month (UTC), in cents, across
//     every sale. Unset = no cap (today). A sale that would pass the cap is charged only what is left of it; past the
//     cap FEL takes 0. The month's total is read from FEL's ledger (COACH_CONNECT_FEE less COACH_CONNECT_FEE_REFUND, by
//     coach) plus the checkouts still open, so two checkouts started together cannot both spend the same room.
//   · REFUND_PROCESSING_FEE — on a refund, does the buyer also get back their share of the processing fee? Default ON
//     since 2026-10-27 (the owner: "refund in full", matching the store terms §2.6 "We refund the full price you paid
//     and absorb that fee ourselves"): the buyer gets the price AND the same share of the processing fee back, the
//     coach's outcome is unchanged, and FEL absorbs Stripe's fee (Stripe keeps it on a refunded charge). Set it to
//     0/false/off/no for the old rule ("the processing fee is not refunded").
// Every value is read on each use. A value that is not a whole number in range falls back to the default, and
// scripts/payments-preflight.ts reports it, so a typo never silently changes a fee.

/** (new, MONEY) FEL's share in bps for a Free coach while PLATFORM_FEE_BPS_FREE is unset: today's 5%. */
export const PLATFORM_FEE_BPS_FREE_DEFAULT = CONNECT_FEE_BPS;
/** (MONEY, TUNED 2026-10-27: 500 → 0, owner "0% on Pro") FEL's share in bps for a Pro coach while PLATFORM_FEE_BPS_PRO is unset. */
export const PLATFORM_FEE_BPS_PRO_DEFAULT = 0;
/** (new, MONEY) No monthly cap while PLATFORM_FEE_CAP_CENTS_MONTHLY is unset: today. */
export const PLATFORM_FEE_CAP_CENTS_MONTHLY_DEFAULT: number | null = null;
/** (MONEY, TUNED 2026-10-27: false → true, owner "refund in full") A refund returns the processing fee while
 *  REFUND_PROCESSING_FEE is unset. */
export const REFUND_PROCESSING_FEE_DEFAULT = true;
/** A cap above this is a typo, not a policy ($1,000,000 a month). */
export const PLATFORM_FEE_CAP_MAX_CENTS = 100_000_000;

export interface FeePolicy { bpsFree: number; bpsPro: number; capCentsMonthly: number | null }

function bpsFrom(raw: string | undefined, fallback: number): number {
  const v = (raw ?? '').trim();
  if (!/^\d+$/.test(v)) return fallback;
  const n = Number(v);
  return n <= 10_000 ? n : fallback;
}

function capFrom(raw: string | undefined): number | null {
  const v = (raw ?? '').trim();
  if (!/^\d+$/.test(v)) return PLATFORM_FEE_CAP_CENTS_MONTHLY_DEFAULT;
  const n = Number(v);
  return n <= PLATFORM_FEE_CAP_MAX_CENTS ? n : PLATFORM_FEE_CAP_CENTS_MONTHLY_DEFAULT;
}

/** The platform-fee settings in force (defaults: 5% on Free, 0% on Pro, no cap). */
export function platformFeePolicy(env: NodeJS.ProcessEnv = process.env): FeePolicy {
  return {
    bpsFree: bpsFrom(env.PLATFORM_FEE_BPS_FREE, PLATFORM_FEE_BPS_FREE_DEFAULT),
    bpsPro: bpsFrom(env.PLATFORM_FEE_BPS_PRO, PLATFORM_FEE_BPS_PRO_DEFAULT),
    capCentsMonthly: capFrom(env.PLATFORM_FEE_CAP_CENTS_MONTHLY),
  };
}

const ON_WORDS = ['1', 'true', 'on', 'yes'];
const OFF_WORDS = ['', '0', 'false', 'off', 'no'];

/** Does a refund also return the buyer's share of the processing fee? Default: yes (owner, 2026-10-27). An explicit
 *  off word turns it off; unset, blank or anything not understood is the default. */
export function refundProcessingFee(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.REFUND_PROCESSING_FEE ?? '').trim().toLowerCase();
  if (ON_WORDS.includes(v)) return true;
  if (v !== '' && OFF_WORDS.includes(v)) return false;
  return REFUND_PROCESSING_FEE_DEFAULT;
}

/** The money env values that are set but not understood (each falls back to its default). For the preflight. */
export function moneyEnvProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  const out: string[] = [];
  for (const k of ['PLATFORM_FEE_BPS_FREE', 'PLATFORM_FEE_BPS_PRO'] as const) {
    const v = (env[k] ?? '').trim();
    if (v && (!/^\d+$/.test(v) || Number(v) > 10_000)) out.push(`${k} is not a whole number of basis points from 0 to 10000; the default ${k === 'PLATFORM_FEE_BPS_FREE' ? PLATFORM_FEE_BPS_FREE_DEFAULT : PLATFORM_FEE_BPS_PRO_DEFAULT} applies`);
  }
  const cap = (env.PLATFORM_FEE_CAP_CENTS_MONTHLY ?? '').trim();
  if (cap && (!/^\d+$/.test(cap) || Number(cap) > PLATFORM_FEE_CAP_MAX_CENTS)) out.push(`PLATFORM_FEE_CAP_CENTS_MONTHLY is not a whole number of cents up to ${PLATFORM_FEE_CAP_MAX_CENTS}; no cap applies`);
  const r = (env.REFUND_PROCESSING_FEE ?? '').trim().toLowerCase();
  if (!ON_WORDS.includes(r) && !OFF_WORDS.includes(r)) out.push(`REFUND_PROCESSING_FEE is not 1/0 (or true/false, on/off, yes/no); the default (${REFUND_PROCESSING_FEE_DEFAULT ? 'on' : 'off'}) applies`);
  return out;
}

/** Coach Pro per month while COACH_PRO_PRICE_USD_CENTS is unset (owner, 2026-10-25: $39/month). */
export const COACH_PRO_PRICE_DEFAULT_CENTS = 3900;

/** Free tier's active-client allowance while COACH_FREE_CLIENT_LIMIT is unset (owner, 2026-10-25: 3 clients). */
export const FREE_CLIENT_LIMIT_DEFAULT = 3;
/** The env may raise or lower the allowance inside these bounds; anything else falls back to the default. */
export const FREE_CLIENT_LIMIT_MAX = 1000;

/** (new) A package price, in cents: $1.00 to $10,000.00. Stripe's own floor is $0.50. */
export const PACKAGE_MIN_CENTS = 100;
export const PACKAGE_MAX_CENTS = 1_000_000;
/** (new) The longest a Checkout stays open, and so the longest a capacity spot is held for it (Stripe's minimum is 30). */
export const CHECKOUT_HOLD_MINUTES = 30;

export function isCoachConnectPaymentsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return envOn(env, 'COACH_CONNECT_PAYMENTS_ENABLED');
}

export function isCoachConnectLive(env: NodeJS.ProcessEnv = process.env): boolean {
  return envOn(env, 'COACH_CONNECT_LIVE');
}

export function isCoachProEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return envOn(env, 'COACH_PRO_ENABLED');
}

export function isCoachMarketplaceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return envOn(env, 'COACH_MARKETPLACE_ENABLED');
}

/** The Pro price in cents. A blank, non-integer or out-of-range value is the default ($39), like the client limit. */
export function coachProPriceCents(env: NodeJS.ProcessEnv = process.env): number {
  const raw = (env.COACH_PRO_PRICE_USD_CENTS ?? '').trim();
  if (!/^\d+$/.test(raw)) return COACH_PRO_PRICE_DEFAULT_CENTS;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= PACKAGE_MIN_CENTS && n <= PACKAGE_MAX_CENTS ? n : COACH_PRO_PRICE_DEFAULT_CENTS;
}

/** `$39` for whole dollars, `$39.50` otherwise: how a monthly plan price reads in a sentence. */
export function usdPlain(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

/** Active clients a Free coach keeps. A blank, non-integer or out-of-range value is the default. 0 is allowed. */
export function coachFreeClientLimit(env: NodeJS.ProcessEnv = process.env): number {
  const raw = (env.COACH_FREE_CLIENT_LIMIT ?? '').trim();
  if (!/^\d+$/.test(raw)) return FREE_CLIENT_LIMIT_DEFAULT;
  const n = Number(raw);
  return n <= FREE_CLIENT_LIMIT_MAX ? n : FREE_CLIENT_LIMIT_DEFAULT;
}

/** The one sentence every closed money surface shows. Product copy, not policy. */
export const PAYMENTS_NOT_LIVE = "Payments aren't live yet.";
