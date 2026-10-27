// lib/coach-business/fees.ts — COACH-BUSINESS: the money split of a coach's sale through Stripe Connect. Pure integer
// math in cents; no float reaches a Stripe amount.
//
// THE OWNER'S RULE (2026-10-25): "5% + Stripe fee on top". FEL keeps a clean 5% of the coach's listed price, the coach
// receives the listed price less that 5%, and the BUYER covers Stripe's processing fee as its own line.
//
// HOW (a destination charge, grossed up). For a listed price P:
//   F  = floor(P × 5%)                          FEL's share (rounded down: the coach keeps the fraction)
//   T  = the smallest charge with T − stripeFee(T) ≥ P      what the buyer pays
//   X  = T − P                                  the "Processing fee" line the buyer sees
//   A  = F + X                                  application_fee_amount: FEL's share plus the processing fee
// Stripe moves T to the coach and A back to FEL, then debits its own fee S from FEL (a destination charge's Stripe fee is
// always the platform's). So the coach keeps T − A = P − F exactly, and FEL keeps A − S = F + (X − S).
// stripeFee() here rounds the percentage UP to the cent, the most Stripe could charge, so X ≥ S under any rounding Stripe
// uses: FEL nets F, or F + 1¢ when Stripe rounds down. Never less than F, never negative, at any price.
//
// REFUNDS (decided here, docs/COACH-BUSINESS.md "Refunds"). A refund returns part or all of the LISTED PRICE. The processing
// fee is not refunded: Stripe keeps its fee on a refunded charge, so returning X would leave FEL paying Stripe's fee out of
// its own pocket. The coach's transfer is reversed by the refund, and FEL hands back the same share of F as of P
// (feeReturnedCents), as an application-fee refund of exactly that amount. After a full refund: buyer −X, coach 0, FEL
// X − S (0 or 1¢).
//
// PAYMENTS-READY (2026-10-26): the two owner calls are settings (config.ts), defaults unchanged.
//   · FEL's share is platformFee(policy, plan, price, fees so far this month): PLATFORM_FEE_BPS_FREE / _PRO by the coach's
//     plan, capped by PLATFORM_FEE_CAP_CENTS_MONTHLY. With the defaults it is floor(P × 5%), exactly as before.
//   · REFUND_PROCESSING_FEE on: a refund of part R of the price also returns the same share of X to the buyer
//     (processingShareCents), and FEL hands the coach back that share of X with its share of F, so the coach ends where
//     they end today and FEL absorbs Stripe's fee. Off (the default): exactly today's refund.
import { CONNECT_FEE_BPS, STRIPE_CARD_FEE_BPS, STRIPE_CARD_FEE_FIXED_CENTS, type FeePolicy } from './config';
import type { CoachPlan } from './plan';

function assertCents(n: number, what: string): void {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`${what} must be whole, non-negative cents`);
}

/** FEL's share of a sale at `priceCents`: floor(price × 5%). */
export function felShareCents(priceCents: number, bps: number = CONNECT_FEE_BPS): number {
  assertCents(priceCents, 'price');
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new Error('fee bps');
  return Math.floor((priceCents * bps) / 10_000);
}

/** What the coach receives from a sale at `priceCents`: the price less FEL's share. Stripe's fee is not the coach's. */
export function coachGrossCents(priceCents: number, bps: number = CONNECT_FEE_BPS): number {
  return priceCents - felShareCents(priceCents, bps);
}

export interface StripeRate { bps: number; fixedCents: number }
/** Stripe's card rate (config.ts; assumption: US standard pricing, 2.9% + 30¢). */
export const STRIPE_CARD_RATE: StripeRate = { bps: STRIPE_CARD_FEE_BPS, fixedCents: STRIPE_CARD_FEE_FIXED_CENTS };

export type Rounding = 'up' | 'nearest' | 'down';

function divRound(num: number, rounding: Rounding): number {
  if (rounding === 'up') return Math.ceil(num / 10_000);
  if (rounding === 'down') return Math.floor(num / 10_000);
  return Math.floor((num + 5_000) / 10_000);
}

