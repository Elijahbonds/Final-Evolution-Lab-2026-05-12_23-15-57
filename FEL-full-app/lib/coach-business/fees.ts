// lib/coach-business/fees.ts — COACH-BUSINESS: the 5% application fee on a coach's sale through Stripe Connect, and its
// share of a refund. Pure integer math in cents; no floats reach a Stripe amount.
//
// ROUNDING. The fee is ROUNDED DOWN to the cent (the coach keeps the fraction), the way the coach store rounds its own
// fee (lib/coach-store/money.ts coachStoreSplit). $19.99 → 99¢, $10.10 → 50¢, $0.19 → 0¢.
// REFUNDS. A refund returns the same share of the fee as of the price (Stripe's refund_application_fee is proportional).
// The returned fee is rounded down too, so FEL never returns more fee than it took; a FULL refund returns the whole fee
// exactly. Across several partial refunds the fee returned is computed from the CUMULATIVE refund each time, so the
// parts always add up to the same total as one refund of the same size (no rounding drift).
import { CONNECT_FEE_BPS } from './config';

function assertCents(n: number, what: string): void {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`${what} must be whole, non-negative cents`);
}

/** FEL's application fee on a sale of `priceCents`: floor(price × 5%). */
export function applicationFeeCents(priceCents: number, bps: number = CONNECT_FEE_BPS): number {
  assertCents(priceCents, 'price');
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new Error('fee bps');
  return Math.floor((priceCents * bps) / 10_000);
}

/** What the coach receives before Stripe's own fees: the price less FEL's fee. */
export function coachGrossCents(priceCents: number, bps: number = CONNECT_FEE_BPS): number {
  return priceCents - applicationFeeCents(priceCents, bps);
}

/** The part of the fee returned once `refundedCents` (cumulative) of `amountCents` has been refunded. */
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
 * fee handed back for this step). A step that does not move the total forward (a redelivered event, an older event
 * arriving late) is a no-op: delta 0.
 */
export function refundStep(feeCents: number, amountCents: number, beforeCents: number, afterCents: number): { feeDelta: number; refundDelta: number } {
  if (afterCents <= beforeCents) return { feeDelta: 0, refundDelta: 0 };
  const feeDelta = feeReturnedCents(feeCents, amountCents, afterCents) - feeReturnedCents(feeCents, amountCents, beforeCents);
  return { feeDelta, refundDelta: Math.min(afterCents, amountCents) - Math.min(beforeCents, amountCents) };
}

/** The ledger postings for FEL's fee on a sale: EXTERNAL → PLATFORM_REVENUE. The coach's money never enters FEL's ledger:
 *  it goes from the buyer to the coach's connected account (a destination charge). Empty for a zero fee. */
export function feePostings(feeCents: number): { type: 'EXTERNAL' | 'PLATFORM_REVENUE'; amount: number }[] {
  assertCents(feeCents, 'fee');
  if (feeCents === 0) return [];
  return [
    { type: 'EXTERNAL', amount: feeCents },
    { type: 'PLATFORM_REVENUE', amount: -feeCents },
  ];
}

/** The reverse of feePostings for the fee handed back on a refund. */
export function feeRefundPostings(feeDeltaCents: number): { type: 'EXTERNAL' | 'PLATFORM_REVENUE'; amount: number }[] {
  assertCents(feeDeltaCents, 'fee refund');
  if (feeDeltaCents === 0) return [];
  return [
    { type: 'EXTERNAL', amount: -feeDeltaCents },
    { type: 'PLATFORM_REVENUE', amount: feeDeltaCents },
  ];
}
