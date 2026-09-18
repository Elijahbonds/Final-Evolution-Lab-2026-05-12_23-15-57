// WHERE THE MONEY GOES, TO THE CENT (2026-09-13).
//
// The other half of build-order item #9. `commissionsFor` already decides who in an upline earns what;
// nothing decided what the COACH gets, and nothing checked that the parts add up to the whole.
//
// THE ONLY REQUIREMENT THAT MATTERS: coach + platform + commissions === gross. Exactly. Every time.
//
// That sounds trivial and it is the single most common bug in payment code, because every share is a
// percentage of an integer number of cents and percentages of integers do not land on integers. Three
// parties rounding independently produces a total that is a cent or two off the amount actually charged,
// and the error is invisible per transaction and structural at volume — it shows up as a ledger that will
// not reconcile and nobody able to say which side is wrong.
//
// SO ONE PARTY IS DEFINED AS "WHAT IS LEFT", and it is the platform. Not the coach, who is owed a stated
// percentage and should be able to predict their own payout; not the upline, whose rates are published.
// The platform's share is the residual by construction, which makes the identity above true by arithmetic
// rather than by a test that has to be remembered. `Math.floor` on the coach's share means the odd cent
// always lands on the platform's side, which is the direction that cannot create money.
//
// COMMISSIONS COME OUT OF THE PLATFORM'S SHARE, never the coach's. `ratesAreSolvent()` (TOTAL_RATE 0.27 <
// PLATFORM_TAKE 0.30) is what makes that possible, and it is asserted here rather than assumed, because if
// somebody ever raises a level rate past the take the failure would otherwise be a coach quietly getting
// paid less than the rate they agreed to.
//
// Pure: no Prisma, no Stripe.

import {
  commissionsFor, isQualifying, ratesAreSolvent, PLATFORM_TAKE,
  type Commission, type Payment,
} from '../marketing/referralTree';

export interface Split {
  grossCents: number;
  /** The seller's share: gross minus the platform take, floored. Predictable from the rate. */
  coachCents: number;
  /** What the platform keeps AFTER paying the upline. The residual — never independently rounded. */
  platformCents: number;
  commissions: Commission[];
  commissionCents: number;
  /** Why the upline was paid nothing, when it was. */
  commissionsRejected: string | null;
}

export class SplitError extends Error {}

/**
 * Split one payment.
 *
 * `upline` is the buyer's referral chain, nearest first; pass an empty array when there is none. `kind` is
 * checked by `commissionsFor` against QUALIFYING_KINDS — a one-off block purchase is deliberately NOT in
 * that list, so a program sale pays no commission and the whole platform take stays with the platform. That
 * boundary is the referral program's, not this file's, and it is honoured rather than widened here.
 */
export function splitPayment(payment: Payment, upline: readonly string[] = []): Split {
  if (!Number.isInteger(payment.amountCents) || payment.amountCents <= 0) {
    throw new SplitError('A payment is a positive whole number of cents.');
  }
  // a rate change that makes the tree insolvent must fail loudly at the till, not quietly in a coach's payout
  if (!ratesAreSolvent()) {
    throw new SplitError('Referral rates exceed the platform take — commissions cannot be paid without taking them out of the coach\'s share.');
  }

  const gross = payment.amountCents;
  // floored: the odd cent goes to the platform, the direction that cannot invent money
  const platformGross = Math.floor(gross * PLATFORM_TAKE);
  const coachCents = gross - platformGross;

  const tree = isQualifying(payment.kind)
    ? commissionsFor(payment, upline)
    : { commissions: [], totalCents: 0, rejected: `"${payment.kind}" is not a qualifying purchase — commissions are paid on product revenue only.` };

  const platformCents = platformGross - tree.totalCents;
  if (platformCents < 0) {
    // unreachable while ratesAreSolvent() holds; asserted because the failure mode is silent underpayment
    throw new SplitError('Commissions exceeded the platform take on this payment.');
  }

  const split: Split = {
    grossCents: gross,
    coachCents,
    platformCents,
    commissions: tree.commissions,
    commissionCents: tree.totalCents,
    commissionsRejected: tree.rejected,
  };
  assertConserved(split);
  return split;
}

/**
 * The identity, checked on every split.
 *
 * Kept as an exported function so a ledger writer can re-check a split it was handed rather than trusting
 * that it came from here.
 */
export function assertConserved(split: Split): void {
  const parts = split.coachCents + split.platformCents + split.commissionCents;
  if (parts !== split.grossCents) {
    throw new SplitError(`Split does not conserve: ${parts} != ${split.grossCents}.`);
  }
}

/** What the coach is shown before they list, so the take is never a surprise on the first payout. */
export function coachSharePreview(priceCents: number): { coachCents: number; platformCents: number; ratePct: number } {
  const platformCents = Math.floor(priceCents * PLATFORM_TAKE);
  return {
    coachCents: priceCents - platformCents,
    platformCents,
    ratePct: Math.round(PLATFORM_TAKE * 100),
  };
}