/** Stripe's processing fee on a charge of `chargeCents`. 'up' (the default) is the most Stripe could take. */
export function stripeFeeCents(chargeCents: number, rate: StripeRate = STRIPE_CARD_RATE, rounding: Rounding = 'up'): number {
  assertCents(chargeCents, 'charge');
  return divRound(chargeCents * rate.bps, rounding) + rate.fixedCents;
}

/** The smallest charge T whose proceeds after Stripe's fee (rounded up) cover `priceCents`. */
export function grossUpCents(priceCents: number, rate: StripeRate = STRIPE_CARD_RATE): number {
  assertCents(priceCents, 'price');
  if (!Number.isInteger(rate.bps) || rate.bps < 0 || rate.bps >= 10_000) throw new Error('rate');
  let t = Math.ceil(((priceCents + rate.fixedCents) * 10_000) / (10_000 - rate.bps));
  while (t > 0 && t - 1 - stripeFeeCents(t - 1, rate) >= priceCents) t -= 1;
  while (t - stripeFeeCents(t, rate) < priceCents) t += 1;
  return t;
}

/** Everything one sale moves, in cents. */
export interface SaleSplit {
  /** The coach's listed price. */
  priceCents: number;
  /** The buyer's "Processing fee" line. */
  processingFeeCents: number;
  /** What the buyer pays: price + processing fee. */
  totalCents: number;
  /** FEL's clean 5% of the listed price. */
  felShareCents: number;
  /** Stripe's application_fee_amount: FEL's share + the processing fee. */
  applicationFeeCents: number;
  /** What the coach keeps: price − FEL's share. */
  coachNetCents: number;
}

/** `felShare` defaults to today's 5%; the checkout passes platformFee(...)'s share (plan and monthly cap). */
export function saleSplit(priceCents: number, rate: StripeRate = STRIPE_CARD_RATE, felShare: number = felShareCents(priceCents)): SaleSplit {
  assertCents(felShare, 'FEL share');
  if (felShare > priceCents) throw new Error('FEL share above the price');
  const fel = felShare;
  const total = grossUpCents(priceCents, rate);
  const processing = total - priceCents;
  return {
    priceCents,
    processingFeeCents: processing,
    totalCents: total,
    felShareCents: fel,
    applicationFeeCents: fel + processing,
    coachNetCents: priceCents - fel,
  };
}

/** What FEL keeps of a split once Stripe has taken its fee (`rounding` models how Stripe rounds). */
export function felNetCents(split: SaleSplit, rate: StripeRate = STRIPE_CARD_RATE, rounding: Rounding = 'nearest'): number {
  return split.applicationFeeCents - stripeFeeCents(split.totalCents, rate, rounding);
}

// ── the platform fee (PAYMENTS-READY) ─────────────────────────────────────────────────────────────────────────────

export interface PlatformFee {
  /** FEL's share of this sale, in cents. */
  felShareCents: number;
  /** The rate that applied (by plan). */
  bps: number;
  /** True when the monthly cap lowered the share. */
  capped: boolean;
}

/**
 * FEL's share of a sale at `priceCents` for a coach on `plan`, who has already paid `feesThisMonthCents` this month.
 * The plan picks the rate; the cap (when set) lowers the share to what is left of it, never below 0.
 */
export function platformFee(policy: FeePolicy, plan: CoachPlan, priceCents: number, feesThisMonthCents: number = 0): PlatformFee {
  assertCents(priceCents, 'price');
  const bps = plan === 'pro' ? policy.bpsPro : policy.bpsFree;
  const share = felShareCents(priceCents, bps);
  if (policy.capCentsMonthly === null) return { felShareCents: share, bps, capped: false };
  const room = Math.max(0, policy.capCentsMonthly - Math.max(0, Math.floor(feesThisMonthCents)));
  return share > room ? { felShareCents: room, bps, capped: true } : { felShareCents: share, bps, capped: false };
}

/** `500` → "5%", `250` → "2.5%", `0` → "0%". */
export function bpsLabel(bps: number): string {
  return `${Number((bps / 100).toFixed(2))}%`;
}

