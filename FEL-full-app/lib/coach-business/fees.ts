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
import { CONNECT_FEE_BPS, STRIPE_CARD_FEE_BPS, STRIPE_CARD_FEE_FIXED_CENTS } from './config';

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

export function saleSplit(priceCents: number, rate: StripeRate = STRIPE_CARD_RATE): SaleSplit {
  const fel = felShareCents(priceCents);
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