/** FEL's fee for a coach on `plan`, as the dashboard says it: "5%", or "5%, at most $50.00 a month" under a cap. */
export function platformFeeLabel(policy: FeePolicy, plan: CoachPlan): string {
  const rate = bpsLabel(plan === 'pro' ? policy.bpsPro : policy.bpsFree);
  return policy.capCentsMonthly === null ? rate : `${rate}, at most $${(policy.capCentsMonthly / 100).toFixed(2)} a month`;
}

/** Does the policy need the coach's fees so far this month? Only with a cap. */
export function needsMonthToDate(policy: FeePolicy): boolean {
  return policy.capCentsMonthly !== null;
}

/** The first instant of `now`'s calendar month, UTC (the cap's month). assumption: UTC months. */
export function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** The same split with a lower (capped) FEL share: the buyer's total and processing fee do not change. */
export function withFelShare(split: SaleSplit, felShare: number): SaleSplit {
  assertCents(felShare, 'FEL share');
  const fel = Math.min(felShare, split.felShareCents);
  return { ...split, felShareCents: fel, applicationFeeCents: fel + split.processingFeeCents, coachNetCents: split.priceCents - fel };
}

// ── monthly coaching ─────────────────────────────────────────────────────────────────────────────────────────────────
// A subscription cannot carry a flat application fee (Stripe: "You can't set a subscription's recurring application fee as
// a flat amount"). The mechanism (connect.ts, webhook.ts):
//   1. the subscription has TWO monthly line items, the coaching price P and the "Processing fee" X, so every invoice is
//      itemised and totals T;
//   2. subscription_data.application_fee_percent = A / T rounded UP to Stripe's two decimals, so the first invoice (which
//      Checkout finalises at once) collects at least A, never less;
//   3. invoice.created (each renewal, still a draft): the webhook sets the invoice's application_fee_amount = A exactly,
//      which Stripe says overrides the percent;
//   4. invoice.paid: if Stripe collected more than A (the first invoice, or a renewal whose draft was not updated in time),
//      the webhook refunds the excess application fee to the coach. Every month ends at A: coach P − F, FEL F (+1¢).

/** application_fee_percent for a monthly split: A / T as a percent, rounded UP to two decimals. */
export function subscriptionFeePercent(split: SaleSplit): number {
  if (split.totalCents <= 0) return 0;
  const hundredths = Math.ceil((split.applicationFeeCents * 10_000) / split.totalCents);
  return hundredths / 100;
}

/** The fee Stripe takes at `percent` on an invoice of `totalCents` (`rounding` models Stripe's rounding). */
export function percentFeeCents(totalCents: number, percent: number, rounding: Rounding = 'nearest'): number {
  assertCents(totalCents, 'total');
  return divRound(totalCents * Math.round(percent * 100), rounding);
}

/** The application fee to hand back to the coach so an invoice ends at exactly A. 0 when Stripe took A or less. */
export function feeExcessCents(collectedCents: number, applicationFeeCents: number): number {
  assertCents(collectedCents, 'collected fee');
  assertCents(applicationFeeCents, 'fee');
  return Math.max(0, collectedCents - applicationFeeCents);
}

// ── refunds ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The part of FEL's share returned once `refundedCents` (cumulative) of the price `amountCents` has been refunded.
 *  Rounded down, so FEL never returns more than it took; a FULL refund returns the whole share exactly. */
export function feeReturnedCents(feeCents: number, amountCents: number, refundedCents: number): number {
  assertCents(feeCents, 'fee');
  assertCents(amountCents, 'amount');
  assertCents(refundedCents, 'refund');
  if (amountCents === 0) return 0;
  const refunded = Math.min(refundedCents, amountCents);
  if (refunded === amountCents) return feeCents;
  return Math.floor((feeCents * refunded) / amountCents);
}

/**
 * One refund step: the cumulative refund moved from `beforeCents` to `afterCents`. The ledger posts `feeDelta` (FEL's
 * share handed back for this step). Computed from the CUMULATIVE refund each time, so several partial refunds add up to
 * one refund of the same size. A step that does not move forward (a redelivered or older event) is a no-op.
 */
export function refundStep(feeCents: number, amountCents: number, beforeCents: number, afterCents: number): { feeDelta: number; refundDelta: number } {
  if (afterCents <= beforeCents) return { feeDelta: 0, refundDelta: 0 };
  const feeDelta = feeReturnedCents(feeCents, amountCents, afterCents) - feeReturnedCents(feeCents, amountCents, beforeCents);
  return { feeDelta, refundDelta: Math.min(afterCents, amountCents) - Math.min(beforeCents, amountCents) };
}

/**
 * How much application fee to refund to the coach now so that, in all, `targetCents` has been refunded on that fee.
 * `alreadyCents` is the fee's amount_refunded as Stripe reports it, so a retry after a partial failure never pays twice.
 */
export function feeRefundDue(targetCents: number, alreadyCents: number): number {
  assertCents(targetCents, 'target');
  assertCents(alreadyCents, 'already refunded');
  return Math.max(0, targetCents - alreadyCents);
}

// ── refunding the processing fee (REFUND_PROCESSING_FEE on) ──────────────────────────────────────────────────────

/** The buyer's share of the processing fee `processingCents` returned once `refundedPriceCents` of the price
 *  `priceCents` is refunded. Rounded down; a FULL refund returns the whole fee. */
export function processingShareCents(processingCents: number, priceCents: number, refundedPriceCents: number): number {
  return feeReturnedCents(processingCents, priceCents, refundedPriceCents);
}

/** What the CHARGE has refunded in all once `refundedPriceCents` of the price is refunded: the price part, plus the
 *  processing fee's share when that is refunded too. */
export function chargeRefundCents(split: { priceCents: number; processingFeeCents: number }, refundedPriceCents: number, refundFee: boolean): number {
  const r = Math.min(Math.max(0, refundedPriceCents), split.priceCents);
  return r + (refundFee ? processingShareCents(split.processingFeeCents, split.priceCents, r) : 0);
}

/**
 * The inverse: the part of the PRICE refunded when the charge has refunded `chargeRefundedCents` in all. With the fee
 * not refunded it is today's min(refunded, price). With it refunded, the largest R whose chargeRefundCents is at most
 * the amount (so a refund made from the Stripe Dashboard of any size maps to a price share, and a full refund of the
 * whole charge to the whole price).
 */
export function priceRefundedFromCharge(split: { priceCents: number; processingFeeCents: number }, chargeRefundedCents: number, refundFee: boolean): number {
  const c = Math.max(0, Math.floor(chargeRefundedCents));
  if (!refundFee) return Math.min(c, split.priceCents);
  const total = split.priceCents + split.processingFeeCents;
  if (c >= total) return split.priceCents;
  if (total === 0) return 0;
  let r = Math.min(split.priceCents, Math.floor((c * split.priceCents) / total));
  while (r < split.priceCents && chargeRefundCents(split, r + 1, true) <= c) r += 1;
  while (r > 0 && chargeRefundCents(split, r, true) > c) r -= 1;
  return r;
}

// ── ledger ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The ledger postings for FEL's share of a sale: EXTERNAL → PLATFORM_REVENUE. The coach's money and the processing fee
 *  (Stripe's) never enter FEL's ledger. Empty for a zero share. */
export function feePostings(feeCents: number): { type: 'EXTERNAL' | 'PLATFORM_REVENUE'; amount: number }[] {
  assertCents(feeCents, 'fee');
  if (feeCents === 0) return [];
  return [
    { type: 'EXTERNAL', amount: feeCents },
    { type: 'PLATFORM_REVENUE', amount: -feeCents },
  ];
}

/** The reverse of feePostings for the share handed back on a refund. */
export function feeRefundPostings(feeDeltaCents: number): { type: 'EXTERNAL' | 'PLATFORM_REVENUE'; amount: number }[] {
  assertCents(feeDeltaCents, 'fee refund');
  if (feeDeltaCents === 0) return [];
  return [
    { type: 'EXTERNAL', amount: -feeDeltaCents },
    { type: 'PLATFORM_REVENUE', amount: feeDeltaCents },
  ];
}
